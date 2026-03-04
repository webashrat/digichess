import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import { getTournament, updateTournament, deleteTournament, registerTournament, unregisterTournament, tournamentStandings, tournamentMyGame } from '../api';
import { useAuth } from '../context/AuthContext';

const statusConfig = {
    active: { label: 'Live', classes: 'bg-red-500/10 text-red-500 border-red-500/20', dot: 'bg-red-500' },
    completed: { label: 'Completed', classes: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20', dot: 'bg-emerald-500' },
    pending: { label: 'Upcoming', classes: 'bg-amber-500/10 text-amber-500 border-amber-500/20', dot: 'bg-amber-500' },
};

const podiumPlaces = [
    { rank: 2, avatarSize: 'w-14 h-14', ring: 'ring-2 ring-slate-400', badgeBg: 'bg-slate-400', blockH: 'h-16', blockColor: 'bg-slate-500/20 border-slate-400/30' },
    { rank: 1, avatarSize: 'w-[4.5rem] h-[4.5rem]', ring: 'ring-[3px] ring-[#FFD700]', badgeBg: 'bg-[#FFD700] text-black', blockH: 'h-24', blockColor: 'bg-[#FFD700]/10 border-[#FFD700]/30' },
    { rank: 3, avatarSize: 'w-14 h-14', ring: 'ring-2 ring-[#CD7F32]', badgeBg: 'bg-[#CD7F32]', blockH: 'h-12', blockColor: 'bg-[#CD7F32]/10 border-[#CD7F32]/30' },
];

export default function TournamentLobbyPage() {
    const { tournamentId } = useParams();
    const navigate = useNavigate();
    const { user, isAuthenticated } = useAuth();
    const [tournament, setTournament] = useState(null);
    const [standings, setStandings] = useState([]);
    const [tab, setTab] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [registration, setRegistration] = useState({ is_registered: false, game_id: null });
    const [actionLoading, setActionLoading] = useState(false);
    const [nowMs, setNowMs] = useState(Date.now());
    const [standingsPage, setStandingsPage] = useState(1);
    const [showEditModal, setShowEditModal] = useState(false);
    const [editForm, setEditForm] = useState({});
    const [editLoading, setEditLoading] = useState(false);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const editStartAtRef = useRef(null);

    const minDatetime = useMemo(() => {
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        return now.toISOString().slice(0, 16);
    }, []);

    const fetchTournamentData = useCallback(async () => {
        const [tourney, standingsRes] = await Promise.all([
            getTournament(tournamentId),
            tournamentStandings(tournamentId),
        ]);
        setTournament(tourney);
        setStandings(standingsRes.standings || []);
        if (isAuthenticated) {
            const myGame = await tournamentMyGame(tournamentId);
            setRegistration({ is_registered: myGame.is_registered, game_id: myGame.game_id });
        } else {
            setRegistration({ is_registered: false, game_id: null });
        }
        return tourney;
    }, [tournamentId, isAuthenticated]);

    useEffect(() => {
        let cancelled = false;
        let polling = null;

        const bootstrap = async () => {
            setLoading(true);
            setError(null);
            try {
                const latest = await fetchTournamentData();
                if (!cancelled && latest) {
                    if (latest.status === 'completed') setTab('standings');
                    else if (latest.status === 'active') setTab('games');
                    else setTab('info');
                }
                if (!cancelled && latest && ['pending', 'active'].includes(latest.status)) {
                    polling = setInterval(async () => {
                        try {
                            const updated = await fetchTournamentData();
                            if (updated?.status === 'completed' && polling) {
                                clearInterval(polling);
                                polling = null;
                                setTab('standings');
                            }
                        } catch {
                            setError('Failed to refresh tournament.');
                        }
                    }, 5000);
                }
            } catch {
                if (!cancelled) setError('Failed to load tournament.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        bootstrap();
        return () => {
            cancelled = true;
            if (polling) clearInterval(polling);
        };
    }, [fetchTournamentData]);

    useEffect(() => {
        const timer = setInterval(() => setNowMs(Date.now()), 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        if (tournament?.status === 'active' && registration.game_id) {
            navigate(`/game/${registration.game_id}`);
        }
    }, [tournament?.status, registration.game_id, navigate]);

    const countdown = useMemo(() => {
        if (!tournament?.start_at) return { hours: '00', minutes: '00', seconds: '00' };
        const diff = new Date(tournament.start_at).getTime() - nowMs;
        if (diff <= 0) return { hours: '00', minutes: '00', seconds: '00' };
        const totalSeconds = Math.floor(diff / 1000);
        return {
            hours: String(Math.floor(totalSeconds / 3600)).padStart(2, '0'),
            minutes: String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0'),
            seconds: String(totalSeconds % 60).padStart(2, '0'),
        };
    }, [tournament?.start_at, nowMs]);

    const handleRegister = async () => {
        if (!isAuthenticated) { navigate('/login'); return; }
        setActionLoading(true);
        setError(null);
        try {
            let payload = {};
            if (tournament?.is_private) {
                const password = window.prompt('Enter tournament entry code');
                if (password == null) { setActionLoading(false); return; }
                payload = { password };
            }
            await registerTournament(tournamentId, payload);
            const myGame = await tournamentMyGame(tournamentId);
            setRegistration({ is_registered: myGame.is_registered, game_id: myGame.game_id });
            await fetchTournamentData();
        } catch (err) {
            setError(err.message || 'Failed to register.');
        } finally {
            setActionLoading(false);
        }
    };

    const handleUnregister = async () => {
        setActionLoading(true);
        setError(null);
        try {
            await unregisterTournament(tournamentId);
            setRegistration({ is_registered: false, game_id: null });
            await fetchTournamentData();
        } catch (err) {
            setError(err.message || 'Failed to unregister.');
        } finally {
            setActionLoading(false);
        }
    };

    const isCreator = Boolean(user && tournament?.creator?.id === user.id);

    const openEditModal = () => {
        if (!tournament) return;
        setEditForm({
            name: tournament.name || '',
            description: tournament.description || '',
            start_at: tournament.start_at ? new Date(new Date(tournament.start_at).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '',
            initial_time_minutes: tournament.initial_time_seconds ? Math.round(tournament.initial_time_seconds / 60) : 3,
            increment_seconds: tournament.increment_seconds ?? 0,
            arena_duration_minutes: tournament.arena_duration_minutes ?? 30,
            swiss_rounds: tournament.swiss_rounds ?? 3,
            rated: tournament.rated ?? true,
            password: '',
        });
        setShowEditModal(true);
    };

    const handleEditSave = async () => {
        if (editForm.start_at && new Date(editForm.start_at) <= new Date()) {
            setError('Start time must be in the future.');
            return;
        }
        setEditLoading(true);
        setError(null);
        try {
            const payload = {};
            if (editForm.name?.trim()) payload.name = editForm.name.trim();
            if (editForm.description != null) payload.description = editForm.description.trim();
            if (editForm.start_at) payload.start_at = new Date(editForm.start_at).toISOString();
            if (editForm.initial_time_minutes != null) payload.initial_time_seconds = Number(editForm.initial_time_minutes) * 60;
            if (editForm.increment_seconds != null) payload.increment_seconds = Number(editForm.increment_seconds);
            if (tournament?.type === 'arena' && editForm.arena_duration_minutes != null) payload.arena_duration_minutes = Number(editForm.arena_duration_minutes);
            if (tournament?.type === 'swiss' && editForm.swiss_rounds != null) payload.swiss_rounds = Number(editForm.swiss_rounds);
            payload.rated = Boolean(editForm.rated);
            if (editForm.password) payload.password = editForm.password;
            await updateTournament(tournamentId, payload);
            await fetchTournamentData();
            setShowEditModal(false);
        } catch (err) {
            setError(err?.message || 'Failed to update tournament.');
        } finally {
            setEditLoading(false);
        }
    };

    const handleDelete = async () => {
        setDeleteLoading(true);
        setError(null);
        try {
            await deleteTournament(tournamentId);
            navigate('/tournaments');
        } catch (err) {
            setError(err?.message || 'Failed to delete tournament.');
            setShowDeleteConfirm(false);
        } finally {
            setDeleteLoading(false);
        }
    };

    const status = statusConfig[tournament?.status] || statusConfig.pending;
    const isCompleted = tournament?.status === 'completed';
    const isActive = tournament?.status === 'active';
    const isPending = tournament?.status === 'pending';

    const tabs = isCompleted
        ? [{ id: 'standings', label: 'Final Standings', icon: 'leaderboard' }, { id: 'info', label: 'Info', icon: 'info' }]
        : isActive
            ? [{ id: 'games', label: 'My Game', icon: 'swords' }, { id: 'standings', label: 'Standings', icon: 'leaderboard' }, { id: 'info', label: 'Info', icon: 'info' }]
            : [{ id: 'info', label: 'Details', icon: 'info' }, { id: 'standings', label: 'Registered Players', icon: 'group' }];

    return (
        <Layout showHeader={false} showBottomNav={!showEditModal}>
            <div className="flex-1 flex flex-col overflow-hidden">
                <header className="sticky top-0 z-50 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-sm">
                    <div className="flex items-center justify-between px-4 py-3">
                        <button
                            className="p-2 -ml-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-slate-600 dark:text-slate-300"
                            type="button"
                            onClick={() => navigate('/tournaments')}
                        >
                            <span className="material-symbols-outlined text-[22px]">arrow_back</span>
                        </button>
                        <h1 className="text-base font-bold tracking-tight">Tournament</h1>
                        <div className="w-10" />
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto pb-24">
                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <div className="text-sm text-slate-500">Loading tournament...</div>
                        </div>
                    ) : error && !tournament ? (
                        <div className="flex items-center justify-center py-20">
                            <div className="text-sm text-red-500">{error}</div>
                        </div>
                    ) : tournament ? (
                        <>
                            {/* Tournament Header Card */}
                            <div className="px-4 pt-4">
                                <div className="bg-white dark:bg-surface-dark rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
                                    <div className="flex items-start justify-between gap-3 mb-3">
                                        <h2 className="text-xl font-bold text-slate-900 dark:text-white leading-tight">{tournament.name}</h2>
                                        <span className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${status.classes}`} data-testid="tournament-status-badge">
                                            {isActive ? (
                                                <span className="relative flex h-2 w-2">
                                                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${status.dot} opacity-75`} />
                                                    <span className={`relative inline-flex rounded-full h-2 w-2 ${status.dot}`} />
                                                </span>
                                            ) : null}
                                            {status.label}
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2 text-xs">
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
                                            <span className="material-symbols-outlined text-[14px]">timer</span>
                                            {tournament.time_control || 'Blitz'}
                                        </span>
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
                                            <span className="material-symbols-outlined text-[14px]">group</span>
                                            {tournament.participants_count || 0} players
                                        </span>
                                        {tournament.current_round ? (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
                                                Round {tournament.current_round}
                                            </span>
                                        ) : null}
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
                                            {tournament.rated ? 'Rated' : 'Casual'}
                                        </span>
                                    </div>
                                    {tournament.description ? (
                                        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{tournament.description}</p>
                                    ) : null}
                                </div>
                            </div>

                            {/* Upcoming: Countdown + Register */}
                            {isPending ? (
                                <div className="px-4 mt-4 space-y-4">
                                    <div className="bg-gradient-to-br from-primary/10 via-blue-500/5 to-transparent dark:from-primary/20 dark:via-blue-500/10 rounded-2xl border border-primary/20 p-5">
                                        <p className="text-xs text-primary font-semibold uppercase tracking-wider mb-3 text-center">Starts in</p>
                                        <div className="flex gap-3 justify-center" data-testid="tournament-countdown">
                                            {[
                                                { value: countdown.hours, label: 'Hours', testId: 'tournament-countdown-hours' },
                                                { value: countdown.minutes, label: 'Min', testId: 'tournament-countdown-minutes' },
                                                { value: countdown.seconds, label: 'Sec', testId: 'tournament-countdown-seconds' },
                                            ].map((unit) => (
                                                <div key={unit.label} className="flex flex-col items-center gap-1">
                                                    <div className="h-14 w-16 flex items-center justify-center bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                                                        <span className="text-2xl font-bold tabular-nums" data-testid={unit.testId}>{unit.value}</span>
                                                    </div>
                                                    <span className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">{unit.label}</span>
                                                </div>
                                            ))}
                                        </div>
                                        <p className="text-xs text-slate-500 text-center mt-3">
                                            {tournament.start_at ? new Date(tournament.start_at).toLocaleString() : 'TBD'}
                                        </p>
                                    </div>

                                    {registration.is_registered ? (
                                        <div className="bg-emerald-500/10 rounded-2xl border border-emerald-500/20 p-4 space-y-3">
                                            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                                                <span className="material-symbols-outlined text-lg">check_circle</span>
                                                <span className="text-sm font-semibold">You are registered</span>
                                            </div>
                                            <button
                                                className="w-full py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                                                type="button"
                                                onClick={handleUnregister}
                                                disabled={actionLoading}
                                                data-testid="tournament-unregister"
                                            >
                                                Unregister
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            className="w-full bg-primary hover:bg-blue-600 text-white font-semibold py-3 rounded-xl shadow-lg shadow-primary/25 transition-colors flex items-center justify-center gap-2"
                                            type="button"
                                            onClick={handleRegister}
                                            disabled={actionLoading}
                                            data-testid="tournament-register"
                                        >
                                            <span className="material-symbols-outlined text-lg">how_to_reg</span>
                                            Register for Tournament
                                        </button>
                                    )}

                                    {isCreator ? (
                                        <div className="flex gap-2">
                                            <button
                                                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 text-sm font-semibold hover:bg-amber-500/20 transition-colors"
                                                type="button"
                                                onClick={openEditModal}
                                            >
                                                <span className="material-symbols-outlined text-lg">edit</span>
                                                Edit
                                            </button>
                                            <button
                                                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-500/10 text-red-500 border border-red-500/20 text-sm font-semibold hover:bg-red-500/20 transition-colors"
                                                type="button"
                                                onClick={() => setShowDeleteConfirm(true)}
                                            >
                                                <span className="material-symbols-outlined text-lg">delete</span>
                                                Delete
                                            </button>
                                        </div>
                                    ) : null}
                                </div>
                            ) : null}

                            {/* Active: My Game CTA */}
                            {isActive ? (
                                <div className="px-4 mt-4">
                                    {registration.is_registered ? (
                                        <button
                                            className="w-full bg-primary hover:bg-blue-600 text-white font-semibold py-3 rounded-xl shadow-lg shadow-primary/25 flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
                                            type="button"
                                            onClick={() => registration.game_id && navigate(`/game/${registration.game_id}`)}
                                            disabled={!registration.game_id}
                                            data-testid="tournament-go-to-game"
                                        >
                                            <span className="material-symbols-outlined text-lg">swords</span>
                                            {registration.game_id ? 'Go to My Game' : 'Waiting for Pairing...'}
                                        </button>
                                    ) : (
                                        <button
                                            className="w-full bg-primary hover:bg-blue-600 text-white font-semibold py-3 rounded-xl shadow-lg shadow-primary/25 transition-colors"
                                            type="button"
                                            onClick={handleRegister}
                                            disabled={actionLoading}
                                            data-testid="tournament-register"
                                        >
                                            Join Tournament
                                        </button>
                                    )}
                                </div>
                            ) : null}

                            {/* Completed: Podium */}
                            {isCompleted && tournament.winners?.length ? (
                                <div className="px-4 mt-4">
                                    <div className="bg-white dark:bg-surface-dark rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm" data-testid="tournament-winners-list">
                                        <div className="pt-5 pb-1 text-center">
                                            <span className="material-symbols-outlined text-[#FFD700] text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>trophy</span>
                                            <h3 className="text-lg font-bold mt-1">Tournament Results</h3>
                                            <p className="text-xs text-slate-500 mt-0.5">{tournament.participants_count || standings.length} participants</p>
                                        </div>

                                        <div className="flex items-end justify-center gap-2 sm:gap-4 px-3 sm:px-6 pt-10 pb-0">
                                            {podiumPlaces.map((cfg) => {
                                                const winner = tournament.winners[cfg.rank - 1];
                                                const standing = standings[cfg.rank - 1];
                                                if (!winner) return <div key={cfg.rank} className="flex-1" />;
                                                return (
                                                    <div key={cfg.rank} className="flex-1 flex flex-col items-center max-w-[140px]">
                                                        {cfg.rank === 1 ? (
                                                            <span className="material-symbols-outlined text-[#FFD700] mb-1" style={{ fontSize: 28, fontVariationSettings: "'FILL' 1" }}>crown</span>
                                                        ) : (
                                                            <div className="h-[28px] mb-1" />
                                                        )}
                                                        <div className={`${cfg.avatarSize} rounded-full bg-slate-200 dark:bg-slate-700 ${cfg.ring} flex items-center justify-center font-bold text-slate-600 dark:text-slate-200 ${cfg.rank === 1 ? 'text-base' : 'text-sm'} shadow-md`}>
                                                            {winner.slice(0, 2).toUpperCase()}
                                                        </div>
                                                        <p className={`font-semibold truncate text-center w-full mt-2 ${cfg.rank === 1 ? 'text-sm' : 'text-xs'}`}>{winner}</p>
                                                        <p className={`text-primary font-bold ${cfg.rank === 1 ? 'text-sm' : 'text-xs'}`}>{standing?.score ?? '--'} pts</p>

                                                        <div className={`w-full ${cfg.blockH} mt-2 rounded-t-xl border-t border-x ${cfg.blockColor} flex items-start justify-center pt-2.5`}>
                                                            <span className={`${cfg.badgeBg} ${cfg.rank === 1 ? 'text-black' : 'text-white'} text-xs font-bold w-7 h-7 rounded-full flex items-center justify-center shadow-sm`}>
                                                                {cfg.rank}
                                                            </span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            ) : null}

                            {/* Tabs */}
                            <div className="px-4 mt-4">
                                <div className="bg-slate-200/80 dark:bg-slate-800/80 p-1 rounded-xl flex gap-1">
                                    {tabs.map((t) => (
                                        <button
                                            key={t.id}
                                            className={`flex-1 py-2 px-2 rounded-lg text-xs sm:text-sm font-semibold transition-all flex items-center justify-center gap-1.5 ${
                                                tab === t.id
                                                    ? 'bg-white dark:bg-primary text-slate-900 dark:text-white shadow-sm'
                                                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                                            }`}
                                            type="button"
                                            onClick={() => setTab(t.id)}
                                        >
                                            <span className={`material-symbols-outlined text-[16px] ${tab === t.id ? 'text-primary dark:text-white' : ''}`}>{t.icon}</span>
                                            {t.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Tab Content */}
                            <div className="px-4 mt-4 space-y-4">
                                {error ? <div className="text-sm text-red-500">{error}</div> : null}

                                {/* Games Tab (active only) */}
                                {tab === 'games' && isActive ? (() => {
                                    const myRank = user ? standings.findIndex((s) => s.user_id === user.id || s.username === user.username) : -1;
                                    const myStanding = myRank >= 0 ? standings[myRank] : null;

                                    return (
                                        <section className="space-y-4">
                                            {registration.is_registered && registration.game_id ? (
                                                <div className="bg-gradient-to-r from-primary/10 to-blue-500/5 dark:from-primary/20 dark:to-blue-500/10 rounded-2xl border border-primary/20 p-4">
                                                    <div className="flex items-center gap-2 mb-3">
                                                        <span className="relative flex h-2.5 w-2.5">
                                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                                                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                                                        </span>
                                                        <h3 className="text-sm font-bold">Your Game is Live</h3>
                                                    </div>
                                                    <button
                                                        className="w-full bg-primary hover:bg-blue-600 text-white font-semibold py-2.5 rounded-xl flex items-center justify-center gap-2 transition-colors shadow-lg shadow-primary/25"
                                                        type="button"
                                                        onClick={() => navigate(`/game/${registration.game_id}`)}
                                                    >
                                                        <span className="material-symbols-outlined text-lg">swords</span>
                                                        Play Now
                                                    </button>
                                                </div>
                                            ) : registration.is_registered ? (
                                                <div className="bg-white dark:bg-surface-dark rounded-2xl border border-slate-200 dark:border-slate-800 p-5 text-center">
                                                    <span className="material-symbols-outlined text-3xl text-primary mb-2">hourglass_top</span>
                                                    <p className="text-sm font-semibold">Waiting for next pairing...</p>
                                                    <p className="text-xs text-slate-500 mt-1">Your game will appear here once paired.</p>
                                                </div>
                                            ) : null}

                                            {myStanding ? (
                                                <div className="bg-white dark:bg-surface-dark rounded-2xl border border-primary/30 p-3 flex items-center gap-3">
                                                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                                                        {user?.username?.slice(0, 2).toUpperCase()}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-sm font-semibold truncate">Your Position</div>
                                                        <div className="text-xs text-slate-500">Rank #{myRank + 1} of {standings.length}</div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="text-lg font-bold text-primary">{myStanding.score}</div>
                                                        <div className="text-[10px] text-slate-500 uppercase font-semibold">Points</div>
                                                    </div>
                                                </div>
                                            ) : null}

                                            {standings.length > 0 ? (
                                                <div className="bg-white dark:bg-surface-dark rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                                                    <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                                                        <div className="flex items-center gap-2">
                                                            <span className="material-symbols-outlined text-primary text-lg">leaderboard</span>
                                                            <h3 className="text-sm font-bold">Live Standings</h3>
                                                        </div>
                                                        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-emerald-500 uppercase tracking-wider">
                                                            <span className="relative flex h-1.5 w-1.5">
                                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                                                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                                                            </span>
                                                            Updating
                                                        </div>
                                                    </div>
                                                    {standings.slice(0, 10).map((row, index) => {
                                                        const isMe = user && (row.user_id === user.id || row.username === user.username);
                                                        const rankColor = index === 0 ? 'text-[#FFD700]' : index === 1 ? 'text-slate-400' : index === 2 ? 'text-[#CD7F32]' : 'text-slate-400';
                                                        return (
                                                            <div key={row.user_id} className={`flex items-center gap-3 px-4 py-2.5 border-b border-slate-100 dark:border-slate-800/50 last:border-b-0 ${isMe ? 'bg-primary/5 dark:bg-primary/10' : ''}`}>
                                                                <span className={`w-6 text-center text-sm font-bold ${rankColor}`}>{index + 1}</span>
                                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${isMe ? 'bg-primary/15 text-primary' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
                                                                    {row.username?.slice(0, 2).toUpperCase()}
                                                                </div>
                                                                <span className={`flex-1 text-sm font-medium truncate ${isMe ? 'text-primary font-semibold' : ''}`}>{row.username}</span>
                                                                <span className="text-sm font-bold text-slate-700 dark:text-slate-300 tabular-nums">{row.score}</span>
                                                            </div>
                                                        );
                                                    })}
                                                    {standings.length > 10 ? (
                                                        <button
                                                            className="w-full py-2.5 text-xs font-semibold text-primary hover:bg-primary/5 transition-colors"
                                                            type="button"
                                                            onClick={() => setTab('standings')}
                                                        >
                                                            View all {standings.length} players
                                                        </button>
                                                    ) : null}
                                                </div>
                                            ) : (
                                                <div className="bg-white dark:bg-surface-dark rounded-2xl border border-slate-200 dark:border-slate-800 p-5 text-center">
                                                    <p className="text-sm text-slate-500">Standings will appear once games are played.</p>
                                                </div>
                                            )}
                                        </section>
                                    );
                                })() : null}

                                {/* Standings Tab */}
                                {tab === 'standings' ? (() => {
                                    const pageSize = 20;
                                    const totalPages = Math.max(1, Math.ceil(standings.length / pageSize));
                                    const safePage = Math.min(standingsPage, totalPages);
                                    const paged = standings.slice((safePage - 1) * pageSize, safePage * pageSize);
                                    const startIndex = (safePage - 1) * pageSize;

                                    const rankIcon = (idx) => {
                                        if (idx === 0) return <span className="material-symbols-outlined text-[18px] text-[#FFD700]" style={{ fontVariationSettings: "'FILL' 1" }}>trophy</span>;
                                        if (idx === 1) return <span className="material-symbols-outlined text-[18px] text-slate-400" style={{ fontVariationSettings: "'FILL' 1" }}>trophy</span>;
                                        if (idx === 2) return <span className="material-symbols-outlined text-[18px] text-[#CD7F32]" style={{ fontVariationSettings: "'FILL' 1" }}>trophy</span>;
                                        return <span className="text-sm font-bold text-slate-400">{idx + 1}</span>;
                                    };

                                    return (
                                        <section className="bg-white dark:bg-surface-dark rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                                            {standings.length > 0 ? (
                                                <>
                                                    {paged.map((row, pageIdx) => {
                                                        const globalIdx = startIndex + pageIdx;
                                                        const isTop3 = globalIdx < 3;
                                                        const isMe = user && (row.user_id === user.id || row.username === user.username);
                                                        return (
                                                            <button
                                                                key={row.user_id}
                                                                type="button"
                                                                onClick={() => navigate(`/profile/${row.username}`)}
                                                                className={`w-full flex items-center gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-800/50 last:border-b-0 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors text-left ${isMe ? 'bg-primary/5 dark:bg-primary/10 border-l-2 border-l-primary' : isTop3 ? 'bg-slate-50/50 dark:bg-slate-800/20' : ''}`}
                                                            >
                                                                <div className="w-7 flex items-center justify-center shrink-0">
                                                                    {rankIcon(globalIdx)}
                                                                </div>
                                                                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${isTop3 ? 'bg-primary/10 text-primary' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
                                                                    {row.username?.slice(0, 2).toUpperCase()}
                                                                </div>
                                                                <div className="flex-1 min-w-0">
                                                                    <span className="truncate font-medium text-sm block">{row.username}</span>
                                                                </div>
                                                                <span className="text-sm font-bold text-slate-700 dark:text-slate-300 tabular-nums">{row.score}</span>
                                                                <span className="material-symbols-outlined text-[18px] text-slate-400">chevron_right</span>
                                                            </button>
                                                        );
                                                    })}
                                                    {totalPages > 1 ? (
                                                        <div className="flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-900/30 border-t border-slate-200 dark:border-slate-800">
                                                            <button
                                                                type="button"
                                                                className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-primary disabled:opacity-40 disabled:hover:text-slate-500 transition-colors"
                                                                onClick={() => setStandingsPage((p) => Math.max(1, p - 1))}
                                                                disabled={safePage <= 1}
                                                            >
                                                                <span className="material-symbols-outlined text-[16px]">chevron_left</span>
                                                                Prev
                                                            </button>
                                                            <span className="text-xs text-slate-500">
                                                                {startIndex + 1}-{Math.min(startIndex + pageSize, standings.length)} of {standings.length}
                                                            </span>
                                                            <button
                                                                type="button"
                                                                className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-primary disabled:opacity-40 disabled:hover:text-slate-500 transition-colors"
                                                                onClick={() => setStandingsPage((p) => Math.min(totalPages, p + 1))}
                                                                disabled={safePage >= totalPages}
                                                            >
                                                                Next
                                                                <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                                                            </button>
                                                        </div>
                                                    ) : null}
                                                </>
                                            ) : (
                                                <div className="p-6 text-center text-sm text-slate-500">
                                                    {isPending ? 'Registered players will appear here.' : 'No standings data yet.'}
                                                </div>
                                            )}
                                        </section>
                                    );
                                })() : null}

                                {/* Info Tab */}
                                {tab === 'info' ? (
                                    <section className="bg-white dark:bg-surface-dark rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                                        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800">
                                            <h3 className="text-sm font-bold">Tournament Details</h3>
                                        </div>
                                        {[
                                            { icon: 'info', label: 'Status', value: status.label },
                                            { icon: 'event', label: 'Starts at', value: tournament.start_at ? new Date(tournament.start_at).toLocaleString() : 'TBD' },
                                            { icon: 'category', label: 'Type', value: tournament.type || 'Arena' },
                                            { icon: 'timer', label: 'Time Control', value: tournament.time_control || 'Blitz' },
                                            { icon: 'verified', label: 'Rated', value: tournament.rated ? 'Yes' : 'No' },
                                            { icon: 'group', label: 'Participants', value: String(tournament.participants_count || 0) },
                                        ].map((item) => (
                                            <div key={item.label} className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-800/50 last:border-b-0">
                                                <span className="material-symbols-outlined text-lg text-slate-400">{item.icon}</span>
                                                <span className="flex-1 text-sm text-slate-500">{item.label}</span>
                                                <span className="text-sm font-semibold">{item.value}</span>
                                            </div>
                                        ))}
                                    </section>
                                ) : null}
                            </div>
                        </>
                    ) : null}
                </main>
            </div>

            {showEditModal ? (
                <div
                    className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm p-3 sm:p-4 flex items-center justify-center"
                    onPointerDown={(e) => { if (e.target === e.currentTarget) setShowEditModal(false); }}
                >
                    <div
                        className="w-full sm:max-w-2xl max-h-[calc(100dvh-6rem)] flex flex-col bg-white dark:bg-[#0f172a] rounded-2xl border-2 border-slate-300 dark:border-slate-600 overflow-hidden shadow-2xl"
                        onPointerDown={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-start justify-between gap-3 p-3 sm:p-4 pb-2 shrink-0">
                            <div className="space-y-0.5">
                                <h2 className="text-lg font-bold">Edit Tournament</h2>
                                <p className="text-xs text-slate-500 dark:text-slate-400">Update settings before the tournament starts.</p>
                            </div>
                            <button
                                type="button"
                                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 dark:border-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 transition-colors shrink-0"
                                onClick={() => setShowEditModal(false)}
                            >
                                <span className="material-symbols-outlined text-[22px]">close</span>
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto px-3 sm:px-4 space-y-3 no-scrollbar">
                            <section className="rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/40 p-3 space-y-2.5">
                                <div className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
                                    <span className="material-symbols-outlined text-[18px] text-primary">edit_note</span>
                                    Basic details
                                </div>
                                <label className="block space-y-1.5">
                                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Tournament name</span>
                                    <input
                                        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                                        value={editForm.name || ''}
                                        onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                                        maxLength={255}
                                    />
                                </label>
                                <label className="block space-y-1.5">
                                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Description</span>
                                    <textarea
                                        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm min-h-[60px]"
                                        placeholder="Short tournament description"
                                        value={editForm.description || ''}
                                        onChange={(e) => setEditForm((prev) => ({ ...prev, description: e.target.value }))}
                                    />
                                </label>
                            </section>

                            <section className="rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/35 p-3 space-y-2.5">
                                <div className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
                                    <span className="material-symbols-outlined text-[18px] text-primary">schedule</span>
                                    Clock & schedule
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <label className="block space-y-1.5">
                                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 dark:text-slate-200">
                                            <span className="material-symbols-outlined text-[14px] text-slate-400">timer</span>
                                            Initial time
                                        </span>
                                        <div className="relative">
                                            <input type="number" min="1" className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 pr-14 text-sm" value={editForm.initial_time_minutes ?? ''} onChange={(e) => setEditForm((prev) => ({ ...prev, initial_time_minutes: e.target.value }))} />
                                            <span className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">min</span>
                                        </div>
                                    </label>
                                    <label className="block space-y-1.5">
                                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 dark:text-slate-200">
                                            <span className="material-symbols-outlined text-[14px] text-slate-400">add_alarm</span>
                                            Increment
                                        </span>
                                        <div className="relative">
                                            <input type="number" min="0" className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 pr-14 text-sm" value={editForm.increment_seconds ?? ''} onChange={(e) => setEditForm((prev) => ({ ...prev, increment_seconds: e.target.value }))} />
                                            <span className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">sec</span>
                                        </div>
                                    </label>
                                    <label className="block space-y-1.5 col-span-2 sm:col-span-1">
                                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 dark:text-slate-200">
                                            <span className="material-symbols-outlined text-[14px] text-slate-400">calendar_month</span>
                                            Start date & time
                                        </span>
                                        <div className="relative">
                                            <input
                                                ref={editStartAtRef}
                                                type="datetime-local"
                                                min={minDatetime}
                                                className="tournament-datetime-input w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 pl-3 pr-11 py-2 text-sm"
                                                value={editForm.start_at || ''}
                                                onChange={(e) => setEditForm((prev) => ({ ...prev, start_at: e.target.value }))}
                                            />
                                            <button
                                                type="button"
                                                className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
                                                onClick={() => { editStartAtRef.current?.showPicker ? editStartAtRef.current.showPicker() : editStartAtRef.current?.focus(); }}
                                                aria-label="Open date and time picker"
                                            >
                                                <span className="material-symbols-outlined text-[18px]">event</span>
                                            </button>
                                        </div>
                                        <p className="text-[10px] text-slate-500 dark:text-slate-400">Pick your local start date and time</p>
                                    </label>
                                    {tournament?.type === 'arena' ? (
                                        <label className="block space-y-1.5 col-span-2 sm:col-span-1">
                                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 dark:text-slate-200">
                                                <span className="material-symbols-outlined text-[14px] text-slate-400">sports_score</span>
                                                Arena duration
                                            </span>
                                            <div className="relative">
                                                <input type="number" min="1" className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 pr-14 text-sm" value={editForm.arena_duration_minutes ?? ''} onChange={(e) => setEditForm((prev) => ({ ...prev, arena_duration_minutes: e.target.value }))} />
                                                <span className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">min</span>
                                            </div>
                                        </label>
                                    ) : null}
                                    {tournament?.type === 'swiss' ? (
                                        <label className="block space-y-1.5 col-span-2 sm:col-span-1">
                                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 dark:text-slate-200">
                                                <span className="material-symbols-outlined text-[14px] text-slate-400">format_list_numbered</span>
                                                Swiss rounds
                                            </span>
                                            <input type="number" min="1" className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm" value={editForm.swiss_rounds ?? ''} onChange={(e) => setEditForm((prev) => ({ ...prev, swiss_rounds: e.target.value }))} />
                                        </label>
                                    ) : null}
                                </div>
                            </section>

                            <section className="rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/35 p-3 space-y-2.5">
                                <div className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
                                    <span className="material-symbols-outlined text-[18px] text-primary">tune</span>
                                    Settings
                                </div>
                                <label className="inline-flex w-full items-center justify-between gap-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900/70 px-3 py-2">
                                    <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                                        <span className="material-symbols-outlined text-[18px] text-amber-500">workspace_premium</span>
                                        Rated tournament
                                    </span>
                                    <input type="checkbox" checked={editForm.rated ?? true} onChange={(e) => setEditForm((prev) => ({ ...prev, rated: e.target.checked }))} className="h-4 w-4 accent-primary" />
                                </label>
                                <label className="block space-y-1.5">
                                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Entry code (optional)</span>
                                    <div className="relative">
                                        <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-slate-400">key</span>
                                        <input className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 pl-9 pr-3 py-2 text-sm" value={editForm.password || ''} onChange={(e) => setEditForm((prev) => ({ ...prev, password: e.target.value }))} placeholder="Leave empty to keep current" />
                                    </div>
                                </label>
                            </section>
                        </div>

                        <div className="shrink-0 p-3 sm:p-4 pt-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]">
                            {error ? <p className="text-xs text-red-500 mb-2">{error}</p> : null}
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    className="flex-1 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                                    onClick={() => setShowEditModal(false)}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    className="flex-1 bg-primary text-white font-semibold py-2.5 rounded-lg disabled:opacity-60"
                                    onClick={handleEditSave}
                                    disabled={editLoading}
                                >
                                    {editLoading ? 'Saving...' : 'Save Changes'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}

            {showDeleteConfirm ? (
                <div className="fixed inset-0 z-[130] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onPointerDown={(e) => { if (e.target === e.currentTarget) setShowDeleteConfirm(false); }}>
                    <div className="w-full max-w-sm bg-white dark:bg-[#0f172a] rounded-2xl border-2 border-slate-300 dark:border-slate-600 shadow-2xl p-6 text-center" onPointerDown={(e) => e.stopPropagation()}>
                        <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
                            <span className="material-symbols-outlined text-3xl text-red-500">delete_forever</span>
                        </div>
                        <h3 className="text-lg font-bold mb-2">Delete Tournament?</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                            This will permanently delete <span className="font-semibold text-slate-700 dark:text-slate-200">{tournament?.name}</span> and remove all registered participants. This action cannot be undone.
                        </p>
                        <div className="flex gap-3">
                            <button
                                type="button"
                                className="flex-1 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                                onClick={() => setShowDeleteConfirm(false)}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition-colors shadow-lg shadow-red-500/25 disabled:opacity-60"
                                onClick={handleDelete}
                                disabled={deleteLoading}
                            >
                                {deleteLoading ? 'Deleting...' : 'Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </Layout>
    );
}
