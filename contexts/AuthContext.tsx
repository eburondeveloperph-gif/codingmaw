import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as api from '../services/api';
import type { User } from '../services/api';
import { startGoogleSignIn, handleGoogleRedirectResult, signOutFirebase } from '../services/firebase';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName?: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
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
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const profile = await api.getProfile();
      setUser(profile);
    } catch {
      api.clearToken();
      setUser(null);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      // Check for existing JWT token first
      const token = api.getToken();
      if (token) {
        await refreshUser();
        setIsLoading(false);
        return;
      }

      // Check for Firebase Google redirect result
      try {
        const googleResult = await handleGoogleRedirectResult();
        if (googleResult) {
          const res = await api.firebaseAuth({
            firebase_uid: googleResult.uid,
            email: googleResult.email,
            display_name: googleResult.displayName,
            photo_url: googleResult.photoURL,
          });
          api.setToken(res.token);
          setUser(res.user);
          // Redirect to main page after successful Google auth
          if (window.location.pathname !== '/') {
            window.history.replaceState(null, '', '/');
          }
        }
      } catch (err) {
        console.error('Google redirect error:', err);
      }

      setIsLoading(false);
    };

    init();
  }, [refreshUser]);

  const loginFn = async (email: string, password: string) => {
    const res = await api.login(email, password);
    api.setToken(res.token);
    setUser(res.user);
  };

  const registerFn = async (email: string, password: string, displayName?: string) => {
    const res = await api.register(email, password, displayName);
    api.setToken(res.token);
    setUser(res.user);
  };

  const loginWithGoogleFn = async () => {
    await startGoogleSignIn();
  };

  const logout = () => {
    api.clearToken();
    setUser(null);
    signOutFirebase().catch(() => {});
  };

  const updateUser = async (data: Partial<Pick<User, 'display_name' | 'avatar_url' | 'ollama_cloud_url' | 'ollama_api_key' | 'ollama_local_url'>>) => {
    const updated = await api.updateProfile(data);
    setUser(updated);
  };

  return (
    <AuthContext.Provider value={{
      user,
      isLoading,
      isAuthenticated: !!user,
      login: loginFn,
      register: registerFn,
      loginWithGoogle: loginWithGoogleFn,
      logout,
      updateUser,
      refreshUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
};
