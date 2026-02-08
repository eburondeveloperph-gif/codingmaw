const API_BASE = import.meta.env.VITE_API_URL || '/api';

// ── Token management ───────────────────────────────────────

const TOKEN_KEY = 'codemax-token';

export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function setToken(token: string) {
  try { localStorage.setItem(TOKEN_KEY, token); } catch {}
}

export function clearToken() {
  try { localStorage.removeItem(TOKEN_KEY); } catch {}
}

// ── Types ──────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  ollama_cloud_url: string;
  ollama_api_key: string;
  ollama_local_url: string;
  created_at: string;
  updated_at?: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface DbMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'model';
  content: string;
  model_name: string | null;
  image_data: string | null;
  image_mime: string | null;
  sort_order: number;
  created_at: string;
}

export interface DbCreation {
  id: string;
  name: string;
  html: string;
  conversation_id: string | null;
  created_at: string;
}

// ── Base request helper ────────────────────────────────────

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    headers,
    ...options,
  });

  if (res.status === 401) {
    clearToken();
    throw new Error('AUTH_EXPIRED');
  }

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(errBody.error || `API error ${res.status}`);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json();
}

// ── Auth ───────────────────────────────────────────────────

export const register = (email: string, password: string, display_name?: string) =>
  request<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, display_name }),
  });

export const login = (email: string, password: string) =>
  request<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

export const getProfile = () =>
  request<User>('/auth/me');

export const updateProfile = (data: Partial<Pick<User, 'display_name' | 'avatar_url' | 'ollama_cloud_url' | 'ollama_api_key' | 'ollama_local_url'>>) =>
  request<User>('/auth/me', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });

// ── Conversations ──────────────────────────────────────────

export const listConversations = () =>
  request<Conversation[]>('/conversations');

export const createConversation = (title?: string) =>
  request<Conversation>('/conversations', {
    method: 'POST',
    body: JSON.stringify({ title }),
  });

export const getConversation = (id: string) =>
  request<Conversation & { messages: DbMessage[] }>(`/conversations/${id}`);

export const updateConversation = (id: string, title: string) =>
  request<Conversation>(`/conversations/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ title }),
  });

export const deleteConversation = (id: string) =>
  request<void>(`/conversations/${id}`, { method: 'DELETE' });

// ── Messages ───────────────────────────────────────────────

export const addMessage = (
  conversationId: string,
  data: { role: string; content: string; model_name?: string; image_data?: string; image_mime?: string }
) =>
  request<DbMessage>(`/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const updateMessage = (id: string, content: string) =>
  request<DbMessage>(`/messages/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ content }),
  });

// ── Creations ──────────────────────────────────────────────

export const listCreations = () =>
  request<DbCreation[]>('/creations');

export const createCreation = (data: { name: string; html: string; conversation_id?: string }) =>
  request<DbCreation>('/creations', {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const getCreation = (id: string) =>
  request<DbCreation>(`/creations/${id}`);

export const deleteCreation = (id: string) =>
  request<void>(`/creations/${id}`, { method: 'DELETE' });
