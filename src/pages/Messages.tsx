import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { MessageSquarePlus, Trash2, Edit2, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';

export function Messages() {
  const { messages, addMessage, removeMessage } = useAppContext();
  const [newMessage, setNewMessage] = useState('');

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    addMessage(newMessage.trim());
    setNewMessage('');
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-1 space-y-6">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <MessageSquarePlus className="w-5 h-5 text-blue-400" />
            <h2 className="font-semibold text-lg">Add Message</h2>
          </div>
          
          <form onSubmit={handleAdd} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1.5">
                Message Content
              </label>
              <textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Enter promotional message, use emojis..."
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-slate-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all min-h-[120px] resize-y"
              />
              <p className="text-xs text-slate-500 mt-2">
                This message will be picked randomly during the automation cycle.
              </p>
            </div>
            <button 
              type="submit"
              disabled={!newMessage.trim()}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save Message
            </button>
          </form>
        </div>
      </div>

      <div className="lg:col-span-2">
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col h-full min-h-[500px]">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between shadow-sm bg-slate-900 z-10 shrink-0">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-slate-400" />
              <h2 className="font-semibold">Saved Messages ({messages.length})</h2>
            </div>
          </div>
          
          <div className="p-4 overflow-y-auto flex-1 space-y-3">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-3">
                <MessageSquare className="w-12 h-12 opacity-20" />
                <p>No messages configured yet.</p>
              </div>
            ) : (
              messages.map(msg => (
                <div key={msg.id} className="group flex items-start justify-between bg-slate-950/50 border border-slate-800 p-4 rounded-lg hover:border-slate-700 transition-colors">
                  <div className="flex-1 pr-4">
                    <p className="text-slate-200 whitespace-pre-wrap text-sm leading-relaxed">{msg.text}</p>
                    <p className="text-xs text-slate-500 mt-2">Added {format(msg.createdAt, 'MMM d, yyyy')}</p>
                  </div>
                  <button
                    onClick={() => removeMessage(msg.id)}
                    className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-md transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                    title="Delete Message"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
