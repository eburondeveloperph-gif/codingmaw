
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

export const MODELS = {
  CODEMAX_13: 'gpt-oss:120b-cloud',
  CODEMAX_PRO: 'gpt-oss:120b-cloud',
  CODEMAX_BETA: 'gpt-oss:120b-cloud',
  POLYAMA_CLOUD: 'gpt-oss:120b-cloud',
  GEMMA_3: 'gpt-oss:120b-cloud'
};

export interface Message {
  role: 'user' | 'model';
  parts: { text?: string; inlineData?: { data: string; mimeType: string } }[];
  modelName?: string;
}

const SYSTEM_INSTRUCTION = `You are the Elite CodeMax Software Architect. 
Your output must consist ONLY of the requested source code. 
DO NOT provide any reasoning, explanations, conversational filler, or introductions. 
Return complete, production-ready, standalone HTML files including all necessary CSS and JavaScript. 
Never truncate code. Never hesitate. Never ask follow-up questions. 
If the user provides a prompt, translate it directly into the most efficient and visually stunning code possible. 
YOUR OUTPUT IS THE RAW SOURCE CODE ONLY.`;

export async function chatStream(
  modelName: string,
  history: Message[],
  onChunk: (text: string) => void
) {
  const apiKey = import.meta.env.VITE_OLLAMA_API_KEY?.trim();
  if (!apiKey) {
    console.error("VITE_OLLAMA_API_KEY is missing");
    throw new Error("VITE_OLLAMA_API_KEY is not set. Please check .env.local");
  }
  const cloudUrl = import.meta.env.VITE_OLLAMA_CLOUD_URL?.trim() || 'https://api.ollama.com';
  console.log("Using Orbit Cloud endpoint:", cloudUrl);
  console.log("Using Orbit Cloud Key:", apiKey.substring(0, 5) + "...");

  const messages = history.map(msg => ({
    role: msg.role === 'model' ? 'assistant' : 'user',
    content: msg.parts.map(p => p.text).join('\n')
  }));

  const response = await fetch(`${cloudUrl}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: modelName,
      messages: [
        { role: 'system', content: SYSTEM_INSTRUCTION },
        ...messages
      ],
      stream: true
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Ollama Cloud Response Error:", response.status, errorText);
    throw new Error(`Ollama Cloud Error (${response.status}): ${errorText || response.statusText}`);
  }

  if (!response.body) throw new Error("Ollama Cloud stream failed: No response body");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (!line) continue;
      try {
        const json = JSON.parse(line);
        if (json.message?.content) {
          fullText += json.message.content;
          onChunk(fullText);
        }
      } catch (e) {
        // Handle partial JSON
      }
    }
  }
  return fullText;
}

export async function chatOllamaStream(
  url: string,
  modelName: string,
  history: Message[],
  onChunk: (text: string) => void
) {
  // Pass through to the cloud implementation if URL suggests cloud, otherwise standard local logic
  const cloudUrl = import.meta.env.VITE_OLLAMA_CLOUD_URL?.trim() || 'https://api.ollama.com';
  if (url === cloudUrl || url.includes('api.ollama.com') || url.includes('ollama.com')) {
    return chatStream(modelName, history, onChunk);
  }

  const messages = history.map(msg => ({
    role: msg.role === 'model' ? 'assistant' : 'user',
    content: msg.parts.map(p => p.text).join('\n')
  }));

  const response = await fetch(`${url}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: modelName,
      messages: [
        { role: 'system', content: SYSTEM_INSTRUCTION },
        ...messages
      ],
      stream: true
    })
  });

  if (!response.body) throw new Error("Ollama stream failed");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (!line) continue;
      try {
        const json = JSON.parse(line);
        if (json.message?.content) {
          fullText += json.message.content;
          onChunk(fullText);
        }
      } catch (e) {
        // Handle partial JSON
      }
    }
  }
  return fullText;
}
