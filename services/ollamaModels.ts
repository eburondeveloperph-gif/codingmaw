/**
 * Ollama Model Search & Management Service
 * Uses Ollama API endpoints per official docs:
 * - GET /api/tags — list local models
 * - POST /api/pull — download a model from the library
 * - DELETE /api/delete — remove a local model
 */

export interface OllamaModel {
  name: string;
  size: number;
  modified_at: string;
  digest: string;
  details?: {
    format?: string;
    family?: string;
    parameter_size?: string;
    quantization_level?: string;
  };
}

export interface PullProgress {
  status: string;
  digest?: string;
  total?: number;
  completed?: number;
}

/** List all locally installed models via GET /api/tags */
export async function listLocalModels(ollamaUrl: string): Promise<OllamaModel[]> {
  const response = await fetch(`${ollamaUrl}/api/tags`);
  if (!response.ok) throw new Error(`Failed to list models (${response.status})`);
  const data = await response.json();
  return data.models || [];
}

/** Pull (download) a model from the Ollama library via POST /api/pull */
export async function pullModel(
  ollamaUrl: string,
  modelName: string,
  onProgress?: (progress: PullProgress) => void
): Promise<void> {
  const response = await fetch(`${ollamaUrl}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: modelName, stream: true }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to pull model "${modelName}" (${response.status}): ${errorText}`);
  }

  if (!response.body) throw new Error('No response body from pull');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const json: PullProgress = JSON.parse(line);
        onProgress?.(json);
      } catch {
        // partial JSON, skip
      }
    }
  }
}

/** Delete a local model via DELETE /api/delete */
export async function deleteModel(ollamaUrl: string, modelName: string): Promise<void> {
  const response = await fetch(`${ollamaUrl}/api/delete`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: modelName }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to delete model "${modelName}" (${response.status}): ${errorText}`);
  }
}

/** Show model details via POST /api/show */
export async function showModelInfo(ollamaUrl: string, modelName: string): Promise<any> {
  const response = await fetch(`${ollamaUrl}/api/show`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: modelName }),
  });
  if (!response.ok) throw new Error(`Failed to get model info (${response.status})`);
  return response.json();
}

/** Format bytes to human-readable size */
export function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/** Popular models from the Ollama library for search suggestions */
export const POPULAR_MODELS = [
  { name: 'llama3.2', description: 'Meta Llama 3.2 — fast and capable', sizes: ['1b', '3b'] },
  { name: 'llama3.1', description: 'Meta Llama 3.1 — high quality', sizes: ['8b', '70b', '405b'] },
  { name: 'gemma2', description: 'Lightweight, state-of-the-art', sizes: ['2b', '9b', '27b'] },
  { name: 'qwen2.5', description: 'Alibaba Qwen 2.5 series', sizes: ['0.5b', '1.5b', '3b', '7b', '14b', '32b', '72b'] },
  { name: 'deepseek-r1', description: 'DeepSeek reasoning model', sizes: ['1.5b', '7b', '8b', '14b', '32b', '70b'] },
  { name: 'mistral', description: 'Mistral 7B — fast inference', sizes: ['7b'] },
  { name: 'codellama', description: 'Code generation specialist', sizes: ['7b', '13b', '34b', '70b'] },
  { name: 'phi3', description: 'Microsoft Phi-3 — compact & capable', sizes: ['mini', 'medium'] },
  { name: 'mixtral', description: 'Mixture of experts model', sizes: ['8x7b', '8x22b'] },
  { name: 'nomic-embed-text', description: 'Text embeddings model', sizes: ['v1.5'] },
  { name: 'llava', description: 'Vision + language model', sizes: ['7b', '13b', '34b'] },
  { name: 'starcoder2', description: 'Code generation by BigCode', sizes: ['3b', '7b', '15b'] },
];

/** Search the popular models list by query */
export function searchModels(query: string): typeof POPULAR_MODELS {
  if (!query.trim()) return POPULAR_MODELS;
  const q = query.toLowerCase();
  return POPULAR_MODELS.filter(
    m => m.name.toLowerCase().includes(q) || m.description.toLowerCase().includes(q)
  );
}
