import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import CountrySelect from '../components/common/CountrySelect';
import MiniChessBoard from '../components/chess/MiniChessBoard';
import { useAuth } from '../context/AuthContext';
import {
    createThread,
    fetchDigiQuizRatingHistory,
    fetchPublicAccount,
    fetchRatingHistory,
    fetchUserGames,
    sendFriendRequest,
    updateProfile,
} from '../api';
import { getBlitzTag, getRatingTagClasses } from '../utils/ratingTags';

const ratingModes = ['bullet', 'blitz', 'rapid', 'classical', 'digiquiz'];
const ratingRanges = [
    { id: 'week', label: 'This Week', days: 7 },
    { id: 'month', label: 'This Month', days: 30 },
    { id: 'year', label: 'This Year', days: 365 },
    { id: 'all', label: 'All Time', days: null },
];
const RECENT_LIMIT = 5;
const RECENT_PAGE_SIZE = 6;
const MAX_PROFILE_IMAGE_BYTES = 2 * 1024 * 1024;
const normalizeCountryCode = (value) => {
    const normalized = String(value || '').trim().toUpperCase();
    if (!normalized || normalized === 'INTERNATIONAL' || normalized === 'INT') return 'INTL';
    return normalized;
};

const readImageAsDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read image.'));
    reader.readAsDataURL(file);
});

const formatResult = (game, username) => {
    if (!game || !username) return '•';
    if (game.result === '1/2-1/2') return 'Draw';
    if (game.result === '1-0') return game.white?.username === username ? 'Win' : 'Loss';
    if (game.result === '0-1') return game.black?.username === username ? 'Win' : 'Loss';
    return 'In Progress';
};

const formatTimeAgo = (dateStr) => {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    if (Number.isNaN(diff)) return '';
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString();
};

const buildDigiQuizHistory = (payload, rangeParams = {}) => {
    const points = Array.isArray(payload?.points) ? payload.points : [];
    let history = points
        .map((point) => ({
            date: point.round_date,
            rating: point.rating_after,
        }))
        .filter((point) => point.date && Number.isFinite(point.rating));

    if (rangeParams.start) {
        history = history.filter((point) => point.date >= rangeParams.start);
    }
    if (rangeParams.end) {
        history = history.filter((point) => point.date <= rangeParams.end);
    }

    return history;
};

const RatingChart = ({ history }) => {
    const [hoveredIdx, setHoveredIdx] = useState(null);
    const chartRef = React.useRef(null);

    if (!history || history.length < 2) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-center">
                <span className="material-symbols-outlined text-3xl text-slate-300 dark:text-slate-600 mb-1">show_chart</span>
                <p className="text-sm text-slate-500">Not enough data to show chart.</p>
            </div>
        );
    }
    const sorted = [...history].sort((a, b) => new Date(a.date) - new Date(b.date));
    const values = sorted.map((point) => point.rating);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const isFlat = min === max;
    const range = isFlat ? 1 : max - min;
    const paddingY = 10;
    const chartHeight = 100 - paddingY * 2;
    const coords = sorted.map((point, index) => {
        const x = (index / (sorted.length - 1)) * 100;
        const y = isFlat ? 50 : paddingY + (1 - (point.rating - min) / range) * chartHeight;
        return { x, y };
    });

    const monotonePath = (points) => {
        const n = points.length;
        if (n < 2) return '';
        if (n === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
        const dx = [];
        const dy = [];
        const slopes = [];
        for (let i = 0; i < n - 1; i++) {
            dx.push(points[i + 1].x - points[i].x);
            dy.push(points[i + 1].y - points[i].y);
            slopes.push(dx[i] === 0 ? 0 : dy[i] / dx[i]);
        }
        const tangents = [slopes[0]];
        for (let i = 1; i < n - 1; i++) {
            if (slopes[i - 1] * slopes[i] <= 0) { tangents.push(0); }
            else { tangents.push((slopes[i - 1] + slopes[i]) / 2); }
        }
        tangents.push(slopes[n - 2]);
        for (let i = 0; i < n - 1; i++) {
            if (Math.abs(slopes[i]) < 1e-6) { tangents[i] = 0; tangents[i + 1] = 0; continue; }
            const a = tangents[i] / slopes[i];
            const b = tangents[i + 1] / slopes[i];
            const s = a * a + b * b;
            if (s > 9) { const t = 3 / Math.sqrt(s); tangents[i] = t * a * slopes[i]; tangents[i + 1] = t * b * slopes[i]; }
        }
        let d = `M ${points[0].x} ${points[0].y}`;
        for (let i = 0; i < n - 1; i++) {
            const seg = dx[i] / 3;
            d += ` C ${points[i].x + seg} ${points[i].y + tangents[i] * seg}, ${points[i + 1].x - seg} ${points[i + 1].y - tangents[i + 1] * seg}, ${points[i + 1].x} ${points[i + 1].y}`;
        }
        return d;
    };

    const linePath = monotonePath(coords);
    const last = coords[coords.length - 1];
    const first = coords[0];
    const areaPath = `${linePath} L ${last.x} 100 L ${first.x} 100 Z`;

    const roundStep = 50;
    const topLabel = isFlat ? min + 50 : Math.ceil(max / roundStep) * roundStep;
    const bottomLabel = isFlat ? Math.max(0, min - 50) : Math.floor(min / roundStep) * roundStep;
    const gridLines = [paddingY, 36, 64, 100 - paddingY];

    const formatMonth = (value) => {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        return date.toLocaleDateString('en-US', { month: 'short' });
    };
    const labelCount = Math.min(5, sorted.length);
    const xAxisLabels = [];
    for (let i = 0; i < labelCount; i++) {
        const idx = Math.round((i / (labelCount - 1)) * (sorted.length - 1));
        const label = formatMonth(sorted[idx]?.date);
        if (label && !xAxisLabels.includes(label)) xAxisLabels.push(label);
    }

    const handleMouseMove = (e) => {
        if (!chartRef.current || sorted.length < 2) return;
        const rect = chartRef.current.getBoundingClientRect();
        const xPct = ((e.clientX - rect.left) / rect.width) * 100;
        let closest = 0;
        let closestDist = Infinity;
        for (let i = 0; i < coords.length; i++) {
            const dist = Math.abs(coords[i].x - xPct);
            if (dist < closestDist) { closestDist = dist; closest = i; }
        }
        setHoveredIdx(closest);
    };

    const handleTouchMove = (e) => {
        if (!chartRef.current || sorted.length < 2 || !e.touches[0]) return;
        const rect = chartRef.current.getBoundingClientRect();
        const xPct = ((e.touches[0].clientX - rect.left) / rect.width) * 100;
        let closest = 0;
        let closestDist = Infinity;
        for (let i = 0; i < coords.length; i++) {
            const dist = Math.abs(coords[i].x - xPct);
            if (dist < closestDist) { closestDist = dist; closest = i; }
        }
        setHoveredIdx(closest);
    };

    const hovered = hoveredIdx != null ? { point: sorted[hoveredIdx], coord: coords[hoveredIdx] } : null;
    const hoveredDate = hovered ? new Date(hovered.point.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

    return (
        <div className="relative h-full w-full">
            <div className="absolute inset-y-0 left-0 w-10 flex flex-col justify-between text-[10px] text-slate-400 dark:text-slate-500 font-mono py-1">
                <span>{topLabel}</span>
                <span>{bottomLabel}</span>
            </div>
            <div
                ref={chartRef}
                className="absolute inset-0 pl-10 pr-2 pt-1 pb-7"
                onMouseMove={handleMouseMove}
                onTouchMove={handleTouchMove}
                onMouseLeave={() => setHoveredIdx(null)}
                onTouchEnd={() => setHoveredIdx(null)}
            >
                <svg className="w-full h-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
                    <defs>
                        <linearGradient id="ratingFill" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor="#135bec" stopOpacity="0.2" />
                            <stop offset="100%" stopColor="#135bec" stopOpacity="0" />
                        </linearGradient>
                    </defs>
                    {gridLines.map((y) => (
                        <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="currentColor" className="text-slate-200 dark:text-slate-700/50" strokeWidth="0.3" strokeDasharray="2,2" />
                    ))}
                    <path d={areaPath} fill="url(#ratingFill)" />
                    <path
                        d={linePath}
                        fill="none"
                        stroke="#135bec"
                        strokeWidth="0.5"
                        vectorEffect="non-scaling-stroke"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                    />
                </svg>
                {hovered ? (
                    <>
                        <div
                            className="absolute top-0 bottom-0 w-px bg-primary/30 pointer-events-none"
                            style={{ left: `${hovered.coord.x}%` }}
                        />
                        <div
                            className="absolute w-2 h-2 rounded-full bg-primary border-2 border-white dark:border-slate-900 shadow -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                            style={{ left: `${hovered.coord.x}%`, top: `${hovered.coord.y}%` }}
                        />
                        <div
                            className="absolute pointer-events-none -translate-x-1/2 z-10"
                            style={{ left: `${hovered.coord.x}%`, top: `${Math.max(0, hovered.coord.y - 8)}%` }}
                        >
                            <div className="bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[10px] font-bold py-1 px-2 rounded shadow-lg whitespace-nowrap -translate-y-full">
                                <div>{hovered.point.rating}</div>
                                <div className="font-normal text-[9px] opacity-70">{hoveredDate}</div>
                            </div>
                        </div>
                    </>
                ) : null}
            </div>
            <div className={`absolute left-10 right-2 bottom-0 text-[10px] text-slate-400 dark:text-slate-500 font-mono flex ${
                xAxisLabels.length === 1 ? 'justify-center' : 'justify-between'
            }`}>
                {xAxisLabels.map((label, index) => (
                    <span key={`${label}-${index}`}>{label}</span>
                ))}
            </div>
        </div>
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
    const [editForm, setEditForm] = useState({ nickname: '', bio: '', country: '', profilePic: '' });
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
        { label: 'Bullet', value: displayUser?.rating_bullet || 800, icon: 'local_fire_department', color: 'text-orange-400' },
        { label: 'Blitz', value: displayUser?.rating_blitz || 800, icon: 'flash_on', color: 'text-yellow-400' },
        { label: 'Rapid', value: displayUser?.rating_rapid || 800, icon: 'timer', color: 'text-green-400' },
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
        if (mode === 'digiquiz') {
            return displayUser?.rating_digiquiz ?? 0;
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
    const completedNonBotGames = useMemo(
        () => completedGames.filter((game) => !(game.white?.is_bot || game.black?.is_bot)),
        [completedGames]
    );
    const visibleCompletedGames = useMemo(
        () => (isSelf ? completedGames : completedNonBotGames),
        [completedGames, completedNonBotGames, isSelf]
    );

    const modeStats = useMemo(() => {
        if (!displayUser?.username) {
            return { total: 0, wins: 0, losses: 0, draws: 0, winPct: 0, winPctWhite: 0, winPctBlack: 0, avgOppRating: 0 };
        }
        if (mode === 'digiquiz') {
            const correct = displayUser?.digiquiz_correct ?? 0;
            const wrong = displayUser?.digiquiz_wrong ?? 0;
            const total = correct + wrong;
            const accuracy = total ? Math.round((correct / total) * 100) : 0;
            return { total, wins: correct, losses: wrong, draws: 0, winPct: accuracy, winPctWhite: correct, winPctBlack: wrong, avgOppRating: 0 };
        }
        const modeGames = completedNonBotGames.filter((game) => game.time_control === mode);
        const total = modeGames.length;
        const wins = modeGames.filter((game) => formatResult(game, displayUser.username) === 'Win').length;
        const losses = modeGames.filter((game) => formatResult(game, displayUser.username) === 'Loss').length;
        const draws = modeGames.filter((game) => formatResult(game, displayUser.username) === 'Draw').length;
        const winPct = total ? Math.round((wins / total) * 100) : 0;
        const whiteGames = modeGames.filter((game) => game.white?.username === displayUser.username);
        const blackGames = modeGames.filter((game) => game.black?.username === displayUser.username);
        const whiteWins = whiteGames.filter((game) => game.result === '1-0').length;
        const blackWins = blackGames.filter((game) => game.result === '0-1').length;
        const winPctWhite = whiteGames.length ? Math.round((whiteWins / whiteGames.length) * 100) : 0;
        const winPctBlack = blackGames.length ? Math.round((blackWins / blackGames.length) * 100) : 0;
        const ratingKey = `rating_${mode}`;
        const oppRatings = modeGames.map((game) => {
            const opp = game.white?.username === displayUser.username ? game.black : game.white;
            return opp?.[ratingKey] || opp?.rating_blitz || 0;
        }).filter((r) => r > 0);
        const avgOppRating = oppRatings.length ? Math.round(oppRatings.reduce((a, b) => a + b, 0) / oppRatings.length) : 0;
        return { total, wins, losses, draws, winPct, winPctWhite, winPctBlack, avgOppRating };
    }, [completedNonBotGames, mode, displayUser]);

    const performanceCards = useMemo(() => {
        if (mode === 'digiquiz') {
            return [
                { label: 'Answers', value: modeStats.total, valueClass: 'text-slate-700 dark:text-slate-300', icon: 'quiz', iconColor: 'text-primary' },
                { label: 'Accuracy', value: modeStats.total ? `${modeStats.winPct}%` : '--', valueClass: 'text-green-500', icon: 'check_circle', iconColor: 'text-green-500' },
                { label: 'Correct', value: modeStats.wins, valueClass: 'text-emerald-500', icon: 'done', iconColor: 'text-emerald-500' },
                { label: 'Wrong', value: modeStats.losses, valueClass: 'text-red-500', icon: 'close', iconColor: 'text-red-500' },
            ];
        }
        return [
            { label: 'Win Rate', value: modeStats.total ? `${modeStats.winPct}%` : '--', valueClass: 'text-green-500', icon: 'trending_up', iconColor: 'text-green-500' },
            { label: 'Games', value: modeStats.total, valueClass: 'text-slate-700 dark:text-slate-300', icon: 'sports_esports', iconColor: 'text-primary' },
            { label: 'Wins', value: modeStats.wins, valueClass: 'text-green-500', icon: 'check_circle', iconColor: 'text-green-500' },
            { label: 'Losses', value: modeStats.losses, valueClass: 'text-red-500', icon: 'cancel', iconColor: 'text-red-500' },
            { label: 'Draws', value: modeStats.draws, valueClass: 'text-slate-500', icon: 'horizontal_rule', iconColor: 'text-slate-400' },
            { label: 'Avg Opp', value: modeStats.avgOppRating || '--', valueClass: 'text-amber-500', icon: 'person', iconColor: 'text-amber-500' },
        ];
    }, [mode, modeStats]);

    const recentPreview = useMemo(() => visibleCompletedGames.slice(0, RECENT_LIMIT), [visibleCompletedGames]);

    const filteredGames = useMemo(() => {
        if (!displayUser?.username) return [];
        if (gamesFilter === 'all') return visibleCompletedGames;
        const desired = gamesFilter === 'win' ? 'Win' : gamesFilter === 'loss' ? 'Loss' : 'Draw';
        return visibleCompletedGames.filter((game) => formatResult(game, displayUser.username) === desired);
    }, [visibleCompletedGames, gamesFilter, displayUser]);

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
                const historyPromise = mode === 'digiquiz'
                    ? (
                        isSelf
                            ? fetchDigiQuizRatingHistory(365).then((payload) => ({
                                history: buildDigiQuizHistory(payload, rangeParams),
                            }))
                            : Promise.resolve({ history: [] })
                    )
                    : fetchRatingHistory(displayUser.username, mode, rangeParams);
                const [historyRes, gamesRes] = await Promise.all([
                    historyPromise,
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
    }, [displayUser, mode, rangeParams, isSelf]);

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
            country: normalizeCountryCode(displayUser.country),
            profilePic: displayUser.profile_pic || '',
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
    const displayCountryCode = useMemo(() => normalizeCountryCode(displayUser?.country), [displayUser?.country]);

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
                profile_pic: editForm.profilePic || '',
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
        navigate(`/?challenge=1&opponent=${displayUser.id}&username=${encodeURIComponent(displayUser.username || '')}`);
    };

    const handleEditProfilePicChange = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;

        const type = file.type?.toLowerCase();
        const validType = type === 'image/jpeg' || type === 'image/jpg' || type === 'image/png';
        if (!validType) {
            setEditError('Profile picture must be JPG or PNG.');
            return;
        }
        if (file.size > MAX_PROFILE_IMAGE_BYTES) {
            setEditError('Profile picture must be smaller than 2 MB.');
            return;
        }
        try {
            const dataUrl = await readImageAsDataUrl(file);
            setEditForm((prev) => ({ ...prev, profilePic: String(dataUrl || '') }));
            setEditError(null);
        } catch (err) {
            setEditError('Could not process profile picture.');
        }
    };

    return (
        <Layout showHeader={false} showBottomNav={!editOpen && !showAllGames}>
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
                        <div className="relative">
                            <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-primary/8 via-primary/3 to-transparent dark:from-primary/15 dark:via-primary/5" />
                            <div className="relative px-4 pt-6 pb-4 flex flex-col items-center">
                                <div className="relative mb-4">
                                    <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-2xl overflow-hidden shadow-xl ring-4 ring-white dark:ring-slate-800 bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-2xl font-bold text-slate-500 dark:text-slate-300">
                                        {displayUser?.profile_pic ? (
                                            <img src={displayUser.profile_pic} alt={`${displayUser?.username || 'User'} avatar`} className="w-full h-full object-cover" />
                                        ) : (
                                            displayUser?.username?.slice(0, 2).toUpperCase()
                                        )}
                                    </div>
                                    <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 rounded-full border-[3px] border-white dark:border-slate-800" />
                                </div>
                                <div className="text-center space-y-1">
                                    <div className="flex items-center justify-center gap-2">
                                        {blitzTag ? (
                                            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider ${blitzTagClasses}`}>
                                                {blitzTag}
                                            </span>
                                        ) : null}
                                        <h2 className="text-2xl font-bold tracking-tight">{displayUser?.username}</h2>
                                        <span className="text-lg">{displayCountryCode}</span>
                                    </div>
                                    <p className="text-slate-500 dark:text-slate-400 text-sm font-medium max-w-xs">{displayUser?.bio || 'No bio yet.'}</p>
                                </div>
                                <div className="grid grid-cols-3 gap-3 w-full max-w-sm mt-5">
                                    {stats.map((stat) => (
                                        <div key={stat.label} className="flex flex-col items-center gap-1 p-3 rounded-xl bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-slate-800 shadow-sm">
                                            <span className={`material-symbols-outlined text-[18px] ${stat.color}`}>{stat.icon}</span>
                                            <p className="text-lg font-bold leading-tight">{stat.value}</p>
                                            <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide">{stat.label}</p>
                                        </div>
                                    ))}
                                </div>
                                <div className="w-full max-w-sm mt-3 p-3 rounded-xl bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-slate-800 shadow-sm">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="material-symbols-outlined text-[18px] text-primary">quiz</span>
                                            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">DigiQuiz</span>
                                        </div>
                                        <span className="text-sm font-bold">{displayUser?.rating_digiquiz ?? 0}</span>
                                    </div>
                                    <div className="flex items-center gap-4 mt-2 text-xs">
                                        <div className="flex items-center gap-1">
                                            <span className="w-2 h-2 rounded-full bg-emerald-500" />
                                            <span className="text-slate-500">{displayUser?.digiquiz_correct ?? 0} correct</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <span className="w-2 h-2 rounded-full bg-red-500" />
                                            <span className="text-slate-500">{displayUser?.digiquiz_wrong ?? 0} wrong</span>
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
                        </div>

                        <div className="px-4 mb-4">
                            <h3 className="text-lg font-bold mb-3">Performance</h3>
                            <div className="bg-surface-light dark:bg-surface-dark p-1 rounded-xl flex gap-1 border border-slate-200 dark:border-slate-800 overflow-x-auto hide-scrollbar">
                                {ratingModes.map((ratingMode) => (
                                    <button
                                        key={ratingMode}
                                        className={`shrink-0 min-w-[92px] py-2 px-2 rounded-lg text-[12px] sm:text-sm font-semibold tracking-wide text-center whitespace-nowrap transition-all ${mode === ratingMode ? 'bg-white dark:bg-background-dark text-primary' : 'text-slate-500'}`}
                                        type="button"
                                        onClick={() => setMode(ratingMode)}
                                    >
                                        {ratingMode === 'digiquiz' ? 'DIGIQUIZ' : ratingMode.toUpperCase()}
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
                                    <RatingChart history={history} />
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-3 gap-3 px-4 mt-4">
                            {performanceCards.map((card) => (
                                <div
                                    key={card.label}
                                    className="bg-surface-light dark:bg-surface-dark p-3 rounded-lg border border-border-light dark:border-border-dark flex flex-col items-center gap-1"
                                >
                                    <span className={`material-symbols-outlined text-[16px] ${card.iconColor}`}>{card.icon}</span>
                                    <span className={`font-bold text-lg leading-tight ${card.valueClass}`}>{card.value}</span>
                                    <span className="text-[10px] text-slate-500 uppercase tracking-wide font-bold">{card.label}</span>
                                </div>
                            ))}
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
                                    const outcomeColor = outcome === 'Win' ? 'text-green-500' : outcome === 'Loss' ? 'text-red-500' : 'text-slate-500';
                                    const barColor = outcome === 'Win' ? 'bg-green-500' : outcome === 'Loss' ? 'bg-red-500' : 'bg-slate-400';
                                    const resultLabel = outcome === 'Draw' ? 'Draw (½-½)' : `${outcome} (${game.result || '*'})`;
                                    return (
                                        <button
                                            key={game.id}
                                            type="button"
                                            onClick={() => navigate(`/game/${game.id}`)}
                                            className="w-full bg-surface-light dark:bg-surface-dark rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-slate-800 text-left hover:border-primary/50 transition-all cursor-pointer shadow-sm"
                                        >
                                            <div className={`w-1.5 self-stretch rounded-full shrink-0 ${barColor}`} />
                                            <MiniChessBoard fen={game.current_fen} size={52} />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-0.5">
                                                    <p className="font-bold text-sm truncate">vs. {opponent?.username || 'Opponent'}</p>
                                                    {opponent?.rating_blitz ? (
                                                        <span className="text-xs bg-slate-200 dark:bg-slate-700 px-1 rounded text-slate-600 dark:text-slate-400">{opponent.rating_blitz}</span>
                                                    ) : null}
                                                </div>
                                                <span className={`text-xs font-bold ${outcomeColor}`}>{resultLabel}</span>
                                                <p className="text-[11px] text-slate-500 truncate mt-0.5">{game.time_control}</p>
                                            </div>
                                            <div className="flex flex-col items-end gap-1.5 shrink-0">
                                                <span className="text-[10px] text-slate-400 whitespace-nowrap">{formatTimeAgo(game.created_at)}</span>
                                                <div className="w-7 h-7 flex items-center justify-center rounded-full bg-primary/10 text-primary">
                                                    <span className="material-symbols-outlined text-[16px]">query_stats</span>
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                                {!recentPreview.length && !loading ? (
                                    <div className="flex flex-col items-center py-8 text-center">
                                        <span className="material-symbols-outlined text-3xl text-slate-300 dark:text-slate-600 mb-2">sports_esports</span>
                                        <p className="text-sm text-slate-500">No games yet. Play your first game!</p>
                                    </div>
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
                                    const outcomeColor = outcome === 'Win' ? 'text-green-500' : outcome === 'Loss' ? 'text-red-500' : 'text-slate-500';
                                    const barColor = outcome === 'Win' ? 'bg-green-500' : outcome === 'Loss' ? 'bg-red-500' : 'bg-slate-400';
                                    return (
                                        <button
                                            key={game.id}
                                            type="button"
                                            onClick={() => navigate(`/game/${game.id}`)}
                                            className="group bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-left hover:border-primary/50 transition-all shadow-sm"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={`w-1 self-stretch rounded-full shrink-0 ${barColor}`} />
                                                <MiniChessBoard fen={game.current_fen} size={80} />
                                                <div className="min-w-0">
                                                    <div className={`text-xs font-bold uppercase ${outcomeColor}`}>{outcome}</div>
                                                    <div className="text-sm font-semibold truncate">vs. {opponent?.username || 'Opponent'}</div>
                                                    <div className="text-xs text-slate-500">{game.time_control}</div>
                                                    <div className="text-[10px] text-slate-400 mt-1">
                                                        {new Date(game.created_at).toLocaleDateString()}
                                                    </div>
                                                </div>
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
                <div
                    className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm p-3 sm:p-6 md:p-8 flex items-center justify-center overflow-y-auto"
                    onPointerDown={(event) => {
                        if (event.target === event.currentTarget) {
                            setEditOpen(false);
                        }
                    }}
                >
                    <div
                        className="relative w-full max-w-lg max-h-[min(92dvh,52rem)] flex flex-col bg-surface-light dark:bg-surface-dark rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700"
                        role="dialog"
                        aria-modal="true"
                        onPointerDown={(event) => event.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-5 pt-4 pb-2.5 shrink-0 border-b border-slate-200/70 dark:border-slate-700/70">
                            <h3 className="text-lg font-bold">Edit profile</h3>
                            <button
                                className="p-1.5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800"
                                type="button"
                                onClick={() => setEditOpen(false)}
                            >
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <div className="px-5 py-3.5 space-y-4 overflow-y-auto no-scrollbar">
                            <div>
                                <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">Profile picture</span>
                                <div className="mt-2 flex items-center gap-4">
                                    <div className="w-16 h-16 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-base font-bold text-slate-700 dark:text-slate-200">
                                        {editForm.profilePic ? (
                                            <img src={editForm.profilePic} alt="Edit profile preview" className="w-full h-full object-cover" />
                                        ) : (
                                            displayUser?.username?.slice(0, 2).toUpperCase()
                                        )}
                                    </div>
                                    <div className="flex-1 space-y-1.5">
                                        <input
                                            id="editProfilePic"
                                            type="file"
                                            accept="image/png,image/jpeg"
                                            className="hidden"
                                            onChange={handleEditProfilePicChange}
                                        />
                                        <label
                                            htmlFor="editProfilePic"
                                            className="inline-flex px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-background-dark text-sm font-semibold cursor-pointer hover:border-primary/50"
                                        >
                                            Upload image
                                        </label>
                                        {editForm.profilePic ? (
                                            <button
                                                type="button"
                                                className="ml-2 text-sm font-semibold text-slate-500 hover:text-primary"
                                                onClick={() => setEditForm((prev) => ({ ...prev, profilePic: '' }))}
                                            >
                                                Remove
                                            </button>
                                        ) : (
                                            <p className="text-xs text-slate-500">JPG or PNG, up to 2 MB.</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <label className="block">
                                <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">Nickname</span>
                                <input
                                    className="mt-1.5 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-background-dark px-3 py-2.5 text-sm"
                                    value={editForm.nickname}
                                    onChange={(event) => setEditForm((prev) => ({ ...prev, nickname: event.target.value }))}
                                />
                            </label>
                            <label className="block">
                                <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">Bio</span>
                                <textarea
                                    className="mt-1.5 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-background-dark px-3 py-2.5 text-sm min-h-[112px] resize-none"
                                    value={editForm.bio}
                                    onChange={(event) => setEditForm((prev) => ({ ...prev, bio: event.target.value }))}
                                />
                            </label>
                            <label className="block">
                                <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">Country</span>
                                <CountrySelect
                                    value={editForm.country}
                                    onChange={(value) => setEditForm((prev) => ({ ...prev, country: value }))}
                                    placeholder="Search country by name or code"
                                    showFlags={false}
                                    showCode
                                    searchable
                                />
                            </label>
                        </div>
                        <div className="px-5 pb-[calc(env(safe-area-inset-bottom)+0.7rem)] pt-2 border-t border-slate-200/80 dark:border-slate-700/80 shrink-0">
                            {editError ? <div className="mb-2 text-xs text-red-500">{editError}</div> : null}
                            <button
                                className="w-full py-2.25 rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-60"
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
