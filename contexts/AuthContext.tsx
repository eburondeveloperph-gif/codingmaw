import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
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
  isLoading: boolean;
  isAuthenticated: boolean;
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
  const [isLoading, setIsLoading] = useState(false);

  const refreshUser = useCallback(async () => {
    try {
      const profile = await api.getProfile();
      setUser(profile);
    } catch {
      setUser(DEFAULT_USER);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const logout = () => {
    api.clearToken();
    setUser(DEFAULT_USER);
  };

  const updateUser = async (data: Partial<Pick<User, 'display_name' | 'avatar_url' | 'ollama_cloud_url' | 'ollama_api_key' | 'ollama_local_url'>>) => {
    try {
      const updated = await api.updateProfile(data);
      setUser(updated);
    } catch {
      setUser(prev => prev ? { ...prev, ...data } as User : DEFAULT_USER);
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      isLoading,
      isAuthenticated: true,
      logout,
      updateUser,
      refreshUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
};
