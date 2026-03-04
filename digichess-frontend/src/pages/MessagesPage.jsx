import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AdBanner from '../components/common/AdBanner';
import Layout from '../components/layout/Layout';
import {
    createThread,
    fetchLeaderboard,
    fetchPublicAccount,
    getFriends,
    getMessages,
    listThreads,
    sendFriendRequest,
    sendMessage,
} from '../api';
import { useAuth } from '../context/AuthContext';

const socialTabs = [
    { id: 'friends', label: 'Friends', icon: 'group' },
    { id: 'players', label: 'Players', icon: 'public' },
    { id: 'messages', label: 'Messages', icon: 'chat' },
];
const chatEmojis = ['😀', '😂', '😍', '👍', '🔥', '🎯', '😢', '🙏', '♟️', '🏆'];

const formatLastSeen = (value) => {
    if (!value) return 'Last seen unknown';
    const last = new Date(value).getTime();
    if (Number.isNaN(last)) return 'Last seen unknown';
    const diffMs = Date.now() - last;
    if (diffMs < 60 * 1000) return 'Last seen just now';
    const minutes = Math.floor(diffMs / (60 * 1000));
    if (minutes < 60) return `Last seen ${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `Last seen ${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `Last seen ${days}d ago`;
};

const formatClock = (value) => {
    if (!value) return '';
    const time = new Date(value);
    if (Number.isNaN(time.getTime())) return '';
    return time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const getInitials = (name = '') => {
    const trimmed = String(name).trim();
    if (!trimmed) return '??';
    return trimmed.slice(0, 2).toUpperCase();
};

export default function MessagesPage() {
    const navigate = useNavigate();
    const { user, isAuthenticated } = useAuth();
    const [params, setParams] = useSearchParams();

    const [activeTab, setActiveTab] = useState('friends');
    const [searchTerm, setSearchTerm] = useState('');

    const [friends, setFriends] = useState([]);
    const [friendsLoading, setFriendsLoading] = useState(false);
    const [friendsError, setFriendsError] = useState('');

    const [players, setPlayers] = useState([]);
    const [playersLoading, setPlayersLoading] = useState(false);
    const [playersError, setPlayersError] = useState('');
    const [friendRequestState, setFriendRequestState] = useState({});

    const [threads, setThreads] = useState([]);
    const [threadsLoading, setThreadsLoading] = useState(true);
    const [selectedId, setSelectedId] = useState(null);

    const [messages, setMessages] = useState([]);
    const [messagesLoading, setMessagesLoading] = useState(false);
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const [error, setError] = useState('');
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const inputRef = useRef(null);
    const emojiPopoverRef = useRef(null);

    const threadFromQuery = useMemo(() => {
        const raw = Number(params.get('thread'));
        return Number.isFinite(raw) && raw > 0 ? raw : null;
    }, [params]);

    useEffect(() => {
        if (threadFromQuery) {
            setActiveTab('messages');
        }
    }, [threadFromQuery]);

    useEffect(() => {
        if (!showEmojiPicker) return undefined;
        const handleOutside = (event) => {
            if (!emojiPopoverRef.current?.contains(event.target)) {
                setShowEmojiPicker(false);
            }
        };
        document.addEventListener('mousedown', handleOutside);
        document.addEventListener('touchstart', handleOutside);
        return () => {
            document.removeEventListener('mousedown', handleOutside);
            document.removeEventListener('touchstart', handleOutside);
        };
    }, [showEmojiPicker]);

    const getThreadPartner = useCallback((thread) => {
        if (!thread || !Array.isArray(thread.participants)) return null;
        if (!thread.participants.length) return null;
        if (!user) return thread.participants[0];
        return thread.participants.find((participant) => participant.id !== user.id) || thread.participants[0];
    }, [user]);

    const loadThreads = useCallback(async () => {
        setThreadsLoading(true);
        try {
            const data = await listThreads();
            const normalized = Array.isArray(data) ? data : data?.results || [];
            setThreads(normalized);
            setSelectedId((current) => {
                if (threadFromQuery && normalized.some((thread) => thread.id === threadFromQuery)) {
                    return threadFromQuery;
                }
                if (current && normalized.some((thread) => thread.id === current)) {
                    return current;
                }
                return normalized[0]?.id || null;
            });
        } catch (err) {
            setError('Could not load conversations.');
        } finally {
            setThreadsLoading(false);
        }
    }, [threadFromQuery]);

    useEffect(() => {
        loadThreads();
    }, [loadThreads]);

    const loadMessages = useCallback(async (threadId) => {
        if (!threadId) return;
        setMessagesLoading(true);
        try {
            const data = await getMessages(threadId);
            const normalized = Array.isArray(data) ? data : data?.results || data?.messages || [];
            setMessages(normalized);
        } catch (err) {
            setError('Could not load messages.');
        } finally {
            setMessagesLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!selectedId) {
            setMessages([]);
            return;
        }
        loadMessages(selectedId);
    }, [selectedId, loadMessages]);

    useEffect(() => {
        if (activeTab !== 'friends') return;
        if (!isAuthenticated) {
            setFriends([]);
            return;
        }
        let active = true;
        const loadFriends = async () => {
            setFriendsLoading(true);
            setFriendsError('');
            try {
                const data = await getFriends();
                const raw = data?.results || (Array.isArray(data) ? data : []);
                const normalized = raw.map((friend) => (friend.user ? { ...friend.user, friendship_id: friend.id } : friend));
                const enriched = await Promise.all(
                    normalized.map(async (friend) => {
                        if (!friend?.username) return friend;
                        try {
                            const detail = await fetchPublicAccount(friend.username);
                            return {
                                ...friend,
                                is_playing: detail?.is_playing,
                                spectate_game_id: detail?.spectate_game_id,
                            };
                        } catch (err) {
                            return friend;
                        }
                    })
                );
                if (active) {
                    setFriends(enriched);
                }
            } catch (err) {
                if (active) {
                    setFriendsError('Could not load friends.');
                }
            } finally {
                if (active) {
                    setFriendsLoading(false);
                }
            }
        };

        loadFriends();
        return () => {
            active = false;
        };
    }, [activeTab, isAuthenticated]);

    useEffect(() => {
        if (activeTab !== 'players') return;
        let active = true;
        const loadPlayers = async () => {
            setPlayersLoading(true);
            setPlayersError('');
            try {
                const data = await fetchLeaderboard('blitz', 1, 100);
                const rows = Array.isArray(data?.results) ? data.results : [];
                if (active) {
                    setPlayers(rows);
                }
            } catch (err) {
                if (active) {
                    setPlayersError('Could not load players.');
                }
            } finally {
                if (active) {
                    setPlayersLoading(false);
                }
            }
        };
        loadPlayers();
        return () => {
            active = false;
        };
    }, [activeTab]);

    const filteredFriends = useMemo(() => {
        if (!searchTerm.trim()) return friends;
        const term = searchTerm.trim().toLowerCase();
        return friends.filter((friend) => friend.username?.toLowerCase().includes(term));
    }, [friends, searchTerm]);

    const playingFriends = filteredFriends.filter((friend) => friend.is_playing);
    const onlineFriends = filteredFriends.filter((friend) => !friend.is_playing && friend.is_online);
    const offlineFriends = filteredFriends.filter((friend) => !friend.is_playing && !friend.is_online);

    const filteredPlayers = useMemo(() => {
        if (!searchTerm.trim()) return players;
        const term = searchTerm.trim().toLowerCase();
        return players.filter((player) => player.username?.toLowerCase().includes(term));
    }, [players, searchTerm]);

    const filteredThreads = useMemo(() => {
        if (!searchTerm.trim()) return threads;
        const term = searchTerm.trim().toLowerCase();
        return threads.filter((thread) => {
            const partner = getThreadPartner(thread);
            const partnerName = partner?.username || '';
            const preview = thread?.last_message || '';
            return partnerName.toLowerCase().includes(term) || preview.toLowerCase().includes(term);
        });
    }, [threads, searchTerm, getThreadPartner]);

    const activeThread = useMemo(() => {
        if (!selectedId) return null;
        return threads.find((thread) => thread.id === selectedId) || null;
    }, [selectedId, threads]);

    const activePartner = useMemo(() => getThreadPartner(activeThread), [activeThread, getThreadPartner]);

    const messagesTitle = activePartner?.username
        ? `Chat with ${activePartner.username}`
        : 'Messages';

    const handleSelectThread = (threadId) => {
        setSelectedId(threadId);
        setActiveTab('messages');
        setError('');
        const next = new URLSearchParams(params);
        next.set('thread', String(threadId));
        setParams(next, { replace: true });
    };

    const handleOpenThreadWithUser = async (targetUser) => {
        if (!targetUser?.id) return;
        if (!isAuthenticated) {
            navigate('/login');
            return;
        }
        try {
            const thread = await createThread(targetUser.id);
            if (!thread?.id) return;
            setActiveTab('messages');
            setSelectedId(thread.id);
            setThreads((prev) => {
                if (prev.some((item) => item.id === thread.id)) {
                    return prev;
                }
                return [thread, ...prev];
            });
            const next = new URLSearchParams(params);
            next.set('thread', String(thread.id));
            setParams(next, { replace: true });
            setError('');
        } catch (err) {
            setError('Could not start chat.');
        }
    };

    const handleSendFriendRequest = async (targetUserId) => {
        if (!targetUserId) return;
        if (!isAuthenticated) {
            navigate('/login');
            return;
        }
        setFriendRequestState((prev) => ({ ...prev, [targetUserId]: 'loading' }));
        try {
            await sendFriendRequest(targetUserId);
            setFriendRequestState((prev) => ({ ...prev, [targetUserId]: 'sent' }));
        } catch (err) {
            setFriendRequestState((prev) => ({ ...prev, [targetUserId]: 'idle' }));
        }
    };

    const handleSend = async () => {
        const payload = input.trim();
        if (!selectedId || !payload || sending) return;
        setSending(true);
        try {
            const msg = await sendMessage(selectedId, { content: payload });
            setInput('');
            setShowEmojiPicker(false);
            setMessages((prev) => [...prev, msg]);
            setThreads((prev) => prev.map((thread) => (
                thread.id === selectedId
                    ? { ...thread, last_message: payload, last_message_at: msg?.created_at || thread.last_message_at }
                    : thread
            )));
        } catch (err) {
            setError('Send failed.');
        } finally {
            setSending(false);
        }
    };

    const handleEmojiPick = (emoji) => {
        setInput((prev) => `${prev}${emoji}`);
        setShowEmojiPicker(false);
        inputRef.current?.focus();
    };

    const handleProfileClick = (username) => {
        if (!username) return;
        navigate(`/profile/${username}`);
    };

    const openChallengeForm = (target) => {
        if (!target?.id || !target?.username) return;
        navigate(`/?opponent=${target.id}&username=${encodeURIComponent(target.username)}`);
    };

    const searchMeta = {
        friends: {
            placeholder: 'Search friends',
            icon: 'group',
        },
        players: {
            placeholder: 'Search players',
            icon: 'public',
        },
        messages: {
            placeholder: 'Search chats',
            icon: 'chat',
        },
    };
    const searchConfig = searchMeta[activeTab] || searchMeta.friends;
    const searchPlaceholder = searchConfig.placeholder;
    const showClearSearch = searchTerm.trim().length > 0;

    return (
        <Layout showHeader={false}>
            <div className="flex flex-col h-full bg-background-light dark:bg-background-dark">
                <header className="sticky top-0 z-40 bg-gradient-to-b from-background-light/95 to-background-light/90 dark:from-background-dark/95 dark:to-background-dark/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-sm">
                    <div className="px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                            <h1 className="text-xl font-bold tracking-tight">Social</h1>
                        </div>
                        <div className="mt-3 grid w-full max-w-md grid-cols-3 gap-2">
                            {socialTabs.map((tab) => (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`inline-flex h-11 w-full min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-2 py-2 text-xs sm:text-sm font-semibold transition-colors ${
                                        activeTab === tab.id
                                            ? 'bg-primary text-white shadow-md shadow-primary/25'
                                            : 'bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                                    }`}
                                >
                                    <span className="material-symbols-outlined text-sm">{tab.icon}</span>
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                        <div className="mt-3 max-w-md">
                            <label className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/95 px-2 py-1.5 shadow-sm focus-within:ring-2 focus-within:ring-primary/35 focus-within:border-primary/40 transition-all">
                                <span className="inline-flex size-7 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300">
                                    <span className="material-symbols-outlined text-[16px]">{searchConfig.icon}</span>
                                </span>
                                <input
                                    value={searchTerm}
                                    onChange={(event) => setSearchTerm(event.target.value)}
                                    placeholder={searchPlaceholder}
                                    className="flex-1 bg-transparent pr-2 text-[13px] text-slate-700 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
                                    autoComplete="off"
                                    onKeyDown={(event) => {
                                        if (event.key === 'Escape') {
                                            setSearchTerm('');
                                        }
                                    }}
                                />
                                {showClearSearch ? (
                                    <button
                                        type="button"
                                        onClick={() => setSearchTerm('')}
                                        className="size-6 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                                        aria-label="Clear search"
                                    >
                                        <span className="material-symbols-outlined text-[16px]">close</span>
                                    </button>
                                ) : null}
                            </label>
                        </div>
                    </div>
                </header>

                <main className="flex-1 px-4 py-4 pb-24 overflow-y-auto no-scrollbar">
                    <div className="w-full">
                        {activeTab === 'friends' ? (
                            <div className="space-y-4">
                                {!isAuthenticated ? (
                                    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 text-sm text-slate-500">
                                        Sign in to manage your friends.
                                    </div>
                                ) : friendsLoading ? (
                                    <div className="text-sm text-slate-500">Loading friends...</div>
                                ) : (
                                    <>
                                        {friendsError ? <div className="text-sm text-red-500">{friendsError}</div> : null}
                                        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-surface-light dark:bg-surface-dark overflow-hidden">
                                            <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-900/70 border-b border-slate-200 dark:border-slate-800">
                                                <h2 className="text-xs uppercase tracking-[0.14em] font-bold text-amber-600 dark:text-amber-400">Currently Playing</h2>
                                            </div>
                                            <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                                {playingFriends.length ? playingFriends.map((friend) => (
                                                    <div key={friend.id} className="px-4 py-3 flex items-center justify-between gap-3">
                                                        <button
                                                            type="button"
                                                            className="flex items-center gap-3 min-w-0 text-left"
                                                            onClick={() => handleProfileClick(friend.username)}
                                                        >
                                                            <div
                                                                className="size-11 rounded-full bg-slate-300 dark:bg-slate-700 bg-cover bg-center flex items-center justify-center text-xs font-bold text-slate-800 dark:text-slate-100"
                                                                style={friend.profile_pic ? { backgroundImage: `url('${friend.profile_pic}')` } : undefined}
                                                            >
                                                                {!friend.profile_pic ? getInitials(friend.username) : null}
                                                            </div>
                                                            <div className="min-w-0">
                                                                <div className="text-sm font-semibold truncate">{friend.username}</div>
                                                                <div className="text-xs text-amber-600 dark:text-amber-400 truncate">In live game</div>
                                                            </div>
                                                        </button>
                                                        <div className="flex items-center gap-1">
                                                            <button
                                                                type="button"
                                                                className="p-2 rounded-full text-slate-500 hover:text-primary hover:bg-primary/10"
                                                                onClick={() => {
                                                                    if (friend.spectate_game_id) {
                                                                        navigate(`/game/${friend.spectate_game_id}`);
                                                                    }
                                                                }}
                                                                title="Spectate"
                                                            >
                                                                <span className="material-symbols-outlined">visibility</span>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="p-2 rounded-full text-slate-500 hover:text-primary hover:bg-primary/10"
                                                                onClick={() => handleOpenThreadWithUser(friend)}
                                                                title="Message"
                                                            >
                                                                <span className="material-symbols-outlined">chat</span>
                                                            </button>
                                                        </div>
                                                    </div>
                                                )) : (
                                                    <div className="px-4 py-3 text-xs text-slate-500">No friends currently playing.</div>
                                                )}
                                            </div>

                                            <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-900/70 border-y border-slate-200 dark:border-slate-800">
                                                <h2 className="text-xs uppercase tracking-[0.14em] font-bold text-green-600 dark:text-green-400">Online</h2>
                                            </div>
                                            <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                                {onlineFriends.length ? onlineFriends.map((friend) => (
                                                    <div key={friend.id} className="px-4 py-3 flex items-center justify-between gap-3">
                                                        <button
                                                            type="button"
                                                            className="flex items-center gap-3 min-w-0 text-left"
                                                            onClick={() => handleProfileClick(friend.username)}
                                                        >
                                                            <div
                                                                className="size-11 rounded-full bg-slate-300 dark:bg-slate-700 bg-cover bg-center flex items-center justify-center text-xs font-bold text-slate-800 dark:text-slate-100"
                                                                style={friend.profile_pic ? { backgroundImage: `url('${friend.profile_pic}')` } : undefined}
                                                            >
                                                                {!friend.profile_pic ? getInitials(friend.username) : null}
                                                            </div>
                                                            <div className="min-w-0">
                                                                <div className="text-sm font-semibold truncate">{friend.username}</div>
                                                                <div className="text-xs text-green-600 dark:text-green-400 truncate">Online now</div>
                                                            </div>
                                                        </button>
                                                        <div className="flex items-center gap-1">
                                                            <button
                                                                type="button"
                                                                className="p-2 rounded-full text-slate-500 hover:text-primary hover:bg-primary/10"
                                                                onClick={() => openChallengeForm(friend)}
                                                                title="Challenge"
                                                            >
                                                                <span className="material-symbols-outlined">swords</span>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="p-2 rounded-full text-slate-500 hover:text-primary hover:bg-primary/10"
                                                                onClick={() => handleOpenThreadWithUser(friend)}
                                                                title="Message"
                                                            >
                                                                <span className="material-symbols-outlined">chat</span>
                                                            </button>
                                                        </div>
                                                    </div>
                                                )) : (
                                                    <div className="px-4 py-3 text-xs text-slate-500">No friends online.</div>
                                                )}
                                            </div>

                                            <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-900/70 border-y border-slate-200 dark:border-slate-800">
                                                <h2 className="text-xs uppercase tracking-[0.14em] font-bold text-slate-500">Offline</h2>
                                            </div>
                                            <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                                {offlineFriends.length ? offlineFriends.map((friend) => (
                                                    <div key={friend.id} className="px-4 py-3 flex items-center justify-between gap-3">
                                                        <button
                                                            type="button"
                                                            className="flex items-center gap-3 min-w-0 text-left"
                                                            onClick={() => handleProfileClick(friend.username)}
                                                        >
                                                            <div
                                                                className="size-11 rounded-full bg-slate-300 dark:bg-slate-700 bg-cover bg-center flex items-center justify-center text-xs font-bold text-slate-800 dark:text-slate-100 grayscale"
                                                                style={friend.profile_pic ? { backgroundImage: `url('${friend.profile_pic}')` } : undefined}
                                                            >
                                                                {!friend.profile_pic ? getInitials(friend.username) : null}
                                                            </div>
                                                            <div className="min-w-0">
                                                                <div className="text-sm font-semibold truncate">{friend.username}</div>
                                                                <div className="text-xs text-slate-500 truncate">{formatLastSeen(friend.last_seen_at)}</div>
                                                            </div>
                                                        </button>
                                                        <div className="flex items-center gap-1">
                                                            <button
                                                                type="button"
                                                                className="p-2 rounded-full text-slate-500 hover:text-primary hover:bg-primary/10"
                                                                onClick={() => openChallengeForm(friend)}
                                                                title="Challenge"
                                                            >
                                                                <span className="material-symbols-outlined">swords</span>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="p-2 rounded-full text-slate-500 hover:text-primary hover:bg-primary/10"
                                                                onClick={() => handleOpenThreadWithUser(friend)}
                                                                title="Message"
                                                            >
                                                                <span className="material-symbols-outlined">chat</span>
                                                            </button>
                                                        </div>
                                                    </div>
                                                )) : (
                                                    <div className="px-4 py-3 text-xs text-slate-500">No offline friends.</div>
                                                )}
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        ) : null}

                        {activeTab === 'players' ? (
                            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-surface-light dark:bg-surface-dark overflow-hidden">
                                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                                    <h2 className="text-sm font-bold">Top Players</h2>
                                </div>
                                {playersLoading ? (
                                    <div className="p-4 text-sm text-slate-500">Loading players...</div>
                                ) : playersError ? (
                                    <div className="p-4 text-sm text-red-500">{playersError}</div>
                                ) : (
                                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {filteredPlayers.map((player, index) => {
                                            const requestState = friendRequestState[player.id] || 'idle';
                                            const isSelf = user?.id === player.id;
                                            return (
                                                <div key={player.id || index} className="px-4 py-3 flex items-center justify-between gap-3">
                                                    <button
                                                        type="button"
                                                        className="flex items-center gap-3 min-w-0 text-left"
                                                        onClick={() => handleProfileClick(player.username)}
                                                    >
                                                        <div
                                                            className="size-11 rounded-full bg-slate-300 dark:bg-slate-700 bg-cover bg-center flex items-center justify-center text-xs font-bold text-slate-800 dark:text-slate-100"
                                                            style={player.profile_pic ? { backgroundImage: `url('${player.profile_pic}')` } : undefined}
                                                        >
                                                            {!player.profile_pic ? getInitials(player.username) : null}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <div className="text-sm font-semibold truncate">{player.username}</div>
                                                            <div className="text-xs text-slate-500 truncate">
                                                                Blitz {player.rating_blitz || player.rating || '--'}
                                                            </div>
                                                        </div>
                                                    </button>
                                                    {!isSelf ? (
                                                        <div className="flex items-center gap-1">
                                                            <button
                                                                type="button"
                                                                className={`p-2 rounded-full ${
                                                                    requestState === 'sent'
                                                                        ? 'text-green-600 bg-green-500/10'
                                                                        : 'text-slate-500 hover:text-primary hover:bg-primary/10'
                                                                }`}
                                                                onClick={() => handleSendFriendRequest(player.id)}
                                                                title={requestState === 'sent' ? 'Request sent' : 'Add friend'}
                                                            >
                                                                <span className="material-symbols-outlined">
                                                                    {requestState === 'sent' ? 'check' : 'person_add'}
                                                                </span>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="p-2 rounded-full text-slate-500 hover:text-primary hover:bg-primary/10"
                                                                onClick={() => handleOpenThreadWithUser(player)}
                                                                title="Message"
                                                            >
                                                                <span className="material-symbols-outlined">chat</span>
                                                            </button>
                                                        </div>
                                                    ) : null}
                                                </div>
                                            );
                                        })}
                                        {!filteredPlayers.length ? (
                                            <div className="px-4 py-3 text-xs text-slate-500">No players found.</div>
                                        ) : null}
                                    </div>
                                )}
                            </div>
                        ) : null}
                        {activeTab === 'messages' ? (
                            <div className="grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] gap-4 min-h-[560px]">
                                <aside className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-surface-light dark:bg-surface-dark overflow-hidden">
                                    <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 text-sm font-bold">
                                        Conversations
                                    </div>
                                    <div className="max-h-[640px] overflow-y-auto">
                                        {threadsLoading ? (
                                            <div className="p-4 text-sm text-slate-500">Loading chats...</div>
                                        ) : filteredThreads.length ? (
                                            filteredThreads.map((thread) => {
                                                const partner = getThreadPartner(thread);
                                                const isActive = thread.id === selectedId;
                                                return (
                                                    <button
                                                        key={thread.id}
                                                        type="button"
                                                        onClick={() => handleSelectThread(thread.id)}
                                                        className={`w-full px-4 py-3 border-b border-slate-100 dark:border-slate-800 text-left transition-colors ${
                                                            isActive
                                                                ? 'bg-primary/10'
                                                                : 'hover:bg-slate-100 dark:hover:bg-slate-800/70'
                                                        }`}
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <div
                                                                className="size-11 rounded-full bg-slate-300 dark:bg-slate-700 bg-cover bg-center flex items-center justify-center text-xs font-bold text-slate-800 dark:text-slate-100 shrink-0"
                                                                style={partner?.profile_pic ? { backgroundImage: `url('${partner.profile_pic}')` } : undefined}
                                                            >
                                                                {!partner?.profile_pic ? getInitials(partner?.username) : null}
                                                            </div>
                                                            <div className="min-w-0 flex-1">
                                                                <div className="flex items-center justify-between gap-2">
                                                                    <span className="text-sm font-semibold truncate">
                                                                        {partner?.username || 'Unknown'}
                                                                    </span>
                                                                    <span className="text-[10px] text-slate-400 shrink-0">
                                                                        {formatClock(thread?.last_message_at)}
                                                                    </span>
                                                                </div>
                                                                <div className="text-xs text-slate-500 truncate">
                                                                    {thread?.last_message || 'Tap to open'}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </button>
                                                );
                                            })
                                        ) : (
                                            <div className="p-4 text-sm text-slate-500">No conversations yet.</div>
                                        )}
                                    </div>
                                    <div className="p-2 hidden lg:block">
                                        <AdBanner format="auto" className="rounded-lg overflow-hidden" />
                                    </div>
                                </aside>

                                <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-surface-light dark:bg-surface-dark overflow-hidden flex flex-col min-h-[560px]">
                                    {activeThread ? (
                                        <>
                                            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80 flex items-center justify-between gap-3">
                                                <button
                                                    type="button"
                                                    className="flex items-center gap-3 min-w-0 text-left"
                                                    onClick={() => handleProfileClick(activePartner?.username)}
                                                >
                                                    <div className="relative shrink-0">
                                                        <div
                                                            className="size-10 rounded-full bg-slate-300 dark:bg-slate-700 bg-cover bg-center flex items-center justify-center text-xs font-bold text-slate-800 dark:text-slate-100 ring-2 ring-white dark:ring-slate-700 shadow-sm"
                                                            style={activePartner?.profile_pic ? { backgroundImage: `url('${activePartner.profile_pic}')` } : undefined}
                                                        >
                                                            {!activePartner?.profile_pic ? getInitials(activePartner?.username) : null}
                                                        </div>
                                                        <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-surface-light dark:border-surface-dark ${activePartner?.is_online ? 'bg-green-500' : 'bg-gray-400'}`} />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <h3 className="text-sm font-bold truncate leading-tight">{messagesTitle}</h3>
                                                        <div className="flex items-center gap-1">
                                                            {activePartner?.is_online ? (
                                                                <span className="text-xs text-green-600 dark:text-green-400 font-medium">Online</span>
                                                            ) : (
                                                                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Offline</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </button>
                                                <button
                                                    type="button"
                                                    className="p-2 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                                                    onClick={() => activePartner?.username && handleProfileClick(activePartner.username)}
                                                    title="Open profile"
                                                >
                                                    <span className="material-symbols-outlined">person</span>
                                                </button>
                                            </div>

                                            <div className="flex-1 overflow-y-auto bg-slate-100/50 dark:bg-[#0d121c] px-4 py-4 space-y-4 overscroll-contain">
                                                {messagesLoading ? (
                                                    <div className="text-sm text-slate-500">Loading messages...</div>
                                                ) : messages.length === 0 ? (
                                                    <div className="flex flex-col items-center justify-center h-full text-center">
                                                        <span className="material-symbols-outlined text-4xl text-slate-300 dark:text-slate-600 mb-2">chat_bubble_outline</span>
                                                        <p className="text-sm text-slate-500">No messages yet. Say hello!</p>
                                                    </div>
                                                ) : (
                                                    messages.map((msg, msgIndex) => {
                                                        const mine = Boolean(user && msg.sender?.id === user.id);
                                                        const timeLabel = formatClock(msg.created_at);
                                                        const showDateSep = msgIndex === 0 || (
                                                            new Date(msg.created_at).toDateString() !== new Date(messages[msgIndex - 1]?.created_at).toDateString()
                                                        );
                                                        return (
                                                            <React.Fragment key={msg.id}>
                                                                {showDateSep ? (
                                                                    <div className="flex justify-center my-2">
                                                                        <span className="text-[10px] font-bold text-slate-400 bg-slate-200/50 dark:bg-slate-800/50 px-3 py-1 rounded-full uppercase tracking-wider">
                                                                            {new Date(msg.created_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                                                                        </span>
                                                                    </div>
                                                                ) : null}
                                                                {mine ? (
                                                                    <div className="flex flex-row-reverse items-end gap-2">
                                                                        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-[9px] font-bold shrink-0 mb-1 shadow-md">ME</div>
                                                                        <div className="flex flex-col items-end gap-1 max-w-[82%]">
                                                                            <div className="bg-primary text-white p-3 rounded-2xl rounded-br-none shadow-md shadow-primary/20 text-sm">
                                                                                <p className="leading-relaxed break-words whitespace-pre-wrap">{msg.content}</p>
                                                                            </div>
                                                                            <div className="flex items-center gap-1 mr-1">
                                                                                <span className="text-[10px] text-slate-400">{timeLabel}</span>
                                                                                <span className="material-symbols-outlined text-primary text-[14px]">done_all</span>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    <div className="flex items-end gap-2">
                                                                        <div
                                                                            className="w-8 h-8 rounded-full bg-slate-300 dark:bg-slate-700 bg-cover bg-center shrink-0 mb-1 ring-1 ring-slate-200 dark:ring-slate-700 flex items-center justify-center text-[9px] font-bold text-slate-600 dark:text-slate-300"
                                                                            style={activePartner?.profile_pic ? { backgroundImage: `url('${activePartner.profile_pic}')` } : undefined}
                                                                        >
                                                                            {!activePartner?.profile_pic ? getInitials(activePartner?.username) : null}
                                                                        </div>
                                                                        <div className="flex flex-col items-start gap-1 max-w-[82%]">
                                                                            <div className="bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 p-3 rounded-2xl rounded-bl-none shadow-sm border border-slate-200 dark:border-slate-700 text-sm">
                                                                                <p className="leading-relaxed break-words whitespace-pre-wrap">{msg.content}</p>
                                                                            </div>
                                                                            <span className="text-[10px] text-slate-400 ml-1">{timeLabel}</span>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </React.Fragment>
                                                        );
                                                    })
                                                )}
                                            </div>

                                            <div className="p-3 bg-white dark:bg-surface-dark border-t border-slate-200 dark:border-slate-800 z-10">
                                                <div className="flex items-center gap-2">
                                                    <div className="relative shrink-0" ref={emojiPopoverRef}>
                                                        <button
                                                            type="button"
                                                            className="p-2 text-slate-400 hover:text-primary transition-colors rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
                                                            onClick={() => setShowEmojiPicker((prev) => !prev)}
                                                            title="Add emoji"
                                                        >
                                                            <span className="material-symbols-outlined">add_circle</span>
                                                        </button>
                                                        {showEmojiPicker ? (
                                                            <div className="absolute bottom-12 left-0 z-20 w-56 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 shadow-xl">
                                                                <div className="grid grid-cols-5 gap-1">
                                                                    {chatEmojis.map((emoji) => (
                                                                        <button
                                                                            key={emoji}
                                                                            type="button"
                                                                            className="h-9 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-xl leading-none"
                                                                            onClick={() => handleEmojiPick(emoji)}
                                                                        >
                                                                            {emoji}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                    <div className="flex-1 relative">
                                                        <input
                                                            ref={inputRef}
                                                            type="text"
                                                            className="w-full pl-4 pr-10 py-2.5 rounded-full bg-slate-100 dark:bg-slate-900 border-none focus:ring-2 focus:ring-primary/50 text-sm placeholder-slate-400 dark:text-white"
                                                            placeholder="Type a message..."
                                                            value={input}
                                                            onChange={(event) => setInput(event.target.value)}
                                                            onKeyDown={(event) => {
                                                                if (event.key === 'Enter') {
                                                                    handleSend();
                                                                }
                                                                if (event.key === 'Escape') {
                                                                    setShowEmojiPicker(false);
                                                                }
                                                            }}
                                                        />
                                                        <button
                                                            type="button"
                                                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-primary transition-colors"
                                                            onClick={() => setShowEmojiPicker((prev) => !prev)}
                                                        >
                                                            <span className="material-symbols-outlined text-[20px]">sentiment_satisfied</span>
                                                        </button>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        className="p-2.5 bg-primary text-white rounded-full hover:bg-blue-600 transition-colors shadow-lg shadow-primary/30 flex items-center justify-center disabled:opacity-60"
                                                        onClick={handleSend}
                                                        disabled={!input.trim() || sending}
                                                    >
                                                        <span className="material-symbols-outlined text-[20px]">send</span>
                                                    </button>
                                                </div>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="flex-1 flex items-center justify-center text-center px-6">
                                            <div>
                                                <div className="text-4xl mb-2">💬</div>
                                                <h3 className="text-lg font-bold">Pick a conversation</h3>
                                                <p className="text-sm text-slate-500 mt-1">
                                                    Open any thread from the left to start chatting.
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </section>
                            </div>
                        ) : null}

                        {error ? (
                            <div className="mt-4 text-sm text-red-500">{error}</div>
                        ) : null}
                    </div>
                </main>
            </div>
        </Layout>
    );
}
