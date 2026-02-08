import React, { useEffect, useState } from 'react';
import { Logo } from './Logo';
import { useAuth } from '../contexts/AuthContext';

const GoogleCallback: React.FC = () => {
  const { loginWithGoogle } = useAuth();
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state') || undefined;
    const errorParam = params.get('error');

    if (errorParam) {
      setError(`Google sign-in was cancelled or failed: ${errorParam}`);
      return;
    }

    if (!code) {
      setError('No authorization code received from Google');
      return;
    }

    loginWithGoogle(code, state)
      .then(() => {
        // If state was present, this was a "link account" flow — go to services page
        if (state) {
          window.location.href = '/services';
        } else {
          window.location.href = '/';
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Google sign-in failed');
      });
  }, []);

  if (error) {
    return (
      <div className="min-h-[100dvh] bg-[#0e0e11] flex flex-col items-center justify-center p-4">
        <Logo className="w-10 h-10 mb-6 opacity-50" />
        <div className="bg-red-500/10 border border-red-500/20 rounded-[12px] p-6 max-w-md w-full text-center">
          <p className="text-red-400 text-sm font-medium mb-4">{error}</p>
          <a
            href="/"
            className="inline-block px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-[6px] text-xs font-bold uppercase tracking-widest transition-all"
          >
            Back to Sign In
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[#0e0e11] flex flex-col items-center justify-center p-4">
      <Logo className="w-10 h-10 mb-4 opacity-30 animate-pulse" />
      <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
      <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Completing Google sign-in...</p>
    </div>
  );
};

export default GoogleCallback;
