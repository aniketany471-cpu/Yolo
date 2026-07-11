import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { Clock, Activity, Trash2, Wifi, Brain, Wrench } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '../lib/utils';

export function Dashboard() {
  const { logs, clearLogs, diagnostics, config, updateConfig } = useAppContext();
  const [togglingMaint, setTogglingMaint] = useState(false);
  const maintenanceOn = config.maintenanceMode === 1;

  const handleMaintenanceToggle = async () => {
    setTogglingMaint(true);
    try {
      await updateConfig({ maintenanceMode: maintenanceOn ? 0 : 1 });
    } finally {
      setTimeout(() => setTogglingMaint(false), 600);
    }
  };

  const stats = [
    {
      label: 'Bot Status',
      value: diagnostics.isListenerActive ? 'Connected' : 'Offline',
      icon: Wifi,
      color: diagnostics.isListenerActive ? 'text-emerald-400' : 'text-slate-400',
      bg: diagnostics.isListenerActive ? 'bg-emerald-400/10' : 'bg-slate-400/10',
    },
    {
      label: 'AI Status',
      value: diagnostics.aiConfigured ? 'Ready' : 'Not configured',
      icon: Brain,
      color: diagnostics.aiConfigured ? 'text-blue-400' : 'text-amber-400',
      bg: diagnostics.aiConfigured ? 'bg-blue-400/10' : 'bg-amber-400/10',
    },
    {
      label: 'Listener',
      value: diagnostics.isListenerActive ? 'Active' : 'Inactive',
      icon: Activity,
      color: diagnostics.isListenerActive ? 'text-purple-400' : 'text-slate-400',
      bg: diagnostics.isListenerActive ? 'bg-purple-400/10' : 'bg-slate-400/10',
    },
  ];

  return (
    <div className="space-y-6">

      {/* ── Maintenance Mode ──────────────────────────────────────────────── */}
      <div className={cn(
        "rounded-xl border p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-colors duration-300",
        maintenanceOn
          ? "bg-amber-950/40 border-amber-700/60"
          : "bg-slate-900 border-slate-800"
      )}>
        <div className="flex items-center gap-4">
          <div className={cn(
            "w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0",
            maintenanceOn ? "bg-amber-500/20" : "bg-slate-700/50"
          )}>
            <Wrench className={cn("w-6 h-6", maintenanceOn ? "text-amber-400" : "text-slate-400")} />
          </div>
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-widest font-medium mb-0.5">Maintenance Mode</p>
            <p className="text-lg font-semibold text-white">
              {maintenanceOn ? 'Maintenance is ON' : 'Bot is running normally'}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              {maintenanceOn
                ? 'All users will receive a maintenance notice — only you can use the bot'
                : 'Turn on to block all users and show a maintenance message'}
            </p>
          </div>
        </div>
        <button
          onClick={handleMaintenanceToggle}
          disabled={togglingMaint}
          className={cn(
            "flex items-center gap-2.5 px-6 py-3 rounded-xl font-semibold text-sm transition-all duration-200 flex-shrink-0 w-full sm:w-auto justify-center",
            togglingMaint && "opacity-60 cursor-not-allowed",
            maintenanceOn
              ? "bg-emerald-500 text-white hover:bg-emerald-400 shadow-lg shadow-emerald-500/20"
              : "bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25"
          )}
        >
          <Wrench className="w-4 h-4" />
          {togglingMaint ? 'Updating...' : maintenanceOn ? 'Turn Off Maintenance' : 'Turn On Maintenance'}
        </button>
      </div>

      {/* ── Stats row ────────────────────────────────────────────────────── */}
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

      {/* ── Activity Log ─────────────────────────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl flex flex-col h-[500px]">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-slate-400" />
            <h2 className="font-semibold">Activity Log</h2>
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
                  log.type === 'info'    && "border-blue-500",
                  log.type === 'success' && "border-emerald-500 text-emerald-200",
                  log.type === 'warn'    && "border-amber-500 text-amber-200",
                  log.type === 'error'   && "border-red-500 text-red-200"
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
