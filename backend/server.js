import express from 'express';
import cors from 'cors';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { startCodeMaxDevRun, approveCodeMaxDevTool, stopCodeMaxDevRun, getCodeMaxDevRun } from './services/codemaxDevRunner.js';

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

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ── Default User Middleware (no auth required) ─────────────────

let defaultUserId = null;

async function ensureDefaultUser() {
  if (defaultUserId) return defaultUserId;
  try {
    const existing = await pool.query("SELECT id FROM users WHERE email = 'default@eburon.local'");
    if (existing.rows.length > 0) {
      defaultUserId = existing.rows[0].id;
    } else {
      const result = await pool.query(
        "INSERT INTO users (email, display_name) VALUES ('default@eburon.local', 'Eburon User') RETURNING id"
      );
      defaultUserId = result.rows[0].id;
    }
  } catch (err) {
    console.error('Failed to ensure default user:', err.message);
  }
  return defaultUserId;
}

function authMiddleware(req, res, next) {
  // If a JWT is provided, use it; otherwise fall back to default user
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(header.split(' ')[1], JWT_SECRET);
      req.userId = decoded.userId;
      return next();
    } catch { /* fall through to default user */ }
  }
  if (defaultUserId) {
    req.userId = defaultUserId;
    return next();
  }
  ensureDefaultUser().then(id => {
    if (!id) return res.status(500).json({ error: 'No default user available' });
    req.userId = id;
    next();
  }).catch(() => res.status(500).json({ error: 'Failed to resolve user' }));
}

function strictAuthMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const decoded = jwt.verify(header.split(' ')[1], JWT_SECRET);
    req.userId = decoded.userId;
    return next();
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

// ── Firebase Auth ────────────────────────────────────────────

app.post('/api/auth/google/callback', async (req, res) => {
  try {
    const { firebase_uid, email, display_name, photo_url } = req.body;
    if (!firebase_uid || !email) {
      return res.status(400).json({ error: 'Firebase UID and email are required' });
    }

    const userFields = 'id, email, display_name, avatar_url, ollama_cloud_url, ollama_api_key, ollama_local_url, google_id, google_scopes, google_token_expiry, created_at, updated_at';

    // Check if user exists by google_id (Firebase UID)
    let result = await pool.query(
      `SELECT ${userFields} FROM users WHERE google_id = $1`,
      [firebase_uid]
    );

    if (result.rows.length > 0) {
      const user = result.rows[0];
      const jwtToken = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
      return res.json({ token: jwtToken, user });
    }

    // Check if user exists by email
    result = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);

    if (result.rows.length > 0) {
      const userId = result.rows[0].id;
      await pool.query(
        `UPDATE users SET google_id = $1, avatar_url = COALESCE(avatar_url, $2), updated_at = NOW() WHERE id = $3`,
        [firebase_uid, photo_url || null, userId]
      );
      const updated = await pool.query(`SELECT ${userFields} FROM users WHERE id = $1`, [userId]);
      const jwtToken = jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
      return res.json({ token: jwtToken, user: updated.rows[0] });
    }

    // New user — create account
    const newUser = await pool.query(
      `INSERT INTO users (email, display_name, avatar_url, google_id)
       VALUES ($1, $2, $3, $4)
       RETURNING ${userFields}`,
      [email.toLowerCase(), display_name || email.split('@')[0], photo_url || null, firebase_uid]
    );
    const user = newUser.rows[0];
    const jwtToken = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    res.status(201).json({ token: jwtToken, user });
  } catch (err) {
    console.error('Firebase auth error:', err);
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

// Google connection status
app.get('/api/auth/google/status', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT google_id FROM users WHERE id = $1',
      [req.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const connected = !!result.rows[0].google_id;
    res.json({ connected });
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

// ── CodeMax Dev Autopilot (Manus-style, white-labeled) ───────────────

app.post('/api/codemax-dev/stream', strictAuthMiddleware, async (req, res) => {
  const startedAt = Date.now();
  let runId = null;

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  // Disable buffering on common proxies (nginx)
  res.setHeader('X-Accel-Buffering', 'no');

  // Best-effort flush
  try { res.flushHeaders?.(); } catch {}

  const emit = (obj) => {
    try {
      if (res.writableEnded) return;
      res.write(`data: ${JSON.stringify(obj)}\n\n`);
    } catch {}
  };

  const end = () => {
    try { if (!res.writableEnded) res.end(); } catch {}
  };

  try {
    const { task, autonomy, maxSteps, model } = req.body || {};

    runId = startCodeMaxDevRun({
      userId: req.userId,
      task,
      autonomy,
      maxSteps,
      model,
      emit,
      onEnd: end,
    });
  } catch (err) {
    emit({ kind: 'error', runId: runId || 'unknown', ts: new Date().toISOString(), error: err instanceof Error ? err.message : String(err) });
    end();
    return;
  }

  // Kill the run if client disconnects (Stop button / tab close)
  req.on('close', () => {
    const live = runId ? getCodeMaxDevRun(runId) : null;
    if (live) stopCodeMaxDevRun(runId, { reason: 'client_disconnected', startedAt });
  });
});

app.post('/api/codemax-dev/approve', strictAuthMiddleware, async (req, res) => {
  try {
    const { runId, toolUseId, decision } = req.body || {};
    if (!runId || !toolUseId || !decision) {
      return res.status(400).json({ error: 'runId, toolUseId, and decision are required' });
    }

    const run = getCodeMaxDevRun(runId);
    if (!run) return res.status(404).json({ error: 'Run not found' });
    if (run.userId !== req.userId) return res.status(403).json({ error: 'Forbidden' });

    const result = approveCodeMaxDevTool({ runId, toolUseId, decision });
    if (!result.ok) return res.status(404).json({ error: result.error || 'Not found' });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── Deprecated Gemini Agent Routes ───────────────────────────────
// These previously imported a TS module as .js without a build step.
// Keep endpoints but mark as gone to avoid runtime import errors.
app.post('/api/agent/gemini', (_req, res) => {
  res.status(410).json({ error: 'Deprecated. Use /api/codemax-dev/stream' });
});
app.post('/api/agent/gemini/stream', (_req, res) => {
  res.status(410).json({ error: 'Deprecated. Use /api/codemax-dev/stream' });
});
app.post('/api/agent/gemini/autonomous', (_req, res) => {
  res.status(410).json({ error: 'Deprecated. Use /api/codemax-dev/stream' });
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
app.listen(PORT, async () => {
  console.log(`Eburon AI Backend running on port ${PORT}`);
  await ensureDefaultUser();
  console.log(`Default user ready (id: ${defaultUserId})`);
});
