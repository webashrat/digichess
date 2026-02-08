import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import { getMessages, listThreads, sendMessage } from '../api';
import { useAuth } from '../context/AuthContext';

export default function MessagesPage() {
    const [threads, setThreads] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [params] = useSearchParams();
    const { user } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        setLoading(true);
        listThreads()
            .then((data) => {
                const normalized = Array.isArray(data) ? data : data?.results || [];
                setThreads(normalized);
                const fromParam = params.get('thread');
                if (fromParam) setSelectedId(Number(fromParam));
            })
            .catch(() => setError('Could not load conversations.'))
            .finally(() => setLoading(false));
    }, [params]);

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

    const activeThread = useMemo(() => {
        if (!selectedId) return null;
        return threads.find((t) => t.id === selectedId) || null;
    }, [threads, selectedId]);

    const activePartner = useMemo(() => {
        if (!activeThread) return null;
        const others = user ? activeThread.participants.filter((p) => p.id !== user.id) : activeThread.participants;
        return others[0] || activeThread.participants[0] || null;
    }, [activeThread, user]);

    const title = useMemo(() => {
        const thread = activeThread;
        if (!thread) return 'Messages';
        const others = user
            ? thread.participants.filter((p) => p.id !== user.id).map((p) => p.username).join(', ')
            : thread.participants.map((p) => p.username).join(', ');
        return others ? `Chat with ${others}` : 'Messages';
    }, [activeThread, user]);

    const handleProfileClick = (username) => {
        if (!username) return;
        navigate(`/profile/${username}`);
    };

    return (
        <Layout showHeader={false}>
            <div className="flex flex-col h-full bg-background-light dark:bg-background-dark">
                <header className="sticky top-0 z-40 bg-gradient-to-b from-background-light/95 to-background-light/90 dark:from-background-dark/95 dark:to-background-dark/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-sm px-4 py-3">
                    <div className="flex items-center justify-between">
                        <h1 className="text-lg font-bold">Messages</h1>
                        {threads.length ? (
                            <span className="text-xs text-slate-500">{threads.length} chats</span>
                        ) : null}
                    </div>
                </header>

                <main className="flex-1 px-4 py-4 pb-24">
                    <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4 h-full min-h-[520px]">
                        <section className="flex flex-col bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                            <div className="bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center justify-between">
                                <button
                                    type="button"
                                    className="flex items-center gap-3 text-left"
                                    onClick={() => handleProfileClick(activePartner?.username)}
                                >
                                    <div
                                        className="w-10 h-10 rounded-full bg-slate-700 bg-cover bg-center shadow-inner"
                                        style={activePartner?.profile_pic ? { backgroundImage: `url('${activePartner.profile_pic}')` } : undefined}
                                    />
                                    <div>
                                        <h3 className="font-bold text-sm leading-tight">{title}</h3>
                                        <div className="flex items-center gap-1 text-xs text-slate-500">
                                            <span className={`w-1.5 h-1.5 rounded-full ${activePartner?.is_online ? 'bg-green-500' : 'bg-slate-400'}`}></span>
                                            {activePartner?.is_online ? 'Online' : 'Offline'}
                                        </div>
                                    </div>
                                </button>
                                <button className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors" type="button">
                                    <span className="material-symbols-outlined">close</span>
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-100/50 dark:bg-[#0d121c]">
                                {selectedId == null ? (
                                    <div className="text-sm text-slate-500">Select a conversation to start.</div>
                                ) : messages.length === 0 ? (
                                    <div className="text-sm text-slate-500">No messages yet.</div>
                                ) : (
                                    messages.map((msg) => {
                                        const mine = user && msg.sender?.id === user.id;
                                        const timeLabel = msg.created_at
                                            ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                            : '';
                                        return (
                                            <div key={msg.id} className={`flex items-end gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
                                                <button
                                                    type="button"
                                                    className="w-8 h-8 rounded-full bg-slate-700 bg-cover bg-center shrink-0 mb-1 ring-1 ring-slate-200 dark:ring-slate-700"
                                                    style={msg.sender?.profile_pic ? { backgroundImage: `url('${msg.sender.profile_pic}')` } : undefined}
                                                    onClick={() => handleProfileClick(msg.sender?.username)}
                                                />
                                                <div className={`flex flex-col ${mine ? 'items-end' : 'items-start'} gap-1 max-w-[85%]`}>
                                                    {msg.sender?.username ? (
                                                        <button
                                                            type="button"
                                                            className="text-[11px] font-semibold text-slate-500 hover:text-primary"
                                                            onClick={() => handleProfileClick(msg.sender?.username)}
                                                        >
                                                            {mine ? 'You' : msg.sender.username}
                                                        </button>
                                                    ) : null}
                                                    <div className={`p-3 rounded-2xl text-sm border shadow-sm ${mine ? 'bg-primary text-white rounded-br-none shadow-primary/20' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 dark:text-slate-200 rounded-bl-none'}`}>
                                                        <p>{msg.content}</p>
                                                    </div>
                                                    <span className="text-[10px] text-slate-400">{timeLabel}</span>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>

                            <div className="p-3 bg-white dark:bg-surface-dark border-t border-slate-200 dark:border-slate-800">
                                <div className="flex items-center gap-2">
                                    <button className="p-2 text-slate-400 hover:text-primary transition-colors rounded-full hover:bg-slate-100 dark:hover:bg-slate-800" type="button">
                                        <span className="material-symbols-outlined">add_circle</span>
                                    </button>
                                    <div className="flex-1 relative">
                                        <input
                                            className="w-full pl-4 pr-10 py-2.5 rounded-full bg-slate-100 dark:bg-slate-900 border-none focus:ring-2 focus:ring-primary/50 text-sm placeholder-slate-400 dark:text-white"
                                            placeholder={selectedId ? 'Type a message...' : 'Select a chat to start'}
                                            type="text"
                                            value={input}
                                            onChange={(e) => setInput(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') handleSend();
                                            }}
                                            disabled={!selectedId}
                                        />
                                        <button className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-primary transition-colors" type="button">
                                            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>sentiment_satisfied</span>
                                        </button>
                                    </div>
                                    <button
                                        className="p-2.5 bg-primary text-white rounded-full hover:bg-blue-600 transition-colors shadow-lg shadow-primary/30 flex items-center justify-center disabled:opacity-60"
                                        type="button"
                                        onClick={handleSend}
                                        disabled={!selectedId}
                                    >
                                        <span className="material-symbols-outlined" style={{ fontSize: 20 }}>send</span>
                                    </button>
                                </div>
                            </div>
                            {error ? (
                                <div className="px-4 pb-3 text-xs text-red-500">{error}</div>
                            ) : null}
                        </section>

                        <aside className="bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 text-sm font-semibold text-slate-600 dark:text-slate-300">
                                Recent chats
                            </div>
                            <div className="max-h-[620px] overflow-y-auto">
                                {loading ? (
                                    <div className="p-4 text-sm text-slate-500">Loading...</div>
                                ) : threads.length === 0 ? (
                                    <div className="p-4 text-sm text-slate-500">No conversations yet.</div>
                                ) : (
                                    threads.map((thread) => {
                                        const others = user
                                            ? thread.participants.filter((p) => p.id !== user.id)
                                            : thread.participants;
                                        const name = others.length ? others.map((p) => p.username).join(', ') : 'Me';
                                        const avatar = others[0]?.profile_pic || '';
                                        const active = selectedId === thread.id;
                                        return (
                                            <button
                                                key={thread.id}
                                                type="button"
                                                onClick={() => setSelectedId(thread.id)}
                                                className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-slate-200/50 dark:border-slate-800/50 transition-colors ${
                                                    active ? 'bg-primary/10' : 'hover:bg-slate-100 dark:hover:bg-slate-800/60'
                                                }`}
                                            >
                                                <div
                                                    className="w-9 h-9 rounded-full bg-slate-200 dark:bg-slate-700 bg-cover bg-center flex items-center justify-center text-xs font-bold text-slate-700 dark:text-slate-200"
                                                    style={avatar ? { backgroundImage: `url('${avatar}')` } : undefined}
                                                >
                                                    {!avatar ? name.slice(0, 2).toUpperCase() : null}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="text-sm font-semibold truncate">{name}</div>
                                                    <div className="text-xs text-slate-500 truncate">
                                                        {thread.last_message || 'Tap to open'}
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })
                                )}
                            </div>
                        </aside>
                    </div>
                </main>
            </div>
        </Layout>
    );
}
