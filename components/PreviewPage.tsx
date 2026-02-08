/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useEffect, useState } from 'react';
import { Logo } from './Logo';
import {
  ComputerDesktopIcon,
  DeviceTabletIcon,
  DevicePhoneMobileIcon,
  ArrowDownTrayIcon,
  ArrowLeftIcon,
  CodeBracketIcon,
  CheckBadgeIcon,
  SunIcon,
  MoonIcon,
} from '@heroicons/react/24/outline';
import * as api from '../services/api';

type ViewportMode = 'desktop' | 'tablet' | 'phone';

const PreviewPage: React.FC = () => {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try { return (localStorage.getItem('codemax-theme') as 'light' | 'dark') || 'dark'; } catch { return 'dark'; }
  });
  const [creations, setCreations] = useState<{ id: string; name: string; created_at: string }[]>([]);
  const [activeHtml, setActiveHtml] = useState<string | null>(null);
  const [activeName, setActiveName] = useState('');
  const [activeId, setActiveId] = useState('');
  const [viewMode, setViewMode] = useState<ViewportMode>('desktop');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try { localStorage.setItem('codemax-theme', theme); } catch {}
  }, [theme]);

  useEffect(() => {
    const init = async () => {
      try {
        const list = await api.listCreations();
        setCreations(list);

        // Check URL for specific creation ID: /preview/abc-123
        const pathParts = window.location.pathname.split('/').filter(Boolean);
        if (pathParts.length >= 2 && pathParts[0] === 'preview') {
          const id = pathParts[1];
          const full = await api.getCreation(id);
          setActiveHtml(full.html);
          setActiveName(full.name);
          setActiveId(full.id);
        } else if (list.length > 0) {
          const full = await api.getCreation(list[0].id);
          setActiveHtml(full.html);
          setActiveName(full.name);
          setActiveId(full.id);
        }
      } catch {
        // DB not available
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const loadCreation = async (id: string) => {
    try {
      const full = await api.getCreation(id);
      setActiveHtml(full.html);
      setActiveName(full.name);
      setActiveId(full.id);
      window.history.replaceState(null, '', `/preview/${id}`);
    } catch {}
  };

  const handleExport = () => {
    if (!activeHtml) return;
    const blob = new Blob([activeHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeName.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.html`;
    a.click();
  };

  const getViewportWidth = () => {
    switch (viewMode) {
      case 'phone': return 'max-w-[390px]';
      case 'tablet': return 'max-w-[768px]';
      default: return 'max-w-full';
    }
  };

  return (
    <div className="flex h-[100dvh] bg-white dark:bg-[#0e0e11] text-zinc-900 dark:text-[#d1d1d1] font-sans transition-colors duration-300">

      {/* Sidebar — creation list */}
      <aside className="w-72 flex flex-col border-r border-zinc-200 dark:border-zinc-800">
        <div className="p-4">
          <div className="flex items-center justify-between mb-5">
            <div className="flex flex-col">
              <div className="flex items-center space-x-2">
                <Logo className="w-5 h-5" />
                <span className="font-bold text-sm tracking-tight text-zinc-900 dark:text-white uppercase">Eburon AI</span>
              </div>
              <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest ml-7 -mt-1">Preview</span>
            </div>
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-[6px] transition-all"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <SunIcon className="w-4 h-4" /> : <MoonIcon className="w-4 h-4" />}
            </button>
          </div>

          <a
            href="/"
            className="flex items-center space-x-2 px-3 py-2 text-sm rounded-[6px] hover:bg-zinc-100 dark:hover:bg-[#1c1c1f] transition-colors mb-4 text-blue-600 dark:text-blue-400"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            <span className="font-medium">Back to Chat</span>
          </a>

          <h3 className="px-2 text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] mb-2">All Creations</h3>
        </div>

        <div className="flex-1 overflow-y-auto px-3 space-y-1 scrollbar-hide">
          {loading && (
            <div className="flex items-center justify-center py-10">
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          )}
          {!loading && creations.length === 0 && (
            <p className="px-3 py-6 text-center text-[10px] text-zinc-400 dark:text-zinc-600 uppercase tracking-widest italic">No creations found</p>
          )}
          {creations.map(c => (
            <button
              key={c.id}
              onClick={() => loadCreation(c.id)}
              className={`w-full text-left px-3 py-2.5 text-sm rounded-[6px] transition-all ${
                activeId === c.id
                  ? 'bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400'
                  : 'hover:bg-zinc-100 dark:hover:bg-[#1c1c1f] border border-transparent'
              }`}
            >
              <span className="truncate block font-medium">{c.name}</span>
              <span className="text-[9px] text-zinc-400 dark:text-zinc-600 font-mono">{new Date(c.created_at).toLocaleString()}</span>
            </button>
          ))}
        </div>
      </aside>

      {/* Main preview area */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-12 border-b border-zinc-100 dark:border-zinc-800/50 flex items-center px-6 shrink-0 bg-white/50 dark:bg-[#0e0e11]/50 backdrop-blur-md z-30">
          <div className="flex items-center space-x-4">
            <div className="flex bg-zinc-100 dark:bg-[#1c1c1f] rounded-[6px] p-0.5 border border-zinc-200 dark:border-zinc-800">
              <button onClick={() => setViewMode('desktop')} className={`p-1.5 rounded-[4px] transition-all ${viewMode === 'desktop' ? 'bg-white dark:bg-[#2a2a2e] text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'}`} aria-label="Desktop view"><ComputerDesktopIcon className="w-4 h-4" /></button>
              <button onClick={() => setViewMode('tablet')} className={`p-1.5 rounded-[4px] transition-all ${viewMode === 'tablet' ? 'bg-white dark:bg-[#2a2a2e] text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'}`} aria-label="Tablet view"><DeviceTabletIcon className="w-4 h-4" /></button>
              <button onClick={() => setViewMode('phone')} className={`p-1.5 rounded-[4px] transition-all ${viewMode === 'phone' ? 'bg-white dark:bg-[#2a2a2e] text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'}`} aria-label="Phone view"><DevicePhoneMobileIcon className="w-4 h-4" /></button>
            </div>
          </div>

          <div className="flex-1 text-center">
            <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest truncate px-4">
              {activeName || 'Select a creation'}
            </h2>
          </div>

          <div className="flex items-center space-x-2">
            {activeHtml && (
              <button
                onClick={handleExport}
                className="flex items-center space-x-1.5 text-[10px] font-bold bg-zinc-900 dark:bg-white text-white dark:text-black px-4 py-1.5 rounded-[6px] transition-all hover:opacity-90 uppercase tracking-tighter shadow-sm active:scale-[0.98]"
              >
                <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                <span>Export</span>
              </button>
            )}
          </div>
        </header>

        {/* Preview frame */}
        <div className="flex-1 bg-zinc-100 dark:bg-[#121212] flex flex-col items-center overflow-hidden p-4 md:p-6">
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center">
              <CodeBracketIcon className="w-12 h-12 text-zinc-300 dark:text-zinc-800 animate-pulse mb-4" />
              <p className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.3em]">Loading...</p>
            </div>
          ) : activeHtml ? (
            <div className={`h-full w-full ${getViewportWidth()} bg-white shadow-2xl rounded-[6px] overflow-hidden transition-all duration-500 border border-zinc-200 dark:border-white/5 mx-auto`}>
              <iframe title="Preview Sandbox" srcDoc={activeHtml} className="w-full h-full border-none" sandbox="allow-scripts allow-forms allow-popups allow-modals allow-same-origin" />
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-zinc-400 dark:text-zinc-700">
              <CodeBracketIcon className="w-16 h-16 mb-4 opacity-20" />
              <p className="text-[10px] uppercase tracking-[0.3em] font-bold">No creation selected</p>
              <p className="text-[9px] mt-1 opacity-50">Select a creation from the sidebar or generate one in the chat</p>
            </div>
          )}
        </div>

        {/* Status bar */}
        {activeHtml && !loading && (
          <div className="bg-zinc-50 dark:bg-[#0f0f0f] border-t border-zinc-200 dark:border-white/5 px-6 py-2 flex items-center justify-between shrink-0">
            <div className="flex items-center space-x-2">
              <CheckBadgeIcon className="w-3 h-3 text-emerald-500" />
              <span className="text-[9px] font-bold text-zinc-400 dark:text-zinc-600 uppercase tracking-widest">Verified Integrity</span>
            </div>
            <div className="text-[9px] font-mono text-zinc-400 dark:text-zinc-700 uppercase">{activeId.split('-')[0]}</div>
          </div>
        )}
      </main>
    </div>
  );
};

export default PreviewPage;
