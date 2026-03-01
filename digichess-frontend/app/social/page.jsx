'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, Mail, Swords, Send } from 'lucide-react';
import {
    createThread,
    fetchPublicAccount,
    getFriends,
    getMessages,
    listThreads,
    sendMessage,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import useNotifications from '@/hooks/useNotifications';

function formatLastSeen(value) {
    if (!value) return 'Last seen unknown';
    const last = new Date(value).getTime();
    if (Number.isNaN(last)) return 'Last seen unknown';
    const diffMs = Date.now() - last;
    if (diffMs < 60000) return 'Last seen just now';
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 60) return `Last seen ${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `Last seen ${hours}h ago`;
    return `Last seen ${Math.floor(hours / 24)}d ago`;
}

function SocialPageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user, isAuthenticated } = useAuth();
    const [segment, setSegment] = useState('friends');


    // Friends state
    const [friends, setFriends] = useState([]);
    const [friendsError, setFriendsError] = useState(null);
    const [friendsLoading, setFriendsLoading] = useState(false);

    // Chat state
    const [threads, setThreads] = useState([]);
    const [selectedThreadId, setSelectedThreadId] = useState(null);
    const [messages, setMessages] = useState([]);
    const [chatInput, setChatInput] = useState('');
    const [chatError, setChatError] = useState('');
    const [chatLoading, setChatLoading] = useState(true);

    useNotifications({ pageSize: 10 });

    // Load friends
    useEffect(() => {
        if (segment !== 'friends' || !isAuthenticated) {
            setFriends([]);
            return;
        }
        let active = true;
        setFriendsError(null);
        setFriendsLoading(true);
        getFriends()
            .then(async (data) => {
                const raw = data?.results ?? (Array.isArray(data) ? data : []);
                const normalized = raw.map((f) => (f.user ? { ...f.user, friendship_id: f.id } : f));
                const enriched = await Promise.all(
                    normalized.map(async (friend) => {
                        if (!friend?.username) return friend;
                        try {
                            const detail = await fetchPublicAccount(friend.username);
                            return { ...friend, is_playing: detail?.is_playing, spectate_game_id: detail?.spectate_game_id };
                        } catch (_err) {
                            return friend;
                        }
                    })
                );
                if (active) setFriends(enriched);
            })
            .catch(() => { if (active) setFriendsError('Could not load friends.'); })
            .finally(() => { if (active) setFriendsLoading(false); });
        return () => { active = false; };
    }, [segment, isAuthenticated]);

    // Load threads for chat
    useEffect(() => {
        if (segment !== 'chat') return;
        setChatLoading(true);
        listThreads()
            .then((data) => {
                const normalized = Array.isArray(data) ? data : data?.results || [];
                setThreads(normalized);
                const fromParam = searchParams.get('thread');
                if (fromParam) setSelectedThreadId(Number(fromParam));
            })
            .catch(() => setChatError('Could not load conversations.'))
            .finally(() => setChatLoading(false));
    }, [segment, searchParams]);

    // Load messages for selected thread
    useEffect(() => {
        if (!selectedThreadId) return;
        getMessages(selectedThreadId)
            .then((data) => {
                const normalized = Array.isArray(data) ? data : data?.results || data?.messages || [];
                setMessages(normalized);
            })
            .catch(() => setChatError('Could not load messages.'));
    }, [selectedThreadId]);

    const handleSendMessage = () => {
        if (!selectedThreadId || !chatInput.trim()) return;
        sendMessage(selectedThreadId, { content: chatInput.trim() })
            .then((msg) => {
                setChatInput('');
                setMessages((prev) => [...prev, msg]);
            })
            .catch(() => setChatError('Send failed.'));
    };

    const playingFriends = friends.filter((f) => f.is_playing);
    const onlineFriends = friends.filter((f) => !f.is_playing && f.is_online);
    const offlineFriends = friends.filter((f) => !f.is_playing && !f.is_online);

    const activeThread = useMemo(() => threads.find((t) => t.id === selectedThreadId) || null, [threads, selectedThreadId]);
    const activePartner = useMemo(() => {
        if (!activeThread) return null;
        const others = user ? activeThread.participants?.filter((p) => p.id !== user.id) : activeThread.participants;
        return others?.[0] || activeThread.participants?.[0] || null;
    }, [activeThread, user]);
    const chatTitle = useMemo(() => {
        if (!activeThread) return 'Messages';
        const others = user ? activeThread.participants?.filter((p) => p.id !== user.id).map((p) => p.username) : activeThread.participants?.map((p) => p.username);
        return others?.length ? `Chat with ${others.join(', ')}` : 'Messages';
    }, [activeThread, user]);

    return (
        <div className="flex flex-col gap-6">
            <h1 className="text-2xl font-bold">Social</h1>

            {/* Tabs */}
            <div className="flex p-1 bg-slate-200 dark:bg-surface-dark rounded-xl w-full max-w-xs">
                <button
                    type="button"
                    className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${segment === 'friends' ? 'bg-primary text-white shadow' : 'text-slate-500 dark:text-slate-400'}`}
                    onClick={() => setSegment('friends')}
                >
                    Friends
                </button>
                <button
                    type="button"
                    className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${segment === 'chat' ? 'bg-primary text-white shadow' : 'text-slate-500 dark:text-slate-400'}`}
                    onClick={() => setSegment('chat')}
                >
                    Chat
                </button>
            </div>

            {/* Friends Tab */}
            {segment === 'friends' && (
                <div className="space-y-4">
                    {!isAuthenticated ? (
                        <p className="text-sm text-slate-500">Sign in to manage friends.</p>
                    ) : friendsLoading ? (
                        <p className="text-sm text-slate-500">Loading friends...</p>
                    ) : (
                        <>
                            {friendsError && <p className="text-sm text-red-500">{friendsError}</p>}
                            <div className="bg-surface-light dark:bg-surface-dark rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800">
                                <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" /> Playing now
                                    </h3>
                                </div>
                                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {playingFriends.length ? playingFriends.map((friend) => (
                                        <div key={friend.id} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800">
                                            <button type="button" className="flex items-center gap-3 text-left flex-1 min-w-0" onClick={() => router.push(`/profile/${friend.username}`)}>
                                                <div className="w-10 h-10 rounded-full bg-slate-700 bg-cover bg-center shrink-0" style={friend.profile_pic ? { backgroundImage: `url('${friend.profile_pic}')` } : undefined}>
                                                    {!friend.profile_pic && (friend.username?.slice(0, 2) || '??').toUpperCase()}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="font-semibold text-sm truncate">{friend.username}</p>
                                                    <p className="text-xs text-slate-500">In live game</p>
                                                </div>
                                            </button>
                                            <div className="flex gap-2 shrink-0">
                                                <button type="button" className="p-2 rounded-full hover:bg-primary/10 text-slate-400 hover:text-primary" onClick={() => friend.spectate_game_id && router.push(`/game/${friend.spectate_game_id}`)} title="Spectate">
                                                    <Eye className="w-5 h-5" />
                                                </button>
                                                <button type="button" className="p-2 rounded-full hover:bg-primary/10 text-slate-400 hover:text-primary" onClick={async () => { try { const t = await createThread(friend.id); if (t?.id) { setSelectedThreadId(t.id); setSegment('chat'); } } catch (_) { } }} title="Message">
                                                    <Mail className="w-5 h-5" />
                                                </button>
                                            </div>
                                        </div>
                                    )) : <div className="px-4 py-3 text-xs text-slate-500">No friends playing.</div>}
                                </div>
                                <div className="px-4 py-2 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-green-500" /> Online
                                    </h3>
                                </div>
                                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {onlineFriends.length ? onlineFriends.map((friend) => (
                                        <div key={friend.id} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800">
                                            <button type="button" className="flex items-center gap-3 text-left flex-1 min-w-0" onClick={() => router.push(`/profile/${friend.username}`)}>
                                                <div className="w-10 h-10 rounded-full bg-slate-700 bg-cover bg-center shrink-0" style={friend.profile_pic ? { backgroundImage: `url('${friend.profile_pic}')` } : undefined}>
                                                    {!friend.profile_pic && (friend.username?.slice(0, 2) || '??').toUpperCase()}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="font-semibold text-sm truncate">{friend.username}</p>
                                                    <p className="text-xs text-slate-500">{friend.rating_blitz ?? '--'} • Online</p>
                                                </div>
                                            </button>
                                            <div className="flex gap-2 shrink-0">
                                                <button type="button" className="p-2 rounded-full hover:bg-primary/10 text-primary" onClick={() => router.push(`/play?opponent=${friend.id}&username=${encodeURIComponent(friend.username || '')}`)} title="Challenge">
                                                    <Swords className="w-5 h-5" />
                                                </button>
                                                <button type="button" className="p-2 rounded-full hover:bg-primary/10 text-slate-400 hover:text-primary" onClick={async () => { try { const t = await createThread(friend.id); if (t?.id) { setSelectedThreadId(t.id); setSegment('chat'); } } catch (_) { } }} title="Message">
                                                    <Mail className="w-5 h-5" />
                                                </button>
                                            </div>
                                        </div>
                                    )) : <div className="px-4 py-3 text-xs text-slate-500">No friends online.</div>}
                                </div>
                                <div className="px-4 py-2 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-slate-400" /> Offline
                                    </h3>
                                </div>
                                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {offlineFriends.length ? offlineFriends.map((friend) => (
                                        <div key={friend.id} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 opacity-75">
                                            <button type="button" className="flex items-center gap-3 text-left flex-1 min-w-0" onClick={() => router.push(`/profile/${friend.username}`)}>
                                                <div className="w-10 h-10 rounded-full bg-slate-700 bg-cover bg-center grayscale shrink-0" style={friend.profile_pic ? { backgroundImage: `url('${friend.profile_pic}')` } : undefined}>
                                                    {!friend.profile_pic && (friend.username?.slice(0, 2) || '??').toUpperCase()}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="font-semibold text-sm truncate">{friend.username}</p>
                                                    <p className="text-xs text-slate-500">{formatLastSeen(friend.last_seen_at)}</p>
                                                </div>
                                            </button>
                                            <div className="flex gap-2 shrink-0">
                                                <button type="button" className="p-2 rounded-full hover:bg-primary/10 text-slate-400 hover:text-primary" onClick={() => router.push(`/play?opponent=${friend.id}&username=${encodeURIComponent(friend.username || '')}`)} title="Challenge">
                                                    <Swords className="w-5 h-5" />
                                                </button>
                                                <button type="button" className="p-2 rounded-full hover:bg-primary/10 text-slate-400 hover:text-primary" onClick={async () => { try { const t = await createThread(friend.id); if (t?.id) { setSelectedThreadId(t.id); setSegment('chat'); } } catch (_) { } }} title="Message">
                                                    <Mail className="w-5 h-5" />
                                                </button>
                                            </div>
                                        </div>
                                    )) : <div className="px-4 py-3 text-xs text-slate-500">No offline friends.</div>}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* Chat Tab */}
            {segment === 'chat' && (
                <div className="flex flex-col h-[calc(100vh-14rem)]">
                    <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4 min-h-0">
                        <section className="flex flex-col bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden min-h-0">
                            <div className="bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center justify-between shrink-0">
                                <button type="button" className="flex items-center gap-3 text-left" onClick={() => activePartner?.username && router.push(`/profile/${activePartner.username}`)}>
                                    <div className="w-10 h-10 rounded-full bg-slate-700 bg-cover bg-center shrink-0 flex items-center justify-center text-xs font-bold text-white" style={activePartner?.profile_pic ? { backgroundImage: `url('${activePartner.profile_pic}')` } : undefined}>
                                        {!activePartner?.profile_pic && (activePartner?.username?.slice(0, 2) || 'CH').toUpperCase()}
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-sm">{chatTitle}</h3>
                                        <p className="text-xs text-slate-500 flex items-center gap-1">
                                            <span className={`w-1.5 h-1.5 rounded-full ${activePartner?.is_online ? 'bg-green-500' : 'bg-slate-400'}`} />
                                            {activePartner?.is_online ? 'Online' : 'Offline'}
                                        </p>
                                    </div>
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-100/50 dark:bg-[#0d121c]">
                                {selectedThreadId == null ? (
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
                                        placeholder={selectedThreadId ? 'Type a message...' : 'Select a chat to start'}
                                        value={chatInput}
                                        onChange={(e) => setChatInput(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                                        disabled={!selectedThreadId}
                                    />
                                    <button type="button" className="p-2.5 bg-primary text-white rounded-full hover:bg-blue-600 disabled:opacity-60" onClick={handleSendMessage} disabled={!selectedThreadId}>
                                        <Send className="w-5 h-5" />
                                    </button>
                                </div>
                                {chatError && <p className="mt-2 text-xs text-red-500">{chatError}</p>}
                            </div>
                        </section>
                        <aside className="bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden flex flex-col min-h-0">
                            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 text-sm font-semibold text-slate-600 dark:text-slate-300 shrink-0">
                                Recent chats
                            </div>
                            <div className="flex-1 overflow-y-auto">
                                {chatLoading ? (
                                    <p className="p-4 text-sm text-slate-500">Loading...</p>
                                ) : threads.length === 0 ? (
                                    <p className="p-4 text-sm text-slate-500">No conversations yet.</p>
                                ) : (
                                    threads.map((thread) => {
                                        const others = user ? thread.participants?.filter((p) => p.id !== user.id) : thread.participants;
                                        const name = others?.length ? others.map((p) => p.username).join(', ') : 'Me';
                                        const avatar = others?.[0]?.profile_pic || '';
                                        const active = selectedThreadId === thread.id;
                                        return (
                                            <button
                                                key={thread.id}
                                                type="button"
                                                onClick={() => setSelectedThreadId(thread.id)}
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
            )}
        </div>
    );
}

export default function SocialPage() {
    return (
        <Suspense fallback={<div className="p-8 text-sm text-slate-500">Loading...</div>}>
            <SocialPageContent />
        </Suspense>
    );
}
