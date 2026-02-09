import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile as updateFirebaseProfile,
  User as FirebaseUser
} from 'firebase/auth';
import { ref, get } from 'firebase/database';
import { auth, db } from '../services/firebase';
import * as api from '../services/api';
import type { User } from '../services/api';

const DEFAULT_USER: User = {
  id: 'default',
  email: 'default@eburon.local',
  display_name: 'Eburon User',
  avatar_url: null,
  ollama_cloud_url: '',
  ollama_api_key: '',
  ollama_local_url: '',
  google_id: null,
  google_scopes: null,
  google_token_expiry: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

interface AuthContextType {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => void;
  updateUser: (data: Partial<Pick<User, 'display_name' | 'avatar_url' | 'ollama_cloud_url' | 'ollama_api_key' | 'ollama_local_url'>>) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(DEFAULT_USER);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async (fbUser: FirebaseUser | null) => {
    if (!fbUser) {
      setUser(DEFAULT_USER);
      setFirebaseUser(null);
      return;
    }

    setFirebaseUser(fbUser);

    // Fetch additional user metadata from RTDB (including ollama_url)
    let ollamaUrl = '';
    try {
      const userRef = ref(db, `users/${fbUser.uid}`);
      const snapshot = await get(userRef);
      if (snapshot.exists()) {
        const data = snapshot.val();
        ollamaUrl = data.ollama_url || '';
      }
    } catch (err) {
      console.warn('[AuthContext] Failed to fetch user data from RTDB:', err);
    }

    setUser({
      id: fbUser.uid,
      email: fbUser.email || '',
      display_name: fbUser.displayName || fbUser.email?.split('@')[0] || 'User',
      avatar_url: fbUser.photoURL,
      ollama_cloud_url: ollamaUrl,
      ollama_api_key: '',
      ollama_local_url: ollamaUrl,
      google_id: fbUser.providerData[0]?.providerId === 'google.com' ? fbUser.uid : null,
      google_scopes: null,
      google_token_expiry: null,
      created_at: fbUser.metadata.creationTime || new Date().toISOString(),
      updated_at: fbUser.metadata.lastSignInTime || new Date().toISOString(),
    });
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (fbUser) => {
      refreshUser(fbUser).then(() => setIsLoading(false));
    });
    return () => unsubscribe();
  }, [refreshUser]);

  const login = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const register = async (email: string, password: string, displayName: string) => {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    await updateFirebaseProfile(credential.user, { displayName });
  };

  const logout = () => {
    signOut(auth);
  };

  const updateUser = async (data: Partial<Pick<User, 'display_name' | 'avatar_url' | 'ollama_cloud_url' | 'ollama_api_key' | 'ollama_local_url'>>) => {
    if (!firebaseUser) return;

    if (data.display_name || data.avatar_url) {
      await updateFirebaseProfile(firebaseUser, {
        displayName: data.display_name || firebaseUser.displayName,
        photoURL: data.avatar_url || firebaseUser.photoURL,
      });
    }

    setUser(prev => prev ? { ...prev, ...data } as User : DEFAULT_USER);
    // Note: To persist custom fields like ollama_local_url, you'd save to Firebase RTDB here.
  };

  const isAuthenticated = !!firebaseUser;

  return (
    <AuthContext.Provider value={{
      user,
      firebaseUser,
      isLoading,
      isAuthenticated,
      login,
      register,
      logout,
      updateUser,
      refreshUser: () => refreshUser(auth.currentUser),
    }}>
      {children}
    </AuthContext.Provider>
  );
};
