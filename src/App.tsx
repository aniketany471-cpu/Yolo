/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AppProvider } from './context/AppContext';
import { Layout } from './components/layout/Layout';
import { Dashboard } from './pages/Dashboard';
import { Messages } from './pages/Messages';
import { Targets } from './pages/Targets';
import { Settings } from './pages/Settings';
import { PdfConverter } from './pages/PdfConverter';
import { MusicDownloader } from './pages/MusicDownloader';
import { AISettings } from './pages/AISettings';
import MatureSettings from './pages/MatureSettings';

function AppContent() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'messages' | 'targets' | 'settings' | 'pdf' | 'music' | 'ai' | 'nsfw'>('dashboard');

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
      {activeTab === 'dashboard' && <Dashboard />}
      {activeTab === 'messages' && <Messages />}
      {activeTab === 'targets' && <Targets />}
      {activeTab === 'pdf' && <PdfConverter />}
      {activeTab === 'music' && <MusicDownloader />}
      {activeTab === 'ai' && <AISettings />}
      {activeTab === 'nsfw' && <MatureSettings />}
      {activeTab === 'settings' && <Settings />}
    </Layout>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
