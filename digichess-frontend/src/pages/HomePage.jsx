import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import MiniChessBoard from '../components/chess/MiniChessBoard';
import { acceptGame, cancelMatchmaking, enqueueMatchmaking, fetchPublicAccount, fetchPublicGames, rejectGame, respondFriendRequest } from '../api';
import { useAuth } from '../context/AuthContext';
import useNotifications from '../hooks/useNotifications';
import { BOARD_THEMES, PIECE_SETS } from '../utils/boardPresets';
import { getBlitzTag, getRatingTagClasses } from '../utils/ratingTags';

const quickPlayCards = [
    { id: 'bullet', label: 'Bullet', time: '1+0', icon: 'local_fire_department', color: 'text-orange-400' },
    { id: 'blitz', label: 'Blitz', time: '3+2', icon: 'flash_on', color: 'text-yellow-400' },
    { id: 'rapid', label: 'Rapid', time: '10+0', icon: 'timer', color: 'text-green-400' },
    { id: 'classical', label: 'Classical', time: '30+0', icon: 'hourglass_empty', color: 'text-blue-400' },
];


const LOCAL_STORAGE_SOUND = 'soundEnabled';

const getRatingForControl = (user, control) => {
    if (!user) return null;
    const map = {
        bullet: user.rating_bullet,
        blitz: user.rating_blitz,
        rapid: user.rating_rapid,
        classical: user.rating_classical,
    };
    return map[control] || null;
};

const getEvalSplit = (game) => {
    if (typeof game?.evaluation === 'number') {
        const clamped = Math.max(-10, Math.min(10, game.evaluation));
        const white = Math.round(50 + (clamped / 20) * 100);
        return { white: Math.max(0, Math.min(100, white)), black: Math.max(0, 100 - white) };
    }
    return { white: 50, black: 50 };
};

export default function HomePage() {
    const navigate = useNavigate();
    const { user, isAuthenticated, logout } = useAuth();
    const [queueingControl, setQueueingControl] = useState(null);
    const [queueLoading, setQueueLoading] = useState(false);
    const [queueError, setQueueError] = useState(null);
    const {
        unreadCount,
        notifications,
        markAllRead,
        removeNotification,
        page: notificationsPage,
        totalPages: notificationsTotalPages,
        total: notificationsTotal,
        setPage: setNotificationsPage,
    } = useNotifications({
        pageSize: 10,
        onMatchFound: (gameId) => {
            if (!queueingControl) return;
            setQueueingControl(null);
            setQueueLoading(false);
            if (gameId) navigate(`/game/${gameId}`);
        },
    });
    const [liveGames, setLiveGames] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showSettings, setShowSettings] = useState(false);
    const [showNotifications, setShowNotifications] = useState(false);
    const [boardThemeIndex, setBoardThemeIndex] = useState(() => {
        if (typeof window === 'undefined') return 6;
        const stored = Number(localStorage.getItem('boardTheme'));
        return Number.isFinite(stored) ? stored : 6;
    });
    const [pieceSet, setPieceSet] = useState(() => {
        if (typeof window === 'undefined') return 'cburnett';
        return localStorage.getItem('pieceSet') || 'cburnett';
    });
    const [soundEnabled, setSoundEnabled] = useState(() => {
        if (typeof window === 'undefined') return true;
        const stored = localStorage.getItem(LOCAL_STORAGE_SOUND);
        return stored ? stored === 'true' : true;
    });
    const [activeGameId, setActiveGameId] = useState(null);

    const stats = useMemo(() => ([
        { label: 'Bullet', value: user?.rating_bullet || 800, icon: 'local_fire_department', color: 'text-orange-400' },
        { label: 'Blitz', value: user?.rating_blitz || 800, icon: 'flash_on', color: 'text-yellow-400' },
        { label: 'Rapid', value: user?.rating_rapid || 800, icon: 'timer', color: 'text-green-400' },
    ]), [user]);

    const avatarUrl = user?.profile_pic || user?.avatar || user?.image || '';
    const initials = user?.username?.slice(0, 2).toUpperCase() || 'DC';

    const blitzTag = getBlitzTag(user?.rating_blitz);
    const boardTheme = BOARD_THEMES[boardThemeIndex] || BOARD_THEMES[6] || BOARD_THEMES[0];

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            setError(null);
            try {
                const gamesRes = await fetchPublicGames({ status: 'active', page_size: 6 });
                setLiveGames(gamesRes?.results || []);
            } catch (err) {
                setError('Failed to load dashboard data.');
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    useEffect(() => {
        if (!user?.username) {
            setActiveGameId(null);
            return;
        }
        fetchPublicAccount(user.username)
            .then((data) => {
                if (data?.is_playing && data?.spectate_game_id) {
                    setActiveGameId(data.spectate_game_id);
                } else {
                    setActiveGameId(null);
                }
            })
            .catch(() => setActiveGameId(null));
    }, [user?.username]);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('boardTheme', String(boardThemeIndex));
        }
    }, [boardThemeIndex]);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('pieceSet', pieceSet);
        }
    }, [pieceSet]);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem(LOCAL_STORAGE_SOUND, String(soundEnabled));
        }
    }, [soundEnabled]);

    const handleQuickPlay = async (timeControl) => {
        if (!isAuthenticated) {
            navigate('/login');
            return;
        }
        if (queueingControl) return;
        setQueueLoading(true);
        setQueueError(null);
        try {
            const result = await enqueueMatchmaking(timeControl);
            if (result?.id) {
                navigate(`/game/${result.id}`);
                return;
            }
            setQueueingControl(timeControl);
        } catch (err) {
            setQueueError(err.message || 'Failed to join queue.');
        } finally {
            setQueueLoading(false);
        }
    };

    const handleCancelQueue = async () => {
        if (!queueingControl) return;
        try {
            await cancelMatchmaking(queueingControl);
        } catch (err) {
            // ignore
        } finally {
            setQueueingControl(null);
        }
    };

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
            if (notification.notification_type === 'friend_request') {
                const requestId = notification.data?.friend_request_id;
                if (requestId) {
                    await respondFriendRequest(requestId, decision);
                }
            }
        } catch (err) {
            // ignore for now
        } finally {
            removeNotification(notification.id);
        }
    };

    return (
        <Layout showHeader={false}>
            <div className="flex-1 overflow-y-auto pb-24 no-scrollbar">
                <header className="sticky top-0 z-30 flex items-center justify-between bg-gradient-to-b from-background-light/95 to-background-light/90 dark:from-background-dark/95 dark:to-background-dark/90 backdrop-blur-md p-4 border-b dark:border-gray-800 border-gray-200 shadow-sm">
                    <div
                        role="button"
                        tabIndex={0}
                        className="flex items-center gap-3 text-left"
                        onClick={() => navigate('/profile')}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                navigate('/profile');
                            }
                        }}
                    >
                        <div className="relative">
                            <div
                                className={`rounded-full size-10 border-2 border-primary ${avatarUrl ? 'bg-cover bg-center' : 'bg-slate-700 flex items-center justify-center text-xs font-bold text-white'}`}
                                style={avatarUrl ? { backgroundImage: `url('${avatarUrl}')` } : undefined}
                            >
                                {!avatarUrl ? initials : null}
                            </div>
                            <div className="absolute bottom-0 right-0 size-3 bg-accent-green-bright rounded-full border-2 border-background-dark"></div>
                        </div>
                        <div>
                            <h1 className="text-sm font-bold leading-tight">{user?.username || 'Guest'}</h1>
                            <div className="flex items-center gap-1">
                                <span className="material-symbols-outlined text-yellow-500 text-[14px]">bolt</span>
                                {user ? (
                                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                                        {user.rating_blitz}
                                    </span>
                                ) : (
                                    <button
                                        className="text-xs font-semibold text-primary hover:text-blue-400 hover:underline cursor-pointer"
                                        type="button"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            navigate('/login');
                                        }}
                                    >
                                        Login to play
                                    </button>
                                )}
                                {blitzTag ? (
                                    <span className={`ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded ${getRatingTagClasses(blitzTag)}`}>
                                        {blitzTag}
                                    </span>
                                ) : null}
                            </div>
                        </div>
                    </div>
                    <div className="flex-1 flex justify-center">
                        <span
                            className="text-2xl md:text-3xl font-black tracking-[0.04em] text-transparent bg-clip-text bg-gradient-to-r from-primary via-purple-400 to-emerald-300 drop-shadow-sm"
                            style={{ fontFamily: '"Calibri", "Lexend", sans-serif' }}
                        >
                            DIGICHESS
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        {!isAuthenticated ? (
                            <button
                                className="px-3 py-2 rounded-full bg-primary text-white text-xs font-semibold shadow-sm hover:bg-blue-600 transition-colors active:scale-95"
                                type="button"
                                onClick={() => navigate('/signup')}
                            >
                                Sign up
                            </button>
                        ) : (
                            <>
                                <button
                                    className="flex items-center justify-center size-10 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors relative"
                                    type="button"
                                onClick={() => {
                                    setShowNotifications((prev) => {
                                        const next = !prev;
                                        if (next) setNotificationsPage(1);
                                        return next;
                                    });
                                    markAllRead();
                                }}
                                >
                                    <span className="material-symbols-outlined text-gray-600 dark:text-gray-300">notifications</span>
                                    {unreadCount > 0 ? (
                                        <span className="absolute top-2 right-2 size-2 bg-red-500 rounded-full"></span>
                                    ) : null}
                                </button>
                                <button
                                    className="flex items-center justify-center px-3 py-2 rounded-full bg-slate-200 dark:bg-slate-800 text-xs font-semibold"
                                    type="button"
                                    onClick={logout}
                                >
                                    Logout
                                </button>
                            </>
                        )}
                        <button
                            className="flex items-center justify-center size-10 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
                            type="button"
                            onClick={() => setShowSettings((prev) => !prev)}
                        >
                            <span className="material-symbols-outlined text-gray-600 dark:text-gray-300">settings</span>
                        </button>
                    </div>
                    {showSettings ? (
                        <div className="absolute top-16 left-4 right-4 sm:left-auto sm:right-4 z-40 w-[min(90vw,20rem)] sm:w-72 bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl p-4 space-y-4">
                            <div>
                                <div className="text-xs font-semibold text-slate-500 mb-2">Board theme</div>
                                <div className="flex items-center gap-3">
                                    <div className="grid grid-cols-2 grid-rows-2 w-8 h-8 rounded overflow-hidden border border-slate-200 dark:border-slate-700">
                                        <div style={{ backgroundColor: boardTheme.light }} />
                                        <div style={{ backgroundColor: boardTheme.dark }} />
                                        <div style={{ backgroundColor: boardTheme.dark }} />
                                        <div style={{ backgroundColor: boardTheme.light }} />
                                    </div>
                                    <select
                                        value={boardThemeIndex}
                                        onChange={(event) => setBoardThemeIndex(Number(event.target.value))}
                                        className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200"
                                    >
                                        {BOARD_THEMES.map((theme, idx) => (
                                            <option key={theme.name} value={idx}>
                                                {theme.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div>
                                <div className="text-xs font-semibold text-slate-500 mb-2">Piece set</div>
                                <select
                                    value={pieceSet}
                                    onChange={(event) => setPieceSet(event.target.value)}
                                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200"
                                >
                                    {PIECE_SETS.map((set) => (
                                        <option key={set.value} value={set.value}>
                                            {set.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="text-xs font-semibold text-slate-500">Sound</div>
                                <button
                                    className={`px-3 py-1.5 rounded-full text-xs font-semibold ${soundEnabled ? 'bg-primary/10 text-primary' : 'bg-slate-200 text-slate-600'}`}
                                    type="button"
                                    onClick={() => setSoundEnabled((prev) => !prev)}
                                >
                                    {soundEnabled ? 'Enabled' : 'Muted'}
                                </button>
                            </div>
                        </div>
                    ) : null}
                    {showNotifications ? (
                        <div className="absolute top-16 left-4 right-4 sm:left-auto sm:right-4 z-40 w-[min(92vw,24rem)] sm:w-80 bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl p-4">
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
                    ) : null}
                </header>

                {activeGameId ? (
                    <button
                        className="mx-4 mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-between gap-3 w-[calc(100%-2rem)] text-left hover:bg-red-500/15 transition-colors"
                        type="button"
                        onClick={() => navigate(`/game/${activeGameId}`)}
                    >
                        <div>
                            <p className="text-sm font-semibold text-red-500">Game in progress</p>
                            <p className="text-xs text-slate-500">Resume your live game now.</p>
                        </div>
                        <span className="material-symbols-outlined text-red-500">arrow_forward</span>
                    </button>
                ) : null}

                    <div className="flex gap-3 px-4 py-4 overflow-x-auto no-scrollbar">
                    {stats.map((stat) => (
                        <div
                            key={stat.label}
                                className="flex min-w-[90px] sm:min-w-[100px] flex-col gap-1 rounded-xl bg-surface-dark border border-gray-800 p-3 items-center text-center shadow-sm"
                        >
                            <span className={`material-symbols-outlined text-[20px] ${stat.color}`}>{stat.icon}</span>
                            <p className="text-white text-lg font-bold leading-tight">{stat.value}</p>
                            <p className="text-gray-400 text-xs font-normal">{stat.label}</p>
                        </div>
                    ))}
                </div>

                <section className="px-4 py-2">
                    <h2 className="text-xl font-bold mb-3 flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary">swords</span>
                        Play Chess
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {quickPlayCards.map((card) => (
                            <button
                                key={card.id}
                                onClick={() => handleQuickPlay(card.id)}
                                disabled={queueLoading || Boolean(queueingControl)}
                                className="group relative flex flex-col items-start justify-between p-4 h-28 sm:h-32 rounded-2xl bg-gradient-to-br from-[#1e232e] to-[#13161c] border border-gray-800 hover:border-primary/50 transition-all overflow-hidden disabled:opacity-60"
                                type="button"
                            >
                                <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                    <span className="material-symbols-outlined text-6xl">{card.icon}</span>
                                </div>
                                <div className="bg-gray-800/50 p-2 rounded-lg backdrop-blur-sm">
                                    <span className={`material-symbols-outlined ${card.color}`}>{card.icon}</span>
                                </div>
                                <div>
                                    <span className="block text-2xl font-bold text-white">{card.time}</span>
                                    <span className="text-sm text-gray-400 font-medium">{card.label}</span>
                                </div>
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={() => navigate('/play')}
                        className="mt-4 w-full py-3 rounded-xl bg-gradient-to-r from-primary/80 to-blue-500 text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all"
                        type="button"
                    >
                        <span className="material-symbols-outlined">add_circle</span>
                        Create Custom Game
                    </button>
                    {queueingControl ? (
                        <div className="mt-3 p-3 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-between">
                            <div className="text-xs text-slate-600 dark:text-slate-300">
                                Searching for a {queueingControl} match...
                            </div>
                            <button
                                className="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-xs font-semibold"
                                type="button"
                                onClick={handleCancelQueue}
                            >
                                Cancel
                            </button>
                        </div>
                    ) : queueError ? (
                        <div className="mt-3 text-xs text-red-500">{queueError}</div>
                    ) : null}
                </section>

                <section className="mt-6 pl-4 border-t border-gray-800 pt-6 bg-gradient-to-b from-transparent to-black/20">
                    <div className="flex items-center justify-between pr-4 mb-3">
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            <span className="relative flex h-3 w-3">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                            </span>
                            Live Games
                        </h2>
                        <div className="text-xs text-slate-500 pr-4">Live now</div>
                    </div>
                    {loading ? (
                        <div className="text-sm text-slate-500 pr-4">Loading live games...</div>
                    ) : (
                        <div className="flex overflow-x-auto gap-4 pb-4 pr-4 snap-x no-scrollbar">
                            {liveGames.slice(0, 6).map((game) => {
                                const evalSplit = getEvalSplit(game);
                                const isUserInGame = user && (game.white?.id === user.id || game.black?.id === user.id);
                                const actionLabel = isUserInGame ? 'Play' : 'Watch';
                                return (
                                    <button
                                        key={game.id}
                                        className="snap-center shrink-0 w-[min(80vw,240px)] sm:w-[240px] bg-surface-dark border border-gray-800 rounded-xl overflow-hidden shadow-lg text-left"
                                        type="button"
                                        onClick={() => navigate(`/game/${game.id}`)}
                                    >
                                        <div className="relative aspect-square w-full bg-gray-800">
                                            <div className="w-full h-full flex items-center justify-center">
                                                    <MiniChessBoard
                                                        fen={game.current_fen}
                                                        size={200}
                                                        themeIndex={boardThemeIndex}
                                                        pieceSet={pieceSet}
                                                    />
                                            </div>
                                            <div className="absolute left-0 top-0 bottom-0 w-2 bg-gray-700 flex flex-col">
                                                <div className="bg-white w-full" style={{ height: `${evalSplit.white}%` }}></div>
                                                <div className="bg-black w-full" style={{ height: `${evalSplit.black}%` }}></div>
                                            </div>
                                        </div>
                                        <div className="p-3">
                                            <div className="flex justify-between items-center mb-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="size-2 rounded-full bg-white"></span>
                                                    <span className="text-sm font-bold truncate max-w-[80px]">{game.white?.username || 'White'}</span>
                                                </div>
                                                <span className="text-xs bg-gray-700 px-1.5 py-0.5 rounded text-gray-300">
                                                    {getRatingForControl(game.white, game.time_control) || '--'}
                                                </span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <div className="flex items-center gap-2">
                                                    <span className="size-2 rounded-full bg-black border border-gray-600"></span>
                                                    <span className="text-sm font-bold truncate max-w-[80px]">{game.black?.username || 'Black'}</span>
                                                </div>
                                                <span className="text-xs bg-gray-700 px-1.5 py-0.5 rounded text-gray-300">
                                                    {getRatingForControl(game.black, game.time_control) || '--'}
                                                </span>
                                            </div>
                                            <div className="flex justify-end mt-3">
                                                <span className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold">
                                                    {actionLabel}
                                                </span>
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                            {!liveGames.length && !loading ? (
                                <div className="text-sm text-slate-500">No live games yet.</div>
                            ) : null}
                        </div>
                    )}
                </section>

                {error ? (
                    <div className="px-4 pb-4 text-sm text-red-500">{error}</div>
                ) : null}
            </div>
        </Layout>
    );
}
