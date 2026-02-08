
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState, useEffect, useRef } from 'react';
import { Logo } from './components/Logo';
import { LivePreview } from './components/LivePreview';
import { Creation } from './components/CreationHistory';
import { MODELS, Message, chatStream, chatOllamaStream } from './services/gemini';
import * as api from './services/api';
import type { Conversation, DbCreation } from './services/api';
import { useAuth } from './contexts/AuthContext';
import UserProfile from './components/UserProfile';
import {
  PaperAirplaneIcon,
  CommandLineIcon,
  XMarkIcon,
  CodeBracketSquareIcon,
  ClipboardIcon,
  CheckIcon,
  CpuChipIcon,
  Cog6ToothIcon,
  SunIcon,
  MoonIcon,
  PlusIcon,
  MagnifyingGlassIcon,
  ArrowUpIcon,
  ChatBubbleLeftRightIcon,
  ShareIcon,
  ArrowPathIcon,
  PhotoIcon,
  SignalIcon,
  ChevronDownIcon,
  AdjustmentsHorizontalIcon
} from '@heroicons/react/24/outline';

declare const marked: any;
declare const hljs: any;

const CODERMAX_PREFIX = 'CoderMax';

function toCoderMaxAlias(modelName: string): string {
  const base = modelName.split(':')[0].replace(/[^a-zA-Z0-9]/g, ' ').trim();
  const tag = modelName.includes(':') ? modelName.split(':')[1] : '';
  const capBase = base.charAt(0).toUpperCase() + base.slice(1);
  return tag ? `${CODERMAX_PREFIX} ${capBase} (${tag})` : `${CODERMAX_PREFIX} ${capBase}`;
}

const App: React.FC = () => {
  const { user, logout, updateUser } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [activeModel, setActiveModel] = useState(MODELS.POLYAMA_CLOUD);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try { return (localStorage.getItem('codemax-theme') as 'light' | 'dark') || 'dark'; } catch { return 'dark'; }
  });
  const [pendingImage, setPendingImage] = useState<{ data: string; mimeType: string } | null>(null);
  const [activeCreation, setActiveCreation] = useState<Creation | null>(null);
  const [creationHistory, setCreationHistory] = useState<Creation[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [deepThink, setDeepThink] = useState(false);

  // Admin / Ollama States
  const [showAdmin, setShowAdmin] = useState(false);
  const [ollamaUrl, setOllamaUrl] = useState(user?.ollama_local_url || 'http://localhost:11434');
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [isOllamaConnected, setIsOllamaConnected] = useState(false);
  const [ollamaAliasMap, setOllamaAliasMap] = useState<Record<string, string>>({});

  // Persistence States
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [dbConnected, setDbConnected] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'chats' | 'creations'>('chats');
  const [hoverConvId, setHoverConvId] = useState<string | null>(null);
  const [editingConvId, setEditingConvId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try { localStorage.setItem('codemax-theme', theme); } catch {}
  }, [theme]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isGenerating]);

  useEffect(() => {
    if (typeof marked !== 'undefined' && typeof hljs !== 'undefined') {
      marked.setOptions({
        highlight: (code: string, lang: string) => {
          const language = hljs.getLanguage(lang) ? lang : 'plaintext';
          return hljs.highlight(code, { language }).value;
        },
        langPrefix: 'hljs language-',
        breaks: true,
        gfm: true
      });
    }
  }, []);

  // Load conversations & creations from DB on mount
  useEffect(() => {
    const init = async () => {
      try {
        const health = await fetch((import.meta.env.VITE_API_URL || '/api') + '/health');
        if (health.ok) {
          setDbConnected(true);
          const [convs, creas] = await Promise.all([api.listConversations(), api.listCreations()]);
          setConversations(convs);
          setCreationHistory(creas.map(c => ({ id: c.id, name: c.name, html: '', timestamp: new Date(c.created_at) })));
        }
      } catch {
        setDbConnected(false);
      }
    };
    init();
  }, []);

  const refreshConversations = async () => {
    try {
      const convs = await api.listConversations();
      setConversations(convs);
    } catch { /* offline fallback */ }
  };

  const loadConversation = async (id: string) => {
    try {
      const data = await api.getConversation(id);
      setActiveConversationId(id);
      const loaded: Message[] = data.messages.map(m => ({
        role: m.role as 'user' | 'model',
        parts: [{ text: m.content, ...(m.image_data ? { inlineData: { data: m.image_data, mimeType: m.image_mime || '' } } : {}) }],
        modelName: m.model_name || undefined,
      }));
      setMessages(loaded);
      setActiveCreation(null);
    } catch (err) {
      console.error('Failed to load conversation:', err);
    }
  };

  const startNewChat = async () => {
    setMessages([]);
    setActiveCreation(null);
    setActiveConversationId(null);
  };

  const handleDeleteConversation = async (id: string) => {
    try {
      await api.deleteConversation(id);
      if (activeConversationId === id) startNewChat();
      await refreshConversations();
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    }
  };

  const handleRenameConversation = async (id: string, title: string) => {
    try {
      await api.updateConversation(id, title);
      setEditingConvId(null);
      await refreshConversations();
    } catch (err) {
      console.error('Failed to rename conversation:', err);
    }
  };

  const detectOllamaModels = async (url?: string) => {
    const targetUrl = url || ollamaUrl;
    try {
      const response = await fetch(`${targetUrl}/api/tags`);
      const data = await response.json();
      if (data.models) {
        const names = data.models.map((m: any) => m.name);
        setOllamaModels(names);
        setIsOllamaConnected(true);
        const aliasMap: Record<string, string> = {};
        names.forEach((name: string) => { aliasMap[name] = toCoderMaxAlias(name); });
        setOllamaAliasMap(aliasMap);
      }
    } catch (err) {
      setIsOllamaConnected(false);
      setOllamaModels([]);
      setOllamaAliasMap({});
    }
  };

  // Auto-detect local Ollama models on mount
  useEffect(() => {
    const localUrl = user?.ollama_local_url || 'http://localhost:11434';
    setOllamaUrl(localUrl);
    detectOllamaModels(localUrl);
  }, [user?.ollama_local_url]);

  const handleSend = async (overridePrompt?: string) => {
    const promptText = overridePrompt || input;
    if (!promptText.trim() && !pendingImage) return;

    const userMessage: Message = {
      role: 'user',
      parts: [{ text: promptText }, ...(pendingImage ? [{ inlineData: pendingImage }] : [])]
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setPendingImage(null);
    setIsGenerating(true);

    // Ensure a conversation exists in DB
    let convId = activeConversationId;
    if (dbConnected && !convId) {
      try {
        const conv = await api.createConversation(promptText.slice(0, 60));
        convId = conv.id;
        setActiveConversationId(conv.id);
        refreshConversations();
      } catch { /* offline fallback */ }
    }

    // Persist user message
    if (dbConnected && convId) {
      try {
        await api.addMessage(convId, {
          role: 'user',
          content: promptText,
          image_data: pendingImage?.data,
          image_mime: pendingImage?.mimeType,
        });
      } catch { /* offline fallback */ }
    }

    try {
      let aiText = "";
      setMessages(prev => [...prev, { role: 'model', parts: [{ text: "" }], modelName: activeModel }]);

      const isOllama = ollamaModels.includes(activeModel);

      if (isOllama) {
        await chatOllamaStream(ollamaUrl, activeModel, [...messages, userMessage], (chunk) => {
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1].parts[0].text = chunk;
            return updated;
          });
          aiText = chunk;
        });
      } else {
        await chatStream(activeModel, [...messages, userMessage], (chunk) => {
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1].parts[0].text = chunk;
            return updated;
          });
          aiText = chunk;
        });
      }

      // Persist AI response
      if (dbConnected && convId) {
        try {
          await api.addMessage(convId, { role: 'model', content: aiText, model_name: activeModel });
        } catch { /* offline fallback */ }
      }

      const html = extractHtml(aiText);
      if (html) {
        let creationId: string = crypto.randomUUID();
        // Persist creation
        if (dbConnected) {
          try {
            const saved = await api.createCreation({ name: promptText.slice(0, 30) + '...', html, conversation_id: convId || undefined });
            creationId = saved.id;
          } catch { /* offline fallback */ }
        }
        const newCreation = { id: creationId, name: promptText.slice(0, 30) + '...', html, timestamp: new Date() };
        setCreationHistory(prev => [newCreation, ...prev]);
        setActiveCreation(newCreation);
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'model', parts: [{ text: `System execution failure: ${err instanceof Error ? err.message : String(err)}` }] }]);
    } finally {
      setIsGenerating(false);
    }
  };

  const extractHtml = (text: string) => {
    const match = text.match(/<!DOCTYPE html>[\s\S]*?<\/html>|<html[\s\S]*?<\/html>/i);
    return match ? match[0] : null;
  };

  const handleCopyCode = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="flex h-[100dvh] bg-white dark:bg-[#0e0e11] text-zinc-900 dark:text-[#d1d1d1] font-sans transition-colors duration-300">

      {/* Sidebar */}
      <aside className={`flex flex-col border-r border-zinc-200 dark:border-zinc-800 transition-all duration-300 ${sidebarOpen ? 'w-72' : 'w-0 overflow-hidden'}`}>
        <div className="p-4 flex flex-col space-y-1">
          <div className="flex items-center justify-between mb-4">
            <div className="flex flex-col">
              <div className="flex items-center space-x-2">
                <Logo className="w-5 h-5" />
                <span className="font-bold text-sm tracking-tight text-zinc-900 dark:text-white uppercase">Eburon AI</span>
              </div>
              <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest ml-7 -mt-1">CodeMax</span>
            </div>
            <div className="flex items-center space-x-1">
              {dbConnected && (
                <span className="flex items-center space-x-1 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full" title="Database connected">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                  <span className="text-[8px] font-black text-emerald-500 uppercase tracking-widest">DB</span>
                </span>
              )}
              <button onClick={() => setSidebarOpen(false)} className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-6 transition-all" aria-label="Close sidebar">
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
          </div>

          <button
            onClick={startNewChat}
            className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-6 flex items-center justify-center space-x-2 transition-all mb-2 shadow-lg shadow-blue-600/20 active:scale-[0.98]"
          >
            <PlusIcon className="w-4 h-4" />
            <span className="text-sm font-bold">New Chat</span>
          </button>

          {/* Sidebar tabs */}
          <div className="flex bg-zinc-100 dark:bg-[#1c1c1f] rounded-6 p-0.5 mt-2">
            <button
              onClick={() => setSidebarTab('chats')}
              className={`flex-1 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-[4px] transition-all ${sidebarTab === 'chats' ? 'bg-white dark:bg-[#2a2a2e] text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
            >
              Chats
            </button>
            <button
              onClick={() => setSidebarTab('creations')}
              className={`flex-1 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-[4px] transition-all ${sidebarTab === 'creations' ? 'bg-white dark:bg-[#2a2a2e] text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
            >
              Creations
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 space-y-1 scrollbar-hide">
          {sidebarTab === 'chats' && (
            <>
              {conversations.length === 0 && (
                <p className="px-3 py-6 text-center text-[10px] text-zinc-400 dark:text-zinc-600 uppercase tracking-widest italic">No conversations yet</p>
              )}
              {conversations.map(conv => (
                <div
                  key={conv.id}
                  onMouseEnter={() => setHoverConvId(conv.id)}
                  onMouseLeave={() => setHoverConvId(null)}
                  className={`group relative flex items-center rounded-6 transition-all cursor-pointer ${activeConversationId === conv.id ? 'bg-blue-500/10 border border-blue-500/20' : 'hover:bg-zinc-100 dark:hover:bg-[#1c1c1f] border border-transparent'}`}
                >
                  {editingConvId === conv.id ? (
                    <input
                      autoFocus
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onBlur={() => handleRenameConversation(conv.id, editingTitle)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleRenameConversation(conv.id, editingTitle); if (e.key === 'Escape') setEditingConvId(null); }}
                      className="flex-1 bg-transparent px-3 py-2 text-sm border-none focus:ring-0 outline-none"
                      aria-label="Rename conversation"
                      placeholder="Conversation title"
                    />
                  ) : (
                    <button
                      onClick={() => loadConversation(conv.id)}
                      className="flex-1 text-left px-3 py-2.5 text-sm truncate"
                    >
                      <span className="truncate block">{conv.title}</span>
                      <span className="text-[9px] text-zinc-400 dark:text-zinc-600 font-mono">{new Date(conv.updated_at).toLocaleDateString()}</span>
                    </button>
                  )}
                  {hoverConvId === conv.id && editingConvId !== conv.id && (
                    <div className="flex items-center space-x-0.5 pr-2 shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingConvId(conv.id); setEditingTitle(conv.title); }}
                        className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors"
                        aria-label="Rename conversation"
                        title="Rename"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteConversation(conv.id); }}
                        className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-500 rounded transition-colors"
                        aria-label="Delete conversation"
                        title="Delete"
                      >
                        <XMarkIcon className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </>
          )}

          {sidebarTab === 'creations' && (
            <>
              {creationHistory.length === 0 && (
                <p className="px-3 py-6 text-center text-[10px] text-zinc-400 dark:text-zinc-600 uppercase tracking-widest italic">No creations yet</p>
              )}
              {creationHistory.map(item => (
                <button
                  key={item.id}
                  onClick={async () => {
                    if (dbConnected && !item.html) {
                      try {
                        const full = await api.getCreation(item.id);
                        const loaded = { ...item, html: full.html };
                        setActiveCreation(loaded);
                        return;
                      } catch { /* fallback */ }
                    }
                    setActiveCreation(item);
                  }}
                  className="w-full text-left px-3 py-2.5 text-sm rounded-6 hover:bg-zinc-100 dark:hover:bg-[#1c1c1f] transition-colors group"
                >
                  <span className="truncate block">{item.name}</span>
                  <span className="text-[9px] text-zinc-400 dark:text-zinc-600 font-mono flex items-center space-x-1">
                    <CodeBracketSquareIcon className="w-2.5 h-2.5 inline" />
                    <span>{item.timestamp.toLocaleDateString()}</span>
                  </span>
                </button>
              ))}
            </>
          )}
        </div>

        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 space-y-1">
          <button
            onClick={() => setShowAdmin(true)}
            className="w-full flex items-center space-x-3 px-3 py-2 text-sm rounded-6 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <AdjustmentsHorizontalIcon className="w-4 h-4" />
            <span>Admin Settings</span>
          </button>
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="w-full flex items-center space-x-3 px-3 py-2 text-sm rounded-6 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            {theme === 'dark' ? <SunIcon className="w-4 h-4" /> : <MoonIcon className="w-4 h-4" />}
            <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
          </button>
          <button
            onClick={() => setShowProfile(true)}
            className="w-full flex items-center space-x-3 px-3 py-3 mt-2 border-t border-zinc-200 dark:border-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors rounded-6"
          >
            <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-[10px] font-bold text-white shadow-lg">{(user?.display_name || user?.email || '?').charAt(0).toUpperCase()}</div>
            <div className="flex flex-col text-left">
              <span className="text-xs font-semibold truncate max-w-[140px]">{user?.display_name || 'User'}</span>
              <span className="text-[9px] text-zinc-500 truncate max-w-[140px]">{user?.email}</span>
            </div>
          </button>
        </div>
      </aside>

      {/* Main Container */}
      <main className="flex-1 flex flex-col min-w-0 bg-white dark:bg-[#0e0e11] relative">
        {!sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            className="absolute left-4 top-4 z-50 p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-6 border border-zinc-200 dark:border-zinc-800 shadow-sm"
            aria-label="Open sidebar"
          >
            <ChatBubbleLeftRightIcon className="w-5 h-5" />
          </button>
        )}

        {/* Model Selector Top Bar */}
        <header className="h-14 border-b border-zinc-100 dark:border-zinc-800/50 flex items-center px-6 shrink-0 bg-white/50 dark:bg-[#0e0e11]/50 backdrop-blur-md z-30">
          <div className="flex items-center space-x-4">
            <div className="relative group">
              <button className="flex items-center space-x-2 px-3 py-1.5 rounded-6 bg-zinc-50 dark:bg-[#1c1c1f] border border-zinc-200 dark:border-zinc-800 text-xs font-bold uppercase tracking-tight hover:border-zinc-400 dark:hover:border-zinc-600 transition-all">
                <span>{ollamaAliasMap[activeModel] || Object.entries(MODELS).find(([_, v]) => v === activeModel)?.[0] || activeModel}</span>
                <ChevronDownIcon className="w-3 h-3" />
              </button>
              <div className="absolute top-full left-0 mt-1 w-48 bg-white dark:bg-[#1c1c1f] border border-zinc-200 dark:border-zinc-800 rounded-6 shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 py-1">
                <div className="px-3 py-1 text-[9px] font-bold text-zinc-400 uppercase tracking-widest border-b border-zinc-100 dark:border-zinc-800 mb-1">Standard</div>
                {Object.entries(MODELS).map(([k, v]) => (
                  <button key={k} onClick={() => setActiveModel(v)} className="w-full text-left px-3 py-2 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800/50">
                    {k.replace('_', ' ')}
                  </button>
                ))}
                {ollamaModels.length > 0 && (
                  <>
                    <div className="px-3 py-1 text-[9px] font-bold text-blue-400 uppercase tracking-widest border-b border-zinc-100 dark:border-zinc-800 my-1">CoderMax Local</div>
                    {ollamaModels.map(m => (
                      <button key={m} onClick={() => setActiveModel(m)} className="w-full text-left px-3 py-2 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800/50 flex items-center justify-between">
                        <span>{ollamaAliasMap[m] || m}</span>
                        <SignalIcon className="w-3 h-3 text-emerald-500" />
                      </button>
                    ))}
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex-1 text-center">
            <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">
              {activeCreation ? activeCreation.name : 'Engineering Core v1.3'}
            </h2>
          </div>
          <div className="flex items-center space-x-2">
            <button className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-6 transition-all" aria-label="Share">
              <ShareIcon className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Chat Stream */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-8 space-y-10 scrollbar-hide max-w-4xl mx-auto w-full">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center py-20 animate-in fade-in duration-1000">
              <Logo className="w-12 h-12 mb-8 opacity-20 grayscale" />
              <h2 className="text-4xl font-bold tracking-tighter text-zinc-900 dark:text-white mb-6">CodeMax Architect.</h2>
              <div className="grid grid-cols-2 gap-3 w-full max-w-lg mt-10">
                {["Build a full CRM dashboard", "Visualize an AI neural network", "Create a verified landing page", "Deep code audit"].map(item => (
                  <button key={item} onClick={() => setInput(item)} className="p-4 bg-zinc-50 dark:bg-[#1c1c1f] border border-zinc-200 dark:border-zinc-800 rounded-6 text-[11px] font-medium text-left hover:border-zinc-400 dark:hover:border-zinc-600 transition-all shadow-sm">
                    {item}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in duration-500`}>
              <div className={`max-w-[95%] sm:max-w-[85%] space-y-4`}>
                <div className={`relative ${msg.role === 'user' ? 'bg-zinc-100 dark:bg-[#1c1c1f] border border-zinc-200 dark:border-zinc-800 px-6 py-4 rounded-6' : 'bg-transparent'}`}>
                  {msg.parts.map((part, pi) => (
                    <div key={pi} className="space-y-4">
                      {part.text && (
                        <div className="font-sans relative">
                          <div className={`prose prose-sm max-w-none ${theme === 'dark' ? 'prose-invert' : 'prose-zinc'} leading-relaxed`} dangerouslySetInnerHTML={{ __html: typeof marked !== 'undefined' ? marked.parse(part.text) : part.text }} />

                          {msg.role === 'model' && extractHtml(part.text) && (
                            <div className="mt-8 flex items-center justify-between p-5 bg-zinc-50 dark:bg-[#1c1c1f] border border-zinc-200 dark:border-zinc-800 rounded-6 shadow-xl">
                              <div className="flex items-center space-x-4">
                                <div className="p-3 bg-blue-500/10 rounded-6 text-blue-500">
                                  <CodeBracketSquareIcon className="w-6 h-6" />
                                </div>
                                <div>
                                  <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-900 dark:text-white">Architecture Deployment</h4>
                                  <p className="text-[9px] text-zinc-500 uppercase font-mono tracking-tighter">Verified Integrity Block: v1.3.2</p>
                                </div>
                              </div>
                              <button onClick={() => { const h = extractHtml(part.text!); if (h) setActiveCreation({ id: 'temp', name: 'Verified Preview', html: h, timestamp: new Date() }); }} className="px-6 py-3 bg-zinc-900 dark:bg-white text-white dark:text-black rounded-6 font-black text-[10px] uppercase tracking-tighter hover:opacity-90 transition-all shadow-lg active:scale-95">Preview Build</button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}

                  {msg.role === 'model' && !isGenerating && (
                    <div className="flex items-center space-x-6 mt-8 text-zinc-400 border-t border-zinc-100 dark:border-zinc-800 pt-4">
                      <button onClick={() => handleCopyCode(msg.parts[0].text!, i)} className="flex items-center space-x-2 hover:text-zinc-900 dark:hover:text-white transition-colors">
                        {copiedIndex === i ? <CheckIcon className="w-4 h-4 text-emerald-500" /> : <ClipboardIcon className="w-4 h-4" />}
                        <span className="text-[10px] font-bold uppercase">Copy Source</span>
                      </button>
                      <button className="flex items-center space-x-2 hover:text-zinc-900 dark:hover:text-white transition-colors">
                        <ArrowPathIcon className="w-4 h-4" />
                        <span className="text-[10px] font-bold uppercase">Rebuild</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {isGenerating && (
            <div className="flex justify-start">
              <div className="flex items-center space-x-3 px-6 py-3 bg-zinc-50 dark:bg-[#1c1c1f] rounded-6 border border-zinc-200 dark:border-zinc-800 shadow-xl">
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce"></div>
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500 ml-2">Synthesizing</span>
              </div>
            </div>
          )}
        </div>

        {/* Floating Input Pill Area */}
        <div className="px-6 pb-8 shrink-0">
          <div className="max-w-3xl mx-auto">
            <div className="relative bg-zinc-50 dark:bg-[#1c1c1f] border border-zinc-200 dark:border-zinc-800 rounded-[24px] p-4 shadow-2xl transition-all focus-within:ring-1 focus-within:ring-zinc-400 dark:focus-within:ring-zinc-600 focus-within:bg-white dark:focus-within:bg-[#202024]">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder="Message CodeMax Architect..."
                className="w-full bg-transparent border-none focus:ring-0 text-zinc-900 dark:text-white placeholder-zinc-500 py-2 px-2 resize-none min-h-[50px] max-h-60 text-base font-light tracking-tight leading-relaxed"
                rows={1}
              />
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800/50">
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setDeepThink(!deepThink)}
                    className={`flex items-center space-x-2 px-3 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-widest transition-all ${deepThink ? 'bg-blue-600 border-blue-600 text-white shadow-lg' : 'bg-transparent border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:border-zinc-400'}`}
                  >
                    <CommandLineIcon className="w-3.5 h-3.5" />
                    <span>DeepThink</span>
                  </button>
                  <button className="flex items-center space-x-2 px-3 py-1.5 rounded-full border border-zinc-200 dark:border-zinc-800 text-zinc-500 text-[10px] font-black uppercase tracking-widest hover:border-zinc-400 transition-all">
                    <MagnifyingGlassIcon className="w-3.5 h-3.5" />
                    <span>Search</span>
                  </button>
                </div>
                <div className="flex items-center space-x-2">
                  <button onClick={() => fileInputRef.current?.click()} className="p-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors" aria-label="Upload image">
                    <PhotoIcon className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => handleSend()}
                    disabled={isGenerating || !input.trim()}
                    className="p-2.5 bg-zinc-900 dark:bg-[#34343a] text-white disabled:opacity-20 rounded-full transition-all shadow-xl active:scale-90"
                    aria-label="Send message"
                  >
                    <ArrowUpIcon className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
            <div className="text-center mt-3">
              <p className="text-[9px] text-zinc-400 font-bold uppercase tracking-[0.4em] opacity-40">Architect Core can err. Production verification suggested.</p>
            </div>
          </div>
        </div>
      </main>

      {/* Admin Settings Modal */}
      {showAdmin && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="w-full max-w-md bg-white dark:bg-[#1c1c1f] border border-zinc-200 dark:border-zinc-800 rounded-6 p-8 shadow-[0_32px_128px_rgba(0,0,0,0.5)]">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white uppercase">Admin Control</h2>
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-1">Ollama Logic Configuration</p>
              </div>
              <button onClick={() => setShowAdmin(false)} className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-6" aria-label="Close admin settings"><XMarkIcon className="w-5 h-5" /></button>
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Ollama API Endpoint</label>
                <input
                  type="text"
                  value={ollamaUrl}
                  onChange={(e) => setOllamaUrl(e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-6 px-4 py-3 text-sm focus:ring-1 focus:ring-blue-500 transition-all"
                  placeholder="http://localhost:11434"
                />
              </div>

              <button
                onClick={() => detectOllamaModels()}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-6 font-black text-xs uppercase tracking-widest shadow-xl transition-all flex items-center justify-center space-x-2 active:scale-[0.98]"
              >
                <SignalIcon className="w-4 h-4" />
                <span>Sync Local Models</span>
              </button>

              {ollamaModels.length > 0 && (
                <div className="mt-6 p-4 bg-zinc-50 dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-6">
                  <h3 className="text-[9px] font-black uppercase tracking-widest text-zinc-500 mb-3 flex items-center space-x-2">
                    <CheckIcon className="w-3 h-3 text-emerald-500" />
                    <span>Connected: {ollamaModels.length} Models Found</span>
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {ollamaModels.map(m => (
                      <span key={m} className="px-2 py-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-6 text-[10px] font-medium text-zinc-600 dark:text-zinc-400">
                        {m}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-10 pt-6 border-t border-zinc-100 dark:border-zinc-800">
              <button onClick={() => setShowAdmin(false)} className="w-full py-3 bg-zinc-100 dark:bg-[#252529] hover:bg-zinc-200 dark:hover:bg-[#2a2a2e] text-zinc-900 dark:text-white rounded-6 font-bold text-xs uppercase transition-all">Close</button>
            </div>
          </div>
        </div>
      )}

      <input type="file" ref={fileInputRef} className="hidden" accept="image/*,application/pdf" aria-label="File upload" title="File upload" onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = () => {
            const base64 = (reader.result as string).split(',')[1];
            setPendingImage({ data: base64, mimeType: file.type });
          };
          reader.readAsDataURL(file);
        }
      }} />

      <LivePreview
        creation={activeCreation}
        isLoading={isGenerating}
        isFocused={!!activeCreation}
        onReset={() => setActiveCreation(null)}
        onVerify={() => handleSend(`Review the following codebase and optimize for production efficiency. Correct any logic gaps or UI inconsistencies.\n\nCODEBASE:\n${activeCreation?.html}`)}
      />

      {showProfile && user && (
        <UserProfile
          user={user}
          onUpdate={updateUser}
          onLogout={logout}
          onClose={() => setShowProfile(false)}
        />
      )}
    </div>
  );
};

export default App;
