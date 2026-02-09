import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  GlobeAltIcon,
  ArrowLeftIcon,
  ArrowPathIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  CursorArrowRaysIcon,
  DocumentTextIcon,
  XMarkIcon,
  PaperAirplaneIcon,
} from '@heroicons/react/24/outline';
import { type BrowseCommand, type BrowseResult, executeBrowseCommand } from '../services/browseCommands';

interface BrowseSandboxProps {
  onClose: () => void;
  isOpen: boolean;
  pendingCommands?: BrowseCommand[];
  agentNarration?: string;
  onCommandsExecuted?: (count: number) => void;
}

const BROWSE_BASE = typeof window !== 'undefined' && !window.location.hostname.includes('localhost') && !window.location.hostname.includes('127.0.0.1')
  ? '/api/browse'
  : 'http://168.231.78.113:18790';

async function browseAction(action: string, params: Record<string, any> = {}): Promise<BrowseResult> {
  const res = await fetch(`${BROWSE_BASE}/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session: 'agent', ...params }),
  });
  return res.json();
}

const BrowseSandbox: React.FC<BrowseSandboxProps> = ({ onClose, isOpen, pendingCommands = [], agentNarration, onCommandsExecuted }) => {
  const [urlInput, setUrlInput] = useState('');
  const [currentUrl, setCurrentUrl] = useState('');
  const [currentTitle, setCurrentTitle] = useState('');
  const [screenshotSrc, setScreenshotSrc] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pageContent, setPageContent] = useState<BrowseResult | null>(null);
  const [showContent, setShowContent] = useState(false);
  const [actionInput, setActionInput] = useState('');
  const [actionType, setActionType] = useState<'click' | 'type' | 'fill'>('click');
  const [logs, setLogs] = useState<string[]>([]);
  const [executedCount, setExecutedCount] = useState(0);
  const executingRef = useRef(false);
  const urlRef = useRef<HTMLInputElement>(null);

  const addLog = (msg: string) => setLogs(prev => [...prev.slice(-30), `[${new Date().toLocaleTimeString()}] ${msg}`]);

  const updateFromResult = useCallback((result: BrowseResult, actionLabel: string) => {
    if (result.ok) {
      if (result.screenshot) setScreenshotSrc(`data:image/jpeg;base64,${result.screenshot}`);
      if (result.url) { setCurrentUrl(result.url); setUrlInput(result.url); }
      if (result.title) setCurrentTitle(result.title);
      addLog(`✓ ${actionLabel}`);
    } else {
      setError(result.error || `${actionLabel} failed`);
      addLog(`✗ ${actionLabel}: ${result.error}`);
    }
  }, []);

  // ── Agent-driven command execution ──────────
  useEffect(() => {
    if (pendingCommands.length <= executedCount || executingRef.current) return;

    const executeNext = async () => {
      executingRef.current = true;
      const cmdsToRun = pendingCommands.slice(executedCount);

      for (const cmd of cmdsToRun) {
        setLoading(true);
        addLog(`▶ Agent: ${cmd.action}${cmd.url ? ` → ${cmd.url}` : ''}${cmd.selector ? ` [${cmd.selector}]` : ''}`);

        const result = await executeBrowseCommand(cmd, 'agent');
        updateFromResult(result, `${cmd.action}${cmd.url ? ` ${cmd.url}` : ''}`);

        setExecutedCount(prev => {
          const next = prev + 1;
          onCommandsExecuted?.(next);
          return next;
        });
        setLoading(false);

        // Small delay between commands for visual feedback
        await new Promise(r => setTimeout(r, 300));
      }
      executingRef.current = false;
    };

    executeNext();
  }, [pendingCommands.length, executedCount, updateFromResult, onCommandsExecuted]);

  // Reset executed count when sandbox is reopened
  useEffect(() => {
    if (isOpen) {
      setExecutedCount(0);
      executingRef.current = false;
    }
  }, [isOpen]);

  const handleNavigate = async (url?: string) => {
    const target = url || urlInput;
    if (!target.trim()) return;
    setLoading(true);
    setError('');
    addLog(`Navigating to ${target}...`);
    try {
      const result = await browseAction('navigate', { url: target });
      updateFromResult(result, `Navigate: ${target}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
      addLog(`Error: ${err}`);
    }
    setLoading(false);
  };

  const handleScreenshot = async () => {
    setLoading(true);
    const result = await browseAction('screenshot');
    if (result.ok && result.screenshot) {
      setScreenshotSrc(`data:image/jpeg;base64,${result.screenshot}`);
      addLog('Screenshot refreshed');
    }
    setLoading(false);
  };

  const handleScroll = async (direction: 'up' | 'down') => {
    setLoading(true);
    const result = await browseAction('scroll', { direction });
    updateFromResult(result, `Scroll ${direction}`);
    setLoading(false);
  };

  const handleBack = async () => {
    setLoading(true);
    addLog('Going back...');
    const result = await browseAction('back');
    updateFromResult(result, 'Back');
    setLoading(false);
  };

  const handleGetContent = async () => {
    setLoading(true);
    const result = await browseAction('content');
    if (result.ok) {
      setPageContent(result);
      setShowContent(true);
      addLog(`Content: ${result.links?.length || 0} links, ${result.inputs?.length || 0} inputs`);
    }
    setLoading(false);
  };

  const handleAction = async () => {
    if (!actionInput.trim()) return;
    setLoading(true);
    setError('');

    if (actionType === 'click') {
      addLog(`Clicking: ${actionInput}`);
      const result = await browseAction('click', { selector: actionInput });
      updateFromResult(result, `Click: ${actionInput}`);
    } else if (actionType === 'type') {
      const [selector, ...textParts] = actionInput.split('|');
      const text = textParts.join('|');
      if (!selector || !text) { setError('Format: selector|text'); setLoading(false); return; }
      addLog(`Typing into ${selector.trim()}`);
      const result = await browseAction('type', { selector: selector.trim(), text: text.trim() });
      updateFromResult(result, `Type: ${selector.trim()}`);
    } else if (actionType === 'fill') {
      addLog(`Submitting form: ${actionInput || 'Enter key'}`);
      const result = await browseAction('submit', { selector: actionInput || undefined });
      updateFromResult(result, 'Submit');
    }
    setLoading(false);
  };

  const handleLinkClick = async (href: string) => {
    setShowContent(false);
    await handleNavigate(href);
  };

  const handleFillInput = async (selector: string, placeholder: string) => {
    const value = prompt(`Enter value for "${placeholder || selector}":`);
    if (value === null) return;
    setLoading(true);
    addLog(`Filling ${selector} with value`);
    const result = await browseAction('type', { selector, text: value });
    if (result.ok) {
      setScreenshotSrc(`data:image/jpeg;base64,${result.screenshot}`);
      addLog(`Filled ${selector}`);
    }
    setLoading(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center md:p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-t-2xl md:rounded-2xl shadow-2xl w-full md:max-w-5xl h-[95dvh] md:h-[90vh] flex flex-col overflow-hidden border border-zinc-200 dark:border-zinc-700">

        {/* Header — compact on mobile */}
        <div className="flex items-center gap-1.5 px-2 md:px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700 shrink-0">
          <GlobeAltIcon className="w-4 h-4 md:w-5 md:h-5 text-emerald-500 shrink-0" />

          {/* URL Bar */}
          <div className="flex-1 flex items-center gap-1 min-w-0">
            <button onClick={handleBack} disabled={loading} className="p-1 md:p-1.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition disabled:opacity-30 shrink-0" title="Back">
              <ArrowLeftIcon className="w-3.5 h-3.5 md:w-4 md:h-4" />
            </button>
            <button onClick={handleScreenshot} disabled={loading} className="p-1 md:p-1.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition disabled:opacity-30 shrink-0" title="Refresh">
              <ArrowPathIcon className={`w-3.5 h-3.5 md:w-4 md:h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <form onSubmit={(e) => { e.preventDefault(); handleNavigate(); }} className="flex-1 flex min-w-0">
              <input
                ref={urlRef}
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="Enter URL..."
                className="flex-1 min-w-0 px-2 md:px-3 py-1 md:py-1.5 text-xs md:text-sm bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-600 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
              <button type="submit" disabled={loading} className="ml-1 px-2 md:px-3 py-1 md:py-1.5 bg-emerald-600 text-white text-[10px] md:text-xs font-bold rounded-lg hover:bg-emerald-700 transition disabled:opacity-50 shrink-0" title="Navigate to URL" aria-label="Navigate to URL">
                Go
              </button>
            </form>
          </div>

          <button onClick={onClose} className="p-1 md:p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 transition shrink-0" title="Close">
            <XMarkIcon className="w-4 h-4 md:w-5 md:h-5" />
          </button>
        </div>

        {/* Title bar */}
        {currentTitle && (
          <div className="px-3 py-1 bg-zinc-100 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-700 shrink-0">
            <span className="text-xs text-zinc-500 truncate block">{currentTitle} — {currentUrl}</span>
          </div>
        )}

        {/* Main content area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Screenshot viewport */}
          <div className="flex-1 overflow-auto bg-zinc-100 dark:bg-zinc-950 relative">
            {screenshotSrc ? (
              <img src={screenshotSrc} alt="Browser view" className="w-full" />
            ) : (
              <div className="flex items-center justify-center h-full text-zinc-400">
                <div className="text-center">
                  <GlobeAltIcon className="w-16 h-16 mx-auto mb-4 opacity-30" />
                  <p className="text-sm font-medium">Enter a URL above to start browsing</p>
                  <p className="text-xs mt-1 opacity-60">The agent can navigate, click, fill forms, and create accounts</p>
                </div>
              </div>
            )}
            {loading && (
              <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                <div className="bg-white dark:bg-zinc-800 px-4 py-2 rounded-xl shadow-lg flex items-center gap-2">
                  <ArrowPathIcon className="w-4 h-4 animate-spin text-emerald-500" />
                  <span className="text-sm">Loading...</span>
                </div>
              </div>
            )}
          </div>

          {/* Content sidebar (when visible) */}
          {showContent && pageContent && (
            <div className="w-72 border-l border-zinc-200 dark:border-zinc-700 overflow-y-auto bg-white dark:bg-zinc-900 shrink-0">
              <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-200 dark:border-zinc-700">
                <span className="text-xs font-bold uppercase text-zinc-500">Page Content</span>
                <button onClick={() => setShowContent(false)} className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700" title="Close content panel" aria-label="Close content panel">
                  <XMarkIcon className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Inputs/Forms */}
              {pageContent.inputs && pageContent.inputs.length > 0 && (
                <div className="p-2 border-b border-zinc-200 dark:border-zinc-700">
                  <span className="text-[10px] font-bold uppercase text-amber-600 block mb-1">Form Fields</span>
                  {pageContent.inputs.map((inp, i) => (
                    <button
                      key={i}
                      onClick={() => handleFillInput(inp.selector, inp.placeholder || inp.name)}
                      className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-amber-50 dark:hover:bg-amber-900/20 transition flex items-center gap-1.5 mb-0.5"
                    >
                      <CursorArrowRaysIcon className="w-3 h-3 text-amber-500 shrink-0" />
                      <span className="truncate">{inp.placeholder || inp.name || inp.id} <span className="text-zinc-400">({inp.type || inp.tag})</span></span>
                    </button>
                  ))}
                </div>
              )}

              {/* Links */}
              {pageContent.links && pageContent.links.length > 0 && (
                <div className="p-2 border-b border-zinc-200 dark:border-zinc-700">
                  <span className="text-[10px] font-bold uppercase text-blue-600 block mb-1">Links</span>
                  {pageContent.links.map((link, i) => (
                    <button
                      key={i}
                      onClick={() => handleLinkClick(link.href)}
                      className="w-full text-left px-2 py-1 text-xs text-blue-600 dark:text-blue-400 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 truncate block mb-0.5"
                      title={link.href}
                    >
                      {link.text}
                    </button>
                  ))}
                </div>
              )}

              {/* Text */}
              {pageContent.text && (
                <div className="p-2">
                  <span className="text-[10px] font-bold uppercase text-zinc-500 block mb-1">Text</span>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap leading-relaxed">{pageContent.text.slice(0, 2000)}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action bar — responsive */}
        <div className="shrink-0 border-t border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-2 md:px-3 py-1.5 md:py-2 space-y-1.5">
          {/* Agent narration (top, most visible) */}
          {agentNarration && (
            <div className="px-2 py-1.5 bg-purple-500/10 border border-purple-500/20 rounded-lg">
              <p className="text-[11px] text-purple-400 font-medium leading-snug line-clamp-2">{agentNarration}</p>
            </div>
          )}

          <div className="flex items-center gap-1.5">
            {/* Quick actions */}
            <div className="flex items-center gap-0.5">
              <button onClick={() => handleScroll('up')} disabled={loading || !screenshotSrc} className="p-1 md:p-1.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition disabled:opacity-30" title="Scroll Up">
                <ArrowUpIcon className="w-3.5 h-3.5 md:w-4 md:h-4" />
              </button>
              <button onClick={() => handleScroll('down')} disabled={loading || !screenshotSrc} className="p-1 md:p-1.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition disabled:opacity-30" title="Scroll Down">
                <ArrowDownIcon className="w-3.5 h-3.5 md:w-4 md:h-4" />
              </button>
              <button onClick={handleGetContent} disabled={loading || !screenshotSrc} className="p-1 md:p-1.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition disabled:opacity-30" title="Extract Content">
                <DocumentTextIcon className="w-3.5 h-3.5 md:w-4 md:h-4" />
              </button>
            </div>

            <div className="h-4 w-px bg-zinc-300 dark:bg-zinc-600 shrink-0" />

            {/* Action type */}
            <select
              value={actionType}
              onChange={(e) => setActionType(e.target.value as 'click' | 'type' | 'fill')}
              className="text-[10px] md:text-xs px-1.5 md:px-2 py-1 md:py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-600 shrink-0"
              title="Action type" aria-label="Action type"
            >
              <option value="click">Click</option>
              <option value="type">Type</option>
              <option value="fill">Submit</option>
            </select>

            {/* Action input */}
            <form onSubmit={(e) => { e.preventDefault(); handleAction(); }} className="flex-1 flex min-w-0">
              <input
                type="text"
                value={actionInput}
                onChange={(e) => setActionInput(e.target.value)}
                placeholder={actionType === 'click' ? 'Selector' : actionType === 'type' ? 'selector|text' : 'Submit selector'}
                className="flex-1 min-w-0 px-2 py-1 md:py-1.5 text-[10px] md:text-xs bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-600 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
              <button type="submit" disabled={loading} className="ml-1 p-1 md:p-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition disabled:opacity-50 shrink-0" title="Execute action" aria-label="Execute action">
                <PaperAirplaneIcon className="w-3.5 h-3.5 md:w-4 md:h-4" />
              </button>
            </form>
          </div>

          {/* Error / Log */}
          {error && <p className="text-[10px] md:text-xs text-red-500 mt-1">{error}</p>}
          {logs.length > 0 && (
            <div className="max-h-12 md:max-h-20 overflow-y-auto scrollbar-hide">
              {logs.slice(-3).map((log, i) => (
                <p key={i} className="text-[9px] md:text-[10px] text-zinc-400 font-mono truncate">{log}</p>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BrowseSandbox;
