import React from 'react';
import App from './App';
import PreviewPage from './components/PreviewPage';
import AgentPage from './components/AgentPage';
import SkillsPage from './components/SkillsPage';

const AppShell: React.FC = () => {
  const path = window.location.pathname;
  if (path.startsWith('/preview')) return <PreviewPage />;
  if (path.startsWith('/agent/')) return <AgentPage />;
  if (path.startsWith('/skills') || path.startsWith('/services')) return <SkillsPage />;
  return <App />;
};

export default AppShell;
