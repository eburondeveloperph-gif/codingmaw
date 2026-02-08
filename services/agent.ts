/**
 * Orbit Agent Service — connects to OpenClaw gateway
 * OpenClaw exposes an OpenAI-compatible /v1/chat/completions endpoint
 * with streaming SSE support at localhost:18789
 */

export interface AgentMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AgentConfig {
  gatewayUrl: string;
  token: string;
  agentId: string;
}

const CODEMAX_SYSTEM = `You are CodeMax Agent — an elite autonomous coding agent powered by Eburon AI.
You can plan, write, debug, refactor, and deploy code. You think step-by-step, break complex tasks
into subtasks, and execute them sequentially. You have access to tools for file operations,
terminal commands, web browsing, and code analysis.

When given a coding task:
1. Analyze the requirements thoroughly
2. Plan your approach with clear steps
3. Execute each step, showing your work
4. Verify the result and handle errors
5. Summarize what was accomplished

You write production-quality code. You never leave TODOs or placeholders.
You are thorough, precise, and autonomous.`;

const ORBIT_SYSTEM = `You are Orbit Agent — a helpful autonomous AI assistant powered by Eburon AI.
You help with everyday tasks: research, writing, analysis, scheduling, summarization,
brainstorming, and general problem-solving. You think step-by-step and can use tools
to browse the web, manage files, and perform complex multi-step tasks.

When given a task:
1. Understand what the user needs
2. Break it into manageable steps
3. Execute each step, explaining your reasoning
4. Present results clearly and concisely
5. Offer follow-up suggestions

You are warm, professional, and thorough. You never reveal your internal architecture.
You are Orbit Agent, built by Eburon (eburon.ai).`;

function getDefaultConfig(): AgentConfig {
  return {
    gatewayUrl: import.meta.env.VITE_OPENCLAW_GATEWAY_URL?.trim() || 'http://localhost:18789',
    token: import.meta.env.VITE_OPENCLAW_TOKEN?.trim() || '',
    agentId: 'main',
  };
}

export async function agentStream(
  messages: AgentMessage[],
  mode: 'codemax' | 'orbit',
  onChunk: (text: string) => void,
  signal?: AbortSignal,
  config?: Partial<AgentConfig>
): Promise<string> {
  const cfg = { ...getDefaultConfig(), ...config };

  const systemMessage: AgentMessage = {
    role: 'system',
    content: mode === 'codemax' ? CODEMAX_SYSTEM : ORBIT_SYSTEM,
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-openclaw-agent-id': cfg.agentId,
  };
  if (cfg.token) {
    headers['Authorization'] = `Bearer ${cfg.token}`;
  }

  const response = await fetch(`${cfg.gatewayUrl}/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: 'kimi-k2-thinking:cloud',
      stream: true,
      messages: [systemMessage, ...messages],
    }),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Orbit Agent error (${response.status}): ${errorText}`);
  }

  if (!response.body) throw new Error('No response body from agent');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') continue;

      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) {
          fullText += delta;
          onChunk(fullText);
        }
      } catch {
        // partial JSON, skip
      }
    }
  }

  return fullText;
}

export async function agentToolInvoke(
  tool: string,
  args: Record<string, any> = {},
  config?: Partial<AgentConfig>
): Promise<any> {
  const cfg = { ...getDefaultConfig(), ...config };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (cfg.token) {
    headers['Authorization'] = `Bearer ${cfg.token}`;
  }

  const response = await fetch(`${cfg.gatewayUrl}/tools/invoke`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      tool,
      action: 'json',
      args,
      sessionKey: 'main',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Orbit Agent tool error (${response.status}): ${errorText}`);
  }

  return response.json();
}

export async function checkAgentHealth(gatewayUrl?: string): Promise<boolean> {
  const url = gatewayUrl || getDefaultConfig().gatewayUrl;
  try {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: 'OPTIONS',
    });
    return response.ok || response.status === 405;
  } catch {
    // Try a simple GET to see if gateway is up
    try {
      const r = await fetch(url);
      return r.ok || r.status === 404 || r.status === 405;
    } catch {
      return false;
    }
  }
}
