import React, { useState, useEffect } from 'react';
import { Logo } from './Logo';
import { checkAgentHealth } from '../services/agent';
import { checkAsrHealth } from '../services/asr';
import {
  HomeIcon,
  SunIcon,
  MoonIcon,
  CheckCircleIcon,
  XCircleIcon,
  CommandLineIcon,
  CodeBracketIcon,
  BugAntIcon,
  GlobeAltIcon,
  LanguageIcon,
  PencilSquareIcon,
  ChartBarIcon,
  PhotoIcon,
  MicrophoneIcon,
  SparklesIcon,
  DocumentTextIcon,
  LightBulbIcon,
  CpuChipIcon,
  PaintBrushIcon,
  ShieldCheckIcon,
  CalculatorIcon,
  AcademicCapIcon,
  ChatBubbleLeftRightIcon,
} from '@heroicons/react/24/outline';

interface Skill {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  category: 'apps' | 'skills';
  prompt?: string;
  route?: string;
  ready: boolean;
}

const SKILLS: Skill[] = [
  // ─── Apps ───
  {
    id: 'codemax',
    name: 'CodeMax Agent',
    description: 'Autonomous coding agent — write, debug, refactor, and deploy code end-to-end.',
    icon: <CodeBracketIcon className="w-6 h-6" />,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
    category: 'apps',
    route: '/agent/codemax',
    ready: true,
  },
  {
    id: 'orbit',
    name: 'Orbit Assistant',
    description: 'General-purpose AI assistant for research, writing, analysis, and everyday tasks.',
    icon: <SparklesIcon className="w-6 h-6" />,
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
    category: 'apps',
    route: '/agent/orbit',
    ready: true,
  },
  {
    id: 'preview',
    name: 'Live Preview',
    description: 'Real-time HTML/CSS/JS preview — see your code render instantly.',
    icon: <PaintBrushIcon className="w-6 h-6" />,
    color: 'text-pink-500',
    bgColor: 'bg-pink-500/10',
    category: 'apps',
    route: '/preview',
    ready: true,
  },
  // ─── Skills ───
  {
    id: 'code-gen',
    name: 'Code Generation',
    description: 'Generate production-quality code in any language from natural language descriptions.',
    icon: <CommandLineIcon className="w-6 h-6" />,
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-500/10',
    category: 'skills',
    prompt: 'Write code for: ',
    ready: true,
  },
  {
    id: 'code-review',
    name: 'Code Review',
    description: 'Analyze code for bugs, security issues, performance, and best practices.',
    icon: <ShieldCheckIcon className="w-6 h-6" />,
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/10',
    category: 'skills',
    prompt: 'Review this code and suggest improvements:\n\n```\n',
    ready: true,
  },
  {
    id: 'debug',
    name: 'Debug Assistant',
    description: 'Paste an error or buggy code — get a step-by-step fix with explanation.',
    icon: <BugAntIcon className="w-6 h-6" />,
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
    category: 'skills',
    prompt: 'Debug this error:\n\n',
    ready: true,
  },
  {
    id: 'web-search',
    name: 'Web Research',
    description: 'Search the web, summarize articles, and compile research on any topic.',
    icon: <GlobeAltIcon className="w-6 h-6" />,
    color: 'text-cyan-500',
    bgColor: 'bg-cyan-500/10',
    category: 'skills',
    prompt: 'Research and summarize: ',
    ready: true,
  },
  {
    id: 'translate',
    name: 'Translation',
    description: 'Translate text between any languages with context-aware accuracy.',
    icon: <LanguageIcon className="w-6 h-6" />,
    color: 'text-indigo-500',
    bgColor: 'bg-indigo-500/10',
    category: 'skills',
    prompt: 'Translate the following text:\n\n',
    ready: true,
  },
  {
    id: 'writing',
    name: 'Writing Assistant',
    description: 'Draft emails, articles, reports, and creative content with professional polish.',
    icon: <PencilSquareIcon className="w-6 h-6" />,
    color: 'text-violet-500',
    bgColor: 'bg-violet-500/10',
    category: 'skills',
    prompt: 'Help me write: ',
    ready: true,
  },
  {
    id: 'data-analysis',
    name: 'Data Analysis',
    description: 'Analyze datasets, find patterns, generate insights, and create visualizations.',
    icon: <ChartBarIcon className="w-6 h-6" />,
    color: 'text-teal-500',
    bgColor: 'bg-teal-500/10',
    category: 'skills',
    prompt: 'Analyze this data:\n\n',
    ready: true,
  },
  {
    id: 'image-analysis',
    name: 'Image Analysis',
    description: 'Upload an image — get detailed descriptions, OCR, and visual analysis.',
    icon: <PhotoIcon className="w-6 h-6" />,
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10',
    category: 'skills',
    prompt: 'Analyze this image and describe what you see:',
    ready: true,
  },
  {
    id: 'voice-input',
    name: 'Voice Input',
    description: 'Speak instead of typing — real-time speech-to-text in any language.',
    icon: <MicrophoneIcon className="w-6 h-6" />,
    color: 'text-rose-500',
    bgColor: 'bg-rose-500/10',
    category: 'skills',
    ready: true,
  },
  {
    id: 'summarize',
    name: 'Summarization',
    description: 'Condense long documents, articles, or conversations into key points.',
    icon: <DocumentTextIcon className="w-6 h-6" />,
    color: 'text-lime-500',
    bgColor: 'bg-lime-500/10',
    category: 'skills',
    prompt: 'Summarize the following:\n\n',
    ready: true,
  },
  {
    id: 'brainstorm',
    name: 'Brainstorming',
    description: 'Generate creative ideas, solutions, names, or strategies for any challenge.',
    icon: <LightBulbIcon className="w-6 h-6" />,
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500/10',
    category: 'skills',
    prompt: 'Brainstorm ideas for: ',
    ready: true,
  },
  {
    id: 'math',
    name: 'Math & Logic',
    description: 'Solve math problems, proofs, logic puzzles, and statistical questions step-by-step.',
    icon: <CalculatorIcon className="w-6 h-6" />,
    color: 'text-sky-500',
    bgColor: 'bg-sky-500/10',
    category: 'skills',
    prompt: 'Solve this step-by-step:\n\n',
    ready: true,
  },
  {
    id: 'explain',
    name: 'Explain Anything',
    description: 'Get clear, beginner-friendly explanations of complex topics and concepts.',
    icon: <AcademicCapIcon className="w-6 h-6" />,
    color: 'text-fuchsia-500',
    bgColor: 'bg-fuchsia-500/10',
    category: 'skills',
    prompt: 'Explain in simple terms: ',
    ready: true,
  },
  {
    id: 'chat',
    name: 'Conversation',
    description: 'Open-ended chat — ask anything, discuss ideas, or just talk.',
    icon: <ChatBubbleLeftRightIcon className="w-6 h-6" />,
    color: 'text-zinc-500',
    bgColor: 'bg-zinc-500/10',
    category: 'skills',
    ready: true,
  },
];

const SkillsPage: React.FC = () => {
  const [agentOnline, setAgentOnline] = useState<boolean | null>(null);
  const [asrOnline, setAsrOnline] = useState<boolean | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try { return (localStorage.getItem('codemax-theme') as 'light' | 'dark') || 'dark'; } catch { return 'dark'; }
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try { localStorage.setItem('codemax-theme', theme); } catch {}
  }, [theme]);

  useEffect(() => {
    checkAgentHealth().then(setAgentOnline);
    checkAsrHealth().then(setAsrOnline);
  }, []);

  const handleSkillClick = (skill: Skill) => {
    if (skill.route) {
      window.location.href = skill.route;
      return;
    }
    if (skill.id === 'voice-input') {
      window.location.href = '/?stt=1';
      return;
    }
    if (skill.prompt) {
      window.location.href = `/?prompt=${encodeURIComponent(skill.prompt)}`;
      return;
    }
    window.location.href = '/';
  };

  const apps = SKILLS.filter(s => s.category === 'apps');
  const skills = SKILLS.filter(s => s.category === 'skills');

  return (
    <div className="h-[100dvh] overflow-y-auto bg-white dark:bg-[#0e0e11] text-zinc-900 dark:text-white">
      {/* Header */}
      <header className="border-b border-zinc-200 dark:border-zinc-800/50 bg-white/80 dark:bg-[#0e0e11]/80 backdrop-blur-xl sticky top-0 z-30">
        <div className="max-w-4xl mx-auto flex items-center justify-between px-4 md:px-6 h-14">
          <div className="flex items-center space-x-3">
            <a href="/" className="flex items-center space-x-2 hover:opacity-80 transition-opacity" aria-label="Home">
              <Logo className="w-6 h-6" />
            </a>
            <div className="w-px h-5 bg-zinc-200 dark:bg-zinc-800"></div>
            <span className="text-sm font-bold tracking-tight">Apps & Skills</span>
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

      <div className="max-w-4xl mx-auto px-4 md:px-6 py-8">
        {/* Hero */}
        <div className="text-center mb-10">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 via-blue-500 to-cyan-500 flex items-center justify-center mx-auto mb-5 shadow-2xl">
            <CpuChipIcon className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-2">Apps & Skills</h1>
          <p className="text-zinc-500 text-sm max-w-md mx-auto">
            Everything Eburon AI can do — powered by the Orbit Model. Tap any skill to get started.
          </p>
        </div>

        {/* Agent Status */}
        <div className={`mb-8 p-4 rounded-2xl border flex items-center justify-between ${
          agentOnline ? 'bg-emerald-500/5 border-emerald-500/20' : agentOnline === false ? 'bg-zinc-50 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800' : 'bg-zinc-50 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800'
        }`}>
          <div className="flex items-center space-x-3">
            {agentOnline === null ? (
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            ) : agentOnline ? (
              <CheckCircleIcon className="w-5 h-5 text-emerald-500" />
            ) : (
              <XCircleIcon className="w-5 h-5 text-zinc-400" />
            )}
            <div>
              <h3 className="text-sm font-bold">
                {agentOnline === null ? 'Checking agent...' : agentOnline ? 'Orbit Agent Online' : 'Orbit Agent Offline'}
              </h3>
              <p className="text-[11px] text-zinc-500">
                {agentOnline
                  ? 'All skills are ready to use'
                  : agentOnline === false
                    ? 'Skills work via cloud models — agent features need Docker'
                    : 'Connecting...'}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {asrOnline !== null && (
              <span className={`flex items-center space-x-1 px-2 py-0.5 rounded-full ${asrOnline ? 'bg-emerald-500/10' : 'bg-zinc-500/10'}`}>
                <MicrophoneIcon className={`w-3 h-3 ${asrOnline ? 'text-emerald-500' : 'text-zinc-400'}`} />
                <span className={`text-[9px] font-bold uppercase tracking-widest ${asrOnline ? 'text-emerald-500' : 'text-zinc-400'}`}>
                  {asrOnline ? 'ASR' : 'Browser STT'}
                </span>
              </span>
            )}
          </div>
        </div>

        {/* Apps Section */}
        <h2 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-4">Apps</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
          {apps.map((skill) => (
            <button
              key={skill.id}
              onClick={() => handleSkillClick(skill)}
              className="group p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#161619] hover:border-zinc-300 dark:hover:border-zinc-700 transition-all text-left active:scale-[0.98] hover:shadow-lg"
            >
              <div className="flex items-start justify-between mb-3">
                <div className={`w-11 h-11 rounded-xl ${skill.bgColor} ${skill.color} flex items-center justify-center transition-transform group-hover:scale-110`}>
                  {skill.icon}
                </div>
                <span className="flex items-center space-x-1 px-2 py-0.5 bg-emerald-500/10 rounded-full">
                  <CheckCircleIcon className="w-3 h-3 text-emerald-500" />
                  <span className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest">Ready</span>
                </span>
              </div>
              <h3 className="text-sm font-bold mb-1 group-hover:text-blue-500 transition-colors">{skill.name}</h3>
              <p className="text-[11px] text-zinc-500 leading-relaxed">{skill.description}</p>
            </button>
          ))}
        </div>

        {/* Skills Section */}
        <h2 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-4">Skills</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-10">
          {skills.map((skill) => (
            <button
              key={skill.id}
              onClick={() => handleSkillClick(skill)}
              className="group p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#161619] hover:border-zinc-300 dark:hover:border-zinc-700 transition-all text-left active:scale-[0.98] hover:shadow-md"
            >
              <div className={`w-10 h-10 rounded-lg ${skill.bgColor} ${skill.color} flex items-center justify-center mb-3 transition-transform group-hover:scale-110`}>
                {skill.icon}
              </div>
              <h3 className="text-xs font-bold mb-1 group-hover:text-blue-500 transition-colors leading-tight">{skill.name}</h3>
              <p className="text-[10px] text-zinc-500 leading-snug line-clamp-2">{skill.description}</p>
            </button>
          ))}
        </div>

        {/* Footer Info */}
        <div className="p-4 bg-zinc-50 dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-800 rounded-xl mb-6">
          <div className="flex items-start space-x-3">
            <CpuChipIcon className="w-5 h-5 text-purple-500 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-bold mb-1">Powered by Eburon AI — Orbit Model</h4>
              <p className="text-[11px] text-zinc-500 leading-relaxed">
                All skills run through the Orbit Model. Agent features (CodeMax, Orbit Assistant) use the
                Orbit Endpoint for advanced reasoning and multi-step task execution.
                Voice input uses browser speech recognition by default, with Orbit Voice as an optional upgrade.
              </p>
            </div>
          </div>
        </div>

        <div className="text-center">
          <p className="text-[9px] text-zinc-400 font-bold uppercase tracking-[0.3em] opacity-40">
            Eburon AI — Apps & Skills
          </p>
        </div>
      </div>
    </div>
  );
};

export default SkillsPage;
