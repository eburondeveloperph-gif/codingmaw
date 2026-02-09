#!/usr/bin/env node
/**
 * OpenClaw Agent Gateway — Eburon AI
 * OpenAI-compatible /v1/chat/completions endpoint with streaming SSE
 * Proxies to local Ollama with skill routing and tool support
 */

const http = require('http');
const { URL } = require('url');

const PORT = parseInt(process.env.OPENCLAW_PORT || '18789');
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const DEFAULT_MODEL = process.env.OPENCLAW_MODEL || 'codemax-kimi';

// ── Skill Definitions ──────────────────────────────────────
const SKILLS = {
  codemax: {
    model: 'codemax-qwen',
    system: `You are CodeMax Agent — an elite autonomous coding agent powered by Eburon AI.
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
You generate COMPLETE, runnable code — never truncated, never abbreviated.
You are thorough, precise, and autonomous.`,
  },

  orbit: {
    model: 'codemax-kimi',
    system: `You are Orbit Agent — a helpful autonomous AI assistant powered by Eburon AI.
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
You are Orbit Agent, built by Eburon (eburon.ai).`,
  },

  translate: {
    model: 'translategemma',
    system: `You are TranslateGemma — an expert multilingual translator built by Eburon AI.
You translate text between ANY languages with native fluency and cultural accuracy.
If no target language is specified, translate to English.
Support ALL languages. Preserve formatting. Output ONLY the translation unless asked for explanation.`,
  },

  code_review: {
    model: 'codemax-qwen',
    system: `You are CodeMax Code Reviewer — an elite code review agent by Eburon AI.
Review code for: bugs, security issues, performance, best practices, readability.
Provide specific line-by-line feedback with severity (critical/warning/info).
Suggest concrete fixes. Be thorough but concise.`,
  },

  debug: {
    model: 'codemax-kimi',
    system: `You are CodeMax Debug Agent — an expert debugger by Eburon AI.
You analyze error messages, stack traces, and code to find the root cause of bugs.
Think step-by-step. Identify the exact cause. Provide a specific fix with code.
Never guess — trace the logic carefully.`,
  },

  writing: {
    model: 'codemax-kimi',
    system: `You are Eburon Writing Assistant — a professional writer and editor.
You help with: essays, articles, emails, reports, documentation, creative writing.
Write in clear, engaging prose. Match the user's tone and style.
Provide complete, polished text — never outlines or bullet points unless asked.`,
  },

  data_analysis: {
    model: 'codemax-kimi',
    system: `You are Eburon Data Analyst — an expert at analyzing data, statistics, and trends.
You interpret data, create insights, suggest visualizations, and explain findings clearly.
Use concrete numbers. Show your reasoning. Provide actionable conclusions.`,
  },

  math: {
    model: 'codemax-kimi',
    system: `You are Eburon Math Agent — an expert mathematician and logician.
Solve problems step-by-step with clear notation. Show all work.
Handle: algebra, calculus, statistics, logic, proofs, discrete math, optimization.
Verify your answers before presenting them.`,
  },

  summarize: {
    model: 'codemax-llama',
    system: `You are Eburon Summarizer — a fast, accurate text summarizer.
Summarize text into clear, concise bullet points or paragraphs.
Preserve key facts and numbers. Never add information not in the original.
Adjust length based on the input — longer texts get more detailed summaries.`,
  },

  brainstorm: {
    model: 'codemax-kimi',
    system: `You are Eburon Brainstorm Agent — a creative ideation partner.
Generate diverse, innovative ideas for any topic. Think outside the box.
Provide 5-10 ideas with brief explanations for each.
Mix practical and creative suggestions. Build on the user's context.`,
  },

  explain: {
    model: 'codemax-kimi',
    system: `You are Eburon Explainer — an expert at making complex topics simple.
Explain anything clearly using analogies, examples, and layered depth.
Start simple, then go deeper if asked. Use markdown for structure.
Adjust complexity to the user's level.`,
  },
};

// ── Utility ──────────────────────────────────────────────
function jsonResponse(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-openclaw-agent-id, x-openclaw-skill',
  });
  res.end(JSON.stringify(data));
}

function corsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-openclaw-agent-id, x-openclaw-skill');
}

function detectSkill(messages, headers) {
  // Check header first
  const skillHeader = headers['x-openclaw-skill'];
  if (skillHeader && SKILLS[skillHeader]) return skillHeader;

  // Check agent-id header
  const agentId = headers['x-openclaw-agent-id'];
  if (agentId === 'codemax') return 'codemax';
  if (agentId === 'orbit') return 'orbit';

  // Auto-detect from message content
  const lastMsg = messages[messages.length - 1]?.content?.toLowerCase() || '';
  if (lastMsg.includes('translate') || lastMsg.includes('salin')) return 'translate';
  if (lastMsg.includes('review') && lastMsg.includes('code')) return 'code_review';
  if (lastMsg.includes('debug') || lastMsg.includes('error') || lastMsg.includes('bug')) return 'debug';
  if (lastMsg.includes('summarize') || lastMsg.includes('summary') || lastMsg.includes('tldr')) return 'summarize';
  if (lastMsg.includes('brainstorm') || lastMsg.includes('ideas')) return 'brainstorm';
  if (lastMsg.includes('explain') || lastMsg.includes('what is') || lastMsg.includes('how does')) return 'explain';
  if (lastMsg.includes('write') || lastMsg.includes('essay') || lastMsg.includes('email') || lastMsg.includes('article')) return 'writing';
  if (lastMsg.includes('data') || lastMsg.includes('analyze') || lastMsg.includes('chart')) return 'data_analysis';
  if (lastMsg.includes('math') || lastMsg.includes('calculate') || lastMsg.includes('solve') || lastMsg.includes('equation')) return 'math';

  return 'orbit'; // default
}

// ── Main Handler ──────────────────────────────────────────
async function handleRequest(req, res) {
  corsHeaders(res);

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Health / root
  if (url.pathname === '/' || url.pathname === '/health') {
    jsonResponse(res, 200, {
      status: 'ok',
      service: 'OpenClaw Agent Gateway',
      version: '1.0.0',
      skills: Object.keys(SKILLS),
      models: [...new Set(Object.values(SKILLS).map(s => s.model))],
    });
    return;
  }

  // List skills
  if (url.pathname === '/v1/skills') {
    jsonResponse(res, 200, {
      skills: Object.entries(SKILLS).map(([id, s]) => ({
        id,
        model: s.model,
        description: s.system.split('\n')[0],
      })),
    });
    return;
  }

  // List models (OpenAI-compatible)
  if (url.pathname === '/v1/models') {
    const models = [...new Set(Object.values(SKILLS).map(s => s.model))];
    jsonResponse(res, 200, {
      object: 'list',
      data: models.map(m => ({ id: m, object: 'model', owned_by: 'eburon-ai' })),
    });
    return;
  }

  // Chat completions (OpenAI-compatible streaming)
  if (url.pathname === '/v1/chat/completions' && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) body += chunk;

    let parsed;
    try { parsed = JSON.parse(body); } catch {
      jsonResponse(res, 400, { error: 'Invalid JSON' });
      return;
    }

    const { messages = [], model, stream = true } = parsed;

    // Detect skill and get config
    const skillId = detectSkill(messages, req.headers);
    const skill = SKILLS[skillId];
    const useModel = model || skill.model || DEFAULT_MODEL;

    // Prepend skill system message if not already present
    const hasSystem = messages.some(m => m.role === 'system');
    const fullMessages = hasSystem ? messages : [{ role: 'system', content: skill.system }, ...messages];

    console.log(`[${new Date().toISOString()}] skill=${skillId} model=${useModel} messages=${fullMessages.length}`);

    // Forward to Ollama
    const ollamaBody = JSON.stringify({
      model: useModel,
      messages: fullMessages,
      stream: true,
    });

    try {
      const ollamaRes = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: ollamaBody,
      });

      if (!ollamaRes.ok) {
        const errText = await ollamaRes.text();
        jsonResponse(res, ollamaRes.status, { error: errText });
        return;
      }

      if (stream) {
        // SSE streaming (OpenAI-compatible)
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        });

        const reader = ollamaRes.body.getReader();
        const decoder = new TextDecoder();
        const completionId = `chatcmpl-${Date.now()}`;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n').filter(l => l.trim());

          for (const line of lines) {
            try {
              const json = JSON.parse(line);
              if (json.message?.content) {
                const sseData = {
                  id: completionId,
                  object: 'chat.completion.chunk',
                  created: Math.floor(Date.now() / 1000),
                  model: useModel,
                  choices: [{
                    index: 0,
                    delta: { content: json.message.content },
                    finish_reason: null,
                  }],
                };
                res.write(`data: ${JSON.stringify(sseData)}\n\n`);
              }
              if (json.done) {
                const doneData = {
                  id: completionId,
                  object: 'chat.completion.chunk',
                  created: Math.floor(Date.now() / 1000),
                  model: useModel,
                  choices: [{
                    index: 0,
                    delta: {},
                    finish_reason: 'stop',
                  }],
                };
                res.write(`data: ${JSON.stringify(doneData)}\n\n`);
                res.write('data: [DONE]\n\n');
              }
            } catch {}
          }
        }
        res.end();
      } else {
        // Non-streaming: collect full response
        const reader = ollamaRes.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          for (const line of chunk.split('\n').filter(l => l.trim())) {
            try {
              const json = JSON.parse(line);
              if (json.message?.content) fullText += json.message.content;
            } catch {}
          }
        }

        jsonResponse(res, 200, {
          id: `chatcmpl-${Date.now()}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: useModel,
          choices: [{
            index: 0,
            message: { role: 'assistant', content: fullText },
            finish_reason: 'stop',
          }],
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        });
      }
    } catch (err) {
      console.error('Ollama proxy error:', err);
      jsonResponse(res, 502, { error: `Failed to reach Ollama: ${err.message}` });
    }
    return;
  }

  // 404
  jsonResponse(res, 404, { error: 'Not found' });
}

// ── Start Server ──────────────────────────────────────────
const server = http.createServer(handleRequest);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`═══════════════════════════════════════════`);
  console.log(`  OpenClaw Agent Gateway — Eburon AI`);
  console.log(`  Port:    ${PORT}`);
  console.log(`  Ollama:  ${OLLAMA_URL}`);
  console.log(`  Model:   ${DEFAULT_MODEL}`);
  console.log(`  Skills:  ${Object.keys(SKILLS).join(', ')}`);
  console.log(`═══════════════════════════════════════════`);
});
