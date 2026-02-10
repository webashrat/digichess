import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import Podium from '../components/leaderboard/Podium';
import PlayerList from '../components/leaderboard/PlayerList';
import {
    acceptGame,
    acceptRematch,
    createThread,
    fetchDigiQuizLeaderboard,
    fetchLeaderboard,
    fetchPublicAccount,
    getFriends,
    rejectGame,
    rejectRematch,
    respondFriendRequest,
} from '../api';
import { useAuth } from '../context/AuthContext';
import useNotifications from '../hooks/useNotifications';
import { flagFor } from '../utils/countries';

export default function LeaderboardPage() {
    const navigate = useNavigate();
    const { isAuthenticated } = useAuth();
    const {
        unreadCount,
        notifications,
        markAllRead,
        removeNotification,
        page: notificationsPage,
        totalPages: notificationsTotalPages,
        total: notificationsTotal,
        setPage: setNotificationsPage,
    } = useNotifications({ pageSize: 10 });
    const [mode, setMode] = useState('blitz');
    const [players, setPlayers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [segment, setSegment] = useState('players');
    const [searchTerm, setSearchTerm] = useState('');
    const [showSearch, setShowSearch] = useState(false);
    const [showNotifications, setShowNotifications] = useState(false);
    const [notificationError, setNotificationError] = useState(null);
    const [friends, setFriends] = useState([]);
    const [friendsError, setFriendsError] = useState(null);
    const [friendsLoading, setFriendsLoading] = useState(false);

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            setError(null);
            try {
                const data = mode === 'digiquiz'
                    ? await fetchDigiQuizLeaderboard(1, 50)
                    : await fetchLeaderboard(mode, 1, 50);
                const mappedPlayers = data.results.map((player) => ({
                    id: player.id,
                    username: player.username,
                    rating: mode === 'digiquiz' ? player.rating_digiquiz : player.rating,
                    rating_blitz: player.rating_blitz,
                    avatar: player.profile_pic || "",
                    countryCode: player.country || "INT",
                    flag: player.country || "🏳️",
                    is_bot: player.is_bot,
                    digiquiz_correct: player.digiquiz_correct,
                    digiquiz_wrong: player.digiquiz_wrong,
                }));
                setPlayers(mappedPlayers);
            } catch (err) {
                setError("Failed to load leaderboard. Ensure backend is running.");
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [mode]);

    useEffect(() => {
        if (segment !== 'friends') return;
        if (!isAuthenticated) {
            setFriends([]);
            return;
        }
        let active = true;
        setFriendsError(null);
        setFriendsLoading(true);
        getFriends()
            .then(async (data) => {
                const raw = data?.results || (Array.isArray(data) ? data : []);
                const normalized = raw.map((f) => (f.user ? { ...f.user, friendship_id: f.id } : f));
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
                if (active) setFriends(enriched);
            })
            .catch(() => {
                if (active) setFriendsError('Could not load friends.');
            })
            .finally(() => {
                if (active) setFriendsLoading(false);
            });
        return () => {
            active = false;
        };
    }, [segment, isAuthenticated]);

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
    const podiumPlayers = filteredPlayers.slice(0, 3);
    const listPlayers = filteredPlayers.slice(3);

    const filterChips = ['Standard', 'Blitz', 'Bullet', 'Rapid', 'DigiQuiz'];
    const modeLabelMap = {
        classical: 'Standard',
        blitz: 'Blitz',
        bullet: 'Bullet',
        rapid: 'Rapid',
        digiquiz: 'DigiQuiz',
    };
    const activeChip = modeLabelMap[mode] || 'Blitz';

    const handleNotificationAction = async (notification, decision) => {
        if (!notification) return;
        try {
            if (notification.notification_type === 'game_challenge') {
                const gameId = notification.data?.game_id;
                if (gameId) {
                    if (decision === 'accept') {
                        await acceptGame(gameId);
                        navigate(`/game/${gameId}`);
                    } else {
                        await rejectGame(gameId);
                    }
                }
            }
            if (notification.notification_type === 'rematch_requested') {
                const gameId = notification.data?.original_game_id || notification.data?.game_id;
                if (gameId) {
                    if (decision === 'accept') {
                        const response = await acceptRematch(gameId);
                        if (response?.id) {
                            navigate(`/game/${response.id}`);
                        }
                    } else {
                        await rejectRematch(gameId);
                    }
                }
            }
            if (notification.notification_type === 'friend_request') {
                const requestId = notification.data?.friend_request_id;
                if (requestId) {
                    await respondFriendRequest(requestId, decision);
                }
            }
        } catch (err) {
            if (notification.notification_type === 'game_challenge' && decision === 'accept' && err?.status === 400) {
                setNotificationError('Challenge is no longer available.');
            }
        } finally {
            removeNotification(notification.id);
        }
    };

    const handleMessageFriend = async (friend) => {
        if (!friend?.id) return;
        try {
            const thread = await createThread(friend.id);
            if (thread?.id) {
                navigate(`/messages?thread=${thread.id}`);
            }
        } catch (err) {
            // ignore
        }
    };

    return (
        <Layout showHeader={false}>
            <div className="flex flex-col h-full bg-background-light dark:bg-background-dark">
                <header className="sticky top-0 z-50 bg-gradient-to-b from-background-light/95 to-background-light/90 dark:from-background-dark/95 dark:to-background-dark/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-sm">
                    <div className="flex items-center justify-between px-4 py-3">
                        <h1 className="text-xl font-bold tracking-tight">Social Hub</h1>
                        <div className="flex items-center gap-2">
                            {showSearch ? (
                                <input
                                    className="w-40 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1 text-xs text-slate-700 dark:text-slate-200"
                                    placeholder={segment === 'friends' ? 'Search friends' : 'Search players'}
                                    value={searchTerm}
                                    onChange={(event) => setSearchTerm(event.target.value)}
                                />
                            ) : null}
                            <button
                                className="flex items-center justify-center p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors text-slate-600 dark:text-slate-300"
                                type="button"
                                onClick={() => setShowSearch((prev) => !prev)}
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: 24 }}>search</span>
                            </button>
                            <button
                                className="relative flex items-center justify-center p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors text-slate-600 dark:text-slate-300"
                                type="button"
                                onClick={() => {
                                    setShowNotifications((prev) => {
                                        const next = !prev;
                                        if (next) {
                                            setNotificationsPage(1);
                                            setNotificationError(null);
                                        }
                                        return next;
                                    });
                                    markAllRead();
                                }}
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: 24 }}>notifications</span>
                                {unreadCount > 0 ? (
                                    <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-background-light dark:border-background-dark"></span>
                                ) : null}
                            </button>
                        </div>
                    </div>
                    <div className="px-4 pb-4">
                        <div className="flex p-1 bg-slate-200 dark:bg-surface-dark rounded-xl">
                            <button
                                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                                    segment === 'friends'
                                        ? 'bg-primary text-white shadow-lg shadow-primary/30'
                                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                                }`}
                                type="button"
                                onClick={() => setSegment('friends')}
                            >
                                Friends
                            </button>
                            <button
                                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                                    segment === 'players'
                                        ? 'bg-primary text-white shadow-lg shadow-primary/30'
                                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                                }`}
                                type="button"
                                onClick={() => setSegment('players')}
                            >
                                Players
                            </button>
                        </div>
                    </div>
                    {showNotifications ? (
                        <div className="px-4 pb-4">
                            <div className="bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <h4 className="text-sm font-semibold">Notifications</h4>
                                    <button
                                        className="p-1 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800"
                                        type="button"
                                        onClick={() => setShowNotifications(false)}
                                    >
                                        <span className="material-symbols-outlined text-base">close</span>
                                    </button>
                                </div>
                                {notificationError ? (
                                    <div className="mb-2 text-[11px] text-amber-500">{notificationError}</div>
                                ) : null}
                                {notifications.length ? (
                                    <div className="space-y-2 max-h-64 overflow-y-auto">
                                        {notifications.map((note) => (
                                            <div key={note.id} className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 text-xs">
                                                <div className="flex items-start justify-between gap-2">
                                                    <div>
                                                        <div className="font-semibold">{note.title || 'Notification'}</div>
                                                        <div className="text-slate-500 mt-1">{note.message || 'Update available.'}</div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        className="text-slate-400 hover:text-red-500"
                                                        onClick={() => removeNotification(note.id)}
                                                        title="Delete notification"
                                                    >
                                                        <span className="material-symbols-outlined text-base">delete</span>
                                                    </button>
                                                </div>
                                                {note.notification_type === 'game_challenge' ? (
                                                    <div className="flex gap-2 mt-2">
                                                        <button
                                                            className="px-2 py-1 rounded bg-primary text-white text-[10px] font-semibold"
                                                            type="button"
                                                            onClick={() => handleNotificationAction(note, 'accept')}
                                                        >
                                                            Accept
                                                        </button>
                                                        <button
                                                            className="px-2 py-1 rounded bg-slate-200 dark:bg-slate-700 text-[10px] font-semibold"
                                                            type="button"
                                                            onClick={() => handleNotificationAction(note, 'decline')}
                                                        >
                                                            Decline
                                                        </button>
                                                    </div>
                                                ) : null}
                                    {note.notification_type === 'rematch_requested' ? (
                                        <div className="flex gap-2 mt-2">
                                            <button
                                                className="px-2 py-1 rounded bg-primary text-white text-[10px] font-semibold"
                                                type="button"
                                                onClick={() => handleNotificationAction(note, 'accept')}
                                            >
                                                Accept
                                            </button>
                                            <button
                                                className="px-2 py-1 rounded bg-slate-200 dark:bg-slate-700 text-[10px] font-semibold"
                                                type="button"
                                                onClick={() => handleNotificationAction(note, 'decline')}
                                            >
                                                Decline
                                            </button>
                                        </div>
                                    ) : null}
                                                {note.notification_type === 'friend_request' ? (
                                                    <div className="flex gap-2 mt-2">
                                                        <button
                                                            className="px-2 py-1 rounded bg-primary text-white text-[10px] font-semibold"
                                                            type="button"
                                                            onClick={() => handleNotificationAction(note, 'accept')}
                                                        >
                                                            Accept
                                                        </button>
                                                        <button
                                                            className="px-2 py-1 rounded bg-slate-200 dark:bg-slate-700 text-[10px] font-semibold"
                                                            type="button"
                                                            onClick={() => handleNotificationAction(note, 'decline')}
                                                        >
                                                            Decline
                                                        </button>
                                                    </div>
                                                ) : null}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-xs text-slate-500">There are no notifications.</div>
                                )}
                                {notificationsTotal > 10 ? (
                                    <div className="mt-3 flex items-center justify-between text-[10px] text-slate-500">
                                        <button
                                            type="button"
                                            className="px-2 py-1 rounded-md bg-slate-200 dark:bg-slate-800 font-semibold disabled:opacity-50"
                                            onClick={() => setNotificationsPage((prev) => Math.max(1, prev - 1))}
                                            disabled={notificationsPage <= 1}
                                        >
                                            Prev
                                        </button>
                                        <div className="flex flex-col items-center gap-1">
                                            <div>
                                                Showing {(notificationsPage - 1) * 10 + 1}-{Math.min(notificationsTotal, notificationsPage * 10)} of {notificationsTotal}
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <span>Page</span>
                                                <input
                                                    type="number"
                                                    min={1}
                                                    max={notificationsTotalPages}
                                                    value={notificationsPage}
                                                    onChange={(event) => {
                                                        const value = Number(event.target.value);
                                                        if (!Number.isFinite(value)) return;
                                                        setNotificationsPage(Math.min(Math.max(1, value), notificationsTotalPages));
                                                    }}
                                                    className="w-12 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-1 py-0.5 text-center text-[10px]"
                                                />
                                                <span>of {notificationsTotalPages}</span>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            className="px-2 py-1 rounded-md bg-slate-200 dark:bg-slate-800 font-semibold disabled:opacity-50"
                                            onClick={() => setNotificationsPage((prev) => Math.min(notificationsTotalPages, prev + 1))}
                                            disabled={notificationsPage >= notificationsTotalPages}
                                        >
                                            Next
                                        </button>
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    ) : null}
                </header>

                <main className="flex-1 px-4 py-4 pb-24 space-y-6 overflow-y-auto no-scrollbar relative">
                    {segment === 'players' ? (
                        <div className="flex flex-col gap-3">
                            <div className="flex items-center justify-between">
                                <h2 className="text-lg font-bold">{mode === 'digiquiz' ? 'DigiQuiz Leaderboard' : 'Leaderboard'}</h2>
                            </div>
                            <div className="flex overflow-x-auto gap-2 no-scrollbar pb-1">
                                {filterChips.map((chip) => (
                                    <button
                                        key={chip}
                                        className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium ${
                                            chip === activeChip
                                                ? 'bg-primary text-white'
                                                : 'bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                                        }`}
                                        type="button"
                                        onClick={() => {
                                            if (chip !== activeChip) {
                                                if (chip === 'Standard') setMode('classical');
                                                if (chip === 'Blitz') setMode('blitz');
                                                if (chip === 'Bullet') setMode('bullet');
                                                if (chip === 'Rapid') setMode('rapid');
                                                if (chip === 'DigiQuiz') setMode('digiquiz');
                                            }
                                        }}
                                    >
                                        {chip}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : null}

                    {segment === 'players' ? (
                        <>
                            {loading ? (
                                <div className="text-xs text-slate-500">Updating leaderboard...</div>
                            ) : null}
                            {error ? (
                        <div className="flex justify-center items-center h-full flex-col gap-2">
                            <span className="text-red-500">{error}</span>
                            <button onClick={() => setMode(mode)} className="text-sm text-primary underline">Retry</button>
                        </div>
                    ) : (
                        <>
                            <Podium players={podiumPlayers} />
                            <PlayerList players={listPlayers} startRank={4} />
                        </>
                    )}
                        </>
                    ) : null}

                    {segment === 'friends' ? (
                        <div className="space-y-4">
                            {!isAuthenticated ? (
                                <div className="text-sm text-slate-500">Sign in to manage your friends.</div>
                            ) : friendsLoading ? (
                                <div className="text-sm text-slate-500">Loading friends...</div>
                            ) : (
                                <>
                                    {friendsError ? <div className="text-sm text-red-500">{friendsError}</div> : null}
                                    <div className="bg-surface-light dark:bg-surface-dark rounded-xl overflow-hidden shadow-sm border border-slate-200 dark:border-slate-800">
                                        <div className="bg-slate-50/50 dark:bg-slate-900/50 px-4 py-2 border-b border-slate-200 dark:border-slate-800">
                                            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></span>
                                                Currently Playing
                                            </h3>
                                        </div>
                                        <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                            {playingFriends.length ? playingFriends.map((friend) => (
                                                <div key={friend.id} className="group flex items-center justify-between px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                                                    <div
                                                        className="flex items-center gap-3 text-left flex-1"
                                                        role="button"
                                                        tabIndex={0}
                                                        onClick={() => navigate(`/profile/${friend.username}`)}
                                                        onKeyDown={(event) => {
                                                            if (event.key === 'Enter') navigate(`/profile/${friend.username}`);
                                                        }}
                                                    >
                                                        <div className="relative">
                                                            <div
                                                                className="w-10 h-10 rounded-full bg-slate-700 bg-cover bg-center flex items-center justify-center text-xs font-bold text-white"
                                                                style={friend.profile_pic ? { backgroundImage: `url('${friend.profile_pic}')` } : undefined}
                                                            >
                                                                {!friend.profile_pic ? friend.username?.slice(0, 2).toUpperCase() : null}
                                                            </div>
                                                            <div className="absolute -bottom-1 -right-1 bg-surface-light dark:bg-surface-dark rounded p-0.5">
                                                                <span className="text-xs">{flagFor(friend.country)}</span>
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="font-semibold text-sm dark:text-slate-200">{friend.username}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                                                <span className="font-medium text-slate-700 dark:text-slate-300">{friend.rating_blitz || friend.rating || '--'}</span>
                                                                <span>•</span>
                                                                <span className="text-yellow-600 dark:text-yellow-500">In live game</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            className="p-2 text-slate-400 hover:text-primary hover:bg-primary/10 rounded-full transition-all"
                                                            title="Spectate"
                                                            type="button"
                                                            onClick={(event) => {
                                                                event.stopPropagation();
                                                                if (friend.spectate_game_id) navigate(`/game/${friend.spectate_game_id}`);
                                                            }}
                                                        >
                                                            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>visibility</span>
                                                        </button>
                                                        <button
                                                            className="p-2 text-slate-400 hover:text-primary hover:bg-primary/10 rounded-full transition-all"
                                                            title="Message"
                                                            type="button"
                                                            onClick={(event) => {
                                                                event.stopPropagation();
                                                                handleMessageFriend(friend);
                                                            }}
                                                        >
                                                            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>mail</span>
                                                        </button>
                                                    </div>
                                                </div>
                                            )) : (
                                                <div className="px-4 py-3 text-xs text-slate-500">No friends currently playing.</div>
                                            )}
                                        </div>

                                        <div className="bg-slate-50/50 dark:bg-slate-900/50 px-4 py-2 border-b border-t border-slate-200 dark:border-slate-800">
                                            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                                                Online &amp; Available
                                            </h3>
                                        </div>
                                        <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                            {onlineFriends.length ? onlineFriends.map((friend) => (
                                                <div key={friend.id} className="group flex items-center justify-between px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                                                    <div
                                                        className="flex items-center gap-3 text-left flex-1"
                                                        role="button"
                                                        tabIndex={0}
                                                        onClick={() => navigate(`/profile/${friend.username}`)}
                                                        onKeyDown={(event) => {
                                                            if (event.key === 'Enter') navigate(`/profile/${friend.username}`);
                                                        }}
                                                    >
                                                        <div className="relative">
                                                            <div
                                                                className="w-10 h-10 rounded-full bg-slate-700 bg-cover bg-center flex items-center justify-center text-xs font-bold text-white"
                                                                style={friend.profile_pic ? { backgroundImage: `url('${friend.profile_pic}')` } : undefined}
                                                            >
                                                                {!friend.profile_pic ? friend.username?.slice(0, 2).toUpperCase() : null}
                                                            </div>
                                                            <div className="absolute -bottom-1 -right-1 bg-surface-light dark:bg-surface-dark rounded p-0.5">
                                                                <span className="text-xs">{flagFor(friend.country)}</span>
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="font-semibold text-sm dark:text-slate-200">{friend.username}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                                                <span className="font-medium text-slate-700 dark:text-slate-300">{friend.rating_blitz || friend.rating || '--'}</span>
                                                                <span>•</span>
                                                                <span className="text-green-600 dark:text-green-500">Online</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            className="p-2 text-primary hover:bg-primary/10 rounded-full transition-all"
                                                            title="Challenge"
                                                            type="button"
                                                            onClick={(event) => {
                                                                event.stopPropagation();
                                                                navigate(`/play?opponent=${friend.id}&username=${encodeURIComponent(friend.username || '')}`);
                                                            }}
                                                        >
                                                            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>swords</span>
                                                        </button>
                                                        <button
                                                            className="p-2 text-slate-400 hover:text-primary hover:bg-primary/10 rounded-full transition-all"
                                                            title="Message"
                                                            type="button"
                                                            onClick={(event) => {
                                                                event.stopPropagation();
                                                                handleMessageFriend(friend);
                                                            }}
                                                        >
                                                            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>mail</span>
                                                        </button>
                                                    </div>
                                                </div>
                                            )) : (
                                                <div className="px-4 py-3 text-xs text-slate-500">No friends online.</div>
                                            )}
                                        </div>

                                        <div className="bg-slate-50/50 dark:bg-slate-900/50 px-4 py-2 border-b border-t border-slate-200 dark:border-slate-800">
                                            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                                                Offline
                                            </h3>
                                        </div>
                                        <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                            {offlineFriends.length ? offlineFriends.map((friend) => (
                                                <div key={friend.id} className="group flex items-center justify-between px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors opacity-75">
                                                    <div
                                                        className="flex items-center gap-3 text-left flex-1"
                                                        role="button"
                                                        tabIndex={0}
                                                        onClick={() => navigate(`/profile/${friend.username}`)}
                                                        onKeyDown={(event) => {
                                                            if (event.key === 'Enter') navigate(`/profile/${friend.username}`);
                                                        }}
                                                    >
                                                        <div className="relative">
                                                            <div
                                                                className="w-10 h-10 rounded-full bg-slate-700 bg-cover bg-center grayscale flex items-center justify-center text-xs font-bold text-white"
                                                                style={friend.profile_pic ? { backgroundImage: `url('${friend.profile_pic}')` } : undefined}
                                                            >
                                                                {!friend.profile_pic ? friend.username?.slice(0, 2).toUpperCase() : null}
                                                            </div>
                                                            <div className="absolute -bottom-1 -right-1 bg-surface-light dark:bg-surface-dark rounded p-0.5">
                                                                <span className="text-xs">{flagFor(friend.country)}</span>
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="font-semibold text-sm dark:text-slate-200">{friend.username}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                                                <span className="font-medium text-slate-700 dark:text-slate-300">{friend.rating_blitz || friend.rating || '--'}</span>
                                                                <span>•</span>
                                                                <span>{formatLastSeen(friend.last_seen_at)}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            className="p-2 text-primary hover:bg-primary/10 rounded-full transition-all"
                                                            title="Challenge"
                                                            type="button"
                                                            onClick={(event) => {
                                                                event.stopPropagation();
                                                                navigate(`/play?opponent=${friend.id}&username=${encodeURIComponent(friend.username || '')}`);
                                                            }}
                                                        >
                                                            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>swords</span>
                                                        </button>
                                                        <button
                                                            className="p-2 text-slate-400 hover:text-primary hover:bg-primary/10 rounded-full transition-all"
                                                            title="Message"
                                                            type="button"
                                                            onClick={(event) => {
                                                                event.stopPropagation();
                                                                handleMessageFriend(friend);
                                                            }}
                                                        >
                                                            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>mail</span>
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

                    {!loading && !error && segment === 'players' ? null : null}
                </main>

                <button
                    className="fixed right-4 bottom-20 z-50 flex items-center justify-center w-14 h-14 bg-primary text-white rounded-full shadow-lg shadow-primary/40 hover:scale-105 transition-transform"
                    type="button"
                    onClick={() => navigate('/messages')}
                >
                    <span className="material-symbols-outlined" style={{ fontSize: 28 }}>chat_bubble</span>
                    <span className="absolute top-3 right-3 w-3 h-3 bg-red-500 border-2 border-primary rounded-full"></span>
                </button>
            </div>
        </Layout>
    );
}
