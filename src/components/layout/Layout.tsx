import React, { useState } from 'react';
import { 
  Bot, 
  MessageSquare, 
  Users, 
  Settings, 
  LayoutDashboard,
  Menu,
  X,
  Play,
  Square,
  FileText,
  Music,
  Sparkles,
  Shield,
  ShieldAlert
} from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { cn } from '../../lib/utils';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: 'dashboard' | 'messages' | 'targets' | 'settings' | 'pdf' | 'music' | 'ai' | 'nsfw';
  setActiveTab: (tab: 'dashboard' | 'messages' | 'targets' | 'settings' | 'pdf' | 'music' | 'ai' | 'nsfw') => void;
}

export function Layout({ children, activeTab, setActiveTab }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isRunning, toggleBot } = useAppContext();

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'messages', label: 'Messages', icon: MessageSquare },
    { id: 'targets', label: 'Targets', icon: Users },
    { id: 'pdf', label: 'PDF Converter', icon: FileText },
    { id: 'music', label: 'Music', icon: Music },
    { id: 'ai', label: 'AI Settings', icon: Sparkles },
    { id: 'nsfw', label: 'Mature Mode', icon: ShieldAlert },
    { id: 'settings', label: 'Settings', icon: Settings },
  ] as const;

  return (
    <div className="flex h-screen bg-slate-950 text-slate-200 overflow-hidden font-sans">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-20 bg-black/50 lg:hidden backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={cn(
        "fixed inset-y-0 left-0 z-30 w-64 bg-slate-900 border-r border-slate-800 transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 flex flex-col",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex items-center h-16 px-6 font-bold text-xl text-blue-400 border-b border-slate-800 gap-3 shrink-0">
          <Bot className="w-6 h-6" />
          <span>TG Auto</span>
        </div>
        
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  setSidebarOpen(false);
                }}
                className={cn(
                  "flex items-center w-full gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium",
                  isActive 
                    ? "bg-blue-600/10 text-blue-400" 
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                )}
              >
                <Icon className="w-5 h-5" />
                {item.label}
              </button>
            );
          })}
        </nav>
        
        <div className="p-4 border-t border-slate-800 shrink-0">
          <button
            onClick={toggleBot}
            className={cn(
              "w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium transition-all shadow-lg text-sm",
              isRunning 
                ? "bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20" 
                : "bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/20"
            )}
          >
            {isRunning ? (
              <>
                <Square className="w-4 h-4 fill-current" /> Stop Bot
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" /> Start Sending
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-16 flex items-center justify-between px-4 lg:px-8 border-b border-slate-800 bg-slate-900/50 shrink-0">
          <div className="flex items-center gap-4">
            <button 
              className="lg:hidden p-2 text-slate-400 hover:text-slate-200 transition-colors"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="w-6 h-6" />
            </button>
            <h1 className="text-xl font-semibold capitalize bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
              {activeTab}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="relative flex h-2.5 w-2.5">
                {isRunning && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                )}
                <span className={cn(
                  "relative inline-flex rounded-full h-2.5 w-2.5",
                  isRunning ? "bg-emerald-500" : "bg-slate-500"
                )}></span>
              </span>
              <span className={isRunning ? "text-emerald-400 font-medium" : "text-slate-400"}>
                {isRunning ? "Running" : "Stopped"}
              </span>
            </div>
          </div>
        </header>
        
        <main className="flex-1 overflow-y-auto p-4 lg:p-8">
          <div className="mx-auto max-w-6xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
