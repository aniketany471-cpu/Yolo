import React, { useState, useEffect } from 'react';
import { Download, Search, Music, Trash2, Loader2, PlayCircle, ShieldCheck, Activity, Layers } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { cn } from '../lib/utils';

interface ExportLog {
  id: string;
  filename: string;
  filepath: string;
  createdAt: number;
  type: string;
  status: string;
}

export function MusicDownloader() {
  const { logs, config } = useAppContext();
  const [exportsList, setExportsList] = useState<ExportLog[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetchExports();
    const interval = setInterval(fetchExports, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchExports = async () => {
    try {
      const res = await fetch('/api/exports');
      const data = await res.json();
      if (data.exports) {
        setExportsList(data.exports.filter((e: any) => e.type === 'music'));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSearchDownload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || isSearching) return;
    
    setIsSearching(true);
    try {
      const res = await fetch('/api/music/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      if (res.ok) {
        setQuery("");
        fetchExports();
      } else {
        const data = await res.json();
        alert(`Error: ${data.error}`);
      }
    } catch (e) {
      console.error("Download failed", e);
    } finally {
      setIsSearching(false);
    }
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/exports/${id}`, { method: 'DELETE' });
    fetchExports();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-100">Music Downloader</h2>
            <p className="text-slate-400">Search and download music directly to your Telegram bot.</p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 text-xs font-medium">
             <ShieldCheck className="w-3.5 h-3.5" />
             Anti-Bot Active
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          {/* Download Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <h3 className="font-semibold text-slate-200 mb-4 flex items-center gap-2">
              <Search className="w-5 h-5 text-indigo-400" />
              Download Song
            </h3>
            
            <form onSubmit={handleSearchDownload} className="flex flex-col gap-4">
               <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Song Name or URL</label>
                  <input
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="e.g. Ed Sheeran Perfect"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder:text-slate-500"
                  />
               </div>
               <button
                  type="submit"
                  disabled={isSearching || !query.trim()}
                  className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  {isSearching ? "Downloading..." : "Download & Send"}
                </button>
            </form>

            <div className="mt-8 p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-lg">
              <h4 className="text-sm font-medium text-indigo-400 mb-2">Userbot Commands</h4>
              <ul className="text-xs text-slate-300 space-y-1.5 list-disc pl-4">
                <li><code className="text-indigo-300">/music &lt;query&gt;</code> - Download song</li>
                <li><code className="text-indigo-300">/song &lt;query&gt;</code> - Alias for music</li>
              </ul>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <h3 className="font-semibold text-slate-200 mb-4 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              Spam Shield & Queue
            </h3>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded-lg">
                <div className="flex items-center gap-2">
                   <Activity className="w-4 h-4 text-emerald-500" />
                   <span className="text-xs text-slate-300">Protection Active</span>
                </div>
                <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded uppercase font-bold">Safe</span>
              </div>

              <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
                 <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-slate-300">
                       <Layers className="w-3.5 h-3.5 text-indigo-400" />
                       Task Queue
                    </div>
                    <span className="text-[10px] text-slate-500">Global Limit: {config.maxConcurrentTasks}</span>
                 </div>
                 <div className="text-[10px] text-slate-400 italic">
                    Tasks are processed sequentially to avoid Telegram flooding.
                 </div>
              </div>
            </div>
          </div>

          {/* Diagnostics Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <h3 className="font-semibold text-slate-200 mb-4 flex items-center gap-2">
              <Loader2 className="w-5 h-5 text-emerald-400" />
              YT Diagnostics
            </h3>
            
            <div className="space-y-3">
              {logs.filter(l => l.message.toLowerCase().includes('download') || l.message.toLowerCase().includes('youtubedl') || l.message.toLowerCase().includes('play-dl')).slice(0, 5).map(log => (
                <div key={log.id} className="text-[10px] p-2 bg-slate-950 border border-slate-800 rounded flex flex-col gap-1">
                   <div className="flex justify-between items-center opacity-50">
                     <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                     <span className={cn(
                        "uppercase font-bold text-[8px]",
                        log.type === 'error' ? "text-red-500" : log.type === 'warn' ? "text-orange-500" : "text-emerald-500"
                     )}>{log.type}</span>
                   </div>
                   <div className="text-slate-300 font-mono break-words leading-tight">{log.message}</div>
                </div>
              ))}
              {logs.filter(l => l.message.toLowerCase().includes('download') || l.message.toLowerCase().includes('youtubedl') || l.message.toLowerCase().includes('play-dl')).length === 0 && (
                <p className="text-xs text-slate-500 text-center py-4 italic">No recent diagnostics.</p>
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          {/* History Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl flex flex-col h-full min-h-[400px]">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-semibold text-slate-200">Download History</h3>
              <span className="text-xs font-medium px-2.5 py-1 bg-slate-800 text-slate-300 rounded-full">
                {exportsList.length} tracks
              </span>
            </div>
            
            <div className="flex-1 p-4 overflow-y-auto">
              {exportsList.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-3">
                  <PlayCircle className="w-12 h-12 stroke-1" />
                  <p>No music downloaded yet.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {exportsList.map((exp) => (
                    <div 
                      key={exp.id}
                      className="group flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-slate-800/30 border border-slate-800/50 rounded-lg hover:bg-slate-800/80 transition-colors gap-4"
                    >
                      <div className="flex items-start gap-3 overflow-hidden">
                        <div className="p-2 bg-indigo-500/10 rounded-lg shrink-0">
                          <Music className="w-5 h-5 text-indigo-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-200 truncate" title={exp.filename}>
                            {exp.filename}
                          </p>
                          <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                            <span>{new Date(exp.createdAt).toLocaleString()}</span>
                            <span>&bull;</span>
                            <span className="uppercase text-slate-500">MP3</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 shrink-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <a 
                          href={`/api/exports/download/${exp.id}`}
                          download
                          className="p-2 text-slate-400 hover:text-indigo-400 hover:bg-indigo-400/10 rounded-md transition-colors"
                          title="Download Audio"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                        <button 
                          onClick={() => handleDelete(exp.id)}
                          className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-md transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
