import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { Settings as SettingsIcon, Save, Clock, ShieldAlert, Key, MessageSquareX, RotateCcw, ListFilter, Trash2, Bot, Video } from 'lucide-react';
import { cn } from '../lib/utils';

export function Settings() {
  const { config, updateConfig } = useAppContext();
  
  const [minDelay, setMinDelay] = useState(config.minDelaySeconds.toString());
  const [maxDelay, setMaxDelay] = useState(config.maxDelaySeconds.toString());
  const [admins, setAdmins] = useState(config.adminUsers.join(', '));
  const [sudoUsers, setSudoUsers] = useState(config.sudoUsers || '');
  const [publicCommands, setPublicCommands] = useState(config.publicCommandsEnabled === 1);
  const [blacklist, setBlacklist] = useState(config.blacklistedUsers || '');
  const [whitelist, setWhitelist] = useState(config.whitelistedUsers || '');
  const [cookies, setCookies] = useState(config.youtube_cookies);
  const [globalCooldown, setGlobalCooldown] = useState(config.globalCooldown.toString());
  const [userCooldown, setUserCooldown] = useState(config.perUserCooldown.toString());
  const [maxTasks, setMaxTasks] = useState(config.maxConcurrentTasks.toString());
  const [videoMaxMb, setVideoMaxMb] = useState((config.videoDownloaderMaxMb || 50).toString());
  const [videoTimeoutSeconds, setVideoTimeoutSeconds] = useState((config.videoDownloaderTimeoutSeconds || 180).toString());
  const [autoDelete, setAutoDelete] = useState(config.autoDeleteCommands === 1);
  const [autoDeleteDelay, setAutoDeleteDelay] = useState((config.autoDeleteDelay || 0).toString());
  const [autoDeleteWhitelist, setAutoDeleteWhitelist] = useState(config.autoDeleteWhitelist || '');
  const [telegramApiId, setTelegramApiId] = useState(config.telegramApiId || '');
  const [telegramApiHash, setTelegramApiHash] = useState(config.telegramApiHash || '');
  const [telegramStringSession, setTelegramStringSession] = useState(config.telegramStringSession || '');
  const [saved, setSaved] = useState(false);
  const [telegramStatus, setTelegramStatus] = useState<'idle' | 'connecting' | 'connected' | 'failed'>('idle');
  const [ytdlVersion, setYtdlVersion] = useState<string | null>(null);

  useEffect(() => {
    setMinDelay(config.minDelaySeconds.toString());
    setMaxDelay(config.maxDelaySeconds.toString());
    setAdmins(config.adminUsers.join(', '));
    setSudoUsers(config.sudoUsers || '');
    setPublicCommands(config.publicCommandsEnabled === 1);
    setBlacklist(config.blacklistedUsers || '');
    setWhitelist(config.whitelistedUsers || '');
    setCookies(config.youtube_cookies);
    setGlobalCooldown(config.globalCooldown.toString());
    setUserCooldown(config.perUserCooldown.toString());
    setMaxTasks(config.maxConcurrentTasks.toString());
    setVideoMaxMb((config.videoDownloaderMaxMb || 50).toString());
    setVideoTimeoutSeconds((config.videoDownloaderTimeoutSeconds || 180).toString());
    setAutoDelete(config.autoDeleteCommands === 1);
    setAutoDeleteDelay((config.autoDeleteDelay || 0).toString());
    setAutoDeleteWhitelist(config.autoDeleteWhitelist || '');
    setTelegramApiId(config.telegramApiId || '');
    setTelegramApiHash(config.telegramApiHash || '');
    setTelegramStringSession(config.telegramStringSession || '');
  }, [config]);

  useEffect(() => {
    const checkYtdl = async () => {
      try {
        const res = await fetch('/api/youtubedl/check');
        const data = await res.json();
        if (data.success) setYtdlVersion(data.version);
      } catch (e) {}
    };
    checkYtdl();
  }, []);

  const toggleAutoDelete = async (checked: boolean) => {
    setAutoDelete(checked);
    await updateConfig({ ...config, autoDeleteCommands: checked ? 1 : 0 });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    
    let parsedMin = parseInt(minDelay);
    let parsedMax = parseInt(maxDelay);
    
    if (isNaN(parsedMin)) parsedMin = 600;
    if (isNaN(parsedMax)) parsedMax = 1200;
    if (parsedMin > parsedMax) {
      const temp = parsedMin;
      parsedMin = parsedMax;
      parsedMax = temp;
    }

    const adminList = admins.split(',').map(s => s.trim()).filter(s => s !== '');

    const hasTelegramCreds = !!(telegramApiId && telegramApiHash && telegramStringSession);
    if (hasTelegramCreds) setTelegramStatus('connecting');

    const result = await updateConfig({
      minDelaySeconds: parsedMin,
      maxDelaySeconds: parsedMax,
      adminUsers: adminList.length > 0 ? adminList : ['YOUR_TELEGRAM_ID'],
      sudoUsers: sudoUsers,
      publicCommandsEnabled: publicCommands ? 1 : 0,
      blacklistedUsers: blacklist,
      whitelistedUsers: whitelist,
      youtube_cookies: cookies,
      globalCooldown: parseInt(globalCooldown) || 3,
      perUserCooldown: parseInt(userCooldown) || 10,
      maxConcurrentTasks: parseInt(maxTasks) || 2,
      videoDownloaderMaxMb: parseInt(videoMaxMb) || 50,
      videoDownloaderTimeoutSeconds: parseInt(videoTimeoutSeconds) || 180,
      autoDeleteCommands: autoDelete ? 1 : 0,
      autoDeleteDelay: parseInt(autoDeleteDelay) || 0,
      autoDeleteWhitelist: autoDeleteWhitelist,
      telegramApiId: telegramApiId,
      telegramApiHash: telegramApiHash,
      telegramStringSession: telegramStringSession
    });

    setSaved(true);
    setTimeout(() => setSaved(false), 3000);

    if (hasTelegramCreds) {
      if (result.telegramConnected === true) {
        setTelegramStatus('connected');
      } else if (result.telegramConnected === false) {
        setTelegramStatus('failed');
      } else {
        setTelegramStatus('idle');
      }
      setTimeout(() => setTelegramStatus('idle'), 6000);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900">
          <div className="flex items-center gap-2">
            <SettingsIcon className="w-5 h-5 text-slate-400" />
            <h2 className="font-semibold text-lg">Automation Settings</h2>
          </div>
        </div>
        
        <form onSubmit={handleSave} className="p-6 space-y-8">
          
          {/* Telegram Credentials Section */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Bot className="w-4 h-4 text-sky-400" />
              <h3 className="font-medium text-slate-300">Telegram API Credentials</h3>
            </div>
            
            <div className="bg-slate-950/50 border border-slate-800 rounded-lg p-4 space-y-4">
              <p className="text-sm text-slate-400 leading-relaxed">
                Enter your Telegram API credentials. These are required for the bot to connect to your account.
                You can get your <b>API ID</b> and <b>Hash</b> from <a href="https://my.telegram.org" target="_blank" className="text-sky-400 hover:underline">my.telegram.org</a>.
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wider">
                    Telegram API ID
                  </label>
                  <input
                    type="text"
                    value={telegramApiId}
                    onChange={(e) => setTelegramApiId(e.target.value)}
                    placeholder="e.g. 1234567"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-sky-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wider">
                    Telegram API Hash
                  </label>
                  <input
                    type="text"
                    value={telegramApiHash}
                    onChange={(e) => setTelegramApiHash(e.target.value)}
                    placeholder="e.g. 1a2b3c4d5e6f7g8h9i0j"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-sky-500 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wider">
                  Telegram String Session
                </label>
                <textarea
                  value={telegramStringSession}
                  onChange={(e) => setTelegramStringSession(e.target.value)}
                  placeholder="Paste your String Session here (starts with 1B...)"
                  rows={3}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-sky-500 font-mono text-xs transition-colors resize-none"
                />
                <p className="text-[10px] text-slate-500 mt-1">If you don't have one, use a session generator script or bot to get it from your phone number.</p>
              </div>
            </div>
          </section>

          {/* Scheduling Section */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-4 h-4 text-blue-400" />
              <h3 className="font-medium text-slate-300">Message Scheduler (Delay System)</h3>
            </div>
            
            <div className="bg-slate-950/50 border border-slate-800 rounded-lg p-4 space-y-4">
              <p className="text-sm text-slate-400 leading-relaxed">
                Configure the random delay between messages to avoid spam detection. 
                Values are in seconds (e.g. 600 = 10 minutes).
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wider">
                    Min Delay (sec)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={minDelay}
                    onChange={(e) => setMinDelay(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wider">
                    Max Delay (sec)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={maxDelay}
                    onChange={(e) => setMaxDelay(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Security & Permissions Section */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <ShieldAlert className="w-4 h-4 text-emerald-400" />
              <h3 className="font-medium text-slate-300">Permissions & Access Control</h3>
            </div>
            
            <div className="bg-slate-950/50 border border-slate-800 rounded-lg p-4 space-y-6">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wider">
                  Owner Admin User IDs (comma separated)
                </label>
                <input
                  type="text"
                  value={admins}
                  onChange={(e) => setAdmins(e.target.value)}
                  placeholder="123456789 (Full control)"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-emerald-500 font-mono text-sm transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wider">
                  Sudo User IDs (comma separated)
                </label>
                <input
                  type="text"
                  value={sudoUsers}
                  onChange={(e) => setSudoUsers(e.target.value)}
                  placeholder="987654321 (Limited control)"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-emerald-500 font-mono text-sm transition-colors"
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg border border-slate-800">
                <div>
                  <p className="text-sm font-medium text-slate-300">Public Commands</p>
                  <p className="text-xs text-slate-500">Allow all users to use public commands (/ans, /music, etc.)</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="sr-only peer" 
                    checked={publicCommands}
                    onChange={(e) => setPublicCommands(e.target.checked)}
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wider">
                    Global Whitelist (IDs)
                  </label>
                  <input
                    type="text"
                    value={whitelist}
                    onChange={(e) => setWhitelist(e.target.value)}
                    placeholder="IDs allowed to use bot"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-emerald-500 font-mono text-sm transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wider">
                    Global Blacklist (IDs)
                  </label>
                  <input
                    type="text"
                    value={blacklist}
                    onChange={(e) => setBlacklist(e.target.value)}
                    placeholder="IDs blocked from bot"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-red-500 font-mono text-sm transition-colors"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Anti-Spam Configuration */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <MessageSquareX className="w-4 h-4 text-red-400" />
              <h3 className="font-medium text-slate-300">Anti-Spam & Task Management</h3>
            </div>
            
            <div className="bg-slate-950/50 border border-slate-800 rounded-lg p-4 space-y-4">
              <p className="text-sm text-slate-400 leading-relaxed">
                Control how the bot handles multiple requests and frequent command usage.
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wider flex items-center gap-1">
                    <RotateCcw className="w-3 h-3" /> Global Cooldown (s)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={globalCooldown}
                    onChange={(e) => setGlobalCooldown(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-red-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wider flex items-center gap-1">
                    <ShieldAlert className="w-3 h-3" /> User Cooldown (s)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={userCooldown}
                    onChange={(e) => setUserCooldown(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-red-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wider flex items-center gap-1">
                    <ListFilter className="w-3 h-3" /> Max Concurrent
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={maxTasks}
                    onChange={(e) => setMaxTasks(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-red-500 transition-colors"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Video Downloader Configuration */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Video className="w-4 h-4 text-orange-400" />
              <h3 className="font-medium text-slate-300">Video Downloader</h3>
            </div>

            <div className="bg-slate-950/50 border border-slate-800 rounded-lg p-4 space-y-4">
              <p className="text-sm text-slate-400 leading-relaxed">
                Configure Donna's automatic YouTube, Shorts, Instagram Reel, and Instagram post downloader.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wider">
                    Max Video Size (MB)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={videoMaxMb}
                    onChange={(e) => setVideoMaxMb(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-orange-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wider">
                    Timeout (seconds)
                  </label>
                  <input
                    type="number"
                    min="10"
                    value={videoTimeoutSeconds}
                    onChange={(e) => setVideoTimeoutSeconds(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-orange-500 transition-colors"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Auto Delete Section */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Trash2 className="w-4 h-4 text-purple-400" />
              <h3 className="font-medium text-slate-300">Auto Delete Commands (Stealth Mode)</h3>
            </div>
            
            <div className="bg-slate-950/50 border border-slate-800 rounded-lg p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    Automatically delete command messages after processing to keep chats clean.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="sr-only peer" 
                    checked={autoDelete}
                    onChange={(e) => toggleAutoDelete(e.target.checked)}
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                </label>
              </div>

              {autoDelete && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wider">
                      Delete Delay (seconds)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={autoDeleteDelay}
                      onChange={(e) => setAutoDeleteDelay(e.target.value)}
                      placeholder="0 for instant"
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-purple-500 transition-colors"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">Time to wait before deleting the command.</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wider">
                      Chat Whitelist (IDs)
                    </label>
                    <input
                      type="text"
                      value={autoDeleteWhitelist}
                      onChange={(e) => setAutoDeleteWhitelist(e.target.value)}
                      placeholder="Optional CSV: -100123, -100456"
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-purple-500 transition-colors"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">Leave empty to auto-delete in ALL chats.</p>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Youtube Extractor Settings */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Key className="w-4 h-4 text-orange-400" />
              <h3 className="font-medium text-slate-300">YouTube Downloader Configuration</h3>
            </div>
            
            <div className="bg-slate-950/50 border border-slate-800 rounded-lg p-4 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-400 leading-relaxed">
                  Provide YouTube cookies in Netscape format to bypass "bot detected" errors.
                </p>
                {ytdlVersion && (
                   <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded font-mono">
                     yt-dlp: {ytdlVersion.trim()}
                   </span>
                )}
              </div>
              
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wider">
                  YouTube Cookies (youtube.txt content)
                </label>
                <textarea
                  value={cookies}
                  onChange={(e) => setCookies(e.target.value)}
                  placeholder="# Netscape HTTP Cookie File..."
                  rows={8}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-orange-500 font-mono text-xs transition-colors resize-none"
                />
              </div>
            </div>
          </section>

          <div className="pt-4 flex items-center justify-between border-t border-slate-800">
            <div className="space-y-1">
              {saved && (
                <span className="text-emerald-400 text-sm font-medium block">
                  Settings saved successfully!
                </span>
              )}
              {telegramStatus === 'connecting' && (
                <span className="text-sky-400 text-sm font-medium block animate-pulse">
                  ⏳ Connecting to Telegram...
                </span>
              )}
              {telegramStatus === 'connected' && (
                <span className="text-emerald-400 text-sm font-medium block">
                  ✅ Telegram connected successfully!
                </span>
              )}
              {telegramStatus === 'failed' && (
                <span className="text-red-400 text-sm font-medium block">
                  ❌ Telegram connection failed — check your API ID, Hash, and Session. See Dashboard logs for details.
                </span>
              )}
            </div>
            <button
              type="submit"
              disabled={telegramStatus === 'connecting'}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium py-2 px-6 rounded-lg transition-colors"
            >
              <Save className="w-4 h-4" />
              {telegramStatus === 'connecting' ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
