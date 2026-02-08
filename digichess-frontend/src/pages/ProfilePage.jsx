import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import CountrySelect from '../components/common/CountrySelect';
import MiniChessBoard from '../components/chess/MiniChessBoard';
import { useAuth } from '../context/AuthContext';
import {
    createThread,
    fetchPublicAccount,
    fetchRatingHistory,
    fetchUserGames,
    sendFriendRequest,
    updateProfile,
} from '../api';
import { getBlitzTag, getRatingTagClasses } from '../utils/ratingTags';
import { flagFor } from '../utils/countries';

const ratingModes = ['bullet', 'blitz', 'rapid', 'classical'];
const ratingRanges = [
    { id: 'week', label: 'This Week', days: 7 },
    { id: 'month', label: 'This Month', days: 30 },
    { id: 'year', label: 'This Year', days: 365 },
    { id: 'all', label: 'All Time', days: null },
];
const RECENT_LIMIT = 5;
const RECENT_PAGE_SIZE = 6;

const formatResult = (game, username) => {
    if (!game || !username) return '•';
    if (game.result === '1/2-1/2') return 'Draw';
    if (game.result === '1-0') return game.white?.username === username ? 'Win' : 'Loss';
    if (game.result === '0-1') return game.black?.username === username ? 'Win' : 'Loss';
    return 'In Progress';
};

const RatingChart = ({ history }) => {
    if (!history || history.length < 2) {
        return (
            <div className="text-sm text-slate-500">Not enough data to show chart.</div>
        );
    }
    const values = history.map((point) => point.rating);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const points = history.map((point, index) => {
        const x = (index / (history.length - 1)) * 100;
        const y = 50 - ((point.rating - min) / range) * 45;
        return `${x},${y}`;
    });
    return (
        <svg className="w-full h-40" viewBox="0 0 100 50" preserveAspectRatio="none">
            <polyline
                fill="none"
                stroke="#135bec"
                strokeWidth="2"
                points={points.join(' ')}
            />
        </svg>
    );
};

export default function ProfilePage() {
    const { username: profileUsername } = useParams();
    const navigate = useNavigate();
    const { user, isAuthenticated, setUser } = useAuth();
    const [profileUser, setProfileUser] = useState(null);
    const [mode, setMode] = useState('blitz');
    const [timeRange, setTimeRange] = useState('all');
    const [history, setHistory] = useState([]);
    const [recentGames, setRecentGames] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [friendState, setFriendState] = useState('idle');
    const [friendError, setFriendError] = useState(null);
    const [activeGame, setActiveGame] = useState(null);
    const [activeGameLoading, setActiveGameLoading] = useState(false);
    const [editOpen, setEditOpen] = useState(false);
    const [editLoading, setEditLoading] = useState(false);
    const [editError, setEditError] = useState(null);
    const [editForm, setEditForm] = useState({ nickname: '', bio: '', country: '' });
    const [challengeError, setChallengeError] = useState(null);
    const [showAllGames, setShowAllGames] = useState(false);
    const [gamesFilter, setGamesFilter] = useState('all');
    const [gamesPage, setGamesPage] = useState(1);

    const isSelf = !profileUsername || (user?.username && user.username === profileUsername);
    const displayUser = isSelf ? user : profileUser;
    const rangeParams = useMemo(() => {
        if (timeRange === 'all') return {};
        const now = new Date();
        const start = new Date(now);
        const range = ratingRanges.find((item) => item.id === timeRange);
        if (range?.days) {
            start.setDate(start.getDate() - range.days);
        }
        return {
            start: start.toISOString().slice(0, 10),
            end: now.toISOString().slice(0, 10),
        };
    }, [timeRange]);

    const stats = useMemo(() => ([
        { label: 'Bullet', value: displayUser?.rating_bullet || 800 },
        { label: 'Blitz', value: displayUser?.rating_blitz || 800 },
        { label: 'Rapid', value: displayUser?.rating_rapid || 800 },
    ]), [displayUser]);

    useEffect(() => {
        if (!profileUsername || isSelf) {
            setProfileUser(null);
            return;
        }
        let active = true;
        fetchPublicAccount(profileUsername)
            .then((data) => {
                if (active) setProfileUser(data);
            })
            .catch(() => {
                if (active) setProfileUser(null);
            });
        return () => {
            active = false;
        };
    }, [profileUsername, isSelf]);

    const currentRating = useMemo(() => {
        if (history.length) {
            return history[history.length - 1].rating;
        }
        return displayUser?.[`rating_${mode}`] || 0;
    }, [history, mode, displayUser]);

    const peakRating = useMemo(() => {
        if (!history.length) return currentRating || 0;
        return Math.max(...history.map((point) => point.rating));
    }, [history, currentRating]);

    const ratingDelta = useMemo(() => {
        if (history.length < 2) return 0;
        return history[history.length - 1].rating - history[history.length - 2].rating;
    }, [history]);

    const completedGames = useMemo(
        () => recentGames.filter((game) => ['1-0', '0-1', '1/2-1/2'].includes(game.result)),
        [recentGames]
    );

    const modeStats = useMemo(() => {
        if (!displayUser?.username) {
            return { total: 0, winPct: 0, winPctWhite: 0, winPctBlack: 0 };
        }
        const modeGames = completedGames.filter((game) => game.time_control === mode);
        const total = modeGames.length;
        const wins = modeGames.filter((game) => formatResult(game, displayUser.username) === 'Win').length;
        const winPct = total ? Math.round((wins / total) * 100) : 0;
        const whiteGames = modeGames.filter((game) => game.white?.username === displayUser.username);
        const blackGames = modeGames.filter((game) => game.black?.username === displayUser.username);
        const whiteWins = whiteGames.filter((game) => game.result === '1-0').length;
        const blackWins = blackGames.filter((game) => game.result === '0-1').length;
        const winPctWhite = whiteGames.length ? Math.round((whiteWins / whiteGames.length) * 100) : 0;
        const winPctBlack = blackGames.length ? Math.round((blackWins / blackGames.length) * 100) : 0;
        return { total, winPct, winPctWhite, winPctBlack };
    }, [completedGames, mode, displayUser]);

    const recentPreview = useMemo(() => completedGames.slice(0, RECENT_LIMIT), [completedGames]);

    const filteredGames = useMemo(() => {
        if (!displayUser?.username) return [];
        if (gamesFilter === 'all') return completedGames;
        const desired = gamesFilter === 'win' ? 'Win' : gamesFilter === 'loss' ? 'Loss' : 'Draw';
        return completedGames.filter((game) => formatResult(game, displayUser.username) === desired);
    }, [completedGames, gamesFilter, displayUser]);

    const totalPages = useMemo(() => {
        return Math.max(1, Math.ceil(filteredGames.length / RECENT_PAGE_SIZE));
    }, [filteredGames.length]);

    const pagedGames = useMemo(() => {
        const start = (gamesPage - 1) * RECENT_PAGE_SIZE;
        return filteredGames.slice(start, start + RECENT_PAGE_SIZE);
    }, [filteredGames, gamesPage]);

    const pageStart = filteredGames.length ? (gamesPage - 1) * RECENT_PAGE_SIZE + 1 : 0;
    const pageEnd = Math.min(filteredGames.length, gamesPage * RECENT_PAGE_SIZE);

    useEffect(() => {
        if (gamesPage > totalPages) {
            setGamesPage(totalPages);
        }
    }, [gamesPage, totalPages]);

    useEffect(() => {
        const load = async () => {
            if (!displayUser) {
                setLoading(false);
                return;
            }
            setLoading(true);
            setError(null);
            try {
                const [historyRes, gamesRes] = await Promise.all([
                    fetchRatingHistory(displayUser.username, mode, rangeParams),
                    fetchUserGames(displayUser.username, { page_size: 50 }),
                ]);
                setHistory(historyRes.history || []);
                setRecentGames(gamesRes.results || []);
            } catch (err) {
                setError('Failed to load profile data.');
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [displayUser, mode, rangeParams]);

    useEffect(() => {
        if (!displayUser?.username || isSelf) {
            setActiveGame(null);
            return;
        }
        if (displayUser?.spectate_game_id) {
            setActiveGame({ id: displayUser.spectate_game_id });
            return;
        }
        let active = true;
        setActiveGameLoading(true);
        fetchUserGames(displayUser.username, { status: 'active', page_size: 1 })
            .then((data) => {
                if (!active) return;
                const games = data?.results || [];
                setActiveGame(games[0] || null);
            })
            .catch(() => {
                if (active) setActiveGame(null);
            })
            .finally(() => {
                if (active) setActiveGameLoading(false);
            });
        return () => {
            active = false;
        };
    }, [displayUser?.username, displayUser?.spectate_game_id, isSelf]);

    useEffect(() => {
        if (!isSelf || !displayUser) return;
        setEditForm({
            nickname: displayUser.nickname || '',
            bio: displayUser.bio || '',
            country: displayUser.country || '',
        });
    }, [isSelf, displayUser]);

    useEffect(() => {
        if (showAllGames) {
            setGamesPage(1);
        }
    }, [showAllGames, gamesFilter]);

    const blitzTag = displayUser?.is_bot ? null : getBlitzTag(displayUser?.rating_blitz);
    const blitzTagClasses = blitzTag ? getRatingTagClasses(blitzTag) : '';
    const canFriend = isAuthenticated && displayUser && !isSelf && !displayUser.is_bot;
    const canMessage = isAuthenticated && displayUser && !isSelf && !displayUser.is_bot;
    const liveGameId = activeGame?.id || displayUser?.spectate_game_id || null;
    const isPlayingLive = Boolean(displayUser?.is_playing || liveGameId);
    const canChallenge = isAuthenticated && displayUser && !isSelf && !displayUser.is_bot && !isPlayingLive;

    const handleFriendRequest = async () => {
        if (!displayUser?.id || friendState === 'loading' || friendState === 'sent') return;
        setFriendError(null);
        setFriendState('loading');
        try {
            await sendFriendRequest(displayUser.id);
            setFriendState('sent');
        } catch (err) {
            setFriendState('idle');
            setFriendError(err?.message || 'Could not send request.');
        }
    };

    const handleMessage = async () => {
        if (!displayUser?.id) return;
        try {
            const thread = await createThread(displayUser.id);
            if (thread?.id) {
                navigate(`/messages?thread=${thread.id}`);
            }
        } catch (err) {
            setFriendError(err?.message || 'Could not start chat.');
        }
    };

    const handleEditSave = async () => {
        setEditError(null);
        setEditLoading(true);
        try {
            const updated = await updateProfile({
                nickname: editForm.nickname || '',
                bio: editForm.bio || '',
                country: editForm.country || '',
            });
            setUser(updated);
            setEditOpen(false);
        } catch (err) {
            setEditError(err?.message || 'Could not update profile.');
        } finally {
            setEditLoading(false);
        }
    };

    const handleChallenge = () => {
        if (!displayUser?.id || isSelf) return;
        if (!isAuthenticated) {
            navigate('/login');
            return;
        }
        if (isPlayingLive) {
            setChallengeError('Player is already in a live game.');
            return;
        }
        navigate(`/play?opponent=${displayUser.id}&username=${encodeURIComponent(displayUser.username || '')}`);
    };

    return (
        <Layout showHeader={false}>
            <div className="flex-1 overflow-y-auto pb-24 no-scrollbar">
                <div className="sticky top-0 z-50 bg-gradient-to-b from-background-light/95 to-background-light/90 dark:from-background-dark/95 dark:to-background-dark/90 backdrop-blur-md border-b border-border-light dark:border-border-dark shadow-sm px-4 py-3 flex items-center justify-between">
                    <button className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-slate-500 dark:text-slate-400" type="button" onClick={() => window.history.back()}>
                        <span className="material-symbols-outlined">arrow_back</span>
                    </button>
                    <h1 className="text-lg font-bold">Profile</h1>
                    <button
                        className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-slate-500 dark:text-slate-400"
                        type="button"
                        onClick={() => setEditOpen(true)}
                    >
                        <span className="material-symbols-outlined">settings</span>
                    </button>
                </div>
                {!displayUser ? (
                    <div className="p-6 text-sm text-slate-500">
                        {profileUsername ? 'Loading profile...' : 'Please sign in to view your profile.'}
                    </div>
                ) : (
                    <>
                        <div className="px-4 py-6 flex flex-col items-center">
                            <div className="relative mb-4">
                                <div className="w-28 h-28 rounded-xl overflow-hidden shadow-lg ring-4 ring-surface-light dark:ring-surface-dark bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-xl font-bold">
                                    {displayUser?.username?.slice(0, 2).toUpperCase()}
                                </div>
                                <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-green-500 rounded-full border-4 border-background-light dark:border-background-dark flex items-center justify-center">
                                    <div className="w-full h-full rounded-full animate-ping opacity-20 bg-green-500 absolute"></div>
                                </div>
                            </div>
                            <div className="text-center space-y-1">
                                <div className="flex items-center justify-center gap-2">
                                    {blitzTag ? (
                                        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider ${blitzTagClasses}`}>
                                            {blitzTag}
                                        </span>
                                    ) : null}
                                    <h2 className="text-2xl font-bold tracking-tight">{displayUser?.username}</h2>
                                    <span className="text-lg">{displayUser?.country || '🌍'}</span>
                                </div>
                                <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">{displayUser?.bio || 'No bio yet.'}</p>
                            </div>
                            <div className="grid grid-cols-3 gap-4 w-full max-w-sm mt-6">
                                {stats.map((stat) => (
                                    <div key={stat.label} className="text-center p-3 rounded-xl bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-slate-800 shadow-sm">
                                        <p className="text-lg font-bold">{stat.value}</p>
                                        <p className="text-xs text-slate-500">{stat.label}</p>
                                    </div>
                                ))}
                            </div>
                            <div className="w-full max-w-sm mt-4">
                                <div className="text-xs font-semibold text-slate-500 mb-2">DigiQuiz</div>
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="text-center p-3 rounded-xl bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-slate-800 shadow-sm">
                                        <p className="text-lg font-bold">{displayUser?.rating_digiquiz ?? 0}</p>
                                        <p className="text-[10px] text-slate-500 uppercase tracking-wide font-bold">Rating</p>
                                    </div>
                                    <div className="text-center p-3 rounded-xl bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-slate-800 shadow-sm">
                                        <p className="text-lg font-bold text-emerald-500">{displayUser?.digiquiz_correct ?? 0}</p>
                                        <p className="text-[10px] text-slate-500 uppercase tracking-wide font-bold">Correct</p>
                                    </div>
                                    <div className="text-center p-3 rounded-xl bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-slate-800 shadow-sm">
                                        <p className="text-lg font-bold text-red-500">{displayUser?.digiquiz_wrong ?? 0}</p>
                                        <p className="text-[10px] text-slate-500 uppercase tracking-wide font-bold">Wrong</p>
                                    </div>
                                </div>
                            </div>
                            {isSelf ? (
                                <div className="flex gap-3 w-full max-w-sm mt-4">
                                    <button
                                        className="flex-1 bg-surface-light dark:bg-surface-dark hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-900 dark:text-white font-semibold py-2.5 px-4 rounded-lg border border-border-light dark:border-border-dark transition-colors flex items-center justify-center gap-2 text-sm"
                                        type="button"
                                        onClick={() => setEditOpen(true)}
                                    >
                                        <span className="material-symbols-outlined text-lg">edit</span>
                                        Edit profile
                                    </button>
                                </div>
                            ) : (canFriend || canMessage) ? (
                                <div className="flex flex-col gap-2 w-full max-w-sm mt-4">
                                    <div className="flex gap-3">
                                        {canFriend ? (
                                            <button
                                                className="flex-1 bg-surface-light dark:bg-surface-dark hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-900 dark:text-white font-semibold py-2.5 px-4 rounded-lg border border-border-light dark:border-border-dark transition-colors flex items-center justify-center gap-2 text-sm disabled:opacity-60"
                                                type="button"
                                                onClick={handleFriendRequest}
                                                disabled={friendState === 'loading' || friendState === 'sent'}
                                            >
                                                <span className="material-symbols-outlined text-lg">
                                                    {friendState === 'sent' ? 'check' : 'person_add'}
                                                </span>
                                                {friendState === 'sent' ? 'Request sent' : 'Add friend'}
                                            </button>
                                        ) : null}
                                        {canMessage ? (
                                            <button
                                                className="flex-1 bg-primary hover:bg-blue-600 text-white font-semibold py-2.5 px-4 rounded-lg shadow-lg shadow-primary/20 transition-colors flex items-center justify-center gap-2 text-sm"
                                                type="button"
                                                onClick={handleMessage}
                                            >
                                                <span className="material-symbols-outlined text-lg">mail</span>
                                                Message
                                            </button>
                                        ) : null}
                                    </div>
                                    {isPlayingLive && liveGameId ? (
                                        <button
                                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 px-4 rounded-lg shadow-lg shadow-emerald-600/20 transition-colors"
                                            type="button"
                                            onClick={() => navigate(`/game/${liveGameId}`)}
                                        >
                                            View live game
                                        </button>
                                    ) : (
                                        <button
                                            className="w-full bg-slate-900 text-white font-semibold py-2.5 px-4 rounded-lg shadow-lg shadow-slate-900/20 transition-colors disabled:opacity-60"
                                            type="button"
                                            onClick={handleChallenge}
                                            disabled={!canChallenge || activeGameLoading}
                                        >
                                            Challenge
                                        </button>
                                    )}
                                    {activeGameLoading ? (
                                        <div className="text-xs text-slate-500">Checking live game…</div>
                                    ) : activeGame ? (
                                        <div className="text-xs text-slate-500">Currently playing a live game.</div>
                                    ) : null}
                                    {challengeError ? (
                                        <div className="text-xs text-red-500">{challengeError}</div>
                                    ) : null}
                                </div>
                            ) : null}
                            {friendError ? (
                                <div className="mt-2 text-xs text-red-500">{friendError}</div>
                            ) : null}
                        </div>

                        <div className="px-4 mb-4">
                            <h3 className="text-lg font-bold mb-3">Performance</h3>
                            <div className="bg-surface-light dark:bg-surface-dark p-1 rounded-xl flex gap-1 border border-slate-200 dark:border-slate-800 overflow-x-auto hide-scrollbar">
                                {ratingModes.map((ratingMode) => (
                                    <button
                                        key={ratingMode}
                                        className={`flex-1 min-w-[80px] py-2 px-3 rounded-lg text-sm font-medium transition-all ${mode === ratingMode ? 'bg-white dark:bg-background-dark text-primary font-bold' : 'text-slate-500'}`}
                                        type="button"
                                        onClick={() => setMode(ratingMode)}
                                    >
                                        {ratingMode.toUpperCase()}
                                    </button>
                                ))}
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                                {ratingRanges.map((range) => (
                                    <button
                                        key={range.id}
                                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                                            timeRange === range.id
                                                ? 'bg-primary text-white border-primary'
                                                : 'bg-surface-light dark:bg-surface-dark border-slate-200 dark:border-slate-700 text-slate-500'
                                        }`}
                                        type="button"
                                        onClick={() => setTimeRange(range.id)}
                                    >
                                        {range.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="mx-4 bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-5 relative overflow-hidden shadow-sm">
                            <div className="flex justify-between items-start mb-6">
                                <div>
                                    <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Current Rating</p>
                                    <div className="flex items-baseline gap-2">
                                        <h2 className="text-4xl font-bold text-slate-900 dark:text-white">{currentRating || '--'}</h2>
                                        <span className={`text-sm font-bold flex items-center ${ratingDelta >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                            <span className="material-symbols-outlined text-sm">
                                                {ratingDelta >= 0 ? 'arrow_upward' : 'arrow_downward'}
                                            </span>
                                            {ratingDelta >= 0 ? `+${ratingDelta}` : ratingDelta}
                                        </span>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide font-bold">Peak</p>
                                    <p className="text-lg font-bold text-slate-700 dark:text-slate-300">{peakRating || '--'}</p>
                                </div>
                            </div>
                            {loading ? (
                                <div className="text-sm text-slate-500">Loading rating history...</div>
                            ) : error ? (
                                <div className="text-sm text-red-500">{error}</div>
                            ) : (
                                <div className="relative h-48 w-full mt-4">
                                    <div className="absolute inset-0 flex flex-col justify-between text-xs text-slate-400 dark:text-slate-600 font-mono pointer-events-none">
                                        <div className="w-full border-b border-dashed border-border-light dark:border-slate-700/50"></div>
                                        <div className="w-full border-b border-dashed border-border-light dark:border-slate-700/50"></div>
                                        <div className="w-full border-b border-dashed border-border-light dark:border-slate-700/50"></div>
                                        <div className="w-full border-b border-dashed border-border-light dark:border-slate-700/50"></div>
                                    </div>
                                    <RatingChart history={history} />
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-3 px-4 mt-4">
                            <div className="bg-surface-light dark:bg-surface-dark p-3 rounded-lg border border-border-light dark:border-border-dark flex flex-col items-center">
                                <span className="text-slate-500 dark:text-slate-300 font-bold text-lg">{modeStats.total}</span>
                                <span className="text-[10px] text-slate-500 uppercase tracking-wide font-bold">Total Games</span>
                            </div>
                            <div className="bg-surface-light dark:bg-surface-dark p-3 rounded-lg border border-border-light dark:border-border-dark flex flex-col items-center">
                                <span className="text-green-500 font-bold text-lg">{modeStats.total ? `${modeStats.winPct}%` : '--'}</span>
                                <span className="text-[10px] text-slate-500 uppercase tracking-wide font-bold">Win %</span>
                            </div>
                            <div className="bg-surface-light dark:bg-surface-dark p-3 rounded-lg border border-border-light dark:border-border-dark flex flex-col items-center">
                                <span className="text-blue-500 font-bold text-lg">{modeStats.total ? `${modeStats.winPctWhite}%` : '--'}</span>
                                <span className="text-[10px] text-slate-500 uppercase tracking-wide font-bold">Win % White</span>
                            </div>
                            <div className="bg-surface-light dark:bg-surface-dark p-3 rounded-lg border border-border-light dark:border-border-dark flex flex-col items-center">
                                <span className="text-purple-500 font-bold text-lg">{modeStats.total ? `${modeStats.winPctBlack}%` : '--'}</span>
                                <span className="text-[10px] text-slate-500 uppercase tracking-wide font-bold">Win % Black</span>
                            </div>
                        </div>

                        <div className="mt-8 px-4">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-bold">Recent Games</h3>
                                <button
                                    className="text-primary text-sm font-semibold hover:underline"
                                    type="button"
                                    onClick={() => setShowAllGames(true)}
                                >
                                    View All
                                </button>
                            </div>
                            <div className="space-y-3">
                                {recentPreview.map((game) => {
                                    const opponent = game.white?.username === displayUser.username ? game.black : game.white;
                                    const outcome = formatResult(game, displayUser.username);
                                    return (
                                        <button
                                            key={game.id}
                                            type="button"
                                            onClick={() => navigate(`/game/${game.id}`)}
                                            className="w-full bg-surface-light dark:bg-surface-dark rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-slate-800 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                                        >
                                            <div className={`w-1.5 h-12 rounded-full ${outcome === 'Win' ? 'bg-green-500' : outcome === 'Loss' ? 'bg-red-500' : 'bg-slate-400'}`}></div>
                                            <MiniChessBoard fen={game.current_fen} size={56} />
                                            <div className="flex flex-col items-center gap-1 shrink-0">
                                                <span className="text-xs font-bold uppercase">{outcome}</span>
                                                <div className="bg-slate-200 dark:bg-slate-700 w-8 h-8 rounded flex items-center justify-center text-xs font-bold">
                                                    {game.result || '*'}
                                                </div>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-bold text-sm truncate">vs. {opponent?.username || 'Opponent'}</p>
                                                <p className="text-xs text-slate-500 truncate">{game.time_control}</p>
                                            </div>
                                            <div className="text-xs text-slate-400 whitespace-nowrap">
                                                {new Date(game.created_at).toLocaleDateString()}
                                            </div>
                                        </button>
                                    );
                                })}
                                {!recentPreview.length && !loading ? (
                                    <p className="text-sm text-slate-500">No games yet.</p>
                                ) : null}
                            </div>
                        </div>
                    </>
                )}
            </div>

            {showAllGames ? (
                <div className="fixed inset-0 z-[60] flex items-center justify-center px-4 py-6">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowAllGames(false)} />
                    <div
                        className="relative w-full max-w-4xl bg-surface-light dark:bg-surface-dark rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 p-6"
                        role="dialog"
                        aria-modal="true"
                    >
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold">All Recent Games</h3>
                            <button
                                className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800"
                                type="button"
                                onClick={() => setShowAllGames(false)}
                            >
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <div className="flex gap-2 mb-4">
                            {['all', 'win', 'loss', 'draw'].map((filter) => (
                                <button
                                    key={filter}
                                    type="button"
                                    onClick={() => setGamesFilter(filter)}
                                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                                        gamesFilter === filter
                                            ? 'bg-primary text-white border-primary'
                                            : 'bg-white dark:bg-surface-dark border-slate-200 dark:border-slate-700 text-slate-500'
                                    }`}
                                >
                                    {filter === 'all' ? 'All' : filter.charAt(0).toUpperCase() + filter.slice(1)}
                                </button>
                            ))}
                        </div>
                        {pagedGames.length ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {pagedGames.map((game) => {
                                    const opponent = game.white?.username === displayUser.username ? game.black : game.white;
                                    const outcome = formatResult(game, displayUser.username);
                                    return (
                                        <button
                                            key={game.id}
                                            type="button"
                                            onClick={() => navigate(`/game/${game.id}`)}
                                            className="bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                                        >
                                            <div className="flex items-center gap-3">
                                                <MiniChessBoard fen={game.current_fen} size={72} />
                                                <div>
                                                    <div className="text-xs font-bold uppercase">{outcome}</div>
                                                    <div className="text-sm font-semibold truncate">vs. {opponent?.username || 'Opponent'}</div>
                                                    <div className="text-xs text-slate-500">{game.time_control}</div>
                                                </div>
                                            </div>
                                            <div className="text-[10px] text-slate-400 mt-2">
                                                {new Date(game.created_at).toLocaleDateString()}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="text-sm text-slate-500">No games found.</div>
                        )}
                        <div className="flex items-center justify-between mt-5">
                            <button
                                type="button"
                                className="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-xs font-semibold disabled:opacity-50"
                                onClick={() => setGamesPage((prev) => Math.max(1, prev - 1))}
                                disabled={gamesPage <= 1}
                            >
                                Prev
                            </button>
                            <div className="flex flex-col items-center gap-1">
                                <div className="text-[10px] text-slate-500">
                                    Showing {pageStart}-{pageEnd} of {filteredGames.length}
                                </div>
                                <div className="flex items-center gap-2 text-xs text-slate-500">
                                    <span>Page</span>
                                    <input
                                        type="number"
                                        min={1}
                                        max={totalPages}
                                        value={gamesPage}
                                        onChange={(event) => {
                                            const value = Number(event.target.value);
                                            if (!Number.isFinite(value)) return;
                                            setGamesPage(Math.min(Math.max(1, value), totalPages));
                                        }}
                                        className="w-14 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-center text-xs"
                                    />
                                    <span>of {totalPages}</span>
                                </div>
                            </div>
                            <button
                                type="button"
                                className="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-xs font-semibold disabled:opacity-50"
                                onClick={() => setGamesPage((prev) => Math.min(totalPages, prev + 1))}
                                disabled={gamesPage >= totalPages}
                            >
                                Next
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            {editOpen ? (
                <div className="fixed inset-0 z-[60] flex items-center justify-center px-4 py-6">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setEditOpen(false)} />
                    <div
                        className="relative w-full max-w-md bg-surface-light dark:bg-surface-dark rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 p-6"
                        role="dialog"
                        aria-modal="true"
                    >
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold">Edit profile</h3>
                            <button
                                className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800"
                                type="button"
                                onClick={() => setEditOpen(false)}
                            >
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <div className="space-y-4">
                            <label className="block">
                                <span className="text-xs font-semibold text-slate-500">Nickname</span>
                                <input
                                    className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-background-dark px-3 py-2 text-sm"
                                    value={editForm.nickname}
                                    onChange={(event) => setEditForm((prev) => ({ ...prev, nickname: event.target.value }))}
                                />
                            </label>
                            <label className="block">
                                <span className="text-xs font-semibold text-slate-500">Bio</span>
                                <textarea
                                    className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-background-dark px-3 py-2 text-sm min-h-[90px]"
                                    value={editForm.bio}
                                    onChange={(event) => setEditForm((prev) => ({ ...prev, bio: event.target.value }))}
                                />
                            </label>
                            <label className="block">
                                <span className="text-xs font-semibold text-slate-500">Country</span>
                                <div className="mt-1 flex items-center gap-2">
                                    <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-lg">
                                        {flagFor(editForm.country)}
                                    </div>
                                    <div className="flex-1">
                                        <CountrySelect value={editForm.country} onChange={(value) => setEditForm((prev) => ({ ...prev, country: value }))} />
                                    </div>
                                </div>
                            </label>
                            {editError ? <div className="text-xs text-red-500">{editError}</div> : null}
                            <button
                                className="w-full py-2.5 rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-60"
                                type="button"
                                onClick={handleEditSave}
                                disabled={editLoading}
                            >
                                {editLoading ? 'Saving...' : 'Save changes'}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </Layout>
    );
}
