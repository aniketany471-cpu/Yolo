import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { Sparkles, Save, ShieldCheck, Zap, Globe, AlertCircle, Bot, MessageSquare, AtSign, Clock, Brain, UserCheck, ShieldAlert } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';

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
  const [activeModel, setActiveModel] = useState(config.activeModel || 'gemini-1.5-flash');
  const [deepThinking, setDeepThinking] = useState(config.deepThinking === 1);
  
  const [saved, setSaved] = useState(false);

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
    setActiveModel(config.activeModel || 'gemini-1.5-flash');
    setDeepThinking(config.deepThinking === 1);
  }, [config]);

  const toggleAiEnabled = async () => {
    const newValue = !aiEnabled;
    setAiEnabled(newValue);
    await updateConfig({ ...config, aiEnabled: newValue ? 1 : 0 });
  };

  const toggleAutoReplyDM = async () => {
    const newValue = !autoReplyDM;
    setAutoReplyDM(newValue);
    await updateConfig({ ...config, autoReplyDM: newValue ? 1 : 0 });
  };

  const toggleAutoReplyMention = async () => {
    const newValue = !autoReplyMention;
    setAutoReplyMention(newValue);
    await updateConfig({ ...config, autoReplyMention: newValue ? 1 : 0 });
  };

  const toggleTypingSimulation = async () => {
    const newValue = !typingSimulation;
    setTypingSimulation(newValue);
    await updateConfig({ ...config, typingSimulation: newValue ? 1 : 0 });
  };

  const toggleConversationMemory = async () => {
    const newValue = !conversationMemory;
    setConversationMemory(newValue);
    await updateConfig({ ...config, conversationMemory: newValue ? 1 : 0 });
  };

  const toggleSearchEnabled = async () => {
    const newValue = !searchEnabled;
    setSearchEnabled(newValue);
    await updateConfig({ ...config, searchEnabled: newValue ? 1 : 0 });
  };

  const toggleFormattingEnabled = async () => {
    const newValue = !formattingEnabled;
    setFormattingEnabled(newValue);
    await updateConfig({ ...config, formattingEnabled: newValue ? 1 : 0 });
  };

  const toggleCleanupEnabled = async () => {
    const newValue = !cleanupEnabled;
    setCleanupEnabled(newValue);
    await updateConfig({ ...config, cleanupEnabled: newValue ? 1 : 0 });
  };

  const toggleDeepThinking = async () => {
    const newValue = !deepThinking;
    setDeepThinking(newValue);
    await updateConfig({ ...config, deepThinking: newValue ? 1 : 0 });
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
      deepThinking: deepThinking ? 1 : 0
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleBlur = async () => {
    await handleSave();
  };

  const aiLogs = logs.filter(l => l.message.includes('AI') || l.message.includes('Auto-replied'));

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
          {/* AI Providers Section */}
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
                  "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5",
                  diagnostics.isListenerActive ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"
                )}>
                  <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse", diagnostics.isListenerActive ? "bg-emerald-400" : "bg-red-400")} />
                  {diagnostics.isListenerActive ? "Listener Active" : "Listener Down"}
                </div>
                <button
                  onClick={toggleAiEnabled}
                  className={cn(
                    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none",
                    aiEnabled ? "bg-blue-600" : "bg-slate-700"
                  )}
                >
                  <span className={cn(
                    "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                    aiEnabled ? "translate-x-6" : "translate-x-1"
                  )} />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
                    <Sparkles className="w-4 h-4" /> Primary Provider
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'gemini', label: 'Gemini', icon: Bot },
                      { id: 'groq', label: 'Groq', icon: Zap },
                      { id: 'bluesminds', label: 'Blues', icon: Sparkles },
                      { id: 'openrouter', label: 'Router', icon: Globe }
                    ].map((p) => (
                      <button
                        key={p.id}
                        onClick={() => selectAiProvider(p.id)}
                        className={cn(
                          "flex flex-col items-center gap-1.5 p-2.5 rounded-xl border transition-all",
                          aiProvider === p.id 
                            ? "bg-blue-600/10 border-blue-500 text-blue-400" 
                            : "bg-slate-950/40 border-slate-800 text-slate-500 hover:border-slate-700"
                        )}
                      >
                        <p.icon className="w-4 h-4" />
                        <span className="text-[10px] font-bold uppercase">{p.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                   <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
                    <Brain className="w-4 h-4" /> AI Personality
                   </label>
                   <textarea
                    rows={3}
                    placeholder="Describe how the bot should behave (e.g., 'Be helpful, concise, and use emojis')"
                    value={autoReplyPersonality}
                    onChange={(e) => setAutoReplyPersonality(e.target.value)}
                    onBlur={handleBlur}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
                   />
                   
                   <div className="space-y-2">
                     <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                       <Zap className="w-3 h-3" /> Active Model (BluesMinds)
                     </label>
                     <select
                       value={activeModel}
                       onChange={async (e) => {
                         const val = e.target.value;
                         setActiveModel(val);
                         if (val !== 'custom') {
                           await updateConfig({ ...config, activeModel: val });
                         }
                       }}
                       className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
                     >
                        <optgroup label="Popular Models">
                          <option value="gpt-4o-mini">GPT-4o Mini (Free)</option>
                          <option value="gpt-4o">GPT-4o (Paid)</option>
                          <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                          <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                          <option value="gemini-2.0-flash-exp">Gemini 2.0 Flash</option>
                          <option value="claude-haiku-4-5">Claude Haiku 4.5</option>
                          <option value="deepseek-chat">DeepSeek Chat</option>
                        </optgroup>
                        <optgroup label="Specialized Models">
                          <option value="gpt-5-chat">GPT-5 Chat</option>
                          <option value="gpt-5-nano">GPT-5 Nano</option>
                          <option value="gpt-5.3-codex">GPT-5.3 Codex</option>
                          <option value="01-ai/yi-large">Yi Large</option>
                          <option value="databricks/dbrx-instruct">DBRX Instruct</option>
                          <option value="bigcode/starcoder2-15b">StarCoder 2 15B</option>
                          <option value="ai21labs/jamba-1.5-large-instruct">Jamba 1.5 Large</option>
                        </optgroup>
                        <optgroup label="Others">
                          <option value="baichuan-inc/baichuan2-13b-chat">Baichuan 2</option>
                          <option value="adept/fuyu-8b">Fuyu 8B</option>
                          <option value="bigcode/starcoder2-7b">StarCoder 2 7B</option>
                          <option value="custom">-- Custom Model Name --</option>
                        </optgroup>
                     </select>
                   </div>

                   {/* Explicit Custom Model Input */}
                   {(activeModel === 'custom' || !["gpt-4o-mini", "gpt-4o", "gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.0-flash-exp", "claude-haiku-4-5", "deepseek-chat", "gpt-5-chat", "gpt-5-nano", "gpt-5.3-codex", "01-ai/yi-large", "databricks/dbrx-instruct", "bigcode/starcoder2-15b", "ai21labs/jamba-1.5-large-instruct", "baichuan-inc/baichuan2-13b-chat", "adept/fuyu-8b", "bigcode/starcoder2-7b"].includes(activeModel)) && (
                     <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                       <label className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">Enter Model ID</label>
                       <input
                         type="text"
                         placeholder="e.g. google/gemini-pro"
                         value={activeModel === 'custom' ? '' : activeModel}
                         onChange={(e) => setActiveModel(e.target.value)}
                         onBlur={async () => {
                           if (activeModel && activeModel !== 'custom') {
                             await updateConfig({ ...config, activeModel: activeModel });
                           }
                         }}
                         className="w-full bg-slate-950 border border-blue-500/30 rounded-lg p-2 text-xs text-blue-200 focus:outline-none focus:border-blue-500 transition-colors"
                       />
                     </div>
                   )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Gemini Key</label>
                  <input
                    type="password"
                    placeholder="System Key used if empty"
                    value={geminiKey}
                    onChange={(e) => setGeminiKey(e.target.value)}
                    onBlur={handleBlur}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
                <div className="space-y-2">
                   <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">BluesMinds Key</label>
                   <input
                     type="password"
                     placeholder="Enter BluesMinds Key"
                     value={bluesmindsApiKey}
                     onChange={(e) => setBluesmindsApiKey(e.target.value)}
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
                    placeholder="Enter Router Key"
                    value={openRouterKey}
                    onChange={(e) => setOpenRouterKey(e.target.value)}
                    onBlur={handleBlur}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Advanced Real-time AI Section */}
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
                   <div className="space-y-6">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between p-3 bg-slate-950/40 rounded-xl border border-slate-800/50">
                          <div className="flex items-center gap-3">
                            <Globe className="w-4 h-4 text-emerald-400" />
                            <span className="text-sm font-medium text-slate-300">Live Web Search</span>
                          </div>
                          <button onClick={toggleSearchEnabled} className={cn("relative inline-flex h-5 w-9 items-center rounded-full transition-colors", searchEnabled ? "bg-emerald-600" : "bg-slate-700")}>
                            <span className={cn("inline-block h-3 w-3 transform rounded-full bg-white transition-transform", searchEnabled ? "translate-x-5" : "translate-x-1")} />
                          </button>
                        </div>

                        <div className="flex items-center justify-between p-3 bg-slate-950/40 rounded-xl border border-slate-800/50">
                          <div className="flex items-center gap-3">
                            <Bot className="w-4 h-4 text-blue-400" />
                            <span className="text-sm font-medium text-slate-300">Telegram Formatting</span>
                          </div>
                          <button onClick={toggleFormattingEnabled} className={cn("relative inline-flex h-5 w-9 items-center rounded-full transition-colors", formattingEnabled ? "bg-blue-600" : "bg-slate-700")}>
                            <span className={cn("inline-block h-3 w-3 transform rounded-full bg-white transition-transform", formattingEnabled ? "translate-x-5" : "translate-x-1")} />
                          </button>
                        </div>

                        <div className="flex items-center justify-between p-3 bg-slate-950/40 rounded-xl border border-slate-800/50">
                          <div className="flex items-center gap-3">
                            <Zap className="w-4 h-4 text-amber-400" />
                            <span className="text-sm font-medium text-slate-300">Response Cleanup</span>
                          </div>
                          <button onClick={toggleCleanupEnabled} className={cn("relative inline-flex h-5 w-9 items-center rounded-full transition-colors", cleanupEnabled ? "bg-amber-600" : "bg-slate-700")}>
                            <span className={cn("inline-block h-3 w-3 transform rounded-full bg-white transition-transform", cleanupEnabled ? "translate-x-5" : "translate-x-1")} />
                          </button>
                        </div>

                        <div className="flex items-center justify-between p-3 bg-slate-950/40 rounded-xl border border-blue-500/20 bg-blue-500/5">
                          <div className="flex items-center gap-3">
                             <Brain className="w-4 h-4 text-purple-400" />
                             <div className="flex flex-col">
                                <span className="text-sm font-bold text-slate-200">Deep Thinking Mode</span>
                                <span className="text-[10px] text-slate-500">Enhanced reasoning & logical depth</span>
                             </div>
                          </div>
                          <button onClick={toggleDeepThinking} className={cn("relative inline-flex h-5 w-9 items-center rounded-full transition-colors", deepThinking ? "bg-purple-600" : "bg-slate-700")}>
                            <span className={cn("inline-block h-3 w-3 transform rounded-full bg-white transition-transform", deepThinking ? "translate-x-5" : "translate-x-1")} />
                          </button>
                        </div>
                      </div>
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
                          <option value="concise">Concise (Direct)</option>
                          <option value="detailed">Detailed (Explainer)</option>
                          <option value="casual">Casual (Friendly)</option>
                          <option value="telegram-friendly">Telegram Optimized</option>
                        </select>
                      </div>

                      <div className={cn("space-y-2 transition-opacity", !searchEnabled && "opacity-50 pointer-events-none")}>
                        <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                           <AlertCircle className="w-3.5 h-3.5" /> Search API Key (Tavily)
                        </label>
                        <input
                          type="password"
                          placeholder="Your Tavily API Key"
                          value={searchApiKey}
                          onChange={(e) => setSearchApiKey(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-300 focus:border-emerald-500 outline-none"
                        />
                        <p className="text-[9px] text-slate-600">Get your key at tavily.com. Free for up to 1,000 searches/mo.</p>
                      </div>
                   </div>
                </div>
             </div>
          </section>

          {/* Auto Reply Mode */}
          <section className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
             <div className="p-6 border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-500/10 rounded-lg">
                    <Zap className="w-5 h-5 text-purple-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-200">AutoAI Automation</h3>
                    <p className="text-xs text-slate-500">Autonomous response triggers</p>
                  </div>
                </div>
             </div>
             
             <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
               <div className="space-y-6">
                 <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 bg-slate-950/40 rounded-xl border border-slate-800/50">
                      <div className="flex items-center gap-3">
                         <MessageSquare className="w-4 h-4 text-slate-400" />
                         <span className="text-sm font-medium text-slate-300">Reply to Private DMs</span>
                      </div>
                      <button onClick={toggleAutoReplyDM} className={cn("relative inline-flex h-5 w-9 items-center rounded-full transition-colors", autoReplyDM ? "bg-purple-600" : "bg-slate-700")}>
                        <span className={cn("inline-block h-3 w-3 transform rounded-full bg-white transition-transform", autoReplyDM ? "translate-x-5" : "translate-x-1")} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-slate-950/40 rounded-xl border border-slate-800/50">
                      <div className="flex items-center gap-3">
                         <AtSign className="w-4 h-4 text-slate-400" />
                         <span className="text-sm font-medium text-slate-300">Reply to Mentions</span>
                      </div>
                      <button onClick={toggleAutoReplyMention} className={cn("relative inline-flex h-5 w-9 items-center rounded-full transition-colors", autoReplyMention ? "bg-purple-600" : "bg-slate-700")}>
                        <span className={cn("inline-block h-3 w-3 transform rounded-full bg-white transition-transform", autoReplyMention ? "translate-x-5" : "translate-x-1")} />
                      </button>
                    </div>
                 </div>

                 <div className="p-4 bg-slate-950/50 border border-slate-800 rounded-xl space-y-4">
                    <h4 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                       <Clock className="w-3.5 h-3.5" /> Human-Like Behavior
                    </h4>
                    <div className="flex items-center justify-between">
                       <span className="text-xs text-slate-400">Typing Simulation</span>
                       <button onClick={toggleTypingSimulation} className={cn("relative inline-flex h-4 w-7 items-center rounded-full transition-colors", typingSimulation ? "bg-blue-600" : "bg-slate-700")}>
                          <span className={cn("inline-block h-2 w-2 transform rounded-full bg-white transition-transform", typingSimulation ? "translate-x-4" : "translate-x-1")} />
                       </button>
                    </div>
                    <div className="flex items-center justify-between">
                       <span className="text-xs text-slate-400">Conversation Memory</span>
                       <button onClick={toggleConversationMemory} className={cn("relative inline-flex h-4 w-7 items-center rounded-full transition-colors", conversationMemory ? "bg-blue-600" : "bg-slate-700")}>
                          <span className={cn("inline-block h-2 w-2 transform rounded-full bg-white transition-transform", conversationMemory ? "translate-x-4" : "translate-x-1")} />
                       </button>
                    </div>
                    <div className="pt-2">
                       <label className="text-[10px] font-medium text-slate-500 mb-2 block">Response Delay (seconds)</label>
                       <div className="flex items-center gap-3">
                          <input type="number" value={autoReplyDelayMin} onChange={(e) => setAutoReplyDelayMin(Number(e.target.value))} className="w-full bg-slate-900 border border-slate-800 rounded p-1 text-xs text-center text-slate-300" placeholder="Min" />
                          <span className="text-slate-700">to</span>
                          <input type="number" value={autoReplyDelayMax} onChange={(e) => setAutoReplyDelayMax(Number(e.target.value))} className="w-full bg-slate-900 border border-slate-800 rounded p-1 text-xs text-center text-slate-300" placeholder="Max" />
                       </div>
                    </div>
                 </div>
               </div>

               <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                       <UserCheck className="w-3.5 h-3.5" /> Auto-Reply Whitelist
                    </label>
                    <input
                      type="text"
                      placeholder="Chat IDs or Usernames (comma separated)"
                      value={autoReplyWhitelist}
                      onChange={(e) => setAutoReplyWhitelist(e.target.value)}
                      onBlur={handleBlur}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-300 focus:border-blue-500 outline-none"
                    />
                    <p className="text-[9px] text-slate-600">If set, bot will ONLY reply to these users/chats.</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                       <ShieldAlert className="w-3.5 h-3.5 text-red-500/50" /> Ignored Blacklist
                    </label>
                    <input
                      type="text"
                      placeholder="Chat IDs or Usernames (comma separated)"
                      value={autoReplyBlacklist}
                      onChange={(e) => setAutoReplyBlacklist(e.target.value)}
                      onBlur={handleBlur}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-300 focus:border-red-500 outline-none"
                    />
                    <p className="text-[9px] text-slate-600">Bot will NEVER reply to these users/chats.</p>
                  </div>

                  <div className="p-3 bg-amber-500/5 border border-amber-500/10 rounded-lg text-[10px] text-amber-200/50 leading-relaxed italic">
                    Safety Tip: The bot automatically ignores other bots and command-style messages beginning with '/' or '.' to prevent feedback loops.
                  </div>
               </div>
             </div>
          </section>
        </div>

        {/* Vertical sidebar for logs */}
        <div className="lg:col-span-4 space-y-6">
          <section className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-4">
             <h3 className="font-semibold text-slate-200 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                Diagnostics
             </h3>
             <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-slate-950/50 border border-slate-800 rounded-lg">
                   <p className="text-[10px] text-slate-500 uppercase font-black mb-1">Telegram</p>
                   <p className={cn("text-xs font-bold", diagnostics.clientReady ? "text-emerald-400" : "text-red-400")}>
                      {diagnostics.clientReady ? "CONNECTED" : "OFFLINE"}
                   </p>
                </div>
                <div className="p-3 bg-slate-950/50 border border-slate-800 rounded-lg">
                   <p className="text-[10px] text-slate-500 uppercase font-black mb-1">Live Events</p>
                   <p className={cn("text-xs font-bold", diagnostics.isListenerActive ? "text-emerald-400" : "text-red-400")}>
                      {diagnostics.isListenerActive ? "ACTIVE" : "INACTIVE"}
                   </p>
                </div>
                <div className="p-3 bg-slate-950/50 border border-slate-800 rounded-lg">
                   <p className="text-[10px] text-slate-500 uppercase font-black mb-1">AI Engine</p>
                   <p className={cn("text-xs font-bold", diagnostics.aiConfigureds ? "text-emerald-400" : "text-red-400")}>
                      {diagnostics.aiConfigureds ? "READY" : "NO KEYS"}
                   </p>
                </div>
                <div className="p-3 bg-slate-950/50 border border-slate-800 rounded-lg">
                   <p className="text-[10px] text-slate-500 uppercase font-black mb-1">Heartbeat</p>
                   <p className="text-xs font-bold text-blue-400">
                      {diagnostics.lastEventTimestamp ? Math.floor((Date.now() - diagnostics.lastEventTimestamp) / 1000) + "s ago" : "None"}
                   </p>
                </div>
             </div>
             
             <div className="p-3 bg-blue-500/5 border border-blue-500/10 rounded-lg">
                <h4 className="text-[10px] font-bold text-blue-400 uppercase mb-1">Self-Correction Tip</h4>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                   If the listener is down, try restarting the automation loop or reloading your session. Use <code className="text-blue-300">/aitest</code> in Telegram to force a diagnostic.
                </p>
             </div>
          </section>

          <section className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-4">
             <h3 className="font-semibold text-slate-200 flex items-center gap-2">
                <Brain className="w-5 h-5 text-purple-400" />
                Active Model Stats
             </h3>
             <div className="space-y-3">
                <div className="flex justify-between items-center text-xs">
                   <span className="text-slate-500">Provider</span>
                   <span className="text-slate-300 font-mono uppercase">{config.aiProvider}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                   <span className="text-slate-500">Active Model</span>
                   <span className="text-blue-400 font-mono">{config.activeModel || 'gemini-1.5-flash'}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                   <span className="text-slate-500">API Health</span>
                   <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold", config.bluesmindsApiKey ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400")}>
                      {config.bluesmindsApiKey ? "SECURE" : "MISSING"}
                   </span>
                </div>
                <div className="pt-2">
                   <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 w-[85%] rounded-full shadow-[0_0_8px_rgba(59,130,246,0.5)]"></div>
                   </div>
                   <p className="text-[9px] text-slate-600 mt-1">Est. Latency: ~1.2s | Token Efficiency: High</p>
                </div>
             </div>
          </section>

          <section className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl h-full flex flex-col max-h-[500px]">
            <h3 className="font-semibold text-slate-200 mb-4 flex items-center gap-2">
              <Bot className="w-5 h-5 text-blue-400" />
              AI Activity
            </h3>
            <div className="flex-1 space-y-3 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-800">
              {aiLogs.length > 0 ? aiLogs.map((log) => (
                <motion.div 
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  key={log.id} 
                  className={cn(
                    "p-3 rounded-lg border",
                    log.message.includes('Auto-replied') ? "bg-purple-500/5 border-purple-500/20" : "bg-slate-950/50 border-slate-800"
                  )}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className={cn(
                      "text-[9px] uppercase font-black tracking-tighter px-1.5 py-0.5 rounded",
                      log.type === 'success' ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-800 text-slate-400"
                    )}>{log.type}</span>
                    <span className="text-[9px] text-slate-600">{new Date(log.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-tight">{log.message}</p>
                </motion.div>
              )) : (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-600 gap-2 opacity-50 py-12">
                   <Sparkles className="w-12 h-12" />
                   <p className="text-xs">Waiting for AI activity...</p>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
