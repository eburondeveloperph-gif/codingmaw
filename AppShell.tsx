import React from 'react';
import { useAuth } from './contexts/AuthContext';
import AuthPage from './components/AuthPage';
import App from './App';
import PreviewPage from './components/PreviewPage';
import { Logo } from './components/Logo';

const AppShell: React.FC = () => {
  const { user, isLoading, isAuthenticated, login, register } = useAuth();

  // Loading spinner while checking token
  if (isLoading) {
    return (
      <div className="min-h-[100dvh] bg-[#0e0e11] flex flex-col items-center justify-center">
        <Logo className="w-10 h-10 mb-4 opacity-30 animate-pulse" />
        <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // Not authenticated — show auth page
  if (!isAuthenticated) {
    return <AuthPage onLogin={login} onRegister={register} />;
  }

  // Authenticated — route
  const isPreviewRoute = window.location.pathname.startsWith('/preview');
  return isPreviewRoute ? <PreviewPage /> : <App />;
};

export default AppShell;
