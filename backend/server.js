import express from 'express';
import cors from 'cors';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const { Pool } = pg;

const dbConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
    }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'codemax',
      user: process.env.DB_USER || 'codemax',
      password: process.env.DB_PASSWORD || 'codemax_secret',
    };

const pool = new Pool(dbConfig);

const JWT_SECRET = process.env.JWT_SECRET || 'eburon-codemax-secret-key-change-in-production';
const JWT_EXPIRES = '7d';

// ── Google OAuth Config ─────────────────────────────────────
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5173/auth/google/callback';

const GOOGLE_SCOPES = {
  base: ['openid', 'email', 'profile'],
  gmail: ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.send'],
  sheets: ['https://www.googleapis.com/auth/spreadsheets'],
  chat: ['https://www.googleapis.com/auth/chat.messages', 'https://www.googleapis.com/auth/chat.spaces.readonly'],
  drive: ['https://www.googleapis.com/auth/drive.readonly'],
};

async function exchangeGoogleCode(code) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google token exchange failed: ${err}`);
  }
  return res.json();
}

async function refreshGoogleToken(refreshToken) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error('Failed to refresh Google token');
  return res.json();
}

async function getGoogleUserInfo(accessToken) {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Failed to get Google user info');
  return res.json();
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ── JWT Middleware ──────────────────────────────────────────

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const decoded = jwt.verify(header.split(' ')[1], JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ── Health check (public) ──────────────────────────────────

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch (err) {
    res.status(503).json({ status: 'error', db: 'disconnected' });
  }
});

// ── Google OAuth ────────────────────────────────────────────

app.get('/api/auth/google/url', (req, res) => {
  if (!GOOGLE_CLIENT_ID) return res.status(500).json({ error: 'Google OAuth not configured' });
  const scopes = req.query.scopes
    ? req.query.scopes.split(',')
    : GOOGLE_SCOPES.base;
  const allScopes = [...new Set([...GOOGLE_SCOPES.base, ...scopes])];
  const state = req.query.link_token || '';
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: allScopes.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  res.json({ url: `https://accounts.google.com/o/oauth2/auth?${params}` });
});

app.post('/api/auth/google/callback', async (req, res) => {
  try {
    const { code, state } = req.body;
    if (!code) return res.status(400).json({ error: 'Authorization code required' });

    const tokens = await exchangeGoogleCode(code);
    const googleUser = await getGoogleUserInfo(tokens.access_token);
    const expiry = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null;
    const scopes = tokens.scope || '';

    // If state contains a JWT, this is a "link account" flow
    if (state) {
      try {
        const decoded = jwt.verify(state, JWT_SECRET);
        // Link Google to existing user
        await pool.query(
          `UPDATE users SET
            google_id = $1,
            google_access_token = $2,
            google_refresh_token = COALESCE($3, google_refresh_token),
            google_token_expiry = $4,
            google_scopes = $5,
            avatar_url = COALESCE(avatar_url, $6),
            updated_at = NOW()
           WHERE id = $7`,
          [googleUser.id, tokens.access_token, tokens.refresh_token || null, expiry, scopes, googleUser.picture || null, decoded.userId]
        );
        const updated = await pool.query(
          'SELECT id, email, display_name, avatar_url, ollama_cloud_url, ollama_api_key, ollama_local_url, google_id, google_scopes, google_token_expiry, created_at, updated_at FROM users WHERE id = $1',
          [decoded.userId]
        );
        const jwtToken = jwt.sign({ userId: decoded.userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
        return res.json({ token: jwtToken, user: updated.rows[0], linked: true });
      } catch {
        // Invalid state token — fall through to login/register flow
      }
    }

    // Check if user exists by google_id
    let result = await pool.query(
      'SELECT id, email, display_name, avatar_url, ollama_cloud_url, ollama_api_key, ollama_local_url, google_id, google_scopes, google_token_expiry, created_at, updated_at FROM users WHERE google_id = $1',
      [googleUser.id]
    );

    if (result.rows.length > 0) {
      // Existing Google user — update tokens
      await pool.query(
        `UPDATE users SET
          google_access_token = $1,
          google_refresh_token = COALESCE($2, google_refresh_token),
          google_token_expiry = $3,
          google_scopes = $4,
          updated_at = NOW()
         WHERE google_id = $5`,
        [tokens.access_token, tokens.refresh_token || null, expiry, scopes, googleUser.id]
      );
      const user = result.rows[0];
      const jwtToken = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
      return res.json({ token: jwtToken, user });
    }

    // Check if user exists by email
    result = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [googleUser.email.toLowerCase()]
    );

    if (result.rows.length > 0) {
      // Link Google to existing email user
      const userId = result.rows[0].id;
      await pool.query(
        `UPDATE users SET
          google_id = $1,
          google_access_token = $2,
          google_refresh_token = COALESCE($3, google_refresh_token),
          google_token_expiry = $4,
          google_scopes = $5,
          avatar_url = COALESCE(avatar_url, $6),
          updated_at = NOW()
         WHERE id = $7`,
        [googleUser.id, tokens.access_token, tokens.refresh_token || null, expiry, scopes, googleUser.picture || null, userId]
      );
      const updated = await pool.query(
        'SELECT id, email, display_name, avatar_url, ollama_cloud_url, ollama_api_key, ollama_local_url, google_id, google_scopes, google_token_expiry, created_at, updated_at FROM users WHERE id = $1',
        [userId]
      );
      const jwtToken = jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
      return res.json({ token: jwtToken, user: updated.rows[0] });
    }

    // New user — create account
    const newUser = await pool.query(
      `INSERT INTO users (email, display_name, avatar_url, google_id, google_access_token, google_refresh_token, google_token_expiry, google_scopes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, email, display_name, avatar_url, ollama_cloud_url, ollama_api_key, ollama_local_url, google_id, google_scopes, google_token_expiry, created_at, updated_at`,
      [googleUser.email.toLowerCase(), googleUser.name || googleUser.email.split('@')[0], googleUser.picture || null,
       googleUser.id, tokens.access_token, tokens.refresh_token || null, expiry, scopes]
    );
    const user = newUser.rows[0];
    const jwtToken = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    res.status(201).json({ token: jwtToken, user });
  } catch (err) {
    console.error('Google OAuth error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Connect additional Google services (add scopes)
app.post('/api/auth/google/connect', authMiddleware, async (req, res) => {
  try {
    const { services } = req.body; // array like ['gmail', 'sheets', 'chat']
    if (!services || !Array.isArray(services)) return res.status(400).json({ error: 'Services array required' });

    const scopes = services.flatMap(s => GOOGLE_SCOPES[s] || []);
    const allScopes = [...new Set([...GOOGLE_SCOPES.base, ...scopes])];

    // Get current user JWT to pass as state for the link flow
    const linkToken = jwt.sign({ userId: req.userId }, JWT_SECRET, { expiresIn: '10m' });

    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: GOOGLE_REDIRECT_URI,
      response_type: 'code',
      scope: allScopes.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      state: linkToken,
    });
    res.json({ url: `https://accounts.google.com/o/oauth2/auth?${params}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Disconnect Google account
app.post('/api/auth/google/disconnect', authMiddleware, async (req, res) => {
  try {
    const user = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.userId]);
    if (!user.rows[0]?.password_hash) {
      return res.status(400).json({ error: 'Cannot disconnect Google — no password set. Set a password first.' });
    }
    await pool.query(
      `UPDATE users SET google_id = NULL, google_access_token = NULL, google_refresh_token = NULL, google_token_expiry = NULL, google_scopes = '', updated_at = NOW() WHERE id = $1`,
      [req.userId]
    );
    const updated = await pool.query(
      'SELECT id, email, display_name, avatar_url, ollama_cloud_url, ollama_api_key, ollama_local_url, google_id, google_scopes, google_token_expiry, created_at, updated_at FROM users WHERE id = $1',
      [req.userId]
    );
    res.json(updated.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Google services status
app.get('/api/auth/google/status', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT google_id, google_scopes, google_token_expiry FROM users WHERE id = $1',
      [req.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const { google_id, google_scopes, google_token_expiry } = result.rows[0];
    const connected = !!google_id;
    const scopes = google_scopes ? google_scopes.split(' ') : [];
    const expired = google_token_expiry ? new Date(google_token_expiry) < new Date() : true;
    res.json({
      connected,
      expired: connected ? expired : null,
      scopes,
      services: {
        gmail: scopes.some(s => s.includes('gmail')),
        sheets: scopes.some(s => s.includes('spreadsheets')),
        chat: scopes.some(s => s.includes('chat')),
        drive: scopes.some(s => s.includes('drive')),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Auth ────────────────────────────────────────────────────

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, display_name } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (existing.rows.length > 0) return res.status(409).json({ error: 'An account with this email already exists' });

    const password_hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, display_name) VALUES ($1, $2, $3) RETURNING id, email, display_name, avatar_url, ollama_cloud_url, ollama_api_key, ollama_local_url, created_at`,
      [email.toLowerCase().trim(), password_hash, display_name || email.split('@')[0]]
    );

    const user = result.rows[0];
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    res.status(201).json({ token, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

    const result = await pool.query(
      'SELECT id, email, password_hash, display_name, avatar_url, ollama_cloud_url, ollama_api_key, ollama_local_url, google_id, google_scopes, google_token_expiry, created_at FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid email or password' });

    const user = result.rows[0];
    if (!user.password_hash) return res.status(401).json({ error: 'This account uses Google Sign-In. Please sign in with Google.' });
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

    const { password_hash, ...safeUser } = user;
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    res.json({ token, user: safeUser });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── User Profile (protected) ───────────────────────────────

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, display_name, avatar_url, ollama_cloud_url, ollama_api_key, ollama_local_url, google_id, google_scopes, google_token_expiry, created_at, updated_at FROM users WHERE id = $1',
      [req.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const { display_name, avatar_url, ollama_cloud_url, ollama_api_key, ollama_local_url } = req.body;
    const result = await pool.query(
      `UPDATE users SET
        display_name = COALESCE($1, display_name),
        avatar_url = COALESCE($2, avatar_url),
        ollama_cloud_url = COALESCE($3, ollama_cloud_url),
        ollama_api_key = COALESCE($4, ollama_api_key),
        ollama_local_url = COALESCE($5, ollama_local_url),
        updated_at = NOW()
       WHERE id = $6
       RETURNING id, email, display_name, avatar_url, ollama_cloud_url, ollama_api_key, ollama_local_url, google_id, google_scopes, google_token_expiry, created_at, updated_at`,
      [display_name, avatar_url, ollama_cloud_url, ollama_api_key, ollama_local_url, req.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Conversations (protected) ──────────────────────────────

app.get('/api/conversations', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, title, created_at, updated_at FROM conversations WHERE user_id = $1 ORDER BY updated_at DESC',
      [req.userId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/conversations', authMiddleware, async (req, res) => {
  try {
    const { title } = req.body;
    const result = await pool.query(
      'INSERT INTO conversations (user_id, title) VALUES ($1, $2) RETURNING *',
      [req.userId, title || 'New Chat']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/conversations/:id', authMiddleware, async (req, res) => {
  try {
    const conv = await pool.query('SELECT * FROM conversations WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
    if (conv.rows.length === 0) return res.status(404).json({ error: 'Not found' });

    const msgs = await pool.query(
      'SELECT * FROM messages WHERE conversation_id = $1 ORDER BY sort_order ASC',
      [req.params.id]
    );
    res.json({ ...conv.rows[0], messages: msgs.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/conversations/:id', authMiddleware, async (req, res) => {
  try {
    const { title } = req.body;
    const result = await pool.query(
      'UPDATE conversations SET title = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3 RETURNING *',
      [title, req.params.id, req.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/conversations/:id', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM conversations WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Messages (protected) ───────────────────────────────────

app.post('/api/conversations/:id/messages', authMiddleware, async (req, res) => {
  try {
    // Verify ownership
    const conv = await pool.query('SELECT id FROM conversations WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
    if (conv.rows.length === 0) return res.status(404).json({ error: 'Conversation not found' });

    const { role, content, model_name, image_data, image_mime } = req.body;

    const countResult = await pool.query(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM messages WHERE conversation_id = $1',
      [req.params.id]
    );
    const sortOrder = countResult.rows[0].next_order;

    const result = await pool.query(
      `INSERT INTO messages (conversation_id, role, content, model_name, image_data, image_mime, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.params.id, role, content, model_name || null, image_data || null, image_mime || null, sortOrder]
    );

    await pool.query('UPDATE conversations SET updated_at = NOW() WHERE id = $1', [req.params.id]);

    if (role === 'user' && sortOrder === 0) {
      const autoTitle = content.substring(0, 60) + (content.length > 60 ? '...' : '');
      await pool.query('UPDATE conversations SET title = $1 WHERE id = $2', [autoTitle, req.params.id]);
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/messages/:id', authMiddleware, async (req, res) => {
  try {
    const { content } = req.body;
    const result = await pool.query(
      'UPDATE messages SET content = $1 WHERE id = $2 RETURNING *',
      [content, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Creations (protected) ──────────────────────────────────

app.get('/api/creations', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, conversation_id, created_at FROM creations WHERE user_id = $1 ORDER BY created_at DESC',
      [req.userId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/creations', authMiddleware, async (req, res) => {
  try {
    const { name, html, conversation_id } = req.body;
    const result = await pool.query(
      'INSERT INTO creations (user_id, name, html, conversation_id) VALUES ($1, $2, $3, $4) RETURNING *',
      [req.userId, name, html, conversation_id || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/creations/:id', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM creations WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/creations/:id', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM creations WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Eburon AI Backend running on port ${PORT}`);
});
