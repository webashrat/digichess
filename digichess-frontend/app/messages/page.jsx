'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Send } from 'lucide-react';
import { getMessages, listThreads, sendMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

function MessagesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const [threads, setThreads] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    listThreads()
      .then((data) => {
        const normalized = Array.isArray(data) ? data : data?.results || [];
        setThreads(normalized);
        const fromParam = searchParams.get('thread');
        if (fromParam) setSelectedId(Number(fromParam));
      })
      .catch(() => setError('Could not load conversations.'))
      .finally(() => setLoading(false));
  }, [searchParams]);

  useEffect(() => {
    if (!selectedId) return;
    getMessages(selectedId)
      .then((data) => {
        const normalized = Array.isArray(data) ? data : data?.results || data?.messages || [];
        setMessages(normalized);
      })
      .catch(() => setError('Could not load messages.'));
  }, [selectedId]);

  const handleSend = () => {
    if (!selectedId || !input.trim()) return;
    sendMessage(selectedId, { content: input.trim() })
      .then((msg) => {
        setInput('');
        setMessages((prev) => [...prev, msg]);
      })
      .catch(() => setError('Send failed.'));
  };

  const activeThread = useMemo(() => threads.find((t) => t.id === selectedId) || null, [threads, selectedId]);
  const activePartner = useMemo(() => {
    if (!activeThread) return null;
    const others = user ? activeThread.participants?.filter((p) => p.id !== user.id) : activeThread.participants;
    return others?.[0] || activeThread.participants?.[0] || null;
  }, [activeThread, user]);

  const title = useMemo(() => {
    if (!activeThread) return 'Messages';
    const others = user ? activeThread.participants?.filter((p) => p.id !== user.id).map((p) => p.username) : activeThread.participants?.map((p) => p.username);
    return others?.length ? `Chat with ${others.join(', ')}` : 'Messages';
  }, [activeThread, user]);

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <h1 className="text-2xl font-bold mb-4">Messages</h1>
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4 min-h-0">
        <section className="flex flex-col bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden min-h-0">
          <div className="bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center justify-between shrink-0">
            <button type="button" className="flex items-center gap-3 text-left" onClick={() => activePartner?.username && router.push(`/profile/${activePartner.username}`)}>
              <div className="w-10 h-10 rounded-full bg-slate-700 bg-cover bg-center shrink-0 flex items-center justify-center text-xs font-bold text-white" style={activePartner?.profile_pic ? { backgroundImage: `url('${activePartner.profile_pic}')` } : undefined}>
                {!activePartner?.profile_pic && (activePartner?.username?.slice(0, 2) || '??').toUpperCase()}
              </div>
              <div>
                <h3 className="font-bold text-sm">{title}</h3>
                <p className="text-xs text-slate-500 flex items-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${activePartner?.is_online ? 'bg-green-500' : 'bg-slate-400'}`} />
                  {activePartner?.is_online ? 'Online' : 'Offline'}
                </p>
              </div>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-100/50 dark:bg-[#0d121c]">
            {selectedId == null ? (
              <p className="text-sm text-slate-500">Select a conversation to start.</p>
            ) : messages.length === 0 ? (
              <p className="text-sm text-slate-500">No messages yet.</p>
            ) : (
              messages.map((msg) => {
                const mine = user && msg.sender?.id === user.id;
                const timeLabel = msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                return (
                  <div key={msg.id} className={`flex items-end gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
                    <button type="button" className="w-8 h-8 rounded-full bg-slate-700 bg-cover bg-center shrink-0 mb-1" style={msg.sender?.profile_pic ? { backgroundImage: `url('${msg.sender.profile_pic}')` } : undefined} onClick={() => msg.sender?.username && router.push(`/profile/${msg.sender.username}`)} />
                    <div className={`flex flex-col ${mine ? 'items-end' : 'items-start'} gap-1 max-w-[85%]`}>
                      {msg.sender?.username && (
                        <button type="button" className="text-[11px] font-semibold text-slate-500 hover:text-primary" onClick={() => router.push(`/profile/${msg.sender.username}`)}>
                          {mine ? 'You' : msg.sender.username}
                        </button>
                      )}
                      <div className={`p-3 rounded-2xl text-sm ${mine ? 'bg-primary text-white rounded-br-none' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-bl-none'}`}>
                        <p>{msg.content}</p>
                      </div>
                      <span className="text-[10px] text-slate-400">{timeLabel}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div className="p-3 bg-white dark:bg-surface-dark border-t border-slate-200 dark:border-slate-800 shrink-0">
            <div className="flex items-center gap-2">
              <input
                className="flex-1 rounded-full bg-slate-100 dark:bg-slate-900 border-none px-4 py-2.5 text-sm placeholder-slate-400 focus:ring-2 focus:ring-primary/50"
                placeholder={selectedId ? 'Type a message...' : 'Select a chat to start'}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                disabled={!selectedId}
              />
              <button type="button" className="p-2.5 bg-primary text-white rounded-full hover:bg-blue-600 disabled:opacity-60" onClick={handleSend} disabled={!selectedId}>
                <Send className="w-5 h-5" />
              </button>
            </div>
            {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
          </div>
        </section>
        <aside className="bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden flex flex-col min-h-0">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 text-sm font-semibold text-slate-600 dark:text-slate-300 shrink-0">
            Recent chats
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <p className="p-4 text-sm text-slate-500">Loading...</p>
            ) : threads.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">No conversations yet.</p>
            ) : (
              threads.map((thread) => {
                const others = user ? thread.participants?.filter((p) => p.id !== user.id) : thread.participants;
                const name = others?.length ? others.map((p) => p.username).join(', ') : 'Me';
                const avatar = others?.[0]?.profile_pic || '';
                const active = selectedId === thread.id;
                return (
                  <button
                    key={thread.id}
                    type="button"
                    onClick={() => setSelectedId(thread.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-slate-200/50 dark:border-slate-800/50 transition-colors ${active ? 'bg-primary/10' : 'hover:bg-slate-100 dark:hover:bg-slate-800/60'}`}
                  >
                    <div className="w-9 h-9 rounded-full bg-slate-200 dark:bg-slate-700 bg-cover bg-center shrink-0 flex items-center justify-center text-xs font-bold" style={avatar ? { backgroundImage: `url('${avatar}')` } : undefined}>
                      {!avatar ? name.slice(0, 2).toUpperCase() : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold truncate">{name}</div>
                      <div className="text-xs text-slate-500 truncate">{thread.last_message || 'Tap to open'}</div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

export default function MessagesPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-slate-500">Loading...</div>}>
      <MessagesPageContent />
    </Suspense>
  );
}
