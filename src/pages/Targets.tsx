import React, { useState } from 'react';
import { useAppContext, TelegramTarget } from '../context/AppContext';
import { Users, UserPlus, Hash, Trash2, AtSign } from 'lucide-react';
import { cn } from '../lib/utils';

export function Targets() {
  const { targets, addTarget, removeTarget } = useAppContext();
  const [newTarget, setNewTarget] = useState('');
  const [targetType, setTargetType] = useState<'group' | 'channel' | 'user'>('group');

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTarget.trim()) return;
    
    // Auto-add @ if it's missing (simple validation)
    const formattedName = newTarget.trim().startsWith('@') 
      ? newTarget.trim() 
      : (newTarget.includes('/') ? newTarget.trim() : `@${newTarget.trim()}`);
      
    addTarget({
      id: Math.random().toString(),
      name: formattedName,
      type: targetType
    });
    setNewTarget('');
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'group': return Users;
      case 'channel': return Hash;
      case 'user': return AtSign;
      default: return Users;
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-1 space-y-6">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <UserPlus className="w-5 h-5 text-purple-400" />
            <h2 className="font-semibold text-lg">Add Target</h2>
          </div>
          
          <form onSubmit={handleAdd} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1.5">
                Target Type
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['group', 'channel', 'user'] as const).map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setTargetType(type)}
                    className={cn(
                      "py-2 px-1 text-xs font-medium rounded-lg capitalize border transition-all",
                      targetType === type 
                        ? "bg-purple-600/20 border-purple-500/50 text-purple-300" 
                        : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                    )}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1.5">
                Username or Link
              </label>
              <input
                type="text"
                value={newTarget}
                onChange={(e) => setNewTarget(e.target.value)}
                placeholder="e.g. @telethon_devs"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-slate-200 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all"
              />
            </div>
            
            <button 
              type="submit"
              disabled={!newTarget.trim()}
              className="w-full bg-purple-600 hover:bg-purple-500 text-white font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              Add Target
            </button>
          </form>
        </div>
      </div>

      <div className="lg:col-span-2">
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col h-full min-h-[500px]">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-900">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-slate-400" />
              <h2 className="font-semibold">Target List ({targets.length})</h2>
            </div>
          </div>
          
          <div className="p-4 overflow-y-auto flex-1">
            {targets.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-3">
                <Users className="w-12 h-12 opacity-20" />
                <p>No target groups/channels added.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {targets.map(target => {
                  const Icon = getTypeIcon(target.type);
                  return (
                    <div key={target.id} className="group flex items-center justify-between bg-slate-950/50 border border-slate-800 p-3 rounded-lg hover:border-slate-700 transition-colors">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className={cn(
                          "p-2 rounded-md shrink-0",
                          target.type === 'group' && "bg-blue-500/10 text-blue-400",
                          target.type === 'channel' && "bg-amber-500/10 text-amber-400",
                          target.type === 'user' && "bg-emerald-500/10 text-emerald-400"
                        )}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-slate-200 font-medium text-sm truncate">{target.name}</p>
                          <p className="text-xs text-slate-500 capitalize">{target.type}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => removeTarget(target.id)}
                        className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-md transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 shrink-0"
                        title="Remove Target"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
