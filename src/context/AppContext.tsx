import React, { createContext, useContext, useState, useEffect } from 'react';

export interface TelegramMessage {
  id: string;
  text: string;
  createdAt: number;
}

export interface TelegramTarget {
  id: string;
  name: string;
  type: 'group' | 'channel' | 'user';
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
  messages: TelegramMessage[];
  targets: TelegramTarget[];
  config: AppConfig;
  logs: LogEntry[];
  nsfwLogs: NSFWLog[];
  nsfwUsers: NSFWUser[];
  isRunning: boolean;
  diagnostics: AppDiagnostics;
  addMessage: (text: string) => void;
  removeMessage: (id: string) => void;
  addTarget: (target: TelegramTarget) => void;
  removeTarget: (id: string) => void;
  updateConfig: (config: Partial<AppConfig>) => Promise<{ telegramConnected?: boolean | null }>;
  toggleBot: () => void;
  clearLogs: () => void;
  toggleNSFWUser: (userId: string, enabled: boolean) => void;
  clearNSFWLogs: () => void;
  addSudoUser: (id: string, name?: string) => void;
  removeSudoUser: (id: string) => void;
}

const defaultContext: AppContextType = {
  messages: [],
  targets: [],
  config: { 
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
    whitelistedUsers: ''
  },
  logs: [],
  nsfwLogs: [],
  nsfwUsers: [],
  isRunning: false,
  diagnostics: {
    isListenerActive: false,
    lastEventTimestamp: 0,
    clientReady: false,
    aiConfigured: false
  },
  addMessage: () => {},
  removeMessage: () => {},
  addTarget: () => {},
  removeTarget: () => {},
  updateConfig: () => Promise.resolve({}),
  toggleBot: () => {},
  clearLogs: () => {},
  toggleNSFWUser: () => {},
  clearNSFWLogs: () => {},
  addSudoUser: () => {},
  removeSudoUser: () => {},
};

const AppContext = createContext<AppContextType>(defaultContext);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [messages, setMessages] = useState<TelegramMessage[]>([]);
  const [targets, setTargets] = useState<TelegramTarget[]>([]);
  const [config, setConfig] = useState<AppConfig>({ 
    minDelaySeconds: 600, 
    maxDelaySeconds: 1200, 
    adminUsers: ['YOUR_TELEGRAM_ID'], 
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
    whitelistedUsers: ''
  });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [nsfwLogs, setNSFWLogs] = useState<NSFWLog[]>([]);
  const [nsfwUsers, setNSFWUsers] = useState<NSFWUser[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [diagnostics, setDiagnostics] = useState<AppDiagnostics>({
    isListenerActive: false,
    lastEventTimestamp: 0,
    clientReady: false,
    aiConfigured: false
  });

  const fetchState = async () => {
    try {
      const res = await fetch('/api/state');
      if (res.redirected) {
         console.warn("fetch redirected!");
      }
      if (res.ok) {
        const text = await res.text();
        try {
          const data = JSON.parse(text);
          setMessages(data.messages);
          setTargets(data.targets);
          
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
            ...restConfig 
          } = data.config;
          
          const nextConfig = {
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
            autoReplyPersonality: autoReplyPersonality || 'You are a modern Telegram AI assistant. Reply intelligently, naturally, and concisely.',
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
            whitelistedUsers: whitelistedUsers || ''
          };
          // Only update config reference when values actually changed so that
          // form fields being edited are not reset by the polling loop.
          setConfig(prev =>
            JSON.stringify(prev) === JSON.stringify(nextConfig) ? prev : nextConfig
          );
          
          setLogs(data.logs);
          setIsRunning(data.isRunning);
          if (data.diagnostics) {
            setDiagnostics(data.diagnostics);
          }
        } catch (err) {
          console.error("Failed to parse JSON. Response starts with:", text.substring(0, 100));
        }
      }

      // Fetch NSFW data
      const nsfwRes = await fetch('/api/nsfw/data');
      if (nsfwRes.ok) {
        const nsfwData = await nsfwRes.json();
        setNSFWLogs(nsfwData.logs);
        setNSFWUsers(nsfwData.users);
      }
    } catch (e) {
      console.error("Failed to fetch state", e);
    }
  };

  useEffect(() => {
    fetchState();
    const interval = setInterval(fetchState, 3000); // Poll every 3 seconds for updates
    return () => clearInterval(interval);
  }, []);

  const addMessage = async (text: string) => {
    try {
      await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      fetchState();
    } catch {}
  };

  const removeMessage = async (id: string) => {
    try {
      await fetch(`/api/messages/${id}`, { method: 'DELETE' });
      fetchState();
    } catch {}
  };

  const addTarget = async (target: Omit<TelegramTarget, 'id'>) => {
    try {
      await fetch('/api/targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(target)
      });
      fetchState();
    } catch {}
  };

  const removeTarget = async (id: string) => {
    try {
      await fetch(`/api/targets/${id}`, { method: 'DELETE' });
      fetchState();
    } catch {}
  };

  const updateConfig = async (newConfig: Partial<AppConfig>): Promise<{ telegramConnected?: boolean | null }> => {
    return new Promise((resolve) => {
      setConfig(prev => {
        const updated = { ...prev, ...newConfig };
        
        fetch('/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updated)
        })
          .then(r => r.json())
          .then(data => resolve({ telegramConnected: data.telegramConnected }))
          .catch(err => {
            console.error("Failed to update config on server", err);
            resolve({});
          });
        
        return updated;
      });
    });
  };

  const toggleBot = async () => {
    const action = isRunning ? 'stop' : 'start';
    setIsRunning(!isRunning); // optimistic update
    try {
      await fetch('/api/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      fetchState();
    } catch {}
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
        body: JSON.stringify({ id, name })
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
        body: JSON.stringify({ nsfwEnabled })
      });
      fetchState();
    } catch {}
  };

  return (
    <AppContext.Provider value={{
      messages, targets, config, logs, nsfwLogs, nsfwUsers, isRunning, diagnostics,
      addMessage, removeMessage, addTarget: addTarget as any, removeTarget, updateConfig, toggleBot, clearLogs,
      toggleNSFWUser, clearNSFWLogs, addSudoUser, removeSudoUser
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => useContext(AppContext);
