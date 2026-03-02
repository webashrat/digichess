import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import MiniChessBoard from '../components/chess/MiniChessBoard';
import {
    acceptGame,
    acceptRematch,
    cancelMatchmaking,
    createBotGame,
    createGame,
    enqueueMatchmaking,
    fetchPublicAccount,
    fetchPublicGames,
    listBots,
    rejectGame,
    rejectRematch,
    respondFriendRequest,
    searchPublicUsers,
} from '../api';
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

const customFormatOptions = [
    { id: 'bullet', label: 'Bullet' },
    { id: 'blitz', label: 'Blitz' },
    { id: 'rapid', label: 'Rapid' },
    { id: 'classical', label: 'Classical' },
    { id: 'custom', label: 'Custom' },
];

const customFormatPresets = {
    bullet: { minutes: 1, increment: 0 },
    blitz: { minutes: 3, increment: 2 },
    rapid: { minutes: 10, increment: 0 },
    classical: { minutes: 30, increment: 0 },
};

const botModeOptions = quickPlayCards.map((card) => ({ id: card.id, label: card.label }));
const JIANG_BOT_IMAGE = '/images/jiang-bot.png';


const LOCAL_STORAGE_SOUND = 'soundEnabled';
const LOCAL_STORAGE_AUTO_QUEEN = 'autoQueenEnabled';
const LOCAL_STORAGE_UI_THEME = 'uiTheme';
const SETTINGS_CHANGE_EVENT = 'digichess-settings-change';

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
    const [searchParams, setSearchParams] = useSearchParams();
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
    const [notificationError, setNotificationError] = useState(null);
    const [uiTheme, setUiTheme] = useState(() => {
        if (typeof window === 'undefined') return 'dark';
        const stored = localStorage.getItem(LOCAL_STORAGE_UI_THEME);
        if (stored === 'light' || stored === 'dark') return stored;
        return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    });
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
    const [autoQueenEnabled, setAutoQueenEnabled] = useState(() => {
        if (typeof window === 'undefined') return true;
        const stored = localStorage.getItem(LOCAL_STORAGE_AUTO_QUEEN);
        return stored ? stored === 'true' : true;
    });
    const [activeGameId, setActiveGameId] = useState(null);
    const [showCustomForm, setShowCustomForm] = useState(false);
    const [customOpponentQuery, setCustomOpponentQuery] = useState('');
    const [customOpponent, setCustomOpponent] = useState(null);
    const [customSearchLoading, setCustomSearchLoading] = useState(false);
    const [customSearchResults, setCustomSearchResults] = useState([]);
    const [customSearchError, setCustomSearchError] = useState(null);
    const [customFormat, setCustomFormat] = useState('blitz');
    const [customMinutes, setCustomMinutes] = useState(3);
    const [customIncrement, setCustomIncrement] = useState(2);
    const [customRated, setCustomRated] = useState(true);
    const [customColor, setCustomColor] = useState('auto');
    const [customSubmitting, setCustomSubmitting] = useState(false);
    const [customError, setCustomError] = useState(null);
    const [showBotPanel, setShowBotPanel] = useState(false);
    const [botMode, setBotMode] = useState('blitz');
    const [bots, setBots] = useState([]);
    const [botLoading, setBotLoading] = useState(false);
    const [botError, setBotError] = useState(null);
    const [botSubmittingId, setBotSubmittingId] = useState(null);
    const prefillAppliedRef = useRef(false);
    const settingsButtonRef = useRef(null);
    const settingsPanelRef = useRef(null);
    const notificationsButtonRef = useRef(null);
    const notificationsPanelRef = useRef(null);

    const stats = useMemo(() => ([
        { label: 'Bullet', value: user?.rating_bullet || 800, icon: 'local_fire_department', color: 'text-orange-400' },
        { label: 'Blitz', value: user?.rating_blitz || 800, icon: 'flash_on', color: 'text-yellow-400' },
        { label: 'Rapid', value: user?.rating_rapid || 800, icon: 'timer', color: 'text-green-400' },
    ]), [user]);

    const avatarUrl = user?.profile_pic || user?.avatar || user?.image || '';
    const initials = user?.username?.slice(0, 2).toUpperCase() || 'DC';

    const blitzTag = getBlitzTag(user?.rating_blitz);
    const boardTheme = BOARD_THEMES[boardThemeIndex] || BOARD_THEMES[6] || BOARD_THEMES[0];
    const isPlayModalOpen = showCustomForm || showBotPanel;

    const loadLiveGames = useCallback(async (showSpinner = false) => {
        if (showSpinner) {
            setLoading(true);
        }
        try {
            const gamesRes = await fetchPublicGames({ status: 'active', page_size: 6 });
            setLiveGames(gamesRes?.results || []);
            setError(null);
        } catch (err) {
            if (showSpinner) {
                setError('Failed to load dashboard data.');
            }
        } finally {
            if (showSpinner) {
                setLoading(false);
            }
        }
    }, []);

    useEffect(() => {
        loadLiveGames(true);
        const interval = setInterval(() => {
            if (typeof document !== 'undefined' && document.hidden) return;
            loadLiveGames(false);
        }, 4000);
        return () => clearInterval(interval);
    }, [loadLiveGames]);

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
        if (prefillAppliedRef.current) return;
        const challenge = searchParams.get('challenge');
        const usernameParam = searchParams.get('username');
        const opponentParam = searchParams.get('opponent');
        if (!challenge && !usernameParam && !opponentParam) return;
        prefillAppliedRef.current = true;
        setShowCustomForm(true);
        setShowBotPanel(false);
        if (usernameParam) {
            setCustomOpponentQuery(usernameParam);
            fetchPublicAccount(usernameParam)
                .then((data) => {
                    if (data?.id) {
                        setCustomOpponent(data);
                        setCustomSearchResults([]);
                        setCustomSearchError(null);
                    }
                })
                .catch(() => {
                    // ignore
                });
        }
        setSearchParams({});
    }, [searchParams, setSearchParams]);

    useEffect(() => {
        if (!showCustomForm) return;
        const query = customOpponentQuery.trim();
        if (customOpponent && query && customOpponent.username?.toLowerCase() !== query.toLowerCase()) {
            setCustomOpponent(null);
        }
        if (!query || query.length < 2) {
            setCustomSearchResults([]);
            setCustomSearchError(null);
            setCustomSearchLoading(false);
            return;
        }
        let active = true;
        setCustomSearchLoading(true);
        setCustomSearchError(null);
        const timeout = setTimeout(async () => {
            try {
                const data = await searchPublicUsers(query, { page_size: 6, sort: 'username' });
                if (!active) return;
                const results = (data?.results || []).filter((item) => item.id !== user?.id);
                setCustomSearchResults(results);
            } catch (err) {
                if (!active) return;
                setCustomSearchResults([]);
                setCustomSearchError('No users found.');
            } finally {
                if (active) setCustomSearchLoading(false);
            }
        }, 250);
        return () => {
            active = false;
            clearTimeout(timeout);
        };
    }, [customOpponentQuery, customOpponent, showCustomForm, user?.id]);

    useEffect(() => {
        if (customFormat === 'custom') {
            setCustomRated(false);
            return;
        }
        const preset = customFormatPresets[customFormat];
        if (preset) {
            setCustomMinutes(preset.minutes);
            setCustomIncrement(preset.increment);
        }
    }, [customFormat]);

    useEffect(() => {
        if (!showBotPanel) return;
        let active = true;
        const loadBots = async () => {
            setBotLoading(true);
            setBotError(null);
            try {
                const data = await listBots(botMode);
                if (!active) return;
                setBots(data?.bots || []);
            } catch (err) {
                if (!active) return;
                setBots([]);
                setBotError('Failed to load bots.');
            } finally {
                if (active) {
                    setBotLoading(false);
                }
            }
        };
        loadBots();
        return () => {
            active = false;
        };
    }, [showBotPanel, botMode]);

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
            window.dispatchEvent(new CustomEvent(SETTINGS_CHANGE_EVENT, {
                detail: { key: LOCAL_STORAGE_SOUND, value: String(soundEnabled) },
            }));
        }
    }, [soundEnabled]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const isDark = uiTheme === 'dark';
        document.documentElement.classList.toggle('dark', isDark);
        localStorage.setItem(LOCAL_STORAGE_UI_THEME, uiTheme);
    }, [uiTheme]);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem(LOCAL_STORAGE_AUTO_QUEEN, String(autoQueenEnabled));
            window.dispatchEvent(new CustomEvent(SETTINGS_CHANGE_EVENT, {
                detail: { key: LOCAL_STORAGE_AUTO_QUEEN, value: String(autoQueenEnabled) },
            }));
        }
    }, [autoQueenEnabled]);

    useEffect(() => {
        if (showNotifications) {
            setNotificationError(null);
        }
    }, [showNotifications]);

    useEffect(() => {
        if (typeof document === 'undefined' || (!showSettings && !showNotifications)) return undefined;
        const handleOutside = (event) => {
            const target = event.target;
            if (showSettings) {
                const clickedSettingsButton = settingsButtonRef.current?.contains(target);
                const clickedSettingsPanel = settingsPanelRef.current?.contains(target);
                if (!clickedSettingsButton && !clickedSettingsPanel) {
                    setShowSettings(false);
                }
            }
            if (showNotifications) {
                const clickedNotificationsButton = notificationsButtonRef.current?.contains(target);
                const clickedNotificationsPanel = notificationsPanelRef.current?.contains(target);
                if (!clickedNotificationsButton && !clickedNotificationsPanel) {
                    setShowNotifications(false);
                }
            }
        };
        document.addEventListener('mousedown', handleOutside);
        document.addEventListener('touchstart', handleOutside);
        return () => {
            document.removeEventListener('mousedown', handleOutside);
            document.removeEventListener('touchstart', handleOutside);
        };
    }, [showSettings, showNotifications]);

    useEffect(() => {
        if (typeof document === 'undefined' || !isPlayModalOpen) return undefined;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [isPlayModalOpen]);

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

    const handleCreateCustomGame = async () => {
        if (!isAuthenticated) {
            navigate('/login');
            return;
        }
        if (!customOpponent?.id) {
            setCustomError('Select an opponent first.');
            return;
        }
        const minutes = Number(customMinutes);
        const increment = Number(customIncrement);
        if (!Number.isFinite(minutes) || minutes <= 0) {
            setCustomError('Initial time must be greater than 0.');
            return;
        }
        if (!Number.isFinite(increment) || increment < 0 || increment > 60) {
            setCustomError('Increment must be between 0 and 60 seconds.');
            return;
        }
        const initialSeconds = Math.round(minutes * 60);
        if (initialSeconds < 1 || initialSeconds > 7200) {
            setCustomError('Initial time must be between 1 and 120 minutes.');
            return;
        }
        if (customFormat !== 'custom') {
            if (customFormat === 'bullet' && !(initialSeconds > 0 && initialSeconds < 180)) {
                setCustomError('Bullet requires less than 3 minutes.');
                return;
            }
            if (customFormat === 'blitz' && !(initialSeconds >= 180 && initialSeconds < 600)) {
                setCustomError('Blitz requires 3 to 9 minutes.');
                return;
            }
            if (customFormat === 'rapid' && !(initialSeconds >= 600 && initialSeconds <= 1500)) {
                setCustomError('Rapid requires 10 to 25 minutes.');
                return;
            }
            if (customFormat === 'classical' && !(initialSeconds > 1500 && initialSeconds <= 7200)) {
                setCustomError('Classical requires more than 25 minutes.');
                return;
            }
        }
        setCustomSubmitting(true);
        setCustomError(null);
        try {
            const payload = {
                opponent_id: customOpponent.id,
                time_control: customFormat,
                preferred_color: customColor,
                rated: customFormat === 'custom' ? false : customRated,
            };
            if (customFormat === 'custom') {
                payload.white_time_seconds = initialSeconds;
                payload.black_time_seconds = initialSeconds;
                payload.white_increment_seconds = increment;
                payload.black_increment_seconds = increment;
            } else {
                payload.initial_time_seconds = initialSeconds;
                payload.increment_seconds = increment;
            }
            const game = await createGame(payload);
            if (game?.id) {
                navigate(`/game/${game.id}`);
            }
        } catch (err) {
            setCustomError(err.message || 'Failed to create game.');
        } finally {
            setCustomSubmitting(false);
        }
    };

    const handleCreateBotGame = async (botId) => {
        if (!isAuthenticated) {
            navigate('/login');
            return;
        }
        setBotSubmittingId(botId);
        setBotError(null);
        try {
            const game = await createBotGame(botId, { time_control: botMode, preferred_color: 'auto' });
            if (game?.id) {
                navigate(`/game/${game.id}`);
            }
        } catch (err) {
            setBotError(err.message || 'Failed to create bot game.');
        } finally {
            setBotSubmittingId(null);
        }
    };

    const toggleCustomForm = () => {
        setCustomError(null);
        setShowCustomForm((prev) => {
            const next = !prev;
            if (next) {
                setShowBotPanel(false);
            }
            return next;
        });
    };

    const toggleBotPanel = () => {
        setBotError(null);
        setShowBotPanel((prev) => {
            const next = !prev;
            if (next) {
                setShowCustomForm(false);
            }
            return next;
        });
    };

    const closePlayModal = () => {
        setShowCustomForm(false);
        setShowBotPanel(false);
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

    return (
        <Layout showHeader={false}>
            <>
                <div className="flex-1 overflow-y-auto pb-24 no-scrollbar">
                <header className="sticky top-0 z-30 border-b border-slate-200/70 dark:border-slate-800/70 bg-gradient-to-b from-background-light/95 to-background-light/85 dark:from-background-dark/95 dark:to-background-dark/85 backdrop-blur-md px-3 py-3 sm:px-4 sm:py-4 shadow-sm">
                    <div className="mx-auto w-full max-w-[1500px] rounded-2xl border border-slate-200/70 dark:border-slate-700/70 bg-white/75 dark:bg-slate-900/55 shadow-[0_10px_35px_rgba(15,23,42,0.15)] dark:shadow-[0_12px_36px_rgba(2,6,23,0.5)] px-3 py-2 sm:px-4 sm:py-3">
                        <div className="grid w-full grid-cols-[1fr_auto] grid-rows-[auto_auto] items-center gap-y-2 gap-x-2 sm:grid-cols-[auto_1fr_auto] sm:grid-rows-1 sm:gap-x-3">
                        <div
                            role="button"
                            tabIndex={0}
                            className="group flex items-center gap-2 sm:gap-3 text-left min-w-0 rounded-xl px-1.5 py-1 sm:px-2.5 sm:py-1.5 hover:bg-slate-100/70 dark:hover:bg-slate-800/60 transition-colors"
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
                                    className={`rounded-full size-10 border-2 border-primary/90 shadow-sm ${avatarUrl ? 'bg-cover bg-center' : 'bg-slate-700 flex items-center justify-center text-xs font-bold text-white'}`}
                                    style={avatarUrl ? { backgroundImage: `url('${avatarUrl}')` } : undefined}
                                >
                                    {!avatarUrl ? initials : null}
                                </div>
                                <div className="absolute bottom-0 right-0 size-3 bg-accent-green-bright rounded-full border-2 border-background-dark"></div>
                            </div>
                            <div className="min-w-0">
                                <h1 className="text-sm font-bold leading-tight truncate text-slate-900 dark:text-slate-100">{user?.username || 'Guest'}</h1>
                                <div className="flex items-center gap-1.5">
                                    <span className="material-symbols-outlined text-yellow-500 text-[14px]">bolt</span>
                                    {user ? (
                                        <span className="text-[11px] sm:text-xs font-medium text-slate-600 dark:text-slate-400">
                                            {user.rating_blitz}
                                        </span>
                                    ) : (
                                        <button
                                            className="text-[11px] sm:text-xs font-semibold text-primary hover:text-blue-400 hover:underline cursor-pointer"
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
                        <div className="col-span-2 row-start-2 flex justify-center sm:col-span-1 sm:row-start-1 sm:col-start-2">
                            <button
                                type="button"
                                onClick={() => navigate('/')}
                                className="inline-flex items-center gap-2.5 rounded-full border border-slate-300/80 dark:border-slate-600/70 bg-slate-100/80 dark:bg-slate-800/70 px-3 py-1.5 sm:px-4 sm:py-2 shadow-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            >
                                <span className="text-base leading-none text-primary">♞</span>
                                <span className="text-sm sm:text-base font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
                                    DigiChess
                                </span>
                                <span className="hidden md:inline-block h-3 w-px bg-slate-300 dark:bg-slate-600" />
                                <span className="hidden md:inline text-[10px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                                    Live Arena
                                </span>
                            </button>
                        </div>
                        <div className="flex items-center justify-end gap-2 sm:col-start-3">
                            {!isAuthenticated ? (
                                <button
                                    className="px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-full bg-primary text-white text-[11px] sm:text-xs font-semibold shadow-sm hover:bg-blue-600 transition-colors active:scale-95"
                                    type="button"
                                    onClick={() => navigate('/signup')}
                                >
                                    Sign up
                                </button>
                            ) : (
                                <>
                                    <button
                                        ref={notificationsButtonRef}
                                        className="relative flex items-center justify-center size-9 sm:size-10 rounded-full border border-slate-300/80 dark:border-slate-700 bg-white/70 dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
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
                                        className="flex items-center justify-center px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-full bg-slate-200/90 dark:bg-slate-800 text-[11px] sm:text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors"
                                        type="button"
                                        onClick={logout}
                                    >
                                        Logout
                                    </button>
                                </>
                            )}
                            <button
                                ref={settingsButtonRef}
                                className="flex items-center justify-center size-9 sm:size-10 rounded-full border border-slate-300/80 dark:border-slate-700 bg-white/70 dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                type="button"
                                onClick={() => setShowSettings((prev) => !prev)}
                            >
                                <span className="material-symbols-outlined text-gray-600 dark:text-gray-300">settings</span>
                            </button>
                        </div>
                    </div>
                    </div>
                    {showSettings ? (
                        <div ref={settingsPanelRef} className="absolute top-16 left-4 right-4 sm:left-auto sm:right-4 z-40 w-[min(90vw,20rem)] sm:w-72 bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl p-4 space-y-4">
                            <div>
                                <div className="text-xs font-semibold text-slate-500 mb-2">App theme</div>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        className={`py-2 rounded-lg text-xs font-semibold border transition-colors ${
                                            uiTheme === 'light'
                                                ? 'bg-primary text-white border-primary'
                                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                                        }`}
                                        onClick={() => setUiTheme('light')}
                                    >
                                        Light
                                    </button>
                                    <button
                                        type="button"
                                        className={`py-2 rounded-lg text-xs font-semibold border transition-colors ${
                                            uiTheme === 'dark'
                                                ? 'bg-primary text-white border-primary'
                                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                                        }`}
                                        onClick={() => setUiTheme('dark')}
                                    >
                                        Dark
                                    </button>
                                </div>
                            </div>
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
                            <div className="flex items-center justify-between">
                                <div className="text-xs font-semibold text-slate-500">Auto queen</div>
                                <button
                                    className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
                                        autoQueenEnabled ? 'bg-primary/10 text-primary' : 'bg-slate-200 text-slate-600'
                                    }`}
                                    type="button"
                                    onClick={() => setAutoQueenEnabled((prev) => !prev)}
                                >
                                    {autoQueenEnabled ? 'Enabled' : 'Disabled'}
                                </button>
                            </div>
                        </div>
                    ) : null}
                    {showNotifications ? (
                        <div ref={notificationsPanelRef} className="absolute top-16 left-4 right-4 sm:left-auto sm:right-4 z-40 w-[min(92vw,24rem)] sm:w-80 bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl p-4">
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
                                className="flex min-w-[90px] sm:min-w-[100px] flex-col gap-1 rounded-xl bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-gray-800 p-3 items-center text-center shadow-sm"
                            >
                                <span className={`material-symbols-outlined text-[20px] ${stat.color}`}>{stat.icon}</span>
                                <p className="text-slate-900 dark:text-white text-lg font-bold leading-tight">{stat.value}</p>
                                <p className="text-slate-500 dark:text-gray-400 text-xs font-normal">{stat.label}</p>
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
                                className="group relative flex items-center p-4 h-28 sm:h-32 rounded-2xl bg-gradient-to-br from-slate-50 to-slate-200 dark:from-[#1e232e] dark:to-[#13161c] border border-slate-200 dark:border-gray-800 hover:border-primary/50 transition-all overflow-hidden disabled:opacity-60"
                                type="button"
                            >
                                <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                    <span className="material-symbols-outlined text-6xl">{card.icon}</span>
                                </div>
                                <div className="relative z-10 flex items-center gap-3 w-full">
                                    <div className="bg-slate-100/80 dark:bg-gray-800/50 p-2 rounded-lg backdrop-blur-sm shrink-0">
                                        <span className={`material-symbols-outlined ${card.color}`}>{card.icon}</span>
                                    </div>
                                    <div className="text-left leading-tight">
                                        <span className="block text-2xl font-bold text-slate-900 dark:text-white">{card.time}</span>
                                        <span className="block text-sm text-slate-600 dark:text-gray-400 font-medium mt-1">{card.label}</span>
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button
                            onClick={toggleCustomForm}
                            className="w-full py-3 rounded-xl bg-gradient-to-r from-primary/80 to-blue-500 text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all"
                            type="button"
                        >
                            <span className="material-symbols-outlined">add_circle</span>
                            Create Custom Game
                        </button>
                        <button
                            onClick={toggleBotPanel}
                            className="group relative w-full overflow-hidden rounded-xl border border-sky-300/35 bg-gradient-to-r from-[#0f4fd8] via-[#0d78dc] to-[#11b8e8] py-3 text-sm font-semibold text-white shadow-lg shadow-sky-500/25 transition-all hover:brightness-105 hover:shadow-sky-400/40 active:scale-[0.99] flex items-center justify-center gap-2.5"
                            type="button"
                        >
                            <span className="inline-flex size-7 items-center justify-center overflow-hidden rounded-full bg-black/20 ring-1 ring-white/35">
                                <img src={JIANG_BOT_IMAGE} alt="Jiang bot" className="h-full w-full object-cover" />
                            </span>
                            <span>Play a Bot</span>
                        </button>
                    </div>
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

                <section className="mt-6 pl-4 border-t border-slate-200 dark:border-gray-800 pt-6 bg-gradient-to-b from-transparent to-slate-200/40 dark:to-black/20">
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
                                        className="snap-center shrink-0 w-[min(80vw,240px)] sm:w-[240px] bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-gray-800 rounded-xl overflow-hidden shadow-lg text-left"
                                        type="button"
                                        onClick={() => navigate(`/game/${game.id}`)}
                                    >
                                        <div className="relative aspect-square w-full bg-slate-200 dark:bg-gray-800">
                                            <div className="w-full h-full flex items-center justify-center">
                                                    <MiniChessBoard
                                                        fen={game.current_fen}
                                                        size={200}
                                                        themeIndex={boardThemeIndex}
                                                        pieceSet={pieceSet}
                                                    />
                                            </div>
                                            <div className="absolute left-0 top-0 bottom-0 w-2 bg-slate-400 dark:bg-gray-700 flex flex-col">
                                                <div className="bg-white w-full" style={{ height: `${evalSplit.white}%` }}></div>
                                                <div className="bg-black w-full" style={{ height: `${evalSplit.black}%` }}></div>
                                            </div>
                                        </div>
                                        <div className="p-3">
                                            <div className="flex justify-between items-center mb-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="size-2 rounded-full bg-white border border-slate-300 dark:border-transparent"></span>
                                                    <span className="text-sm font-bold truncate max-w-[80px]">{game.white?.username || 'White'}</span>
                                                </div>
                                                <span className="text-xs bg-slate-200 dark:bg-gray-700 px-1.5 py-0.5 rounded text-slate-600 dark:text-gray-300">
                                                    {getRatingForControl(game.white, game.time_control) || '--'}
                                                </span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <div className="flex items-center gap-2">
                                                    <span className="size-2 rounded-full bg-black border border-slate-500 dark:border-gray-600"></span>
                                                    <span className="text-sm font-bold truncate max-w-[80px]">{game.black?.username || 'Black'}</span>
                                                </div>
                                                <span className="text-xs bg-slate-200 dark:bg-gray-700 px-1.5 py-0.5 rounded text-slate-600 dark:text-gray-300">
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
                {isPlayModalOpen ? (
                    <div
                        className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6"
                        onClick={closePlayModal}
                    >
                        <div
                            className={`w-full ${showCustomForm ? 'max-w-6xl' : 'max-w-3xl'} max-h-[90dvh] overflow-y-auto no-scrollbar`}
                            onClick={(event) => event.stopPropagation()}
                        >
                            {showCustomForm ? (
                                <div className="rounded-3xl border border-[#30466e] bg-[#1a2335] p-4 sm:p-5 shadow-[0_24px_55px_rgba(7,11,24,0.45)] space-y-4 text-slate-100">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-xl sm:text-2xl font-bold tracking-tight">Create custom game</h3>
                                        <button
                                            type="button"
                                        className="size-9 rounded-full border border-[#3d5580] bg-[#0d1730] text-slate-400 hover:text-white hover:border-[#4d6aa0] flex items-center justify-center transition-colors"
                                            onClick={closePlayModal}
                                        >
                                            <span className="material-symbols-outlined">close</span>
                                        </button>
                                    </div>
                                    <div className="grid gap-4 sm:grid-cols-2 items-start">
                                        <div className="space-y-2">
                                            <div className="text-xs font-semibold text-slate-400">Opponent</div>
                                            <div className="relative">
                                                <input
                                                    value={customOpponentQuery}
                                                    onChange={(event) => setCustomOpponentQuery(event.target.value)}
                                                    placeholder="Search username"
                                                    className="h-12 w-full rounded-xl border border-[#2c3f64] bg-[#0d1730] px-4 text-sm font-semibold text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/40"
                                                />
                                                {customOpponentQuery.trim().length >= 2 ? (
                                                    <div className="absolute z-30 left-0 right-0 top-[calc(100%+8px)] rounded-xl border border-[#2c3f64] bg-[#111d38] max-h-48 overflow-y-auto shadow-2xl shadow-black/30">
                                                        {customSearchLoading ? (
                                                            <div className="px-3 py-2 text-[11px] text-slate-400">Searching...</div>
                                                        ) : customSearchResults.length ? (
                                                            customSearchResults.map((result) => (
                                                                <button
                                                                    key={result.id}
                                                                    type="button"
                                                                    className="w-full px-3 py-2 text-left text-xs hover:bg-[#1c2c50] flex items-center justify-between"
                                                                    onClick={() => {
                                                                        setCustomOpponent(result);
                                                                        setCustomOpponentQuery(result.username || '');
                                                                        setCustomSearchResults([]);
                                                                        setCustomSearchError(null);
                                                                    }}
                                                                >
                                                                    <span className="font-semibold text-slate-100">
                                                                        {result.username}
                                                                    </span>
                                                                    <span className="text-[10px] text-slate-400">
                                                                        {result.rating_blitz ?? '--'}
                                                                    </span>
                                                                </button>
                                                            ))
                                                        ) : (
                                                            <div className="px-3 py-2 text-[11px] text-slate-400">
                                                                {customSearchError || 'No users found.'}
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : null}
                                            </div>
                                            <div className="min-h-[18px]">
                                                {customOpponent ? (
                                                    <div className="text-[11px] text-slate-400 flex items-center justify-between">
                                                        <span>Selected: {customOpponent.username}</span>
                                                        <button
                                                            type="button"
                                                            className="text-[11px] text-slate-300 hover:text-white"
                                                            onClick={() => {
                                                                setCustomOpponent(null);
                                                                setCustomOpponentQuery('');
                                                            }}
                                                        >
                                                            Clear
                                                        </button>
                                                    </div>
                                                ) : null}
                                            </div>
                                        </div>
                                        <div className="grid gap-4">
                                            <div className="space-y-2">
                                                <div className="text-xs font-semibold text-slate-400">Color</div>
                                                <select
                                                    value={customColor}
                                                    onChange={(event) => setCustomColor(event.target.value)}
                                                    className="h-12 w-full rounded-xl border border-[#2c3f64] bg-[#0d1730] px-4 text-sm font-semibold text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/40"
                                                >
                                                    <option value="auto">Random</option>
                                                    <option value="white">White</option>
                                                    <option value="black">Black</option>
                                                </select>
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="space-y-2">
                                                    <div className="text-xs font-semibold text-slate-400">Format</div>
                                                    <select
                                                        value={customFormat}
                                                        onChange={(event) => setCustomFormat(event.target.value)}
                                                        className="h-12 w-full rounded-xl border border-[#2c3f64] bg-[#0d1730] px-4 text-sm font-semibold text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/40"
                                                    >
                                                        {customFormatOptions.map((option) => (
                                                            <option key={option.id} value={option.id}>
                                                                {option.label}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div className="space-y-2">
                                                    <div className="text-xs font-semibold text-slate-400">Rated</div>
                                                    <label className="h-12 rounded-xl border border-[#2c3f64] bg-[#0d1730] px-3 sm:px-4 flex items-center gap-2 sm:gap-3 text-sm font-semibold text-slate-100">
                                                        <input
                                                            type="checkbox"
                                                            className="h-4 w-4 rounded border-slate-500 text-primary focus:ring-primary/40"
                                                            checked={customRated}
                                                            onChange={(event) => {
                                                                if (customFormat === 'custom') return;
                                                                setCustomRated(event.target.checked);
                                                            }}
                                                            disabled={customFormat === 'custom'}
                                                        />
                                                        <span>{customFormat === 'custom' ? 'Unrated (Custom)' : 'Rated'}</span>
                                                    </label>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <div className="space-y-2">
                                            <div className="text-xs font-semibold text-slate-400">Minutes</div>
                                            <input
                                                type="number"
                                                min={0.5}
                                                step={0.5}
                                                value={customMinutes}
                                                onChange={(event) => setCustomMinutes(event.target.value)}
                                                className="h-12 w-full rounded-xl border border-[#2c3f64] bg-[#0d1730] px-4 text-lg font-semibold text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/40"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <div className="text-xs font-semibold text-slate-400">Increment (s)</div>
                                            <input
                                                type="number"
                                                min={0}
                                                max={60}
                                                step={1}
                                                value={customIncrement}
                                                onChange={(event) => setCustomIncrement(event.target.value)}
                                                className="h-12 w-full rounded-xl border border-[#2c3f64] bg-[#0d1730] px-4 text-lg font-semibold text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/40"
                                            />
                                        </div>
                                    </div>
                                    {customError ? (
                                        <div className="text-sm text-red-300">{customError}</div>
                                    ) : null}
                                    <button
                                        type="button"
                                        className="w-full h-12 rounded-xl bg-primary text-white text-base font-semibold shadow-lg shadow-primary/25 disabled:opacity-60"
                                        onClick={handleCreateCustomGame}
                                        disabled={customSubmitting}
                                    >
                                        {customSubmitting ? 'Creating...' : 'Send Challenge'}
                                    </button>
                                </div>
                            ) : null}
                            {showBotPanel ? (
                                <div className="rounded-3xl border border-[#30466e] bg-[#1a2335] p-4 sm:p-5 shadow-[0_20px_45px_rgba(7,11,24,0.35)] space-y-4 text-slate-100">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                                            <span className="inline-flex size-8 items-center justify-center overflow-hidden rounded-full bg-[#1a2f4f] ring-1 ring-[#35507f]">
                                                <img src={JIANG_BOT_IMAGE} alt="Jiang bot" className="h-full w-full object-cover" />
                                            </span>
                                            Play a Bot
                                        </h3>
                                        <button
                                            type="button"
                                            className="text-slate-400 hover:text-white"
                                            onClick={closePlayModal}
                                        >
                                            <span className="material-symbols-outlined">close</span>
                                        </button>
                                    </div>
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-xs font-semibold text-slate-400">Time control</span>
                                        <select
                                            value={botMode}
                                            onChange={(event) => setBotMode(event.target.value)}
                                            className="text-xs font-semibold rounded-xl border border-[#2c3f64] bg-[#0d1730] px-3 py-2 text-slate-100"
                                        >
                                            {botModeOptions.map((option) => (
                                                <option key={option.id} value={option.id}>
                                                    {option.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    {botLoading ? (
                                        <div className="text-sm text-slate-400">Loading bots...</div>
                                    ) : (
                                        <div className="grid gap-3">
                                            {bots.map((bot) => (
                                                <div
                                                    key={bot.id}
                                                    className="flex items-center justify-between gap-3 rounded-xl border border-[#2c3f64] bg-[#0d1730] p-3"
                                                >
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <div className="size-10 rounded-lg bg-[#263a5e] flex items-center justify-center text-lg shrink-0">
                                                            {bot.bot_avatar ? (
                                                                typeof bot.bot_avatar === 'string' && (bot.bot_avatar.startsWith('http') || bot.bot_avatar.startsWith('/')) ? (
                                                                    <img src={bot.bot_avatar} alt={`${bot.first_name || bot.username || 'Bot'} avatar`} className="h-full w-full object-cover" />
                                                                ) : (
                                                                    bot.bot_avatar
                                                                )
                                                            ) : (
                                                                <img src={JIANG_BOT_IMAGE} alt="Jiang bot" className="h-full w-full object-cover" />
                                                            )}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="font-semibold text-sm truncate">
                                                                {bot.first_name || bot.username || 'Bot'}
                                                            </p>
                                                            <p className="text-xs text-slate-400">Rating {bot.rating ?? '--'}</p>
                                                        </div>
                                                    </div>
                                                    <button
                                                        className="bg-primary text-white text-xs font-semibold px-3 py-2 rounded-lg disabled:opacity-60"
                                                        type="button"
                                                        onClick={() => handleCreateBotGame(bot.id)}
                                                        disabled={botSubmittingId === bot.id}
                                                    >
                                                        {botSubmittingId === bot.id ? 'Starting...' : 'Play'}
                                                    </button>
                                                </div>
                                            ))}
                                            {!bots.length && !botLoading ? (
                                                <div className="text-sm text-slate-400">No bots available.</div>
                                            ) : null}
                                        </div>
                                    )}
                                    {botError ? <p className="text-sm text-red-300">{botError}</p> : null}
                                </div>
                            ) : null}
                        </div>
                    </div>
                ) : null}
            </>
        </Layout>
    );
}
