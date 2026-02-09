import React, { useState, useEffect, useRef } from 'react';
import { Logo } from './Logo';
import { useAuth } from '../contexts/AuthContext';
import { agentStream, checkAgentHealth, type AgentMessage } from '../services/agent';
import {
  PaperAirplaneIcon,
  XMarkIcon,
  ArrowUpIcon,
  ArrowPathIcon,
  CodeBracketSquareIcon,
  SparklesIcon,
  Cog6ToothIcon,
  SunIcon,
  MoonIcon,
  HomeIcon,
  SignalIcon,
  ClipboardIcon,
  CheckIcon,
  BoltIcon,
  CommandLineIcon,
  GlobeAltIcon,
  DocumentTextIcon,
  WrenchScrewdriverIcon,
  ChatBubbleLeftRightIcon,
} from '@heroicons/react/24/outline';

declare const marked: any;
declare const hljs: any;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const AgentPage: React.FC = () => {
  const { user, logout } = useAuth();
  const mode = window.location.pathname.startsWith('/agent/codemax') ? 'codemax' : 'orbit';

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [agentConnected, setAgentConnected] = useState<boolean | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try { return (localStorage.getItem('codemax-theme') as 'light' | 'dark') || 'dark'; } catch { return 'dark'; }
  });
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try { localStorage.setItem('codemax-theme', theme); } catch {}
  }, [theme]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    checkAgentHealth().then(setAgentConnected);
  }, []);

  const handleStop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsGenerating(false);
  };

  const handleSend = async () => {
    if (!input.trim() || isGenerating) return;

    const userMsg: ChatMessage = { role: 'user', content: input.trim(), timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsGenerating(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const assistantMsg: ChatMessage = { role: 'assistant', content: '', timestamp: new Date() };
    setMessages(prev => [...prev, assistantMsg]);

    try {
      const history: AgentMessage[] = [...messages, userMsg].map(m => ({
        role: m.role,
        content: m.content,
      }));

      await agentStream(history, mode, (text) => {
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { ...updated[updated.length - 1], content: text };
          return updated;
        });
      }, controller.signal);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // stopped by user
      } else {
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            content: `⚠ Agent error: ${err instanceof Error ? err.message : String(err)}\n\nMake sure the Orbit Agent gateway is running:\n\`\`\`\nollama launch openclaw --model kimi-k2-thinking:cloud\n\`\`\``,
          };
          return updated;
        });
      }
    } finally {
      abortRef.current = null;
      setIsGenerating(false);
    }
  };

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const renderMarkdown = (text: string) => {
    try {
      if (typeof marked !== 'undefined') {
        const html = marked.parse(text, { breaks: true });
        return html;
      }
    } catch {}
    return text.replace(/\n/g, '<br/>');
  };

  const isCodeMax = mode === 'codemax';
  const accentColor = isCodeMax ? 'blue' : 'violet';
  const accentBg = isCodeMax ? 'bg-blue-600' : 'bg-violet-600';
  const accentText = isCodeMax ? 'text-blue-500' : 'text-violet-500';
  const accentBorder = isCodeMax ? 'border-blue-500' : 'border-violet-500';
  const accentShadow = isCodeMax ? 'shadow-blue-600/20' : 'shadow-violet-600/20';
  const agentName = isCodeMax ? 'CodeMax Agent' : 'Orbit Agent';
  const agentDesc = isCodeMax ? 'Autonomous coding agent' : 'Personal AI assistant';

  const quickActions = isCodeMax ? [
    { icon: CodeBracketSquareIcon, label: 'Build a project', prompt: 'Create a new React project with TypeScript, Tailwind CSS, and a modern dashboard layout' },
    { icon: WrenchScrewdriverIcon, label: 'Debug code', prompt: 'Help me debug and fix issues in my codebase' },
    { icon: DocumentTextIcon, label: 'Write tests', prompt: 'Write comprehensive unit tests for my application' },
    { icon: CommandLineIcon, label: 'Deploy setup', prompt: 'Set up a CI/CD pipeline with Docker and automated deployment' },
  ] : [
    { icon: GlobeAltIcon, label: 'Research topic', prompt: 'Research and summarize the latest developments in' },
    { icon: DocumentTextIcon, label: 'Write content', prompt: 'Help me write a professional document about' },
    { icon: SparklesIcon, label: 'Brainstorm ideas', prompt: 'Brainstorm creative ideas for' },
    { icon: ChatBubbleLeftRightIcon, label: 'Analyze data', prompt: 'Analyze and provide insights on' },
  ];

  return (
    <div className="h-[100dvh] overflow-y-auto bg-white dark:bg-[#0e0e11] text-zinc-900 dark:text-white flex flex-col">
      {/* Header */}
      <header className="shrink-0 border-b border-zinc-200 dark:border-zinc-800/50 bg-white/80 dark:bg-[#0e0e11]/80 backdrop-blur-xl z-30">
        <div className="max-w-4xl mx-auto flex items-center justify-between px-4 md:px-6 h-14">
          <div className="flex items-center space-x-3">
            <a href="/" className="flex items-center space-x-2 hover:opacity-80 transition-opacity" aria-label="Home">
              <Logo className="w-6 h-6" />
            </a>
            <div className="w-px h-5 bg-zinc-200 dark:bg-zinc-800"></div>
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${accentBg} animate-pulse`}></div>
              <span className="text-sm font-bold tracking-tight">{agentName}</span>
              <span className="text-[9px] text-zinc-400 uppercase tracking-widest font-bold">{agentDesc}</span>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {agentConnected !== null && (
              <span className={`flex items-center space-x-1 px-2 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest ${agentConnected ? 'text-emerald-500 bg-emerald-500/10' : 'text-red-500 bg-red-500/10'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${agentConnected ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
                <span>{agentConnected ? 'Connected' : 'Offline'}</span>
              </span>
            )}
            <div className="flex bg-zinc-100 dark:bg-zinc-800/50 rounded-full p-0.5">
              <a
                href="/agent/codemax"
                className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${isCodeMax ? 'bg-blue-600 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
              >
                CodeMax
              </a>
              <a
                href="/agent/orbit"
                className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${!isCodeMax ? 'bg-violet-600 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
              >
                Orbit
              </a>
            </div>
            <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="p-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors rounded-full" aria-label="Toggle theme">
              {theme === 'dark' ? <SunIcon className="w-4 h-4" /> : <MoonIcon className="w-4 h-4" />}
            </button>
            <a href="/" className="p-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors rounded-full" aria-label="Back to home">
              <HomeIcon className="w-4 h-4" />
            </a>
          </div>
        </div>
      </header>

      {/* Chat Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-hide">
        <div className="max-w-3xl mx-auto px-4 md:px-6 py-6">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[60vh]">
              <div className={`w-16 h-16 rounded-2xl ${accentBg} flex items-center justify-center mb-6 shadow-2xl ${accentShadow}`}>
                {isCodeMax ? <CodeBracketSquareIcon className="w-8 h-8 text-white" /> : <SparklesIcon className="w-8 h-8 text-white" />}
              </div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-2">{agentName}</h1>
              <p className="text-zinc-500 text-sm mb-8 text-center max-w-md">
                {isCodeMax
                  ? 'Autonomous coding agent. Plan, build, debug, and deploy — all in one conversation.'
                  : 'Your personal AI assistant. Research, write, analyze, and brainstorm with agentic capabilities.'}
              </p>

              {/* Quick Actions */}
              <div className="grid grid-cols-2 gap-3 w-full max-w-lg">
                {quickActions.map((action, i) => (
                  <button
                    key={i}
                    onClick={() => { setInput(action.prompt); }}
                    className="flex items-center space-x-3 p-4 bg-zinc-50 dark:bg-[#1a1a1d] border border-zinc-200 dark:border-zinc-800 rounded-2xl hover:border-zinc-400 dark:hover:border-zinc-600 transition-all text-left group"
                  >
                    <action.icon className={`w-5 h-5 ${accentText} shrink-0 group-hover:scale-110 transition-transform`} />
                    <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{action.label}</span>
                  </button>
                ))}
              </div>

              {!agentConnected && agentConnected !== null && (
                <div className="mt-8 p-4 bg-red-500/5 border border-red-500/20 rounded-2xl max-w-lg w-full">
                  <p className="text-xs text-red-400 font-bold uppercase tracking-widest mb-2">Agent Gateway Offline</p>
                  <p className="text-xs text-zinc-500">Start the Orbit Agent gateway:</p>
                  <code className="block mt-2 p-2 bg-black/20 rounded text-[11px] text-zinc-400 font-mono">ollama launch openclaw --model kimi-k2-thinking:cloud</code>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] ${msg.role === 'user' ? '' : 'w-full'}`}>
                    {/* Role label */}
                    <div className={`flex items-center space-x-2 mb-1.5 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                      {msg.role === 'assistant' && (
                        <div className={`w-5 h-5 rounded-md ${accentBg} flex items-center justify-center`}>
                          {isCodeMax ? <CodeBracketSquareIcon className="w-3 h-3 text-white" /> : <SparklesIcon className="w-3 h-3 text-white" />}
                        </div>
                      )}
                      <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">
                        {msg.role === 'user' ? 'You' : agentName}
                      </span>
                      <span className="text-[9px] text-zinc-500 font-mono">
                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    {/* Message content */}
                    {msg.role === 'user' ? (
                      <div className={`px-4 py-3 rounded-2xl rounded-tr-md ${accentBg} text-white text-sm leading-relaxed shadow-lg ${accentShadow}`}>
                        {msg.content}
                      </div>
                    ) : (
                      <div className="relative group">
                        {msg.content ? (
                          <div className="px-4 py-3 bg-zinc-50 dark:bg-[#1a1a1d] border border-zinc-200 dark:border-zinc-800 rounded-2xl rounded-tl-md">
                            <div
                              className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed [&_pre]:bg-black [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:text-xs [&_pre]:overflow-x-auto [&_code]:text-xs [&_code]:font-mono [&_p]:mb-2 [&_ul]:mb-2 [&_ol]:mb-2 [&_li]:mb-0.5 [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm"
                              dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                            />
                            <button
                              onClick={() => handleCopy(msg.content, i)}
                              className="absolute top-2 right-2 p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md opacity-0 group-hover:opacity-100 transition-all"
                              aria-label="Copy response"
                            >
                              {copiedIndex === i ? <CheckIcon className="w-3.5 h-3.5 text-emerald-500" /> : <ClipboardIcon className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        ) : (
                          <div className="px-4 py-3 bg-zinc-50 dark:bg-[#1a1a1d] border border-zinc-200 dark:border-zinc-800 rounded-2xl rounded-tl-md">
                            <div className="flex items-center space-x-2">
                              <div className="flex space-x-1">
                                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce delay-0"></span>
                                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce delay-150"></span>
                                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce delay-300"></span>
                              </div>
                              <span className={`text-[10px] font-bold ${accentText} uppercase tracking-widest`}>
                                {isCodeMax ? 'Executing...' : 'Processing...'}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="px-4 md:px-6 pb-6 pt-2 shrink-0">
        <div className="max-w-3xl mx-auto">
          <div className={`relative bg-zinc-50 dark:bg-[#1c1c1f] border rounded-[20px] p-3 shadow-2xl transition-all ${isGenerating ? `${accentBorder}/30 ring-1 ring-${accentColor}-500/20` : 'border-zinc-200 dark:border-zinc-800 focus-within:ring-1 focus-within:ring-zinc-400 dark:focus-within:ring-zinc-600'}`}>
            <textarea
              value={input}
              onChange={(e) => { if (!isGenerating) setInput(e.target.value); }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder={isGenerating ? '' : (isCodeMax ? 'Describe what you want to build...' : 'What can I help you with?')}
              disabled={isGenerating}
              className={`w-full bg-transparent border-none focus:ring-0 py-2 px-2 resize-none min-h-[44px] max-h-40 text-sm font-light tracking-tight leading-relaxed ${isGenerating ? 'text-transparent cursor-not-allowed' : 'text-zinc-900 dark:text-white placeholder-zinc-500'}`}
              rows={1}
            />
            {isGenerating && (
              <div className="absolute top-3 left-3 right-3 flex items-center space-x-2 pointer-events-none z-10">
                <div className="flex space-x-1">
                  <span className={`w-1.5 h-1.5 ${accentBg} rounded-full animate-bounce delay-0`}></span>
                  <span className={`w-1.5 h-1.5 ${accentBg} rounded-full animate-bounce delay-150`}></span>
                  <span className={`w-1.5 h-1.5 ${accentBg} rounded-full animate-bounce delay-300`}></span>
                </div>
                <span className={`text-[10px] font-bold ${accentText} uppercase tracking-widest`}>
                  {isCodeMax ? 'Agent executing...' : 'Agent working...'}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between mt-1 pt-2 border-t border-zinc-100 dark:border-zinc-800/50">
              <div className="flex items-center space-x-2">
                <span className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full ${accentBg} text-white text-[9px] font-black uppercase tracking-widest shadow-lg ${accentShadow}`}>
                  {isCodeMax ? <CodeBracketSquareIcon className="w-3 h-3" /> : <SparklesIcon className="w-3 h-3" />}
                  <span>{isCodeMax ? 'CodeMax' : 'Orbit'}</span>
                </span>
                <span className="flex items-center space-x-1 px-2 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-[9px] font-bold text-zinc-500 uppercase tracking-widest">
                  <BoltIcon className="w-3 h-3" />
                  <span>Agentic</span>
                </span>
              </div>
              <div className="flex items-center space-x-2">
                {isGenerating ? (
                  <button
                    onClick={handleStop}
                    className="p-2 bg-red-600 hover:bg-red-700 text-white rounded-full transition-all shadow-xl active:scale-90 animate-pulse"
                    aria-label="Stop agent"
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    onClick={handleSend}
                    disabled={!input.trim()}
                    className={`p-2 text-white disabled:opacity-20 rounded-full transition-all shadow-xl active:scale-90 ${accentBg}`}
                    aria-label="Send to agent"
                  >
                    <ArrowUpIcon className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="text-center mt-2">
            <p className="text-[9px] text-zinc-400 font-bold uppercase tracking-[0.3em] opacity-40">
              {isCodeMax ? 'CodeMax Agent — Autonomous Coding by Eburon AI' : 'Orbit Agent — Built by eburon.ai'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgentPage;
