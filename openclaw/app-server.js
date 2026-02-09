#!/usr/bin/env node
/**
 * Eburon AI — HTTPS Static Server
 * Serves the built frontend over HTTPS to enable microphone/camera APIs on non-localhost
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.APP_PORT || '3581');
const STATIC_DIR = process.env.STATIC_DIR || '/opt/eburon-app';
const SSL_KEY = process.env.SSL_KEY || path.join(STATIC_DIR, 'ssl', 'key.pem');
const SSL_CERT = process.env.SSL_CERT || path.join(STATIC_DIR, 'ssl', 'cert.pem');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.webp': 'image/webp',
  '.webm': 'video/webm',
  '.mp4':  'video/mp4',
  '.map':  'application/json',
};

function serveFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, {
      'Content-Type': mimeType,
      'Content-Length': data.length,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(data);
  } catch {
    return false;
  }
  return true;
}

// ── API Proxy (avoids mixed-content HTTPS→HTTP) ──────────
const OLLAMA_URL = 'http://127.0.0.1:11434';
const OPENCLAW_URL = 'http://127.0.0.1:18789';
const BROWSE_URL = 'http://127.0.0.1:18790';

function proxyRequest(req, res, targetUrl) {
  let body = [];
  req.on('data', chunk => body.push(chunk));
  req.on('end', async () => {
    try {
      const fetchOpts = {
        method: req.method,
        headers: { 'Content-Type': 'application/json' },
      };
      if (req.headers['x-openclaw-skill']) fetchOpts.headers['x-openclaw-skill'] = req.headers['x-openclaw-skill'];
      if (req.headers['x-openclaw-agent-id']) fetchOpts.headers['x-openclaw-agent-id'] = req.headers['x-openclaw-agent-id'];
      if (req.headers['authorization']) fetchOpts.headers['Authorization'] = req.headers['authorization'];
      if (body.length > 0) fetchOpts.body = Buffer.concat(body);

      const upstream = await fetch(targetUrl, fetchOpts);
      const contentType = upstream.headers.get('content-type') || '';

      // Stream responses (Ollama chat, SSE)
      if (contentType.includes('application/x-ndjson') || contentType.includes('text/event-stream') || contentType.includes('application/json')) {
        res.writeHead(upstream.status, {
          'Content-Type': contentType,
          'Cache-Control': 'no-cache',
          'Access-Control-Allow-Origin': '*',
        });
        const reader = upstream.body.getReader();
        const pump = async () => {
          while (true) {
            const { done, value } = await reader.read();
            if (done) { res.end(); return; }
            res.write(Buffer.from(value));
          }
        };
        pump().catch(() => res.end());
      } else {
        const data = await upstream.arrayBuffer();
        res.writeHead(upstream.status, {
          'Content-Type': contentType,
          'Access-Control-Allow-Origin': '*',
        });
        res.end(Buffer.from(data));
      }
    } catch (err) {
      res.writeHead(502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: `Proxy error: ${err.message}` }));
    }
  });
}

function handleRequest(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-openclaw-agent-id, x-openclaw-skill',
    });
    res.end();
    return;
  }

  const urlPath = decodeURIComponent(new URL(req.url, 'https://localhost').pathname);

  // ── API Proxies ──────────
  if (urlPath.startsWith('/api/ollama/')) {
    const ollamaPath = urlPath.replace('/api/ollama', '/api');
    proxyRequest(req, res, `${OLLAMA_URL}${ollamaPath}`);
    return;
  }
  if (urlPath.startsWith('/api/agent/')) {
    const agentPath = urlPath.replace('/api/agent', '');
    proxyRequest(req, res, `${OPENCLAW_URL}${agentPath}`);
    return;
  }
  if (urlPath.startsWith('/api/browse/')) {
    const browsePath = urlPath.replace('/api/browse', '');
    proxyRequest(req, res, `${BROWSE_URL}${browsePath}`);
    return;
  }

  // ── Static files ──────────
  let staticPath = urlPath === '/' ? '/index.html' : urlPath;
  const filePath = path.join(STATIC_DIR, staticPath);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    serveFile(res, filePath);
    return;
  }

  // SPA fallback: serve index.html for all non-asset routes
  const indexPath = path.join(STATIC_DIR, 'index.html');
  if (fs.existsSync(indexPath)) {
    serveFile(res, indexPath);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
}

// Start HTTPS if certs exist, otherwise HTTP with warning
if (fs.existsSync(SSL_KEY) && fs.existsSync(SSL_CERT)) {
  const sslOpts = {
    key: fs.readFileSync(SSL_KEY),
    cert: fs.readFileSync(SSL_CERT),
  };
  https.createServer(sslOpts, handleRequest).listen(PORT, '0.0.0.0', () => {
    console.log(`═══════════════════════════════════════════`);
    console.log(`  Eburon AI — HTTPS Server`);
    console.log(`  https://0.0.0.0:${PORT}`);
    console.log(`  SSL: ✅ (microphone/camera enabled)`);
    console.log(`  Static: ${STATIC_DIR}`);
    console.log(`═══════════════════════════════════════════`);
  });

  // Also redirect HTTP → HTTPS on port 3580
  const HTTP_PORT = PORT - 1;
  http.createServer((req, res) => {
    const host = req.headers.host?.replace(`:${HTTP_PORT}`, `:${PORT}`) || `localhost:${PORT}`;
    res.writeHead(301, { Location: `https://${host}${req.url}` });
    res.end();
  }).listen(HTTP_PORT, '0.0.0.0', () => {
    console.log(`  HTTP redirect: http://0.0.0.0:${HTTP_PORT} → https`);
  });
} else {
  console.warn('⚠ SSL certs not found — falling back to HTTP (microphone will NOT work)');
  http.createServer(handleRequest).listen(PORT, '0.0.0.0', () => {
    console.log(`  Eburon AI — HTTP Server (no SSL)`);
    console.log(`  http://0.0.0.0:${PORT}`);
  });
}
