import { getToken } from './api';

export type CodeMaxDevAutonomy = 'auto_edit' | 'read_only' | 'yolo';

export type CodeMaxDevSseMessage =
  | { kind: 'status'; runId: string; status: 'started' | 'running' | 'done' | 'stopped'; ts: string; [k: string]: any }
  | { kind: 'event'; runId: string; ts: string; event: any }
  | { kind: 'approval'; runId: string; ts: string; toolUseId: string; toolName: string; args?: any; prompt?: string }
  | { kind: 'error'; runId: string; ts: string; error: string }
  | { kind: 'ping'; runId: string; ts: string; [k: string]: any };

function getBase(): string {
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  const isVPS = hostname.includes('168.231.78.113') || hostname.includes('codemaxx.eburon.ai');
  return isVPS ? '/api/db' : '/api';
}

export async function streamCodeMaxDevRun(
  params: {
    task: string;
    autonomy?: CodeMaxDevAutonomy;
    maxSteps?: number;
    model?: string;
  },
  onMessage: (msg: CodeMaxDevSseMessage) => void,
  signal?: AbortSignal
): Promise<void> {
  const token = getToken();
  if (!token) throw new Error('Sign in required for CodeMax Dev Autopilot');

  const res = await fetch(`${getBase()}/codemax-dev/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(params),
    signal,
  });

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(t || `CodeMax Dev stream failed (${res.status})`);
  }

  if (!res.body) throw new Error('CodeMax Dev stream failed: no response body');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    while (true) {
      const idx = buffer.indexOf('\n');
      if (idx === -1) break;
      const line = buffer.slice(0, idx).trimEnd();
      buffer = buffer.slice(idx + 1);

      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;

      try {
        const msg = JSON.parse(payload) as CodeMaxDevSseMessage;
        onMessage(msg);
      } catch {
        // Ignore partial/bad JSON
      }
    }
  }
}

export async function approveCodeMaxDevTool(params: {
  runId: string;
  toolUseId: string;
  decision: 'approve' | 'deny';
}): Promise<void> {
  const token = getToken();
  if (!token) throw new Error('Sign in required for approvals');

  const res = await fetch(`${getBase()}/codemax-dev/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || `Approval failed (${res.status})`);
  }
}

