import React, { useState, useEffect, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import { Sparkles, Save, ShieldCheck, Zap, Globe, Bot, MessageSquare, Clock, Brain, ChevronDown, Search, X } from 'lucide-react';
import { cn } from '../lib/utils';

// Group model IDs into readable categories
function groupModels(models: string[]) {
  const groups: Record<string, string[]> = {
    'GPT / OpenAI': [],
    'Gemini / Google': [],
    'DeepSeek': [],
    'Llama / Meta': [],
    'Mistral': [],
    'Qwen': [],
    'NVIDIA': [],
    'Grok / xAI': [],
    'MiniMax': [],
    'Other': [],
  };
  for (const m of models) {
    const l = m.toLowerCase();
    if (l.startsWith('gpt') || l.startsWith('openai/')) groups['GPT / OpenAI'].push(m);
    else if (l.startsWith('gemini') || l.startsWith('google/')) groups['Gemini / Google'].push(m);
    else if (l.includes('deepseek')) groups['DeepSeek'].push(m);
    else if (l.includes('llama') || l.startsWith('meta/')) groups['Llama / Meta'].push(m);
    else if (l.includes('mistral') || l.includes('mixtral') || l.startsWith('mistralai/') || l.startsWith('nv-mistral')) groups['Mistral'].push(m);
    else if (l.includes('qwen')) groups['Qwen'].push(m);
    else if (l.startsWith('nvidia/') || l.includes('nemotron') || l.includes('nemo')) groups['NVIDIA'].push(m);
    else if (l.includes('grok')) groups['Grok / xAI'].push(m);
    else if (l.includes('minimax') || l.startsWith('MiniMax')) groups['MiniMax'].push(m);
    else groups['Other'].push(m);
  }
  return Object.entries(groups).filter(([, v]) => v.length > 0);
}

function ModelPicker({
  value,
  models,
  loading,
  onChange,
}: {
  value: string;
  models: string[];
  loading: boolean;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const filtered = search
    ? models.filter((m) => m.toLowerCase().includes(search.toLowerCase()))
    : models;

  const grouped = groupModels(filtered);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
      >
        <span className="truncate font-mono text-blue-300">{loading ? 'Loading models…' : (value || 'Select a model')}</span>
        <ChevronDown className={cn('w-3.5 h-3.5 text-slate-500 ml-2 flex-shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-slate-800 flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
            <input
              autoFocus
              type="text"
              placeholder="Search models…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-xs text-slate-200 placeholder:text-slate-600 outline-none"
            />
            {search && (
              <button onClick={() => setSearch('')}><X className="w-3 h-3 text-slate-500" /></button>
            )}
          </div>

          {/* List */}
          <div className="overflow-y-auto max-h-64">
            {loading ? (
              <div className="p-4 text-xs text-slate-500 text-center">Loading…</div>
            ) : grouped.length === 0 ? (
              <div className="p-4 text-xs text-slate-500 text-center">No models found</div>
            ) : (
              grouped.map(([group, items]) => (
                <div key={group}>
                  <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-600 bg-slate-950/60 sticky top-0">
                    {group}
                  </div>
                  {items.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => { onChange(m); setOpen(false); setSearch(''); }}
                      className={cn(
                        'w-full text-left px-3 py-2 text-xs font-mono transition-colors',
                        m === value
                          ? 'bg-blue-600/20 text-blue-300'
                          : 'text-slate-300 hover:bg-slate-800'
                      )}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>

          {/* Footer count */}
          <div className="px-3 py-1.5 border-t border-slate-800 text-[10px] text-slate-600">
            {filtered.length} model{filtered.length !== 1 ? 's' : ''} available
          </div>
        </div>
      )}
    </div>
  );
}

export function AISettings() {
  const { config, updateConfig, logs, diagnostics } = useAppContext();
  const [aiEnabled, setAiEnabled] = useState(config.aiEnabled === 1);
  const [aiProvider, setAiProvider] = useState(config.aiProvider);
  const [geminiKey, setGeminiKey] = useState(config.geminiKey || '');
  const [groqKey, setGroqKey] = useState(config.groqKey || '');
  const [openRouterKey, setOpenRouterKey] = useState(config.openRouterKey || '');

  const [autoReplyDM, setAutoReplyDM] = useState(config.autoReplyDM === 1);
  const [autoReplyMention, setAutoReplyMention] = useState(config.autoReplyMention === 1);
  const [typingSimulation, setTypingSimulation] = useState(config.typingSimulation === 1);
  const [conversationMemory, setConversationMemory] = useState(config.conversationMemory === 1);
  const [autoReplyDelayMin, setAutoReplyDelayMin] = useState(config.autoReplyDelayMin || 3);
  const [autoReplyDelayMax, setAutoReplyDelayMax] = useState(config.autoReplyDelayMax || 15);
  const [autoReplyPersonality, setAutoReplyPersonality] = useState(config.autoReplyPersonality || '');
  const [autoReplyWhitelist, setAutoReplyWhitelist] = useState(config.autoReplyWhitelist || '');
  const [autoReplyBlacklist, setAutoReplyBlacklist] = useState(config.autoReplyBlacklist || '');

  const [searchEnabled, setSearchEnabled] = useState(config.searchEnabled === 1);
  const [searchProvider, setSearchProvider] = useState(config.searchProvider || 'tavily');
  const [searchApiKey, setSearchApiKey] = useState(config.searchApiKey || '');
  const [aiMode, setAiMode] = useState(config.aiMode || 'intelligent');
  const [formattingEnabled, setFormattingEnabled] = useState(config.formattingEnabled === 1);
  const [cleanupEnabled, setCleanupEnabled] = useState(config.cleanupEnabled === 1);

  const [bluesmindsApiKey, setBluesmindsApiKey] = useState(config.bluesmindsApiKey || '');
  const [activeModel, setActiveModel] = useState(config.activeModel || 'gpt-4o-mini');
  const [deepThinking, setDeepThinking] = useState(config.deepThinking === 1);

  const [saved, setSaved] = useState(false);

  // Live model list from Bluesminds API
  const [bluesModels, setBluesModels] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditReport, setAuditReport] = useState<any | null>(null);

  const fetchModels = async () => {
    setModelsLoading(true);
    try {
      const r = await fetch('/api/bluesminds/models');
      const data = await r.json();
      if (data.models?.length) setBluesModels(data.models);
    } catch { /* ignore */ }
    setModelsLoading(false);
  };

  useEffect(() => { fetchModels(); }, []);

  const runBluemindsAudit = async () => {
    setAuditLoading(true);
    try {
      const r = await fetch('/api/bluesminds/test-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Say: BLUEMINDS_OK' })
      });
      const data = await r.json();
      setAuditReport(data);
    } catch (e) {
      setAuditReport({ ok: false, error: String(e) });
    } finally {
      setAuditLoading(false);
    }
  };

  useEffect(() => {
    setAiEnabled(config.aiEnabled === 1);
    setAiProvider(config.aiProvider);
    setGeminiKey(config.geminiKey || '');
    setGroqKey(config.groqKey || '');
    setOpenRouterKey(config.openRouterKey || '');
    setAutoReplyDM(config.autoReplyDM === 1);
    setAutoReplyMention(config.autoReplyMention === 1);
    setTypingSimulation(config.typingSimulation === 1);
    setConversationMemory(config.conversationMemory === 1);
    setAutoReplyDelayMin(config.autoReplyDelayMin || 3);
    setAutoReplyDelayMax(config.autoReplyDelayMax || 15);
    setAutoReplyPersonality(config.autoReplyPersonality || '');
    setAutoReplyWhitelist(config.autoReplyWhitelist || '');
    setAutoReplyBlacklist(config.autoReplyBlacklist || '');
    setSearchEnabled(config.searchEnabled === 1);
    setSearchProvider(config.searchProvider || 'tavily');
    setSearchApiKey(config.searchApiKey || '');
    setAiMode(config.aiMode || 'intelligent');
    setFormattingEnabled(config.formattingEnabled === 1);
    setCleanupEnabled(config.cleanupEnabled === 1);
    setBluesmindsApiKey(config.bluesmindsApiKey || '');
    setActiveModel(config.activeModel || 'gpt-4o-mini');
    setDeepThinking(config.deepThinking === 1);
  }, [config]);

  const toggleAiEnabled = async () => {
    const v = !aiEnabled; setAiEnabled(v);
    await updateConfig({ ...config, aiEnabled: v ? 1 : 0 });
  };
  const toggleAutoReplyDM = async () => {
    const v = !autoReplyDM; setAutoReplyDM(v);
    await updateConfig({ ...config, autoReplyDM: v ? 1 : 0 });
  };
  const toggleAutoReplyMention = async () => {
    const v = !autoReplyMention; setAutoReplyMention(v);
    await updateConfig({ ...config, autoReplyMention: v ? 1 : 0 });
  };
  const toggleTypingSimulation = async () => {
    const v = !typingSimulation; setTypingSimulation(v);
    await updateConfig({ ...config, typingSimulation: v ? 1 : 0 });
  };
  const toggleConversationMemory = async () => {
    const v = !conversationMemory; setConversationMemory(v);
    await updateConfig({ ...config, conversationMemory: v ? 1 : 0 });
  };
  const toggleSearchEnabled = async () => {
    const v = !searchEnabled; setSearchEnabled(v);
    await updateConfig({ ...config, searchEnabled: v ? 1 : 0 });
  };
  const toggleFormattingEnabled = async () => {
    const v = !formattingEnabled; setFormattingEnabled(v);
    await updateConfig({ ...config, formattingEnabled: v ? 1 : 0 });
  };
  const toggleCleanupEnabled = async () => {
    const v = !cleanupEnabled; setCleanupEnabled(v);
    await updateConfig({ ...config, cleanupEnabled: v ? 1 : 0 });
  };
  const toggleDeepThinking = async () => {
    const v = !deepThinking; setDeepThinking(v);
    await updateConfig({ ...config, deepThinking: v ? 1 : 0 });
  };
  const selectAiProvider = async (id: string) => {
    setAiProvider(id);
    await updateConfig({ ...config, aiProvider: id });
  };

  const handleSave = async () => {
    await updateConfig({
      ...config,
      aiEnabled: aiEnabled ? 1 : 0,
      aiProvider,
      geminiKey,
      groqKey,
      openRouterKey,
      autoReplyDM: autoReplyDM ? 1 : 0,
      autoReplyMention: autoReplyMention ? 1 : 0,
      typingSimulation: typingSimulation ? 1 : 0,
      conversationMemory: conversationMemory ? 1 : 0,
      autoReplyDelayMin: Number(autoReplyDelayMin),
      autoReplyDelayMax: Number(autoReplyDelayMax),
      autoReplyPersonality,
      autoReplyWhitelist,
      autoReplyBlacklist,
      searchEnabled: searchEnabled ? 1 : 0,
      searchProvider,
      searchApiKey,
      aiMode,
      formattingEnabled: formattingEnabled ? 1 : 0,
      cleanupEnabled: cleanupEnabled ? 1 : 0,
      bluesmindsApiKey,
      activeModel,
      deepThinking: deepThinking ? 1 : 0,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleBlur = async () => { await handleSave(); };

  const aiLogs = logs.filter(l => l.message.includes('AI') || l.message.includes('Auto-replied'));

  const Toggle = ({ on, onClick, color = 'blue' }: { on: boolean; onClick: () => void; color?: string }) => (
    <button
      onClick={onClick}
      className={cn(
        'relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none',
        on ? `bg-${color}-600` : 'bg-slate-700'
      )}
    >
      <span className={cn('inline-block h-3 w-3 transform rounded-full bg-white transition-transform', on ? 'translate-x-5' : 'translate-x-1')} />
    </button>
  );

  return (
    <div className="space-y-6 pb-12">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold flex items-center gap-2 text-slate-100">
          <Sparkles className="w-7 h-7 text-blue-400" />
          AI & Auto-Reply
        </h2>
        <button
          onClick={handleSave}
          className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-medium transition-all shadow-lg shadow-blue-500/20 flex items-center gap-2"
        >
          {saved ? <ShieldCheck className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saved ? 'Settings Saved' : 'Save Changes'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 space-y-6">

          {/* AI Provider + Model */}
          <section className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
            <div className="p-6 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/10 rounded-lg">
                  <Zap className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-200">AI Logic Engines</h3>
                  <p className="text-xs text-slate-500">Configure how the bot thinks</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className={cn(
                  'px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5',
                  diagnostics.isListenerActive
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-red-500/10 text-red-400 border border-red-500/20'
                )}>
                  <div className={cn('w-1.5 h-1.5 rounded-full animate-pulse', diagnostics.isListenerActive ? 'bg-emerald-400' : 'bg-red-400')} />
                  {diagnostics.isListenerActive ? 'Listener Active' : 'Listener Down'}
                </div>
                <button
                  onClick={toggleAiEnabled}
                  className={cn('relative inline-flex h-6 w-11 items-center rounded-full transition-colors', aiEnabled ? 'bg-blue-600' : 'bg-slate-700')}
                >
                  <span className={cn('inline-block h-4 w-4 transform rounded-full bg-white transition-transform', aiEnabled ? 'translate-x-6' : 'translate-x-1')} />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* Provider selector */}
                <div className="space-y-3">
                  <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
                    <Sparkles className="w-4 h-4" /> Primary Provider
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'bluesminds', label: 'BluesMinds', icon: Sparkles },
                      { id: 'gemini', label: 'Gemini', icon: Bot },
                      { id: 'groq', label: 'Groq', icon: Zap },
                      { id: 'openrouter', label: 'OpenRouter', icon: Globe },
                    ].map((p) => (
                      <button
                        key={p.id}
                        onClick={() => selectAiProvider(p.id)}
                        className={cn(
                          'flex flex-col items-center gap-1.5 p-2.5 rounded-xl border transition-all',
                          aiProvider === p.id
                            ? 'bg-blue-600/10 border-blue-500 text-blue-400'
                            : 'bg-slate-950/40 border-slate-800 text-slate-500 hover:border-slate-700'
                        )}
                      >
                        <p.icon className="w-4 h-4" />
                        <span className="text-[10px] font-bold uppercase">{p.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Model picker + personality */}
                <div className="space-y-4">
                  <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
                    <Brain className="w-4 h-4" /> AI Personality
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Describe how the bot should behave…"
                    value={autoReplyPersonality}
                    onChange={(e) => setAutoReplyPersonality(e.target.value)}
                    onBlur={handleBlur}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 transition-colors resize-none"
                  />

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                        <Zap className="w-3 h-3" /> Active Model
                        <span className="text-slate-700 normal-case font-normal">(BluesMinds • {bluesModels.length} available)</span>
                      </label>
                      <button
                        onClick={fetchModels}
                        className="text-[10px] text-blue-500 hover:text-blue-400 transition-colors"
                      >
                        ↻ Refresh
                      </button>
                    </div>
                    <ModelPicker
                      value={activeModel}
                      models={bluesModels}
                      loading={modelsLoading}
                      onChange={async (m) => {
                        setActiveModel(m);
                        await updateConfig({ ...config, activeModel: m });
                      }}
                    />
                    <p className="text-[10px] text-slate-600">This model is used for all BluesMinds AI calls</p>
                    <div className="pt-2">
                      <button onClick={runBluemindsAudit} className="text-[11px] bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded border border-slate-700">
                        {auditLoading ? 'Running full model audit…' : 'Run Blueminds Full Model Audit'}
                      </button>
                    </div>
                    {auditReport && (
                      <pre className="mt-2 text-[10px] bg-slate-950 border border-slate-800 rounded p-2 overflow-auto max-h-48 text-slate-300">
                        {JSON.stringify(auditReport, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>
              </div>

              {/* API Keys */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">BluesMinds Key</label>
                  <input
                    type="password"
                    placeholder="sk-…"
                    value={bluesmindsApiKey}
                    onChange={(e) => setBluesmindsApiKey(e.target.value)}
                    onBlur={handleBlur}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                  <div className="flex items-center gap-1.5">
                    <div className={cn('w-1.5 h-1.5 rounded-full', bluesmindsApiKey ? 'bg-emerald-400' : 'bg-red-500')} />
                    <span className="text-[10px] text-slate-600">{bluesmindsApiKey ? 'Key configured' : 'No key set'}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Gemini Key</label>
                  <input
                    type="password"
                    placeholder="System key used if empty"
                    value={geminiKey}
                    onChange={(e) => setGeminiKey(e.target.value)}
                    onBlur={handleBlur}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Groq Key</label>
                  <input
                    type="password"
                    placeholder="Enter Groq Key"
                    value={groqKey}
                    onChange={(e) => setGroqKey(e.target.value)}
                    onBlur={handleBlur}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">OpenRouter Key</label>
                  <input
                    type="password"
                    placeholder="Enter OpenRouter Key"
                    value={openRouterKey}
                    onChange={(e) => setOpenRouterKey(e.target.value)}
                    onBlur={handleBlur}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Real-time & Intelligence */}
          <section className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
            <div className="p-6 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/10 rounded-lg">
                  <Globe className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-200">Real-time & Intelligence</h3>
                  <p className="text-xs text-slate-500">Live data fetching and response refinement</p>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-3">
                  {[
                    { label: 'Live Web Search', icon: Globe, color: 'emerald', on: searchEnabled, toggle: toggleSearchEnabled },
                    { label: 'Telegram Formatting', icon: Bot, color: 'blue', on: formattingEnabled, toggle: toggleFormattingEnabled },
                    { label: 'Response Cleanup', icon: Zap, color: 'amber', on: cleanupEnabled, toggle: toggleCleanupEnabled },
                    { label: 'Deep Thinking Mode', icon: Brain, color: 'purple', on: deepThinking, toggle: toggleDeepThinking },
                  ].map(({ label, icon: Icon, color, on, toggle }) => (
                    <div key={label} className="flex items-center justify-between p-3 bg-slate-950/40 rounded-xl border border-slate-800/50">
                      <div className="flex items-center gap-3">
                        <Icon className={`w-4 h-4 text-${color}-400`} />
                        <span className="text-sm font-medium text-slate-300">{label}</span>
                      </div>
                      <Toggle on={on} onClick={toggle} color={color} />
                    </div>
                  ))}
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                      <Bot className="w-3.5 h-3.5" /> Response Mode
                    </label>
                    <select
                      value={aiMode}
                      onChange={(e) => setAiMode(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-300 focus:border-emerald-500 outline-none"
                    >
                      <option value="intelligent">Intelligent (Balanced)</option>
                      <option value="fast">Fast (Concise)</option>
                      <option value="creative">Creative (Expansive)</option>
                    </select>
                  </div>

                  {searchEnabled && (
                    <div className="space-y-3 p-3 bg-slate-950/40 rounded-xl border border-emerald-500/20 animate-in fade-in slide-in-from-top-1 duration-200">
                      <label className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Search Config</label>
                      <select
                        value={searchProvider}
                        onChange={(e) => setSearchProvider(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-300 focus:border-emerald-500 outline-none"
                      >
                        <option value="tavily">Tavily</option>
                        <option value="serpapi">SerpAPI</option>
                        <option value="duckduckgo">DuckDuckGo (Free)</option>
                      </select>
                      <input
                        type="password"
                        placeholder="Search API Key"
                        value={searchApiKey}
                        onChange={(e) => setSearchApiKey(e.target.value)}
                        onBlur={handleBlur}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 transition-colors"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Auto-Reply */}
          <section className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
            <div className="p-6 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-500/10 rounded-lg">
                  <MessageSquare className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-200">Auto-Reply Behaviour</h3>
                  <p className="text-xs text-slate-500">Control when and how the bot replies</p>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Reply DMs', on: autoReplyDM, toggle: toggleAutoReplyDM },
                  { label: 'Reply Mentions', on: autoReplyMention, toggle: toggleAutoReplyMention },
                  { label: 'Typing Effect', on: typingSimulation, toggle: toggleTypingSimulation },
                  { label: 'Memory', on: conversationMemory, toggle: toggleConversationMemory },
                ].map(({ label, on, toggle }) => (
                  <div key={label} className="flex flex-col items-center gap-2 p-3 bg-slate-950/40 rounded-xl border border-slate-800/50">
                    <span className="text-[10px] font-bold text-slate-500 uppercase text-center">{label}</span>
                    <Toggle on={on} onClick={toggle} />
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                    <Clock className="w-3 h-3" /> Min Delay (s)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={autoReplyDelayMin}
                    onChange={(e) => setAutoReplyDelayMin(Number(e.target.value))}
                    onBlur={handleBlur}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                    <Clock className="w-3 h-3" /> Max Delay (s)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={autoReplyDelayMax}
                    onChange={(e) => setAutoReplyDelayMax(Number(e.target.value))}
                    onBlur={handleBlur}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Whitelist (user IDs)</label>
                  <input
                    type="text"
                    placeholder="123456,789012"
                    value={autoReplyWhitelist}
                    onChange={(e) => setAutoReplyWhitelist(e.target.value)}
                    onBlur={handleBlur}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Blacklist (user IDs)</label>
                  <input
                    type="text"
                    placeholder="123456,789012"
                    value={autoReplyBlacklist}
                    onChange={(e) => setAutoReplyBlacklist(e.target.value)}
                    onBlur={handleBlur}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Right sidebar */}
        <div className="lg:col-span-4 space-y-6">
          {/* Status card */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 shadow-xl">
            <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-400" /> AI Status
            </h4>
            <div className="space-y-3">
              {[
                { label: 'Provider', value: config.aiProvider, mono: true },
                { label: 'Model', value: config.activeModel || 'gpt-4o-mini', mono: true, color: 'blue' },
                { label: 'BluesMinds Key', value: config.bluesmindsApiKey ? 'CONFIGURED' : 'MISSING', badge: true, ok: !!config.bluesmindsApiKey },
                { label: 'AI Enabled', value: config.aiEnabled ? 'ON' : 'OFF', badge: true, ok: config.aiEnabled === 1 },
              ].map(({ label, value, mono, color, badge, ok }) => (
                <div key={label} className="flex items-center justify-between py-2 border-b border-slate-800/50 last:border-0">
                  <span className="text-xs text-slate-500">{label}</span>
                  {badge ? (
                    <span className={cn('px-2 py-0.5 rounded text-[10px] font-bold', ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400')}>
                      {value}
                    </span>
                  ) : (
                    <span className={cn('text-xs truncate max-w-[140px]', mono ? 'font-mono' : '', color === 'blue' ? 'text-blue-400' : 'text-slate-300')}>
                      {value}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Recent AI logs */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl">
            <h4 className="text-sm font-semibold text-slate-300 mb-3">Recent AI Activity</h4>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {aiLogs.length === 0 ? (
                <p className="text-xs text-slate-600 text-center py-4">No AI activity yet</p>
              ) : (
                aiLogs.slice(0, 15).map((log, i) => (
                  <div key={i} className="text-[10px] text-slate-500 py-1 border-b border-slate-800/30 last:border-0">
                    {log.message}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
