import React from 'react';
import App from './App';
import PreviewPage from './components/PreviewPage';
import AgentPage from './components/AgentPage';
import GoogleServicesPage from './components/GoogleServicesPage';

const AppShell: React.FC = () => {
  const path = window.location.pathname;
  if (path.startsWith('/preview')) return <PreviewPage />;
  if (path.startsWith('/agent/')) return <AgentPage />;
  if (path.startsWith('/services')) return <GoogleServicesPage />;
  return <App />;
};

export default AppShell;
