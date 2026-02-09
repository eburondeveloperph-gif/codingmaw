import { spawn } from 'child_process';
import readline from 'readline';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

/**
 * CodeMax Dev Autopilot Runner
 * Spawns Gemini CLI (white-labeled) and streams JSON events to the UI over SSE.
 *
 * Notes:
 * - Gemini CLI flags/event schema can change; this runner is defensive and also supports
 *   env overrides for CLI path/args.
 * - Secrets must never be emitted to the client.
 */

const runs = new Map(); // runId -> run
const userActiveRun = new Map(); // userId -> runId

const DEFAULT_MAX_CONCURRENT = 2;
const MAX_CONCURRENT = Number.parseInt(process.env.CODEMAX_DEV_MAX_CONCURRENT || '', 10) || DEFAULT_MAX_CONCURRENT;

const DEFAULT_GATED_TOOLS = new Set([
  'run_shell_command',
  'shell',
  'run_shell',
  'web_fetch',
  'google_web_search',
]);

function nowIso() {
  return new Date().toISOString();
}

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function scrubString(s) {
  return s.replace(/gemini/gi, 'CodeMax Dev');
}

function looksSensitiveKey(key) {
  return /(api_?key|token|authorization|secret|password|headers|env)$/i.test(key);
}

function scrubValue(value, depth = 0) {
  if (depth > 6) return value;
  if (typeof value === 'string') return scrubString(value);
  if (Array.isArray(value)) return value.slice(0, 200).map(v => scrubValue(v, depth + 1));
  if (!isObject(value)) return value;

  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (looksSensitiveKey(k)) continue;
    if (k === 'model') {
      out[k] = 'codemax-dev';
      continue;
    }
    out[k] = scrubValue(v, depth + 1);
  }
  return out;
}

function sanitizeEvent(event) {
  try {
    return scrubValue(event, 0);
  } catch {
    // If anything goes wrong, don't block the stream.
    return { type: 'unknown', note: 'event_sanitization_failed' };
  }
}

function normalizeToolName(name) {
  return String(name || '').trim().toLowerCase();
}

function extractToolUse(event) {
  if (!isObject(event)) return null;

  const type = String(event.type || event.event_type || event.kind || '').toLowerCase();
  const maybeTool =
    type.includes('tool') && (type.includes('use') || type.includes('call') || type.includes('invocation'));

  const toolName =
    event.tool_name ||
    event.toolName ||
    event.name ||
    event.tool ||
    (isObject(event.tool) ? (event.tool.name || event.tool.tool_name || event.tool.toolName) : null);

  if (!toolName) return null;

  // If the event doesn't clearly look like a tool event, still allow through if it has a toolName.
  if (!maybeTool && !type) {
    // fallthrough
  }

  const toolUseId =
    event.tool_use_id ||
    event.toolUseId ||
    event.tool_id ||
    event.toolId ||
    event.call_id ||
    event.callId ||
    event.id ||
    crypto.randomUUID();

  const args =
    event.args ||
    event.arguments ||
    event.parameters ||
    event.params ||
    event.input ||
    (isObject(event.tool) ? (event.tool.args || event.tool.arguments || event.tool.parameters || event.tool.params) : null) ||
    null;

  return { toolName: String(toolName), toolUseId: String(toolUseId), args };
}

function getShellCommandFromArgs(args) {
  if (!args) return '';
  if (typeof args === 'string') return args;
  if (Array.isArray(args)) return args.map(String).join(' ');
  if (!isObject(args)) return '';

  const candidates = ['command', 'cmd', 'shell', 'script', 'args', 'argv'];
  for (const key of candidates) {
    const v = args[key];
    if (typeof v === 'string') return v;
    if (Array.isArray(v)) return v.map(String).join(' ');
  }
  return '';
}

function isDangerousShellCommand(cmd) {
  const s = String(cmd || '').trim().toLowerCase();
  if (!s) return false;

  const patterns = [
    /\brm\s+-rf\b/,
    /\bmkfs\b/,
    /\bdd\s+if=/,
    /\bshutdown\b/,
    /\breboot\b/,
    /\bpoweroff\b/,
    /:\(\)\s*\{\s*:\s*\|\s*:\s*;\s*\}\s*;/, // fork bomb
    />\s*\/dev\/sd[a-z]\b/,
    /\b\/dev\/sd[a-z]\b/,
  ];
  return patterns.some(p => p.test(s));
}

function resolveCliPath() {
  const override = (process.env.CODEMAX_DEV_CLI_PATH || '').trim();
  if (override) return override;

  const localBin = path.resolve(process.cwd(), 'node_modules', '.bin', 'gemini');
  try {
    if (fs.existsSync(localBin)) return localBin;
  } catch { /* ignore */ }

  // Fallback to PATH resolution
  return 'gemini';
}

function buildDefaultArgs({ prompt, autonomy, model, maxSteps }) {
  // Allow full override if needed (string split is intentionally minimal).
  const raw = (process.env.CODEMAX_DEV_CLI_ARGS || '').trim();
  if (raw) {
    const parts = raw.split(' ').filter(Boolean);
    return parts.map(p => (p === '{{PROMPT}}' ? prompt : p));
  }

  // Best-effort defaults (Gemini CLI interface can vary).
  const args = [];

  // Prompt
  args.push('--prompt', prompt);

  // Streaming JSON output
  args.push('--output-format', 'stream-json');

  // Autonomy mode
  if (autonomy === 'yolo') {
    args.push('--yolo');
  } else {
    args.push('--approval-mode', autonomy === 'read_only' ? 'read_only' : 'auto_edit');
  }

  if (model) args.push('--model', model);
  if (typeof maxSteps === 'number' && Number.isFinite(maxSteps)) args.push('--max-steps', String(maxSteps));

  return args;
}

export function startCodeMaxDevRun({
  userId,
  task,
  autonomy = 'auto_edit',
  maxSteps = 20,
  model,
  emit,
  gatedTools,
  onEnd,
}) {
  if (!userId) throw new Error('Missing userId');
  if (!task || !String(task).trim()) throw new Error('Missing task');
  if (typeof emit !== 'function') throw new Error('Missing emit');

  if ((process.env.GEMINI_API_KEY || '').trim() === '' && (process.env.GOOGLE_API_KEY || '').trim() === '') {
    throw new Error('Missing server API key. Set GEMINI_API_KEY (or GOOGLE_API_KEY) on the backend.');
  }

  if (runs.size >= MAX_CONCURRENT) {
    throw new Error(`Too many concurrent runs. Try again in a moment (max ${MAX_CONCURRENT}).`);
  }

  if (userActiveRun.has(userId)) {
    const active = userActiveRun.get(userId);
    throw new Error(`You already have an active run (${active}). Stop it before starting a new one.`);
  }

  const runId = crypto.randomUUID();
  const cliPath = resolveCliPath();

  const systemFraming = [
    'You are CodeMax Dev Autopilot.',
    'Operate autonomously on complex tasks.',
    'Stream progress as JSON events.',
    'Never mention any provider/model names; refer to yourself as CodeMax Dev.',
    '',
    `TASK: ${String(task).trim()}`,
  ].join('\n');

  const envModel = (process.env.CODEMAX_DEV_MODEL || '').trim();
  const effectiveModel = (model || envModel || '').trim() || undefined;
  const args = buildDefaultArgs({ prompt: systemFraming, autonomy, model: effectiveModel, maxSteps });

  const env = {
    ...process.env,
    // Compatibility: some tooling uses GOOGLE_API_KEY.
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
    GOOGLE_API_KEY: process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY,
    CODEMAX_DEV_BRAND: 'codemax-dev',
    GEMINI_CLI_DISABLE_TELEMETRY: process.env.GEMINI_CLI_DISABLE_TELEMETRY || '1',
  };

  const proc = spawn(cliPath, args, {
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const run = {
    runId,
    userId,
    proc,
    startedAt: Date.now(),
    pendingApprovals: new Map(), // toolUseId -> resolver(decision)
    gatedTools: gatedTools ? new Set(gatedTools.map(normalizeToolName)) : DEFAULT_GATED_TOOLS,
    emit,
    ended: false,
    onEnd,
  };

  runs.set(runId, run);
  userActiveRun.set(userId, runId);

  emit({ kind: 'status', runId, status: 'started', ts: nowIso() });
  emit({ kind: 'status', runId, status: 'running', ts: nowIso() });

  const pingTimer = setInterval(() => {
    if (run.ended) return;
    emit({ kind: 'ping', runId, ts: nowIso() });
  }, 15000);

  const rlOut = readline.createInterface({ input: proc.stdout });
  const rlErr = readline.createInterface({ input: proc.stderr });

  let chain = Promise.resolve();

  rlOut.on('line', (line) => {
    chain = chain.then(() => handleStdoutLine(run, line)).catch((err) => {
      emit({ kind: 'error', runId, ts: nowIso(), error: String(err?.message || err || 'Unknown error') });
    });
  });

  rlErr.on('line', (line) => {
    const safe = scrubString(String(line || '').slice(0, 5000));
    if (safe.trim()) emit({ kind: 'event', runId, ts: nowIso(), event: { type: 'stderr', content: safe } });
  });

  proc.on('error', (err) => {
    emit({ kind: 'error', runId, ts: nowIso(), error: String(err?.message || err || 'Failed to start CLI') });
    stopCodeMaxDevRun(runId, { reason: 'spawn_error' });
  });

  proc.on('exit', (code, signal) => {
    clearInterval(pingTimer);
    rlOut.close();
    rlErr.close();

    if (!run.ended) {
      run.ended = true;
      emit({ kind: 'status', runId, status: 'done', ts: nowIso(), code, signal });
      cleanupRun(runId);
      if (typeof run.onEnd === 'function') run.onEnd();
    }
  });

  return runId;
}

async function handleStdoutLine(run, line) {
  const raw = String(line || '').trim();
  if (!raw) return;

  let event = null;
  try {
    event = JSON.parse(raw);
  } catch {
    // Non-JSON output (still show it)
    run.emit({ kind: 'event', runId: run.runId, ts: nowIso(), event: { type: 'text', content: scrubString(raw.slice(0, 5000)) } });
    return;
  }

  const sanitized = sanitizeEvent(event);
  run.emit({ kind: 'event', runId: run.runId, ts: nowIso(), event: sanitized });

  const toolUse = extractToolUse(event);
  if (!toolUse) return;

  const toolNameNorm = normalizeToolName(toolUse.toolName);
  if (!run.gatedTools.has(toolNameNorm)) return;

  // Register the approval resolver before notifying the client, so ultra-fast
  // approval posts can't race ahead of pending registration.
  const approvalPromise = waitForApproval(run, toolUse.toolUseId, 60000);

  // Ask the UI for approval
  run.emit({
    kind: 'approval',
    runId: run.runId,
    ts: nowIso(),
    toolUseId: toolUse.toolUseId,
    toolName: toolUse.toolName,
    args: scrubValue(toolUse.args),
    prompt: `Approve tool action: ${toolUse.toolName}?`,
  });

  const decision = await approvalPromise;

  // Extra safety gate for shell, even if approved.
  if (toolNameNorm.includes('shell')) {
    const cmd = getShellCommandFromArgs(toolUse.args);
    if (isDangerousShellCommand(cmd)) {
      run.emit({ kind: 'error', runId: run.runId, ts: nowIso(), error: 'Blocked dangerous shell command.' });
      writeToStdin(run.proc, 'n\n');
      return;
    }
  }

  writeToStdin(run.proc, decision === 'approve' ? 'y\n' : 'n\n');
}

function writeToStdin(proc, data) {
  try {
    if (!proc?.stdin?.writable) return;
    proc.stdin.write(data);
  } catch { /* ignore */ }
}

function waitForApproval(run, toolUseId, timeoutMs) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      run.pendingApprovals.delete(toolUseId);
      resolve('deny');
    }, timeoutMs);

    run.pendingApprovals.set(toolUseId, (decision) => {
      clearTimeout(timer);
      run.pendingApprovals.delete(toolUseId);
      resolve(decision === 'approve' ? 'approve' : 'deny');
    });
  });
}

export function approveCodeMaxDevTool({ runId, toolUseId, decision }) {
  const run = runs.get(runId);
  if (!run) return { ok: false, error: 'not_found' };

  const resolver = run.pendingApprovals.get(toolUseId);
  if (!resolver) return { ok: false, error: 'not_pending' };

  resolver(decision === 'approve' ? 'approve' : 'deny');
  return { ok: true };
}

export function stopCodeMaxDevRun(runId, { reason = 'stopped' } = {}) {
  const run = runs.get(runId);
  if (!run) return { ok: false, error: 'not_found' };

  if (run.ended) return { ok: true };
  run.ended = true;

  // Deny any pending approvals to unblock internal awaits
  for (const [toolUseId, resolver] of run.pendingApprovals) {
    try { resolver('deny'); } catch { /* ignore */ }
    run.pendingApprovals.delete(toolUseId);
  }

  try {
    run.emit({ kind: 'status', runId, status: 'stopped', ts: nowIso(), reason });
  } catch { /* ignore */ }

  try {
    run.proc.kill('SIGTERM');
    setTimeout(() => {
      try { run.proc.kill('SIGKILL'); } catch { /* ignore */ }
    }, 2500);
  } catch { /* ignore */ }

  cleanupRun(runId);
  if (typeof run.onEnd === 'function') {
    try { run.onEnd(); } catch { /* ignore */ }
  }
  return { ok: true };
}

function cleanupRun(runId) {
  const run = runs.get(runId);
  if (!run) return;
  runs.delete(runId);
  const active = userActiveRun.get(run.userId);
  if (active === runId) userActiveRun.delete(run.userId);
}

export function getCodeMaxDevRun(runId) {
  return runs.get(runId) || null;
}
