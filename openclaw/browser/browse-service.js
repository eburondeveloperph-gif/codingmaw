#!/usr/bin/env node
/**
 * OpenClaw Browser Service — Eburon AI
 * Playwright-based web browsing with live screenshots, form filling, and navigation
 * Exposes HTTP API for the OpenClaw gateway to control a headless browser
 */

const http = require('http');
const { chromium } = require('playwright');

const PORT = parseInt(process.env.BROWSE_PORT || '18790');
const MAX_SESSIONS = 5;
const SESSION_TIMEOUT = 5 * 60 * 1000; // 5 minutes idle timeout

// ── Session Manager ──────────────────────────────────────
const sessions = new Map();

async function getOrCreateSession(sessionId) {
  if (sessions.has(sessionId)) {
    const session = sessions.get(sessionId);
    session.lastActive = Date.now();
    return session;
  }

  // Evict oldest session if at capacity
  if (sessions.size >= MAX_SESSIONS) {
    let oldest = null;
    for (const [id, s] of sessions) {
      if (!oldest || s.lastActive < oldest.lastActive) oldest = { id, ...s };
    }
    if (oldest) await destroySession(oldest.id);
  }

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  const session = { browser, context, page, lastActive: Date.now(), history: [] };
  sessions.set(sessionId, session);
  console.log(`[Session] Created: ${sessionId} (${sessions.size} active)`);
  return session;
}

async function destroySession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return;
  try { await session.browser.close(); } catch {}
  sessions.delete(sessionId);
  console.log(`[Session] Destroyed: ${sessionId} (${sessions.size} active)`);
}

// Cleanup idle sessions every 60s
setInterval(async () => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.lastActive > SESSION_TIMEOUT) {
      console.log(`[Session] Timeout: ${id}`);
      await destroySession(id);
    }
  }
}, 60000);

// ── Browser Actions ──────────────────────────────────────

async function navigate(session, url) {
  if (!url.startsWith('http')) url = 'https://' + url;
  await session.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
  session.history.push({ action: 'navigate', url, time: Date.now() });
  const screenshot = await session.page.screenshot({ type: 'jpeg', quality: 60 });
  return {
    url: session.page.url(),
    title: await session.page.title(),
    screenshot: screenshot.toString('base64'),
  };
}

async function screenshot(session) {
  const img = await session.page.screenshot({ type: 'jpeg', quality: 60 });
  return {
    url: session.page.url(),
    title: await session.page.title(),
    screenshot: img.toString('base64'),
  };
}

async function click(session, selector) {
  await session.page.click(selector, { timeout: 5000 });
  await session.page.waitForTimeout(500);
  session.history.push({ action: 'click', selector, time: Date.now() });
  const img = await session.page.screenshot({ type: 'jpeg', quality: 60 });
  return {
    url: session.page.url(),
    title: await session.page.title(),
    screenshot: img.toString('base64'),
  };
}

async function type(session, selector, text) {
  await session.page.click(selector, { timeout: 5000 });
  await session.page.fill(selector, text);
  session.history.push({ action: 'type', selector, text: text.replace(/./g, '*'), time: Date.now() });
  const img = await session.page.screenshot({ type: 'jpeg', quality: 60 });
  return {
    url: session.page.url(),
    title: await session.page.title(),
    screenshot: img.toString('base64'),
  };
}

async function fill(session, fields) {
  // fields: [{ selector, value }]
  for (const field of fields) {
    await session.page.click(field.selector, { timeout: 5000 });
    await session.page.fill(field.selector, field.value);
  }
  session.history.push({ action: 'fill', fields: fields.length, time: Date.now() });
  const img = await session.page.screenshot({ type: 'jpeg', quality: 60 });
  return {
    url: session.page.url(),
    title: await session.page.title(),
    screenshot: img.toString('base64'),
  };
}

async function submit(session, selector) {
  if (selector) {
    await session.page.click(selector, { timeout: 5000 });
  } else {
    await session.page.keyboard.press('Enter');
  }
  await session.page.waitForTimeout(2000);
  session.history.push({ action: 'submit', selector, time: Date.now() });
  const img = await session.page.screenshot({ type: 'jpeg', quality: 60 });
  return {
    url: session.page.url(),
    title: await session.page.title(),
    screenshot: img.toString('base64'),
  };
}

async function scroll(session, direction) {
  const delta = direction === 'up' ? -500 : 500;
  await session.page.mouse.wheel(0, delta);
  await session.page.waitForTimeout(300);
  const img = await session.page.screenshot({ type: 'jpeg', quality: 60 });
  return {
    url: session.page.url(),
    title: await session.page.title(),
    screenshot: img.toString('base64'),
  };
}

async function getPageContent(session) {
  const text = await session.page.evaluate(() => {
    // Get visible text content, limited to first 5000 chars
    return document.body?.innerText?.substring(0, 5000) || '';
  });
  const links = await session.page.evaluate(() => {
    return Array.from(document.querySelectorAll('a[href]')).slice(0, 20).map(a => ({
      text: a.innerText.trim().substring(0, 80),
      href: a.href,
    })).filter(l => l.text);
  });
  const inputs = await session.page.evaluate(() => {
    return Array.from(document.querySelectorAll('input, textarea, select, button[type="submit"]')).slice(0, 20).map(el => ({
      tag: el.tagName.toLowerCase(),
      type: el.type || '',
      name: el.name || '',
      id: el.id || '',
      placeholder: el.placeholder || '',
      selector: el.id ? `#${el.id}` : el.name ? `[name="${el.name}"]` : null,
    })).filter(el => el.selector);
  });
  return {
    url: session.page.url(),
    title: await session.page.title(),
    text,
    links,
    inputs,
  };
}

async function hover(session, selector) {
  await session.page.hover(selector, { timeout: 5000 });
  await session.page.waitForTimeout(300);
  session.history.push({ action: 'hover', selector, time: Date.now() });
  const img = await session.page.screenshot({ type: 'jpeg', quality: 60 });
  return {
    url: session.page.url(),
    title: await session.page.title(),
    screenshot: img.toString('base64'),
  };
}

async function press(session, key, selector) {
  if (selector) {
    await session.page.click(selector, { timeout: 5000 });
  }
  await session.page.keyboard.press(key);
  await session.page.waitForTimeout(300);
  session.history.push({ action: 'press', key, selector, time: Date.now() });
  const img = await session.page.screenshot({ type: 'jpeg', quality: 60 });
  return {
    url: session.page.url(),
    title: await session.page.title(),
    screenshot: img.toString('base64'),
  };
}

async function selectOption(session, selector, value) {
  await session.page.selectOption(selector, value, { timeout: 5000 });
  await session.page.waitForTimeout(300);
  session.history.push({ action: 'select', selector, value, time: Date.now() });
  const img = await session.page.screenshot({ type: 'jpeg', quality: 60 });
  return {
    url: session.page.url(),
    title: await session.page.title(),
    screenshot: img.toString('base64'),
  };
}

async function waitFor(session, selector, timeout) {
  const ms = timeout || 5000;
  if (selector) {
    await session.page.waitForSelector(selector, { timeout: ms });
  } else {
    await session.page.waitForTimeout(ms);
  }
  const img = await session.page.screenshot({ type: 'jpeg', quality: 60 });
  return {
    url: session.page.url(),
    title: await session.page.title(),
    screenshot: img.toString('base64'),
  };
}

async function focus(session, selector) {
  await session.page.focus(selector, { timeout: 5000 });
  session.history.push({ action: 'focus', selector, time: Date.now() });
  const img = await session.page.screenshot({ type: 'jpeg', quality: 60 });
  return {
    url: session.page.url(),
    title: await session.page.title(),
    screenshot: img.toString('base64'),
  };
}

async function dblclick(session, selector) {
  await session.page.dblclick(selector, { timeout: 5000 });
  await session.page.waitForTimeout(500);
  session.history.push({ action: 'dblclick', selector, time: Date.now() });
  const img = await session.page.screenshot({ type: 'jpeg', quality: 60 });
  return {
    url: session.page.url(),
    title: await session.page.title(),
    screenshot: img.toString('base64'),
  };
}

async function rightclick(session, selector) {
  await session.page.click(selector, { button: 'right', timeout: 5000 });
  await session.page.waitForTimeout(500);
  session.history.push({ action: 'rightclick', selector, time: Date.now() });
  const img = await session.page.screenshot({ type: 'jpeg', quality: 60 });
  return {
    url: session.page.url(),
    title: await session.page.title(),
    screenshot: img.toString('base64'),
  };
}

async function drag(session, fromSelector, toSelector) {
  await session.page.dragAndDrop(fromSelector, toSelector, { timeout: 5000 });
  await session.page.waitForTimeout(500);
  session.history.push({ action: 'drag', from: fromSelector, to: toSelector, time: Date.now() });
  const img = await session.page.screenshot({ type: 'jpeg', quality: 60 });
  return {
    url: session.page.url(),
    title: await session.page.title(),
    screenshot: img.toString('base64'),
  };
}

async function clear(session, selector) {
  await session.page.click(selector, { timeout: 5000 });
  await session.page.fill(selector, '');
  session.history.push({ action: 'clear', selector, time: Date.now() });
  const img = await session.page.screenshot({ type: 'jpeg', quality: 60 });
  return {
    url: session.page.url(),
    title: await session.page.title(),
    screenshot: img.toString('base64'),
  };
}

async function typeSlow(session, selector, text, delay) {
  const charDelay = delay || 80; // ms between keystrokes, like a real person
  await session.page.click(selector, { timeout: 5000 });
  await session.page.fill(selector, ''); // clear first
  await session.page.type(selector, text, { delay: charDelay });
  session.history.push({ action: 'type_slow', selector, text: text.replace(/./g, '*'), time: Date.now() });
  const img = await session.page.screenshot({ type: 'jpeg', quality: 60 });
  return {
    url: session.page.url(),
    title: await session.page.title(),
    screenshot: img.toString('base64'),
  };
}

async function check(session, selector, checked) {
  if (checked === false) {
    await session.page.uncheck(selector, { timeout: 5000 });
  } else {
    await session.page.check(selector, { timeout: 5000 });
  }
  await session.page.waitForTimeout(300);
  session.history.push({ action: checked === false ? 'uncheck' : 'check', selector, time: Date.now() });
  const img = await session.page.screenshot({ type: 'jpeg', quality: 60 });
  return {
    url: session.page.url(),
    title: await session.page.title(),
    screenshot: img.toString('base64'),
  };
}

async function upload(session, selector, filePath) {
  const fileInput = await session.page.$(selector);
  if (!fileInput) throw new Error(`File input not found: ${selector}`);
  await fileInput.setInputFiles(filePath);
  await session.page.waitForTimeout(500);
  session.history.push({ action: 'upload', selector, time: Date.now() });
  const img = await session.page.screenshot({ type: 'jpeg', quality: 60 });
  return {
    url: session.page.url(),
    title: await session.page.title(),
    screenshot: img.toString('base64'),
  };
}

async function evaluate(session, script) {
  const result = await session.page.evaluate(script);
  const img = await session.page.screenshot({ type: 'jpeg', quality: 60 });
  return {
    url: session.page.url(),
    title: await session.page.title(),
    result,
    screenshot: img.toString('base64'),
  };
}

async function goBack(session) {
  await session.page.goBack({ waitUntil: 'domcontentloaded', timeout: 10000 });
  const img = await session.page.screenshot({ type: 'jpeg', quality: 60 });
  return {
    url: session.page.url(),
    title: await session.page.title(),
    screenshot: img.toString('base64'),
  };
}

// ── HTTP Server ──────────────────────────────────────────

function corsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function jsonResponse(res, status, data) {
  corsHeaders(res);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function handleRequest(req, res) {
  corsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Health
  if (url.pathname === '/' || url.pathname === '/health') {
    jsonResponse(res, 200, {
      status: 'ok',
      service: 'OpenClaw Browser Service',
      sessions: sessions.size,
      maxSessions: MAX_SESSIONS,
      actions: ['navigate', 'screenshot', 'click', 'dblclick', 'rightclick', 'hover', 'type', 'type_slow', 'fill', 'clear', 'press', 'select', 'check', 'submit', 'scroll', 'focus', 'wait', 'drag', 'upload', 'content', 'evaluate', 'back', 'close'],
    });
    return;
  }

  // All actions require POST with JSON body
  if (req.method !== 'POST') {
    jsonResponse(res, 405, { error: 'POST required' });
    return;
  }

  let body = '';
  for await (const chunk of req) body += chunk;
  let params;
  try { params = JSON.parse(body); } catch {
    jsonResponse(res, 400, { error: 'Invalid JSON' });
    return;
  }

  const sessionId = params.session || 'default';

  try {
    let result;

    switch (url.pathname) {
      case '/navigate': {
        if (!params.url) return jsonResponse(res, 400, { error: 'url required' });
        const session = await getOrCreateSession(sessionId);
        result = await navigate(session, params.url);
        break;
      }
      case '/screenshot': {
        const session = await getOrCreateSession(sessionId);
        result = await screenshot(session);
        break;
      }
      case '/click': {
        if (!params.selector) return jsonResponse(res, 400, { error: 'selector required' });
        const session = await getOrCreateSession(sessionId);
        result = await click(session, params.selector);
        break;
      }
      case '/type': {
        if (!params.selector || !params.text) return jsonResponse(res, 400, { error: 'selector and text required' });
        const session = await getOrCreateSession(sessionId);
        result = await type(session, params.selector, params.text);
        break;
      }
      case '/fill': {
        if (!params.fields || !Array.isArray(params.fields)) return jsonResponse(res, 400, { error: 'fields array required' });
        const session = await getOrCreateSession(sessionId);
        result = await fill(session, params.fields);
        break;
      }
      case '/submit': {
        const session = await getOrCreateSession(sessionId);
        result = await submit(session, params.selector);
        break;
      }
      case '/scroll': {
        const session = await getOrCreateSession(sessionId);
        result = await scroll(session, params.direction || 'down');
        break;
      }
      case '/content': {
        const session = await getOrCreateSession(sessionId);
        result = await getPageContent(session);
        break;
      }
      case '/evaluate': {
        if (!params.script) return jsonResponse(res, 400, { error: 'script required' });
        const session = await getOrCreateSession(sessionId);
        result = await evaluate(session, params.script);
        break;
      }
      case '/back': {
        const session = await getOrCreateSession(sessionId);
        result = await goBack(session);
        break;
      }
      case '/hover': {
        if (!params.selector) return jsonResponse(res, 400, { error: 'selector required' });
        const session = await getOrCreateSession(sessionId);
        result = await hover(session, params.selector);
        break;
      }
      case '/press': {
        if (!params.key) return jsonResponse(res, 400, { error: 'key required (e.g. Enter, Tab, Escape)' });
        const session = await getOrCreateSession(sessionId);
        result = await press(session, params.key, params.selector);
        break;
      }
      case '/select': {
        if (!params.selector || !params.value) return jsonResponse(res, 400, { error: 'selector and value required' });
        const session = await getOrCreateSession(sessionId);
        result = await selectOption(session, params.selector, params.value);
        break;
      }
      case '/wait': {
        const session = await getOrCreateSession(sessionId);
        result = await waitFor(session, params.selector, params.timeout);
        break;
      }
      case '/focus': {
        if (!params.selector) return jsonResponse(res, 400, { error: 'selector required' });
        const session = await getOrCreateSession(sessionId);
        result = await focus(session, params.selector);
        break;
      }
      case '/dblclick': {
        if (!params.selector) return jsonResponse(res, 400, { error: 'selector required' });
        const session = await getOrCreateSession(sessionId);
        result = await dblclick(session, params.selector);
        break;
      }
      case '/rightclick': {
        if (!params.selector) return jsonResponse(res, 400, { error: 'selector required' });
        const session = await getOrCreateSession(sessionId);
        result = await rightclick(session, params.selector);
        break;
      }
      case '/drag': {
        if (!params.from || !params.to) return jsonResponse(res, 400, { error: 'from and to selectors required' });
        const session = await getOrCreateSession(sessionId);
        result = await drag(session, params.from, params.to);
        break;
      }
      case '/clear': {
        if (!params.selector) return jsonResponse(res, 400, { error: 'selector required' });
        const session = await getOrCreateSession(sessionId);
        result = await clear(session, params.selector);
        break;
      }
      case '/type_slow': {
        if (!params.selector || !params.text) return jsonResponse(res, 400, { error: 'selector and text required' });
        const session = await getOrCreateSession(sessionId);
        result = await typeSlow(session, params.selector, params.text, params.delay);
        break;
      }
      case '/check': {
        if (!params.selector) return jsonResponse(res, 400, { error: 'selector required' });
        const session = await getOrCreateSession(sessionId);
        result = await check(session, params.selector, params.checked);
        break;
      }
      case '/upload': {
        if (!params.selector || !params.file) return jsonResponse(res, 400, { error: 'selector and file required' });
        const session = await getOrCreateSession(sessionId);
        result = await upload(session, params.selector, params.file);
        break;
      }
      case '/close': {
        await destroySession(sessionId);
        result = { closed: true };
        break;
      }
      default:
        return jsonResponse(res, 404, { error: 'Unknown action' });
    }

    jsonResponse(res, 200, { ok: true, ...result });
  } catch (err) {
    console.error(`[Error] ${url.pathname}:`, err.message);
    jsonResponse(res, 500, { error: err.message });
  }
}

const server = http.createServer(handleRequest);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`═══════════════════════════════════════════`);
  console.log(`  OpenClaw Browser Service — Eburon AI`);
  console.log(`  Port: ${PORT}`);
  console.log(`  Max Sessions: ${MAX_SESSIONS}`);
  console.log(`  Idle Timeout: ${SESSION_TIMEOUT / 1000}s`);
  console.log(`═══════════════════════════════════════════`);
});
