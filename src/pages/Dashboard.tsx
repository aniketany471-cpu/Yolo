import React from 'react';
import { useAppContext } from '../context/AppContext';
import { Clock, Send, Users, Activity, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '../lib/utils';

export function Dashboard() {
  const { messages, targets, logs, isRunning, clearLogs } = useAppContext();

  const stats = [
    { label: 'Total Messages', value: messages.length, icon: Send, color: 'text-blue-400', bg: 'bg-blue-400/10' },
    { label: 'Active Targets', value: targets.length, icon: Users, color: 'text-purple-400', bg: 'bg-purple-400/10' },
    { label: 'Status', value: isRunning ? 'Running' : 'Stopped', icon: Activity, color: isRunning ? 'text-emerald-400' : 'text-slate-400', bg: isRunning ? 'bg-emerald-400/10' : 'bg-slate-400/10' },
  ];

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {stats.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex items-center gap-4">
              <div className={cn("p-3 rounded-lg", stat.bg)}>
                <Icon className={cn("w-6 h-6", stat.color)} />
              </div>
              <div>
                <p className="text-sm text-slate-400 font-medium">{stat.label}</p>
                <p className="text-2xl font-semibold text-white mt-0.5">{stat.value}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Activity Log */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl flex flex-col h-[500px]">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-slate-400" />
            <h2 className="font-semibold">Automation Log</h2>
          </div>
          <button 
            onClick={clearLogs}
            className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
            title="Clear Logs"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
        
        <div className="p-4 overflow-y-auto flex-1 font-mono text-sm space-y-2">
          {logs.length === 0 ? (
            <div className="h-full flex items-center justify-center text-slate-500">
              No logs available
            </div>
          ) : (
            logs.map(log => (
              <div 
                key={log.id} 
                className={cn(
                  "py-2 px-3 rounded text-slate-300 border-l-2 bg-slate-950/50",
                  log.type === 'info' && "border-blue-500",
                  log.type === 'success' && "border-emerald-500 text-emerald-200",
                  log.type === 'warn' && "border-amber-500 text-amber-200",
                  log.type === 'error' && "border-red-500 text-red-200"
                )}
              >
                <span className="text-slate-500 text-xs mr-3">
                  {format(log.timestamp, 'HH:mm:ss')}
                </span>
                {log.message}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
