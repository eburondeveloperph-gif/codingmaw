import React, { useState, useEffect } from 'react';
import { Logo } from './Logo';
import { useAuth } from '../contexts/AuthContext';
import * as api from '../services/api';
import type { GoogleServicesStatus } from '../services/api';
import {
  HomeIcon,
  SunIcon,
  MoonIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowPathIcon,
  LinkIcon,
  ShieldCheckIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';

interface ServiceDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  bgColor: string;
}

const SERVICES: ServiceDef[] = [
  {
    id: 'gmail',
    name: 'Gmail',
    description: 'Read and send emails through your Gmail account',
    icon: '📧',
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
  },
  {
    id: 'sheets',
    name: 'Google Sheets',
    description: 'Access and edit your Google Spreadsheets',
    icon: '📊',
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-500/10',
  },
  {
    id: 'chat',
    name: 'Google Chat',
    description: 'Read messages and spaces in Google Chat',
    icon: '💬',
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
  },
  {
    id: 'drive',
    name: 'Google Drive',
    description: 'Browse and read files from your Google Drive',
    icon: '📁',
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/10',
  },
];

const GoogleServicesPage: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const [status, setStatus] = useState<GoogleServicesStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connectingServices, setConnectingServices] = useState<string[]>([]);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try { return (localStorage.getItem('codemax-theme') as 'light' | 'dark') || 'dark'; } catch { return 'dark'; }
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try { localStorage.setItem('codemax-theme', theme); } catch {}
  }, [theme]);

  const fetchStatus = async () => {
    try {
      const s = await api.getGoogleStatus();
      setStatus(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Google services status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStatus(); }, []);

  const handleConnect = async (serviceIds: string[]) => {
    setError('');
    setConnectingServices(serviceIds);
    try {
      const { url } = await api.connectGoogleServices(serviceIds);
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect services');
      setConnectingServices([]);
    }
  };

  const handleConnectAll = () => {
    handleConnect(SERVICES.map(s => s.id));
  };

  const handleDisconnect = async () => {
    if (!confirm('Disconnect your Google account? You can reconnect anytime.')) return;
    setDisconnecting(true);
    setError('');
    try {
      await api.disconnectGoogle();
      await refreshUser();
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect');
    } finally {
      setDisconnecting(false);
    }
  };

  const isConnected = status?.connected ?? false;

  return (
    <div className="min-h-[100dvh] bg-white dark:bg-[#0e0e11] text-zinc-900 dark:text-white">
      {/* Header */}
      <header className="border-b border-zinc-200 dark:border-zinc-800/50 bg-white/80 dark:bg-[#0e0e11]/80 backdrop-blur-xl sticky top-0 z-30">
        <div className="max-w-3xl mx-auto flex items-center justify-between px-4 md:px-6 h-14">
          <div className="flex items-center space-x-3">
            <a href="/" className="flex items-center space-x-2 hover:opacity-80 transition-opacity" aria-label="Home">
              <Logo className="w-6 h-6" />
            </a>
            <div className="w-px h-5 bg-zinc-200 dark:bg-zinc-800"></div>
            <span className="text-sm font-bold tracking-tight">Google Services</span>
          </div>
          <div className="flex items-center space-x-2">
            <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="p-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors rounded-full" aria-label="Toggle theme">
              {theme === 'dark' ? <SunIcon className="w-4 h-4" /> : <MoonIcon className="w-4 h-4" />}
            </button>
            <a href="/" className="p-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors rounded-full" aria-label="Back to home">
              <HomeIcon className="w-4 h-4" />
            </a>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 md:px-6 py-8">
        {/* Hero */}
        <div className="text-center mb-10">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 via-red-500 to-yellow-500 flex items-center justify-center mx-auto mb-5 shadow-2xl">
            <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-2">Google Services</h1>
          <p className="text-zinc-500 text-sm max-w-md mx-auto">
            Connect your Google account to use Gmail, Sheets, Chat, and Drive directly within Eburon AI.
          </p>
        </div>

        {loading ? (
          <div className="flex flex-col items-center py-16">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-3"></div>
            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Loading status...</p>
          </div>
        ) : (
          <>
            {error && (
              <div className="mb-6 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs font-medium flex items-center space-x-2">
                <ExclamationTriangleIcon className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Connection status card */}
            <div className={`mb-8 p-5 rounded-2xl border ${isConnected ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-zinc-50 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  {isConnected ? (
                    <CheckCircleIcon className="w-6 h-6 text-emerald-500" />
                  ) : (
                    <XCircleIcon className="w-6 h-6 text-zinc-400" />
                  )}
                  <div>
                    <h3 className="text-sm font-bold">
                      {isConnected ? 'Google Account Connected' : 'Google Account Not Connected'}
                    </h3>
                    <p className="text-[11px] text-zinc-500">
                      {isConnected
                        ? `Signed in as ${user?.email || 'unknown'}`
                        : 'Connect your Google account to enable services'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {isConnected ? (
                    <>
                      {status?.expired && (
                        <span className="px-2 py-1 bg-amber-500/10 text-amber-500 rounded-full text-[9px] font-bold uppercase tracking-widest">Token Expired</span>
                      )}
                      <button
                        onClick={handleDisconnect}
                        disabled={disconnecting}
                        className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all disabled:opacity-50"
                      >
                        {disconnecting ? 'Disconnecting...' : 'Disconnect'}
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={handleConnectAll}
                      disabled={connectingServices.length > 0}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all shadow-lg shadow-blue-600/20 disabled:opacity-50 flex items-center space-x-2"
                    >
                      {connectingServices.length > 0 ? (
                        <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <LinkIcon className="w-3.5 h-3.5" />
                      )}
                      <span>Connect Google Account</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Services grid */}
            <h2 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-4">Available Services</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              {SERVICES.map((service) => {
                const isServiceConnected = isConnected && status?.services?.[service.id as keyof typeof status.services];
                const isConnecting = connectingServices.includes(service.id);

                return (
                  <div
                    key={service.id}
                    className={`relative p-5 rounded-2xl border transition-all ${
                      isServiceConnected
                        ? 'bg-emerald-500/5 border-emerald-500/20'
                        : 'bg-zinc-50 dark:bg-[#161619] border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className={`w-10 h-10 rounded-xl ${service.bgColor} flex items-center justify-center text-lg`}>
                        {service.icon}
                      </div>
                      {isServiceConnected ? (
                        <span className="flex items-center space-x-1 px-2 py-0.5 bg-emerald-500/10 rounded-full">
                          <ShieldCheckIcon className="w-3 h-3 text-emerald-500" />
                          <span className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest">Active</span>
                        </span>
                      ) : (
                        <button
                          onClick={() => handleConnect([service.id])}
                          disabled={isConnecting || connectingServices.length > 0}
                          className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all disabled:opacity-50 flex items-center space-x-1"
                        >
                          {isConnecting ? (
                            <ArrowPathIcon className="w-3 h-3 animate-spin" />
                          ) : (
                            <LinkIcon className="w-3 h-3" />
                          )}
                          <span>Connect</span>
                        </button>
                      )}
                    </div>
                    <h3 className="text-sm font-bold mb-1">{service.name}</h3>
                    <p className="text-[11px] text-zinc-500 leading-relaxed">{service.description}</p>
                  </div>
                );
              })}
            </div>

            {/* Security note */}
            <div className="p-4 bg-zinc-50 dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-800 rounded-xl">
              <div className="flex items-start space-x-3">
                <ShieldCheckIcon className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold mb-1">Privacy & Security</h4>
                  <p className="text-[11px] text-zinc-500 leading-relaxed">
                    Your Google credentials are stored securely and only used to access the services you've authorized.
                    Eburon AI uses OAuth 2.0 and never stores your Google password. You can revoke access at any time from your
                    <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-400 ml-1">Google Account settings</a>.
                  </p>
                </div>
              </div>
            </div>
          </>
        )}

        <div className="text-center mt-8">
          <p className="text-[9px] text-zinc-400 font-bold uppercase tracking-[0.3em] opacity-40">
            Eburon AI — Google Integration
          </p>
        </div>
      </div>
    </div>
  );
};

export default GoogleServicesPage;
