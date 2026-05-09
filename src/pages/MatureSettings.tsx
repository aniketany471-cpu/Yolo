import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { 
  ShieldAlert, 
  ToggleLeft, 
  ToggleRight, 
  Users, 
  History, 
  AlertTriangle, 
  ChevronRight, 
  Search,
  MessageSquare,
  Lock,
  Trash2,
  Settings as SettingsIcon,
  ShieldCheck
} from 'lucide-react';
import { motion } from 'motion/react';

const MatureSettings: React.FC = () => {
  const { config, updateConfig, nsfwLogs, nsfwUsers, toggleNSFWUser, clearNSFWLogs } = useAppContext();
  const [activeTab, setActiveTab] = useState<'settings' | 'users' | 'logs'>('settings');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredUsers = nsfwUsers.filter(u => u.userId.toLowerCase().includes(searchTerm.toLowerCase()));
  const filteredLogs = nsfwLogs.filter(l => l.userId.toLowerCase().includes(searchTerm.toLowerCase()) || l.message.toLowerCase().includes(searchTerm.toLowerCase()));

  const toggleNSFWGlobal = () => {
    updateConfig({ nsfwEnabled: config.nsfwEnabled === 1 ? 0 : 1 });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
            <ShieldAlert className="text-pink-500" />
            Mature Chat Mode
          </h1>
          <p className="text-gray-400 mt-1">Manage private adult AI conversation settings and safety.</p>
        </div>
        
        <div className="flex bg-gray-800/50 p-1 rounded-xl border border-gray-700/50">
          <button 
            onClick={() => setActiveTab('settings')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'settings' ? 'bg-pink-600 text-white shadow-lg' : 'text-gray-400 hover:text-white hover:bg-gray-700/50'}`}
          >
            <div className="flex items-center gap-2">
              <SettingsIcon size={16} />
              Settings
            </div>
          </button>
          <button 
            onClick={() => setActiveTab('users')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'users' ? 'bg-pink-600 text-white shadow-lg' : 'text-gray-400 hover:text-white hover:bg-gray-700/50'}`}
          >
            <div className="flex items-center gap-2">
              <Users size={16} />
              Users
            </div>
          </button>
          <button 
            onClick={() => setActiveTab('logs')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'logs' ? 'bg-pink-600 text-white shadow-lg' : 'text-gray-400 hover:text-white hover:bg-gray-700/50'}`}
          >
            <div className="flex items-center gap-2">
              <History size={16} />
              Logs
            </div>
          </button>
        </div>
      </div>

      {activeTab === 'settings' && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-1 lg:grid-cols-3 gap-6"
        >
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-gray-800/40 border border-gray-700/50 rounded-2xl overflow-hidden backdrop-blur-sm">
              <div className="p-6 border-b border-gray-700/50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-pink-500/10 flex items-center justify-center text-pink-500">
                    <ToggleRight />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white text-lg">Global NSFW Toggle</h3>
                    <p className="text-sm text-gray-400">Enable or disable mature chat features bot-wide.</p>
                  </div>
                </div>
                <button 
                  onClick={toggleNSFWGlobal}
                  className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none ${config.nsfwEnabled === 1 ? 'bg-pink-600' : 'bg-gray-700'}`}
                >
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${config.nsfwEnabled === 1 ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              <div className="p-6 space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">NSFW AI Personality</label>
                  <textarea
                    value={config.nsfwPersonality || ''}
                    onChange={(e) => updateConfig({ nsfwPersonality: e.target.value })}
                    className="w-full h-32 bg-gray-900/50 border border-gray-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all outline-none resize-none"
                    placeholder="Describe the mature AI personality..."
                  />
                  <p className="mt-2 text-xs text-gray-500 italic">This prompt is only used when mature mode is active in a private chat.</p>
                </div>
              </div>
            </div>

            <div className="bg-amber-900/10 border border-amber-800/30 rounded-2xl p-6 flex gap-4">
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 shrink-0">
                <AlertTriangle />
              </div>
              <div>
                <h4 className="text-amber-100 font-semibold mb-1">Safety Constraints</h4>
                <p className="text-amber-200/60 text-sm leading-relaxed">
                  Mature mode is strictly restricted to private chats. It will be automatically ignored in group chats. 
                  Safety filters are always active to prevent non-consensual content, exploitation, or illegal scenarios.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-gray-800/40 border border-gray-700/50 rounded-2xl p-6 backdrop-blur-sm">
              <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                <Lock size={18} className="text-pink-500" />
                Security Rules
              </h3>
              <ul className="space-y-3">
                {[
                  "Adults Only (18+ confirmed)",
                  "Strictly Opt-In via /nsfw on",
                  "Private Conversations only",
                  "Automated Moderation Filter",
                  "No Minor-related content",
                  "No illegal/harmful content"
                ].map((rule, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm text-gray-400">
                    <ShieldCheck size={14} className="text-pink-500" />
                    {rule}
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-pink-900/10 border border-pink-800/30 rounded-2xl p-6">
              <h3 className="font-semibold text-white mb-2">Did you know?</h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                When a user types `/nsfw on` for the first time, they must confirm their age before mature mode is activated.
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {activeTab === 'users' && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gray-800/40 border border-gray-700/50 rounded-2xl overflow-hidden backdrop-blur-sm"
        >
          <div className="p-6 border-b border-gray-700/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="font-semibold text-white text-lg">Mature Mode Users</h3>
              <p className="text-sm text-gray-400">Users who have opted into mature chat mode.</p>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
              <input
                type="text"
                placeholder="Search user ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-gray-900/50 border border-gray-700 rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:ring-2 focus:ring-pink-500 outline-none w-full md:w-64 transition-all"
              />
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-900/30 text-gray-400 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4 font-medium text-center">Status</th>
                  <th className="px-6 py-4 font-medium">User ID</th>
                  <th className="px-6 py-4 font-medium">Age Confirmed</th>
                  <th className="px-6 py-4 font-medium">Last Active</th>
                  <th className="px-6 py-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/30">
                {filteredUsers.length > 0 ? (
                  filteredUsers.map((user) => (
                    <tr key={user.userId} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${user.nsfwEnabled === 1 ? 'bg-pink-500/10 text-pink-500' : 'bg-gray-700/30 text-gray-500'}`}>
                          {user.nsfwEnabled === 1 ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-mono text-sm text-white">{user.userId}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${user.ageConfirmed === 1 ? 'bg-green-500' : 'bg-gray-600'}`} />
                          <span className="text-sm text-gray-400">{user.ageConfirmed === 1 ? 'Verified' : 'Pending'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-400">
                        {new Date(user.updatedAt).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button 
                          onClick={() => toggleNSFWUser(user.userId, user.nsfwEnabled === 0)}
                          className={`text-sm font-medium ${user.nsfwEnabled === 1 ? 'text-gray-400 hover:text-white' : 'text-pink-500 hover:text-pink-400'} transition-colors`}
                        >
                          {user.nsfwEnabled === 1 ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-500 italic">
                      No users found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {activeTab === 'logs' && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gray-800/40 border border-gray-700/50 rounded-2xl overflow-hidden backdrop-blur-sm"
        >
          <div className="p-6 border-b border-gray-700/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="font-semibold text-white text-lg">Moderation Logs</h3>
              <p className="text-sm text-gray-400">Detection logs for NSFW policy violations.</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                <input
                  type="text"
                  placeholder="Search logs..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-gray-900/50 border border-gray-700 rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:ring-2 focus:ring-pink-500 outline-none w-full md:w-64 transition-all"
                />
              </div>
              <button 
                onClick={clearNSFWLogs}
                className="p-2 text-gray-400 hover:text-red-400 transition-colors"
                title="Clear Logs"
              >
                <Trash2 size={20} />
              </button>
            </div>
          </div>

          <div className="max-h-[600px] overflow-y-auto">
            {filteredLogs.length > 0 ? (
              <div className="divide-y divide-gray-700/30">
                {filteredLogs.map((log) => (
                  <div key={log.id} className="p-5 hover:bg-white/[0.02] transition-colors animate-in fade-in slide-in-from-top-1">
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center text-red-500">
                          <AlertTriangle size={16} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                             <span className="text-sm font-semibold text-white">Policy Violation</span>
                             <span className="text-[10px] bg-red-900/30 text-red-400 px-1.5 py-0.5 rounded uppercase font-bold tracking-wider underline decoration-red-400/30 underline-offset-2">Critical</span>
                          </div>
                          <span className="text-xs text-gray-500">{new Date(log.timestamp).toLocaleString()}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-mono text-gray-500">USER: {log.userId}</div>
                        <div className="text-xs font-mono text-gray-500">CHAT: {log.chatId}</div>
                      </div>
                    </div>
                    <div className="bg-gray-900/50 rounded-xl p-3 border border-gray-700/30 mt-3">
                      <p className="text-sm text-gray-300 font-mono break-all leading-relaxed whitespace-pre-wrap">
                        {log.message}
                      </p>
                    </div>
                    <div className="mt-3 flex items-center gap-2 text-xs text-red-400/80 italic">
                       <ChevronRight size={12} />
                       Reason: {log.violation}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-12 text-center space-y-4">
                <div className="w-16 h-16 bg-gray-900/50 rounded-full flex items-center justify-center mx-auto text-gray-600">
                  <ShieldCheck size={32} />
                </div>
                <div>
                  <h4 className="text-white font-medium">All Clear</h4>
                  <p className="text-gray-500 text-sm">No policy violations detected in the archive.</p>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default MatureSettings;
