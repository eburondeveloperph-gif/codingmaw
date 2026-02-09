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

// ── Ollama Cloud Proxy with Fallback (avoids CORS in production) ──────────

async function tryOllamaEndpoint(url, headers, body, res) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const upstream = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!upstream.ok) {
      const errText = await upstream.text();
      throw new Error(`${upstream.status}: ${errText}`);
    }

    // Stream response
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Transfer-Encoding', 'chunked');

    const reader = upstream.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) { res.end(); return true; }
      res.write(Buffer.from(value));
    }
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

app.post('/api/ollama/chat', async (req, res) => {
  const cloudUrl = process.env.OLLAMA_CLOUD_URL || 'https://api.ollama.com';
  const apiKey = process.env.OLLAMA_API_KEY || '';
  const fallbackUrl = process.env.OLLAMA_FALLBACK_URL || 'http://168.231.78.113:11434';

  // Try primary (Ollama Cloud)
  if (apiKey) {
    try {
      await tryOllamaEndpoint(
        `${cloudUrl}/api/chat`,
        { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        req.body,
        res
      );
      return;
    } catch (err) {
      console.error('Primary Ollama failed, trying fallback:', err.message);
    }
  }

  // Try fallback (self-hosted server) — remap model names to CodeMax models
  if (!res.headersSent) {
    const fallbackModelMap = {
      'kimi-k2.5:cloud':        'codemax-qwen',
      'kimi-k2-thinking:cloud': 'codemax-kimi',
      'gpt-oss:120b-cloud':     'codemax-qwen',
      'qwen3-coder-next:cloud': 'codemax-qwen',
      'llama3.2:1b':            'codemax-llama',
    };
    const fallbackBody = { ...req.body };
    if (fallbackBody.model && fallbackModelMap[fallbackBody.model]) {
      console.log(`Remapping model: ${fallbackBody.model} → ${fallbackModelMap[fallbackBody.model]}`);
      fallbackBody.model = fallbackModelMap[fallbackBody.model];
    }
    try {
      await tryOllamaEndpoint(
        `${fallbackUrl}/api/chat`,
        { 'Content-Type': 'application/json' },
        fallbackBody,
        res
      );
      return;
    } catch (err) {
      console.error('Fallback Ollama failed:', err.message);
    }
  }

  if (!res.headersSent) {
    res.status(502).json({ error: 'All Ollama endpoints failed. Primary and fallback both unreachable.' });
  }
});

// ── Health check (public) ──────────────────────────────────

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch (err) {
    res.status(503).json({ status: 'error', db: 'disconnected' });
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
      'SELECT id, email, password_hash, display_name, avatar_url, ollama_cloud_url, ollama_api_key, ollama_local_url, created_at FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid email or password' });

    const user = result.rows[0];
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
      'SELECT id, email, display_name, avatar_url, ollama_cloud_url, ollama_api_key, ollama_local_url, created_at, updated_at FROM users WHERE id = $1',
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
       RETURNING id, email, display_name, avatar_url, ollama_cloud_url, ollama_api_key, ollama_local_url, created_at, updated_at`,
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

export default app;
