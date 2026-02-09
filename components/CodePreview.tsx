import React, { useState, useRef, useEffect } from 'react';
import {
  EyeIcon,
  CodeBracketSquareIcon,
  ArrowsPointingOutIcon,
  XMarkIcon,
  PlayIcon,
  ArrowPathIcon,
  DevicePhoneMobileIcon,
  ComputerDesktopIcon,
  DeviceTabletIcon,
} from '@heroicons/react/24/outline';

interface CodePreviewProps {
  code: string;
  title?: string;
  onClose?: () => void;
  isOpen: boolean;
}

const CodePreview: React.FC<CodePreviewProps> = ({ code, title = 'Live Preview', onClose, isOpen }) => {
  const [activeTab, setActiveTab] = useState<'preview' | 'code'>('preview');
  const [viewMode, setViewMode] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [key, setKey] = useState(0); // For forcing refresh
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Auto-refresh when code changes
  useEffect(() => {
    if (code && isOpen) {
      setKey(prev => prev + 1);
    }
  }, [code, isOpen]);

  if (!isOpen || !code) return null;

  const getPreviewWidth = () => {
    switch (viewMode) {
      case 'mobile': return '375px';
      case 'tablet': return '768px';
      default: return '100%';
    }
  };

  const refreshPreview = () => {
    setKey(prev => prev + 1);
  };

  const openInNewTab = () => {
    const blob = new Blob([code], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  return (
    <div className={`fixed inset-0 z-[100] flex flex-col bg-white dark:bg-[#0e0e11] ${isFullscreen ? '' : 'md:inset-4 md:rounded-2xl md:border md:border-zinc-200 dark:border-zinc-800 md:shadow-2xl'}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 text-white shrink-0">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <EyeIcon className="w-5 h-5" />
            <span className="font-black text-sm uppercase tracking-widest">{title}</span>
          </div>
          <div className="h-4 w-px bg-white/30" />
          {/* Tabs */}
          <div className="flex bg-white/10 rounded-lg p-0.5">
            <button
              onClick={() => setActiveTab('preview')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                activeTab === 'preview' ? 'bg-white text-purple-600' : 'text-white/80 hover:text-white'
              }`}
            >
              <PlayIcon className="w-3.5 h-3.5" />
              <span>Preview</span>
            </button>
            <button
              onClick={() => setActiveTab('code')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                activeTab === 'code' ? 'bg-white text-purple-600' : 'text-white/80 hover:text-white'
              }`}
            >
              <CodeBracketSquareIcon className="w-3.5 h-3.5" />
              <span>Code</span>
            </button>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* View Mode Toggles */}
          {activeTab === 'preview' && (
            <div className="hidden md:flex items-center bg-white/10 rounded-lg p-0.5 mr-2">
              <button
                onClick={() => setViewMode('desktop')}
                className={`p-1.5 rounded-md transition-all ${viewMode === 'desktop' ? 'bg-white text-purple-600' : 'text-white/80 hover:text-white'}`}
                title="Desktop view"
              >
                <ComputerDesktopIcon className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('tablet')}
                className={`p-1.5 rounded-md transition-all ${viewMode === 'tablet' ? 'bg-white text-purple-600' : 'text-white/80 hover:text-white'}`}
                title="Tablet view"
              >
                <DeviceTabletIcon className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('mobile')}
                className={`p-1.5 rounded-md transition-all ${viewMode === 'mobile' ? 'bg-white text-purple-600' : 'text-white/80 hover:text-white'}`}
                title="Mobile view"
              >
                <DevicePhoneMobileIcon className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Refresh */}
          <button
            onClick={refreshPreview}
            className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-all"
            title="Refresh preview"
          >
            <ArrowPathIcon className="w-4 h-4" />
          </button>

          {/* Fullscreen toggle */}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-all hidden md:flex"
            title="Toggle fullscreen"
            aria-label="Toggle fullscreen"
          >
            <ArrowsPointingOutIcon className="w-4 h-4" />
          </button>

          {/* Open in new tab */}
          <button
            onClick={openInNewTab}
            className="px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-bold transition-all"
            title="Open in new tab"
          >
            Open
          </button>

          {/* Close */}
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-all"
              title="Close preview"
              aria-label="Close preview"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden bg-zinc-50 dark:bg-[#0a0a0a]">
        {activeTab === 'preview' ? (
          <div className="h-full flex items-center justify-center p-4 overflow-auto">
            <div
              className="h-full bg-white rounded-lg shadow-2xl overflow-hidden transition-all duration-300"
              style={{
                width: getPreviewWidth(),
                maxWidth: '100%',
              }}
            >
              <iframe
                key={key}
                ref={iframeRef}
                srcDoc={code}
                className="w-full h-full border-0"
                sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-downloads allow-modals"
                allow="accelerometer; camera; encrypted-media; geolocation; gyroscope; microphone; midi; clipboard-read; clipboard-write"
                title="Live preview"
              />
            </div>
          </div>
        ) : (
          <div className="h-full overflow-auto">
            <pre className="p-4 text-xs font-mono leading-relaxed text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap break-words">
              <code>{code}</code>
            </pre>
          </div>
        )}
      </div>

      {/* Footer info */}
      <div className="px-4 py-2 bg-zinc-100 dark:bg-[#1c1c1f] border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between text-[10px] text-zinc-500">
        <span className="font-medium">
          {activeTab === 'preview' ? 'Auto-refresh enabled • Supports HTML, CSS, JS, Three.js, Canvas, SVG, WebGL' : 'Source code view'}
        </span>
        <span className="font-mono">{code.length.toLocaleString()} chars</span>
      </div>
    </div>
  );
};

export default CodePreview;
