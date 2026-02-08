import React, { useState } from 'react';
import { XMarkIcon, CheckIcon, UserCircleIcon } from '@heroicons/react/24/outline';
import type { User } from '../services/api';

interface UserProfileProps {
  user: User;
  onUpdate: (data: Partial<Pick<User, 'display_name' | 'avatar_url' | 'ollama_cloud_url' | 'ollama_api_key' | 'ollama_local_url'>>) => Promise<void>;
  onLogout: () => void;
  onClose: () => void;
}

const UserProfile: React.FC<UserProfileProps> = ({ user, onUpdate, onLogout, onClose }) => {
  const [displayName, setDisplayName] = useState(user.display_name);
  const [ollamaCloudUrl, setOllamaCloudUrl] = useState(user.ollama_cloud_url || 'https://api.ollama.com');
  const [ollamaApiKey, setOllamaApiKey] = useState(user.ollama_api_key || '');
  const [ollamaLocalUrl, setOllamaLocalUrl] = useState(user.ollama_local_url || 'http://localhost:11434');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await onUpdate({
        display_name: displayName,
        ollama_cloud_url: ollamaCloudUrl,
        ollama_api_key: ollamaApiKey,
        ollama_local_url: ollamaLocalUrl,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const initials = (user.display_name || user.email || '?').charAt(0).toUpperCase();

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="w-full max-w-lg bg-white dark:bg-[#161619] border border-zinc-200 dark:border-zinc-800 rounded-[12px] p-8 shadow-[0_32px_128px_rgba(0,0,0,0.5)] max-h-[90vh] overflow-y-auto scrollbar-hide">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-lg font-bold text-white shadow-lg shadow-blue-600/30">
              {initials}
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-white">{user.display_name || 'User'}</h2>
              <p className="text-xs text-zinc-500">{user.email}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-[6px] transition-all" aria-label="Close profile">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-6">
          {/* Display Name */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full bg-zinc-50 dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-[6px] px-4 py-3 text-sm text-zinc-900 dark:text-white focus:ring-1 focus:ring-blue-500 transition-all"
              placeholder="Your name"
            />
          </div>

          <div className="border-t border-zinc-200 dark:border-zinc-800 pt-6">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-4">Orbit Model Configuration</h3>

            {/* Ollama Cloud URL */}
            <div className="space-y-1.5 mb-4">
              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Cloud API URL</label>
              <input
                type="text"
                value={ollamaCloudUrl}
                onChange={(e) => setOllamaCloudUrl(e.target.value)}
                className="w-full bg-zinc-50 dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-[6px] px-4 py-3 text-sm text-zinc-900 dark:text-white font-mono focus:ring-1 focus:ring-blue-500 transition-all"
                placeholder="https://api.ollama.com"
              />
            </div>

            {/* Ollama API Key */}
            <div className="space-y-1.5 mb-4">
              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Cloud API Key</label>
              <input
                type="password"
                value={ollamaApiKey}
                onChange={(e) => setOllamaApiKey(e.target.value)}
                className="w-full bg-zinc-50 dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-[6px] px-4 py-3 text-sm text-zinc-900 dark:text-white font-mono focus:ring-1 focus:ring-blue-500 transition-all"
                placeholder="Your API key"
              />
            </div>

            {/* Ollama Local URL */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Local Endpoint URL</label>
              <input
                type="text"
                value={ollamaLocalUrl}
                onChange={(e) => setOllamaLocalUrl(e.target.value)}
                className="w-full bg-zinc-50 dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-[6px] px-4 py-3 text-sm text-zinc-900 dark:text-white font-mono focus:ring-1 focus:ring-blue-500 transition-all"
                placeholder="http://localhost:11434"
              />
            </div>
          </div>

          {error && (
            <div className="px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-[6px] text-red-400 text-xs font-medium">
              {error}
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-[6px] font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-600/20 transition-all active:scale-[0.98] flex items-center justify-center space-x-2"
          >
            {saving ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            ) : saved ? (
              <><CheckIcon className="w-4 h-4" /><span>Saved</span></>
            ) : (
              <span>Save Changes</span>
            )}
          </button>
        </div>

        <div className="mt-8 pt-6 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div className="text-[9px] text-zinc-500 uppercase tracking-widest font-mono">
            Joined {new Date(user.created_at).toLocaleDateString()}
          </div>
          <button
            onClick={onLogout}
            className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 rounded-[6px] text-[10px] font-bold uppercase tracking-widest transition-all"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserProfile;
