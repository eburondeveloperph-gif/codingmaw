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

function handleRequest(req, res) {
  let urlPath = decodeURIComponent(new URL(req.url, 'https://localhost').pathname);
  if (urlPath === '/') urlPath = '/index.html';

  // Try exact file
  const filePath = path.join(STATIC_DIR, urlPath);
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
