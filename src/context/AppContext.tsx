import React, { createContext, useContext, useState, useEffect } from 'react';

export interface TTSConfig {
  primaryProvider: string;
  voiceId?: string;
  model: string;
}

export interface AppConfig {
  minDelaySeconds: number;
  maxDelaySeconds: number;
  adminUsers: string[];
  youtube_cookies: string;
  globalCooldown: number;
  perUserCooldown: number;
  maxConcurrentTasks: number;
  aiEnabled: number;
  aiProvider: string;
  geminiKey?: string;
  groqKey?: string;
  openRouterKey?: string;
  autoDeleteCommands?: number;
  autoDeleteDelay?: number;
  autoDeleteWhitelist?: string;
  autoReplyDM?: number;
  autoReplyMention?: number;
  typingSimulation?: number;
  conversationMemory?: number;
  autoReplyDelayMin?: number;
  autoReplyDelayMax?: number;
  autoReplyPersonality?: string;
  autoReplyWhitelist?: string;
  autoReplyBlacklist?: string;
  telegramApiId?: string;
  telegramApiHash?: string;
  telegramStringSession?: string;
  nsfwEnabled?: number;
  nsfwPersonality?: string;
  searchEnabled?: number;
  searchProvider?: string;
  searchApiKey?: string;
  serperKey?: string;
  aiMode?: string;
  formattingEnabled?: number;
  cleanupEnabled?: number;
  bluesmindsApiKey?: string;
  activeModel?: string;
  deepThinking?: number;
  sudoUsers?: string;
  publicCommandsEnabled?: number;
  blacklistedUsers?: string;
  whitelistedUsers?: string;
  maintenanceMode?: number;
  tts?: TTSConfig;
  videoDownloaderMaxMb?: number;
  videoDownloaderTimeoutSeconds?: number;
}

export interface LogEntry {
  id: string;
  timestamp: number;
  message: string;
  type: 'info' | 'success' | 'warn' | 'error';
}

export interface AppDiagnostics {
  isListenerActive: boolean;
  lastEventTimestamp: number;
  clientReady: boolean;
  aiConfigured: boolean;
}

export interface NSFWLog {
  id: string;
  timestamp: number;
  userId: string;
  chatId: string;
  message: string;
  violation: string;
}

export interface NSFWUser {
  userId: string;
  nsfwEnabled: number;
  ageConfirmed: number;
  updatedAt: number;
}

interface AppContextType {
  config: AppConfig;
  logs: LogEntry[];
  nsfwLogs: NSFWLog[];
  nsfwUsers: NSFWUser[];
  diagnostics: AppDiagnostics;
  updateConfig: (config: Partial<AppConfig>) => Promise<{ telegramConnected?: boolean | null }>;
  clearLogs: () => void;
  toggleNSFWUser: (userId: string, enabled: boolean) => void;
  clearNSFWLogs: () => void;
  addSudoUser: (id: string, name?: string) => void;
  removeSudoUser: (id: string) => void;
}

const defaultConfig: AppConfig = {
  minDelaySeconds: 600,
  maxDelaySeconds: 1200,
  adminUsers: [],
  youtube_cookies: '',
  globalCooldown: 3,
  perUserCooldown: 10,
  maxConcurrentTasks: 2,
  aiEnabled: 1,
  aiProvider: 'gemini',
  autoDeleteCommands: 0,
  autoDeleteDelay: 0,
  autoDeleteWhitelist: '',
  autoReplyDM: 0,
  autoReplyMention: 0,
  typingSimulation: 1,
  conversationMemory: 1,
  autoReplyDelayMin: 3,
  autoReplyDelayMax: 15,
  autoReplyPersonality: 'You are a helpful, concise and friendly friend.',
  autoReplyWhitelist: '',
  autoReplyBlacklist: '',
  telegramApiId: '',
  telegramApiHash: '',
  telegramStringSession: '',
  nsfwEnabled: 0,
  nsfwPersonality: 'You are a flirty, mature, and consenting adult friend.',
  searchEnabled: 0,
  searchProvider: 'tavily',
  searchApiKey: '',
  aiMode: 'intelligent',
  formattingEnabled: 1,
  cleanupEnabled: 1,
  bluesmindsApiKey: '',
  activeModel: 'gemini-1.5-flash',
  deepThinking: 0,
  sudoUsers: '',
  publicCommandsEnabled: 1,
  blacklistedUsers: '',
  whitelistedUsers: '',
  maintenanceMode: 0,
  tts: {
    primaryProvider: 'elevenlabs',
    model: 'eleven_multilingual_v2',
  },
  videoDownloaderMaxMb: 50,
  videoDownloaderTimeoutSeconds: 180,
};

const defaultContext: AppContextType = {
  config: defaultConfig,
  logs: [],
  nsfwLogs: [],
  nsfwUsers: [],
  diagnostics: { isListenerActive: false, lastEventTimestamp: 0, clientReady: false, aiConfigured: false },
  updateConfig: () => Promise.resolve({}),
  clearLogs: () => {},
  toggleNSFWUser: () => {},
  clearNSFWLogs: () => {},
  addSudoUser: () => {},
  removeSudoUser: () => {},
};

const AppContext = createContext<AppContextType>(defaultContext);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [config, setConfig] = useState<AppConfig>({ ...defaultConfig, adminUsers: ['YOUR_TELEGRAM_ID'] });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [nsfwLogs, setNSFWLogs] = useState<NSFWLog[]>([]);
  const [nsfwUsers, setNSFWUsers] = useState<NSFWUser[]>([]);
  const [diagnostics, setDiagnostics] = useState<AppDiagnostics>({
    isListenerActive: false,
    lastEventTimestamp: 0,
    clientReady: false,
    aiConfigured: false,
  });

  const fetchState = async () => {
    try {
      const res = await fetch('/api/state');
      if (res.ok) {
        const text = await res.text();
        try {
          const data = JSON.parse(text);
          const {
            adminUsers, youtube_cookies, globalCooldown, perUserCooldown, maxConcurrentTasks,
            aiEnabled, aiProvider, geminiKey, groqKey, openRouterKey,
            autoDeleteCommands, autoDeleteDelay, autoDeleteWhitelist,
            autoReplyDM, autoReplyMention, typingSimulation,
            conversationMemory, autoReplyDelayMin, autoReplyDelayMax,
            autoReplyPersonality, autoReplyWhitelist, autoReplyBlacklist,
            telegramApiId, telegramApiHash, telegramStringSession,
            nsfwEnabled, nsfwPersonality,
            searchEnabled, searchProvider, searchApiKey,
            aiMode, formattingEnabled, cleanupEnabled,
            bluesmindsApiKey, activeModel,
            deepThinking, sudoUsers, publicCommandsEnabled, blacklistedUsers, whitelistedUsers,
            maintenanceMode, tts, videoDownloaderMaxMb, videoDownloaderTimeoutSeconds,
            ...restConfig
          } = data.config;

          let parsedTts = defaultConfig.tts;
          if (typeof tts === 'string') {
            try {
              parsedTts = { ...defaultConfig.tts!, ...JSON.parse(tts || '{}') };
            } catch {
              parsedTts = defaultConfig.tts;
            }
          } else {
            parsedTts = { ...defaultConfig.tts!, ...(tts || {}) };
          }

          const nextConfig: AppConfig = {
            ...restConfig,
            adminUsers: typeof adminUsers === 'string' ? adminUsers.split(',') : [],
            youtube_cookies: youtube_cookies || '',
            globalCooldown: globalCooldown ?? 3,
            perUserCooldown: perUserCooldown ?? 10,
            maxConcurrentTasks: maxConcurrentTasks ?? 2,
            aiEnabled: aiEnabled ?? 1,
            aiProvider: aiProvider || 'gemini',
            geminiKey: geminiKey || '',
            groqKey: groqKey || '',
            openRouterKey: openRouterKey || '',
            autoDeleteCommands: autoDeleteCommands ?? 0,
            autoDeleteDelay: autoDeleteDelay ?? 0,
            autoDeleteWhitelist: autoDeleteWhitelist || '',
            autoReplyDM: autoReplyDM ?? 0,
            autoReplyMention: autoReplyMention ?? 0,
            typingSimulation: typingSimulation ?? 1,
            conversationMemory: conversationMemory ?? 1,
            autoReplyDelayMin: autoReplyDelayMin ?? 3,
            autoReplyDelayMax: autoReplyDelayMax ?? 15,
            autoReplyPersonality: autoReplyPersonality || 'You are a modern Telegram AI assistant.',
            autoReplyWhitelist: autoReplyWhitelist || '',
            autoReplyBlacklist: autoReplyBlacklist || '',
            telegramApiId: telegramApiId || '',
            telegramApiHash: telegramApiHash || '',
            telegramStringSession: telegramStringSession || '',
            nsfwEnabled: nsfwEnabled ?? 0,
            nsfwPersonality: nsfwPersonality || 'You are a flirty, mature, and consenting adult friend.',
            searchEnabled: searchEnabled ?? 0,
            searchProvider: searchProvider || 'tavily',
            searchApiKey: searchApiKey || '',
            aiMode: aiMode || 'intelligent',
            formattingEnabled: formattingEnabled ?? 1,
            cleanupEnabled: cleanupEnabled ?? 1,
            bluesmindsApiKey: bluesmindsApiKey || '',
            activeModel: activeModel || 'gemini-1.5-flash',
            deepThinking: deepThinking ?? 0,
            sudoUsers: sudoUsers || '',
            publicCommandsEnabled: publicCommandsEnabled ?? 1,
            blacklistedUsers: blacklistedUsers || '',
            whitelistedUsers: whitelistedUsers || '',
            maintenanceMode: maintenanceMode ?? 0,
            tts: parsedTts,
            videoDownloaderMaxMb: videoDownloaderMaxMb ?? 50,
            videoDownloaderTimeoutSeconds: videoDownloaderTimeoutSeconds ?? 180,
          };

          setConfig(prev => JSON.stringify(prev) === JSON.stringify(nextConfig) ? prev : nextConfig);
          setLogs(data.logs);
          if (data.diagnostics) setDiagnostics(data.diagnostics);
        } catch (err) {
          console.error('Failed to parse state JSON');
        }
      }

      const nsfwRes = await fetch('/api/nsfw/data');
      if (nsfwRes.ok) {
        const nsfwData = await nsfwRes.json();
        setNSFWLogs(nsfwData.logs);
        setNSFWUsers(nsfwData.users);
      }
    } catch (e) {
      console.error('Failed to fetch state', e);
    }
  };

  useEffect(() => {
    fetchState();
    const interval = setInterval(fetchState, 3000);
    return () => clearInterval(interval);
  }, []);

  const updateConfig = async (newConfig: Partial<AppConfig>): Promise<{ telegramConnected?: boolean | null }> => {
    return new Promise((resolve) => {
      setConfig(prev => {
        const updated = { ...prev, ...newConfig };
        fetch('/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updated),
        })
          .then(r => r.json())
          .then(data => resolve({ telegramConnected: data.telegramConnected }))
          .catch(() => resolve({}));
        return updated;
      });
    });
  };

  const clearLogs = async () => {
    setLogs([]);
    try {
      await fetch('/api/logs', { method: 'DELETE' });
      fetchState();
    } catch {}
  };

  const addSudoUser = async (id: string, name?: string) => {
    try {
      await fetch('/api/sudo-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name }),
      });
      fetchState();
    } catch {}
  };

  const removeSudoUser = async (id: string) => {
    try {
      await fetch(`/api/sudo-users/${id}`, { method: 'DELETE' });
      fetchState();
    } catch {}
  };

  const clearNSFWLogs = async () => {
    setNSFWLogs([]);
    try {
      await fetch('/api/nsfw/logs', { method: 'DELETE' });
      fetchState();
    } catch {}
  };

  const toggleNSFWUser = async (userId: string, nsfwEnabled: boolean) => {
    try {
      await fetch(`/api/nsfw/users/${userId}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nsfwEnabled }),
      });
      fetchState();
    } catch {}
  };

  return (
    <AppContext.Provider value={{
      config, logs, nsfwLogs, nsfwUsers, diagnostics,
      updateConfig, clearLogs, toggleNSFWUser, clearNSFWLogs,
      addSudoUser, removeSudoUser,
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => useContext(AppContext);
