import React from 'react';
import { XMarkIcon, BoltIcon, CheckIcon, XCircleIcon } from '@heroicons/react/24/outline';
import type { CodeMaxDevSseMessage } from '../services/codemaxDev';

export interface PendingApproval {
  runId: string;
  toolUseId: string;
  toolName: string;
  ts: string;
  args?: any;
  prompt?: string;
  decided?: 'approve' | 'deny';
}

interface SimulationPanelProps {
  open: boolean;
  onClose: () => void;
  runId: string | null;
  status: string | null;
  events: CodeMaxDevSseMessage[];
  approvals: PendingApproval[];
  onDecision: (toolUseId: string, decision: 'approve' | 'deny') => void;
}

function toolLabel(toolName: string): string {
  const t = String(toolName || '').toLowerCase();
  if (t.includes('google_web_search')) return 'Web Search';
  if (t.includes('web_fetch')) return 'Web Fetch';
  if (t.includes('shell')) return 'Shell';
  return toolName || 'Tool';
}

function summarizeEvent(msg: CodeMaxDevSseMessage): { title: string; detail?: string; tone?: 'info' | 'warn' | 'error' } {
  if (msg.kind === 'status') {
    return { title: `Status: ${msg.status}`, tone: msg.status === 'done' ? 'info' : 'info' };
  }
  if (msg.kind === 'error') {
    return { title: 'Error', detail: msg.error, tone: 'error' };
  }
  if (msg.kind === 'approval') {
    return { title: `Approval requested: ${toolLabel(msg.toolName)}`, detail: msg.prompt || '', tone: 'warn' };
  }
  if (msg.kind === 'event') {
    const ev: any = msg.event || {};
    const type = String(ev.type || ev.kind || ev.event_type || 'event');
    const content = typeof ev.content === 'string'
      ? ev.content
      : typeof ev.text === 'string'
        ? ev.text
        : typeof ev.message === 'string'
          ? ev.message
          : '';
    const detail = content ? content.slice(0, 240) : '';
    return { title: type, detail, tone: type.toLowerCase().includes('stderr') ? 'warn' : 'info' };
  }
  return { title: msg.kind, tone: 'info' };
}

function toneClasses(tone?: 'info' | 'warn' | 'error') {
  switch (tone) {
    case 'error':
      return 'border-red-500/20 bg-red-500/5 text-red-200';
    case 'warn':
      return 'border-amber-500/20 bg-amber-500/5 text-amber-100';
    case 'info':
    default:
      return 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#161619] text-zinc-900 dark:text-white';
  }
}

const SimulationPanel: React.FC<SimulationPanelProps> = ({ open, onClose, runId, status, events, approvals, onDecision }) => {
  if (!open) return null;

  const statusText = status || 'idle';
  const statusColor =
    statusText === 'running' ? 'bg-blue-500' :
    statusText === 'done' ? 'bg-emerald-500' :
    statusText === 'stopped' ? 'bg-zinc-500' :
    statusText === 'error' ? 'bg-red-500' :
    'bg-zinc-400';

  const recent = events.slice(-80);

  return (
    <>
      {/* Mobile backdrop */}
      <button
        onClick={onClose}
        className="md:hidden fixed inset-0 z-[90] bg-black/40 backdrop-blur-sm"
        aria-label="Close simulations"
      />

      <aside className="fixed z-[100] md:top-16 md:bottom-4 md:right-4 md:w-[420px] bottom-0 left-0 right-0 md:left-auto max-h-[85vh] md:max-h-none flex flex-col rounded-t-2xl md:rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#0e0e11] shadow-[0_32px_128px_rgba(0,0,0,0.45)]">
        {/* Header */}
        <div className="shrink-0 px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-[#0e0e11]/80 backdrop-blur-xl flex items-center justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-blue-600/10 flex items-center justify-center border border-blue-500/20">
                <BoltIcon className="w-5 h-5 text-blue-500" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-black uppercase tracking-widest truncate">CodeMax Dev</h3>
                  <span className={`w-2 h-2 rounded-full ${statusColor} animate-pulse`} title={statusText} />
                  <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">{statusText}</span>
                </div>
                {runId && (
                  <p className="text-[10px] text-zinc-500 font-mono truncate">run: {runId}</p>
                )}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition" aria-label="Close simulations" title="Close">
            <XMarkIcon className="w-5 h-5 text-zinc-500" />
          </button>
        </div>

        {/* Approvals */}
        {approvals.length > 0 && (
          <div className="shrink-0 px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-amber-500/5">
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400 mb-2">Approvals</p>
            <div className="space-y-2">
              {approvals.map((a) => {
                const decided = a.decided;
                return (
                  <div key={a.toolUseId} className="rounded-xl border border-amber-500/20 bg-white dark:bg-[#161619] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-bold truncate">{toolLabel(a.toolName)}</p>
                        <p className="text-[10px] text-zinc-500 font-mono truncate">toolUseId: {a.toolUseId}</p>
                        {a.prompt && <p className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-1 line-clamp-2">{a.prompt}</p>}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => onDecision(a.toolUseId, 'approve')}
                          disabled={!!decided}
                          className={`px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border transition ${
                            decided === 'approve'
                              ? 'bg-emerald-600 border-emerald-600 text-white'
                              : 'bg-emerald-600/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-600/20'
                          } disabled:opacity-60`}
                          title="Approve"
                        >
                          <span className="inline-flex items-center gap-1">
                            <CheckIcon className="w-3.5 h-3.5" />
                            Approve
                          </span>
                        </button>
                        <button
                          onClick={() => onDecision(a.toolUseId, 'deny')}
                          disabled={!!decided}
                          className={`px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border transition ${
                            decided === 'deny'
                              ? 'bg-red-600 border-red-600 text-white'
                              : 'bg-red-600/10 border-red-500/20 text-red-600 dark:text-red-400 hover:bg-red-600/20'
                          } disabled:opacity-60`}
                          title="Deny"
                        >
                          <span className="inline-flex items-center gap-1">
                            <XCircleIcon className="w-3.5 h-3.5" />
                            Deny
                          </span>
                        </button>
                      </div>
                    </div>
                    {a.args !== undefined && (
                      <details className="mt-2">
                        <summary className="text-[10px] text-zinc-500 cursor-pointer select-none">Args</summary>
                        <pre className="mt-1 text-[10px] bg-zinc-50 dark:bg-black/30 border border-zinc-200 dark:border-zinc-800 rounded-lg p-2 overflow-auto max-h-40 whitespace-pre-wrap break-words font-mono text-zinc-700 dark:text-zinc-300">
                          {JSON.stringify(a.args, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Timeline */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 scrollbar-hide">
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-1">Simulations</p>
          {recent.length === 0 ? (
            <div className="py-10 text-center text-zinc-500 text-xs">
              Waiting for events...
            </div>
          ) : (
            recent.map((msg, idx) => {
              const s = summarizeEvent(msg);
              const tone = s.tone;
              const time = (msg as any).ts ? new Date((msg as any).ts).toLocaleTimeString() : '';
              return (
                <div key={`${(msg as any).ts || idx}-${idx}`} className={`rounded-xl border p-3 ${toneClasses(tone)}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-bold truncate">{s.title}</p>
                      {s.detail && (
                        <p className="text-[11px] mt-1 text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap break-words">
                          {s.detail}
                        </p>
                      )}
                    </div>
                    {time && <span className="text-[9px] text-zinc-500 font-mono shrink-0">{time}</span>}
                  </div>
                  <details className="mt-2">
                    <summary className="text-[10px] text-zinc-500 cursor-pointer select-none">Raw</summary>
                    <pre className="mt-1 text-[10px] bg-zinc-50 dark:bg-black/30 border border-zinc-200 dark:border-zinc-800 rounded-lg p-2 overflow-auto max-h-44 whitespace-pre-wrap break-words font-mono text-zinc-700 dark:text-zinc-300">
                      {JSON.stringify(msg, null, 2)}
                    </pre>
                  </details>
                </div>
              );
            })
          )}
        </div>
      </aside>
    </>
  );
};

export default SimulationPanel;

