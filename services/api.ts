import { db, auth } from './firebase';
import {
  ref,
  set,
  get,
  push,
  child,
  update,
  remove,
  query,
  orderByChild,
  equalTo,
  serverTimestamp,
  type DataSnapshot
} from 'firebase/database';

// ── Types ──────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  ollama_cloud_url: string;
  ollama_api_key: string;
  ollama_local_url: string;
  google_id: string | null;
  google_scopes: string | null;
  google_token_expiry: string | null;
  created_at: any;
  updated_at?: any;
}

export interface Conversation {
  id: string;
  title: string;
  user_id: string;
  created_at: any;
  updated_at: any;
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
  created_at: any;
}

export interface DbCreation {
  id: string;
  name: string;
  html: string;
  conversation_id: string | null;
  user_id: string;
  created_at: any;
}

// ── Auth Utilities (for backward compatibility where needed) ─

export function getToken() { return null; } // Firebase handles this
export function setToken(_t: string) { }
export function clearToken() { }

export const getGoogleStatus = async () => {
  const user = auth.currentUser;
  return { connected: !!user && user.providerData.some(p => p.providerId === 'google.com') };
};

export const disconnectGoogle = async () => {
  // For now, we'll just sign out from Firebase. 
  // Unlinking is possible but more complex to implement as a stub.
  await auth.signOut();
};

export const getProfile = async (): Promise<User> => {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');

  const userRef = ref(db, `users/${user.uid}`);
  const snapshot = await get(userRef);

  if (snapshot.exists()) {
    return snapshot.val() as User;
  }

  // Default if not in DB yet
  return {
    id: user.uid,
    email: user.email || '',
    display_name: user.displayName || 'User',
    avatar_url: user.photoURL,
    ollama_cloud_url: '',
    ollama_api_key: '',
    ollama_local_url: '',
    google_id: user.uid,
    google_scopes: null,
    google_token_expiry: null,
    created_at: new Date().toISOString(),
  };
};

export const updateProfile = async (data: Partial<User>) => {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  await update(ref(db, `users/${user.uid}`), { ...data, updated_at: serverTimestamp() });
  return getProfile();
};

// ── Conversations ──────────────────────────────────────────

export const listConversations = async (): Promise<Conversation[]> => {
  const user = auth.currentUser;
  if (!user) return [];

  const convsRef = query(ref(db, 'conversations'), orderByChild('user_id'), equalTo(user.uid));
  const snapshot = await get(convsRef);

  if (!snapshot.exists()) return [];

  const data = snapshot.val();
  return Object.keys(data).map(key => ({
    id: key,
    ...data[key]
  })).sort((a, b) => b.updated_at - a.updated_at);
};

export const createConversation = async (title?: string): Promise<Conversation> => {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');

  const newConvRef = push(ref(db, 'conversations'));
  const convData = {
    title: title || 'New Chat',
    user_id: user.uid,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  };

  await set(newConvRef, convData);
  return { id: newConvRef.key!, ...convData };
};

export const getConversation = async (id: string): Promise<Conversation & { messages: DbMessage[] }> => {
  const convRef = ref(db, `conversations/${id}`);
  const snapshot = await get(convRef);

  if (!snapshot.exists()) throw new Error('Conversation not found');

  // Fetch messages
  const msgsRef = query(ref(db, 'messages'), orderByChild('conversation_id'), equalTo(id));
  const msgsSnapshot = await get(msgsRef);

  const messages: DbMessage[] = [];
  if (msgsSnapshot.exists()) {
    const data = msgsSnapshot.val();
    Object.keys(data).forEach(key => {
      messages.push({ id: key, ...data[key] });
    });
    messages.sort((a, b) => a.sort_order - b.sort_order);
  }

  return { id, ...snapshot.val(), messages };
};

export const updateConversation = async (id: string, title: string): Promise<void> => {
  await update(ref(db, `conversations/${id}`), { title, updated_at: serverTimestamp() });
};

export const deleteConversation = async (id: string): Promise<void> => {
  await remove(ref(db, `conversations/${id}`));
  // Also delete associated messages (ideally this should be done with a cloud function, 
  // but for simplicity we'll just delete the conv here or client-side could loop)
};

// ── Messages ───────────────────────────────────────────────

export const addMessage = async (
  conversationId: string,
  data: { role: string; content: string; model_name?: string; image_data?: string; image_mime?: string }
): Promise<DbMessage> => {
  const msgsRef = ref(db, 'messages');
  const newMsgRef = push(msgsRef);

  // Get current message count for sort_order
  const currentMsgs = await get(query(ref(db, 'messages'), orderByChild('conversation_id'), equalTo(conversationId)));
  const sortOrder = currentMsgs.exists() ? Object.keys(currentMsgs.val()).length : 0;

  const msgData = {
    ...data,
    conversation_id: conversationId,
    sort_order: sortOrder,
    created_at: serverTimestamp(),
  };

  await set(newMsgRef, msgData);
  await update(ref(db, `conversations/${conversationId}`), { updated_at: serverTimestamp() });

  return { id: newMsgRef.key!, ...msgData as any };
};

// ── Creations ──────────────────────────────────────────────

export const listCreations = async (): Promise<DbCreation[]> => {
  const user = auth.currentUser;
  if (!user) return [];

  const creationsRef = query(ref(db, 'creations'), orderByChild('user_id'), equalTo(user.uid));
  const snapshot = await get(creationsRef);

  if (!snapshot.exists()) return [];

  const data = snapshot.val();
  return Object.keys(data).map(key => ({
    id: key,
    ...data[key]
  })).sort((a, b) => b.created_at - a.created_at);
};

export const createCreation = async (data: { name: string; html: string; conversation_id?: string }): Promise<DbCreation> => {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');

  const newRef = push(ref(db, 'creations'));
  const creationData = {
    ...data,
    user_id: user.uid,
    created_at: serverTimestamp(),
  };

  await set(newRef, creationData);
  return { id: newRef.key!, ...creationData as any };
};

export const getCreation = async (id: string): Promise<DbCreation> => {
  const snapshot = await get(ref(db, `creations/${id}`));
  if (!snapshot.exists()) throw new Error('Creation not found');
  return { id, ...snapshot.val() };
};

export const deleteCreation = async (id: string): Promise<void> => {
  await remove(ref(db, `creations/${id}`));
};
