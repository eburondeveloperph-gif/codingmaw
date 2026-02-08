
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState, useEffect, useRef } from 'react';
import { Logo } from './components/Logo';
import { Creation } from './components/CreationHistory';
import { MODELS, CHAT_MODEL, CODE_MODEL, Message, chatStream, chatOllamaStream } from './services/gemini';
import * as api from './services/api';
import { googleSearch, formatSearchResultsForPrompt } from './services/search';
import { listLocalModels, pullModel, deleteModel, searchModels, formatSize, POPULAR_MODELS, type OllamaModel, type PullProgress } from './services/ollamaModels';
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
  EyeIcon,
  ArrowPathIcon,
  PhotoIcon,
  SignalIcon,
  ChevronDownIcon,
  AdjustmentsHorizontalIcon,
  ArrowDownTrayIcon,
  TrashIcon,
  ExclamationTriangleIcon
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
  const isAdmin = user?.email === 'master@eburon.ai';
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [activeModel, setActiveModel] = useState(MODELS.POLYAMA_CLOUD);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try { return (localStorage.getItem('codemax-theme') as 'light' | 'dark') || 'dark'; } catch { return 'dark'; }
  });
  const [pendingImage, setPendingImage] = useState<{ data: string; mimeType: string } | null>(null);
  const [creationHistory, setCreationHistory] = useState<Creation[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [deepThink, setDeepThink] = useState(false);
  const [appMode, setAppMode] = useState<'code' | 'chat'>('code');

  // Admin / Ollama States
  const [showAdmin, setShowAdmin] = useState(false);
  const [ollamaUrl, setOllamaUrl] = useState(user?.ollama_local_url || 'http://localhost:11434');
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [isOllamaConnected, setIsOllamaConnected] = useState(false);
  const [ollamaAliasMap, setOllamaAliasMap] = useState<Record<string, string>>({});
  const [modelSearchQuery, setModelSearchQuery] = useState('');
  const [pullingModel, setPullingModel] = useState<string | null>(null);
  const [pullProgress, setPullProgress] = useState<PullProgress | null>(null);
  const [localModelDetails, setLocalModelDetails] = useState<OllamaModel[]>([]);
  const [adminTab, setAdminTab] = useState<'local' | 'search'>('local');

  // Web Search States
  const [searchActive, setSearchActive] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

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
    } catch (err) {
      console.error('Failed to load conversation:', err);
    }
  };

  const startNewChat = async () => {
    setMessages([]);
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
      const models = await listLocalModels(targetUrl);
      const names = models.map(m => m.name);
      setOllamaModels(names);
      setLocalModelDetails(models);
      setIsOllamaConnected(true);
      const aliasMap: Record<string, string> = {};
      names.forEach((name: string) => { aliasMap[name] = toCoderMaxAlias(name); });
      setOllamaAliasMap(aliasMap);
    } catch (err) {
      setIsOllamaConnected(false);
      setOllamaModels([]);
      setLocalModelDetails([]);
      setOllamaAliasMap({});
    }
  };

  const handlePullModel = async (modelName: string) => {
    setPullingModel(modelName);
    setPullProgress(null);
    try {
      await pullModel(ollamaUrl, modelName, (progress) => {
        setPullProgress(progress);
      });
      await detectOllamaModels();
    } catch (err) {
      console.error('Failed to pull model:', err);
    } finally {
      setPullingModel(null);
      setPullProgress(null);
    }
  };

  const handleDeleteModel = async (modelName: string) => {
    try {
      await deleteModel(ollamaUrl, modelName);
      await detectOllamaModels();
      if (activeModel === modelName) setActiveModel(MODELS.POLYAMA_CLOUD);
    } catch (err) {
      console.error('Failed to delete model:', err);
    }
  };

  // Auto-detect local Ollama models on mount
  useEffect(() => {
    const localUrl = user?.ollama_local_url || 'http://localhost:11434';
    setOllamaUrl(localUrl);
    detectOllamaModels(localUrl);
  }, [user?.ollama_local_url]);

  const handleSearchSend = async () => {
    const promptText = input;
    if (!promptText.trim()) return;
    setIsSearching(true);
    try {
      const results = await googleSearch(promptText);
      const context = formatSearchResultsForPrompt(promptText, results);
      const enrichedPrompt = `${context}\n\nUser question: ${promptText}`;
      setSearchActive(false);
      await handleSend(enrichedPrompt);
    } catch (err) {
      console.error('Search failed:', err);
      // Fallback: send without search context
      setSearchActive(false);
      await handleSend();
    } finally {
      setIsSearching(false);
    }
  };

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
      const effectiveModel = appMode === 'chat' ? CHAT_MODEL : activeModel;
      setMessages(prev => [...prev, { role: 'model', parts: [{ text: "" }], modelName: effectiveModel }]);

      const isOllama = ollamaModels.includes(effectiveModel);

      if (isOllama) {
        await chatOllamaStream(ollamaUrl, effectiveModel, [...messages, userMessage], (chunk) => {
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1].parts[0].text = chunk;
            return updated;
          });
          aiText = chunk;
        }, appMode);
      } else {
        await chatStream(effectiveModel, [...messages, userMessage], (chunk) => {
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1].parts[0].text = chunk;
            return updated;
          });
          aiText = chunk;
        }, appMode);
      }

      // Persist AI response
      if (dbConnected && convId) {
        try {
          await api.addMessage(convId, { role: 'model', content: aiText, model_name: activeModel });
        } catch { /* offline fallback */ }
      }

      const html = appMode === 'code' ? extractHtml(aiText) : null;
      if (html) {
        let creationId: string | null = null;
        // Persist creation — only open preview if saved successfully
        if (dbConnected) {
          try {
            const saved = await api.createCreation({ name: promptText.slice(0, 30) + '...', html, conversation_id: convId || undefined });
            creationId = saved.id;
          } catch { /* offline fallback */ }
        }
        if (creationId) {
          const newCreation = { id: creationId, name: promptText.slice(0, 30) + '...', html, timestamp: new Date() };
          setCreationHistory(prev => [newCreation, ...prev]);
        }
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

  const splitResponse = (text: string): { explanation: string; code: string | null } => {
    const html = extractHtml(text);
    if (!html) return { explanation: text, code: null };
    const idx = text.indexOf(html);
    const before = text.slice(0, idx).trim();
    const after = text.slice(idx + html.length).trim();
    const explanation = [before, after].filter(Boolean).join('\n\n');
    return { explanation, code: html };
  };

  const handleCopyCode = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="flex h-[100dvh] bg-white dark:bg-[#0e0e11] text-zinc-900 dark:text-[#d1d1d1] font-sans transition-colors duration-300">

      {/* Mobile sidebar backdrop */}
      {sidebarOpen && <div className="fixed inset-0 bg-black/50 z-30 md:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-40 md:relative w-72 flex flex-col border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#0e0e11] transition-all duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0 md:w-0 md:overflow-hidden'}`}>
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
                  onClick={() => {
                    window.open(`/preview/${item.id}`, '_blank');
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
          {isAdmin && (
            <button
              onClick={() => setShowAdmin(true)}
              className="w-full flex items-center space-x-3 px-3 py-2 text-sm rounded-6 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <AdjustmentsHorizontalIcon className="w-4 h-4" />
              <span>Admin Settings</span>
            </button>
          )}
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
      <main className="flex-1 flex flex-col min-w-0 bg-white dark:bg-[#0e0e11] relative pb-16 md:pb-0">
        {!sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            className="absolute left-3 top-3 z-20 p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-6 border border-zinc-200 dark:border-zinc-800 shadow-sm"
            aria-label="Open sidebar"
          >
            <ChatBubbleLeftRightIcon className="w-5 h-5" />
          </button>
        )}

        {/* Model Selector Top Bar */}
        <header className="h-12 md:h-14 border-b border-zinc-100 dark:border-zinc-800/50 flex items-center px-3 md:px-6 shrink-0 bg-white/50 dark:bg-[#0e0e11]/50 backdrop-blur-md z-20">
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
              {'Engineering Core v1.3'}
            </h2>
          </div>
          <div className="flex items-center space-x-2">
            <button className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-6 transition-all" aria-label="Share">
              <ShareIcon className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Chat Stream */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 md:px-6 py-4 md:py-8 space-y-6 md:space-y-10 scrollbar-hide max-w-4xl mx-auto w-full">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center py-20 animate-in fade-in duration-1000">
              <Logo className="w-12 h-12 mb-8 opacity-20 grayscale" />
              <h2 className="text-2xl md:text-4xl font-bold tracking-tighter text-zinc-900 dark:text-white mb-6">{appMode === 'code' ? 'CodeMax Architect.' : 'Eburon AI'}</h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4 max-w-md">{appMode === 'code' ? 'Generate production-ready apps, dashboards, and landing pages.' : 'Chat with Eburon AI — ask anything, brainstorm ideas, get answers.'}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg mt-6 md:mt-10">
                {(appMode === 'code'
                  ? ["Build a full CRM dashboard", "Visualize an AI neural network", "Create a verified landing page", "Deep code audit"]
                  : ["Explain quantum computing simply", "Help me write a business plan", "What are the best productivity tips?", "Brainstorm startup ideas"]
                ).map(item => (
                  <button key={item} onClick={() => setInput(item)} className="p-4 bg-zinc-50 dark:bg-[#1c1c1f] border border-zinc-200 dark:border-zinc-800 rounded-6 text-[11px] font-medium text-left hover:border-zinc-400 dark:hover:border-zinc-600 transition-all shadow-sm">
                    {item}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => {
            const isStreaming = isGenerating && i === messages.length - 1 && msg.role === 'model';
            return (
              <div key={i} className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in duration-500`}>
                <div className="max-w-[95%] md:max-w-[85%] space-y-4">
                  <div className={`relative ${msg.role === 'user' ? 'bg-zinc-100 dark:bg-[#1c1c1f] border border-zinc-200 dark:border-zinc-800 px-4 md:px-6 py-3 md:py-4 rounded-2xl' : 'bg-transparent'}`}>
                    {msg.parts.map((part, pi) => {
                      if (!part.text) return null;

                      {/* During streaming: show raw monospace text, no HTML rendering */}
                      if (isStreaming) {
                        return (
                          <div key={pi} className="relative">
                            <pre className="font-mono text-xs md:text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap break-words max-h-[60vh] overflow-y-auto scrollbar-hide">
                              {part.text}
                            </pre>
                            <span className="inline-block w-1.5 h-4 bg-blue-500 ml-0.5 animate-pulse rounded-sm align-text-bottom" />
                          </div>
                        );
                      }

                      {/* Completed message: split into explanation + code box */}
                      const { explanation, code } = splitResponse(part.text);
                      return (
                        <div key={pi} className="space-y-4">
                          {explanation && (
                            <div className={`prose prose-sm max-w-none ${theme === 'dark' ? 'prose-invert' : 'prose-zinc'} leading-relaxed`}
                              dangerouslySetInnerHTML={{ __html: typeof marked !== 'undefined' ? marked.parse(explanation) : explanation }} />
                          )}

                          {code && (
                            <div className="rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700/50 shadow-lg">
                              {/* Code box header with Copy + Preview */}
                              <div className="flex items-center justify-between px-3 md:px-4 py-2.5 bg-zinc-100 dark:bg-zinc-800/80 border-b border-zinc-200 dark:border-zinc-700/50">
                                <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center space-x-2">
                                  <CodeBracketSquareIcon className="w-3.5 h-3.5" />
                                  <span>Generated Code</span>
                                </span>
                                <div className="flex items-center space-x-1">
                                  <button
                                    onClick={() => { navigator.clipboard.writeText(code); setCopiedIndex(i); setTimeout(() => setCopiedIndex(null), 2000); }}
                                    className="flex items-center space-x-1.5 px-2.5 py-1.5 text-[10px] font-bold text-zinc-500 hover:text-zinc-900 dark:hover:text-white rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all"
                                    aria-label="Copy code"
                                  >
                                    {copiedIndex === i ? <CheckIcon className="w-3.5 h-3.5 text-emerald-500" /> : <ClipboardIcon className="w-3.5 h-3.5" />}
                                    <span className="hidden sm:inline">{copiedIndex === i ? 'Copied!' : 'Copy'}</span>
                                  </button>
                                  <button
                                    onClick={() => { const blob = new Blob([code], {type:'text/html'}); window.open(URL.createObjectURL(blob), '_blank'); }}
                                    className="flex items-center space-x-1.5 px-2.5 py-1.5 text-[10px] font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-all shadow-sm"
                                    aria-label="Preview code"
                                  >
                                    <EyeIcon className="w-3.5 h-3.5" />
                                    <span className="hidden sm:inline">Preview</span>
                                  </button>
                                </div>
                              </div>
                              {/* Scrollable code display */}
                              <pre className="overflow-auto bg-zinc-50 dark:bg-[#0a0a0a] p-3 md:p-4 text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-400 max-h-80 scrollbar-hide font-mono">
                                <code>{code}</code>
                              </pre>
                            </div>
                          )}

                          {/* Copy button for non-code responses */}
                          {!code && msg.role === 'model' && (
                            <div className="flex items-center space-x-4 mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                              <button onClick={() => handleCopyCode(part.text!, i)} className="flex items-center space-x-1.5 text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">
                                {copiedIndex === i ? <CheckIcon className="w-3.5 h-3.5 text-emerald-500" /> : <ClipboardIcon className="w-3.5 h-3.5" />}
                                <span className="text-[10px] font-bold uppercase">{copiedIndex === i ? 'Copied!' : 'Copy'}</span>
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Floating Input Pill Area */}
        <div className="px-3 md:px-6 pb-20 md:pb-8 shrink-0">
          <div className="max-w-3xl mx-auto">
            <div className="relative bg-zinc-50 dark:bg-[#1c1c1f] border border-zinc-200 dark:border-zinc-800 rounded-[24px] p-4 shadow-2xl transition-all focus-within:ring-1 focus-within:ring-zinc-400 dark:focus-within:ring-zinc-600 focus-within:bg-white dark:focus-within:bg-[#202024]">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder={appMode === 'code' ? 'Message CodeMax Architect...' : 'Chat with Eburon AI...'}
                className="w-full bg-transparent border-none focus:ring-0 text-zinc-900 dark:text-white placeholder-zinc-500 py-2 px-2 resize-none min-h-[50px] max-h-60 text-base font-light tracking-tight leading-relaxed"
                rows={1}
              />
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800/50">
                <div className="flex items-center space-x-2">
                  {/* CodeMax Mode Toggle */}
                  <button
                    onClick={() => setAppMode(appMode === 'code' ? 'chat' : 'code')}
                    className={`flex items-center space-x-2 px-3 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-widest transition-all ${
                      appMode === 'code'
                        ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-600/20'
                        : 'bg-emerald-600 border-emerald-600 text-white shadow-lg shadow-emerald-600/20'
                    }`}
                  >
                    {appMode === 'code' ? <CodeBracketSquareIcon className="w-3.5 h-3.5" /> : <ChatBubbleLeftRightIcon className="w-3.5 h-3.5" />}
                    <span>{appMode === 'code' ? 'Code' : 'Chat'}</span>
                  </button>
                  <button
                    onClick={() => setDeepThink(!deepThink)}
                    className={`flex items-center space-x-2 px-3 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-widest transition-all ${deepThink ? 'bg-blue-600 border-blue-600 text-white shadow-lg' : 'bg-transparent border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:border-zinc-400'}`}
                  >
                    <CommandLineIcon className="w-3.5 h-3.5" />
                    <span>DeepThink</span>
                  </button>
                  <button
                    onClick={() => setSearchActive(!searchActive)}
                    className={`flex items-center space-x-2 px-3 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-widest transition-all ${searchActive ? 'bg-amber-600 border-amber-600 text-white shadow-lg shadow-amber-600/20' : 'border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:border-zinc-400'}`}
                  >
                    <MagnifyingGlassIcon className="w-3.5 h-3.5" />
                    <span>Search</span>
                  </button>
                </div>
                <div className="flex items-center space-x-2">
                  <button onClick={() => fileInputRef.current?.click()} className="p-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors" aria-label="Upload image">
                    <PhotoIcon className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => searchActive ? handleSearchSend() : handleSend()}
                    disabled={isGenerating || isSearching || !input.trim()}
                    className={`p-2.5 text-white disabled:opacity-20 rounded-full transition-all shadow-xl active:scale-90 ${searchActive ? 'bg-amber-600' : 'bg-zinc-900 dark:bg-[#34343a]'}`}
                    aria-label={searchActive ? 'Search and send' : 'Send message'}
                  >
                    {isSearching ? <ArrowPathIcon className="w-5 h-5 animate-spin" /> : searchActive ? <MagnifyingGlassIcon className="w-5 h-5" /> : <ArrowUpIcon className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            </div>
            <div className="text-center mt-3">
              <p className="text-[9px] text-zinc-400 font-bold uppercase tracking-[0.4em] opacity-40">{appMode === 'code' ? 'Architect Core can err. Production verification suggested.' : 'Eburon AI — Built by eburon.ai'}</p>
            </div>
          </div>
        </div>
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-[#0e0e11] border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-around px-2 py-1.5" style={{ paddingBottom: 'max(6px, env(safe-area-inset-bottom))' }}>
        <button onClick={startNewChat} className="flex flex-col items-center space-y-0.5 px-3 py-1" aria-label="New chat">
          <PlusIcon className="w-5 h-5 text-zinc-500" />
          <span className="text-[8px] font-bold text-zinc-500 uppercase">New</span>
        </button>
        <button onClick={() => { setSidebarOpen(true); setSidebarTab('chats'); }} className="flex flex-col items-center space-y-0.5 px-3 py-1" aria-label="Chats">
          <ChatBubbleLeftRightIcon className="w-5 h-5 text-zinc-500" />
          <span className="text-[8px] font-bold text-zinc-500 uppercase">Chats</span>
        </button>
        <button onClick={() => { setSidebarOpen(true); setSidebarTab('creations'); }} className="flex flex-col items-center space-y-0.5 px-3 py-1" aria-label="Creations">
          <CodeBracketSquareIcon className="w-5 h-5 text-zinc-500" />
          <span className="text-[8px] font-bold text-zinc-500 uppercase">Builds</span>
        </button>
        <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="flex flex-col items-center space-y-0.5 px-3 py-1" aria-label="Toggle theme">
          {theme === 'dark' ? <SunIcon className="w-5 h-5 text-zinc-500" /> : <MoonIcon className="w-5 h-5 text-zinc-500" />}
          <span className="text-[8px] font-bold text-zinc-500 uppercase">Theme</span>
        </button>
        <button onClick={() => setShowProfile(true)} className="flex flex-col items-center space-y-0.5 px-3 py-1" aria-label="Profile">
          <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center text-[8px] font-bold text-white">{(user?.display_name || user?.email || '?').charAt(0).toUpperCase()}</div>
          <span className="text-[8px] font-bold text-zinc-500 uppercase">Me</span>
        </button>
      </nav>

      {/* Admin Settings Modal */}
      {showAdmin && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="w-full max-w-lg bg-white dark:bg-[#1c1c1f] border border-zinc-200 dark:border-zinc-800 rounded-6 p-6 shadow-[0_32px_128px_rgba(0,0,0,0.5)] max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between mb-4 shrink-0">
              <div>
                <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white uppercase">Admin Control</h2>
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-1">Model Management & Configuration</p>
              </div>
              <button onClick={() => setShowAdmin(false)} className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-6" aria-label="Close admin settings"><XMarkIcon className="w-5 h-5" /></button>
            </div>

            {/* Endpoint Config */}
            <div className="space-y-2 mb-4 shrink-0">
              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Ollama API Endpoint</label>
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={ollamaUrl}
                  onChange={(e) => setOllamaUrl(e.target.value)}
                  className="flex-1 bg-zinc-50 dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-6 px-4 py-2.5 text-sm focus:ring-1 focus:ring-blue-500 transition-all"
                  placeholder="http://localhost:11434"
                />
                <button
                  onClick={() => detectOllamaModels()}
                  className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-6 font-black text-[10px] uppercase tracking-widest shadow-lg transition-all flex items-center space-x-2 active:scale-[0.98]"
                >
                  <SignalIcon className="w-3.5 h-3.5" />
                  <span>Sync</span>
                </button>
              </div>
              {isOllamaConnected && (
                <p className="text-[9px] text-emerald-500 font-bold uppercase tracking-widest flex items-center space-x-1">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse inline-block"></span>
                  <span>Connected — {ollamaModels.length} model{ollamaModels.length !== 1 ? 's' : ''} available</span>
                </p>
              )}
            </div>

            {/* Tabs: Local Models / Search & Pull */}
            <div className="flex bg-zinc-100 dark:bg-[#252529] rounded-6 p-0.5 mb-4 shrink-0">
              <button
                onClick={() => setAdminTab('local')}
                className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-[4px] transition-all ${adminTab === 'local' ? 'bg-white dark:bg-[#1c1c1f] text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
              >
                Local Models ({localModelDetails.length})
              </button>
              <button
                onClick={() => setAdminTab('search')}
                className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-[4px] transition-all ${adminTab === 'search' ? 'bg-white dark:bg-[#1c1c1f] text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
              >
                Search & Pull
              </button>
            </div>

            {/* Tab Content — scrollable */}
            <div className="flex-1 overflow-y-auto scrollbar-hide min-h-0">
              {adminTab === 'local' && (
                <div className="space-y-2">
                  {localModelDetails.length === 0 && (
                    <div className="text-center py-8">
                      <CpuChipIcon className="w-8 h-8 mx-auto text-zinc-300 dark:text-zinc-700 mb-3" />
                      <p className="text-[10px] text-zinc-400 uppercase tracking-widest">No local models found</p>
                      <p className="text-[9px] text-zinc-400 mt-1">Switch to "Search & Pull" to download models</p>
                    </div>
                  )}
                  {localModelDetails.map(m => (
                    <div key={m.name} className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-6 group">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-bold text-zinc-900 dark:text-white truncate">{m.name}</span>
                          {activeModel === m.name && <span className="px-1.5 py-0.5 bg-blue-500/10 border border-blue-500/20 rounded text-[8px] font-black text-blue-500 uppercase">Active</span>}
                        </div>
                        <div className="flex items-center space-x-3 mt-1">
                          <span className="text-[9px] text-zinc-400 font-mono">{formatSize(m.size)}</span>
                          {m.details?.parameter_size && <span className="text-[9px] text-zinc-400 font-mono">{m.details.parameter_size}</span>}
                          {m.details?.quantization_level && <span className="text-[9px] text-zinc-400 font-mono">{m.details.quantization_level}</span>}
                          <span className="text-[9px] text-zinc-400 font-mono">{new Date(m.modified_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="flex items-center space-x-1 shrink-0 ml-2">
                        <button
                          onClick={() => setActiveModel(m.name)}
                          className="px-2 py-1 text-[9px] font-bold text-blue-500 hover:bg-blue-500/10 rounded transition-all uppercase"
                        >
                          Use
                        </button>
                        <button
                          onClick={() => handleDeleteModel(m.name)}
                          className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-500/10 rounded transition-all opacity-0 group-hover:opacity-100"
                          aria-label={`Delete ${m.name}`}
                          title="Delete model"
                        >
                          <TrashIcon className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {adminTab === 'search' && (
                <div className="space-y-4">
                  {/* Search input */}
                  <div className="relative">
                    <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                    <input
                      type="text"
                      value={modelSearchQuery}
                      onChange={(e) => setModelSearchQuery(e.target.value)}
                      className="w-full bg-zinc-50 dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-6 pl-10 pr-4 py-2.5 text-sm focus:ring-1 focus:ring-blue-500 transition-all"
                      placeholder="Search models (e.g. llama, codellama, gemma)..."
                    />
                  </div>

                  {/* Pull progress */}
                  {pullingModel && (
                    <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded-6">
                      <div className="flex items-center space-x-2 mb-2">
                        <ArrowPathIcon className="w-3.5 h-3.5 text-blue-500 animate-spin" />
                        <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">Pulling {pullingModel}</span>
                      </div>
                      <p className="text-[9px] text-zinc-500 font-mono">{pullProgress?.status || 'Starting...'}</p>
                      {pullProgress?.total && pullProgress.total > 0 && (
                        <div className="mt-2 w-full bg-zinc-200 dark:bg-zinc-800 rounded-full h-1.5">
                          <div
                            className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                            style={{ width: `${Math.round(((pullProgress.completed || 0) / pullProgress.total) * 100)}%` }}
                          ></div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Pull by exact name */}
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={modelSearchQuery}
                      onChange={(e) => setModelSearchQuery(e.target.value)}
                      className="flex-1 bg-zinc-50 dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-6 px-4 py-2.5 text-sm focus:ring-1 focus:ring-blue-500 transition-all"
                      placeholder="Enter model name to pull (e.g. llama3.2)"
                    />
                    <button
                      onClick={() => { if (modelSearchQuery.trim()) handlePullModel(modelSearchQuery.trim()); }}
                      disabled={!modelSearchQuery.trim() || !!pullingModel}
                      className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-30 text-white rounded-6 font-black text-[10px] uppercase tracking-widest shadow-lg transition-all flex items-center space-x-2 active:scale-[0.98]"
                    >
                      <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                      <span>Pull</span>
                    </button>
                  </div>

                  {/* Popular models list */}
                  <div>
                    <h3 className="text-[9px] font-black uppercase tracking-widest text-zinc-500 mb-2">Ollama Library</h3>
                    <div className="space-y-1.5">
                      {searchModels(modelSearchQuery).map(m => {
                        const isInstalled = ollamaModels.some(om => om.startsWith(m.name));
                        return (
                          <div key={m.name} className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-6">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center space-x-2">
                                <span className="text-sm font-bold text-zinc-900 dark:text-white">{m.name}</span>
                                {isInstalled && <span className="px-1.5 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded text-[8px] font-black text-emerald-500 uppercase">Installed</span>}
                              </div>
                              <p className="text-[9px] text-zinc-400 mt-0.5">{m.description}</p>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {m.sizes.map(s => (
                                  <button
                                    key={s}
                                    onClick={() => handlePullModel(`${m.name}:${s}`)}
                                    disabled={!!pullingModel}
                                    className="px-1.5 py-0.5 bg-zinc-200 dark:bg-zinc-800 hover:bg-blue-500/20 hover:text-blue-500 rounded text-[8px] font-mono font-bold text-zinc-500 transition-all disabled:opacity-30"
                                    title={`Pull ${m.name}:${s}`}
                                  >
                                    {s}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <button
                              onClick={() => handlePullModel(m.name)}
                              disabled={!!pullingModel}
                              className="ml-2 p-2 text-zinc-400 hover:text-emerald-500 hover:bg-emerald-500/10 rounded-6 transition-all disabled:opacity-30 shrink-0"
                              aria-label={`Pull ${m.name}`}
                              title={`Pull ${m.name} (default tag)`}
                            >
                              <ArrowDownTrayIcon className="w-4 h-4" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800 shrink-0">
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
