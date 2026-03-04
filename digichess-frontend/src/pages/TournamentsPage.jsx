import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AdBanner from '../components/common/AdBanner';
import Layout from '../components/layout/Layout';
import { createTournament, listTournaments, registerTournament, tournamentMyGame } from '../api';
import { useAuth } from '../context/AuthContext';

const statusOptions = [
    { id: 'live', label: 'Live' },
    { id: 'pending', label: 'Upcoming' },
    { id: 'completed', label: 'Completed' },
];

const tournamentTypeOptions = [
    { id: 'arena', label: 'Arena' },
    { id: 'swiss', label: 'Swiss' },
    { id: 'round_robin', label: 'Round Robin' },
    { id: 'knockout', label: 'Knockout' },
];

const timeControlOptions = [
    { id: 'bullet', label: 'Bullet' },
    { id: 'blitz', label: 'Blitz' },
    { id: 'rapid', label: 'Rapid' },
    { id: 'classical', label: 'Classical' },
];

const timeControlDefaults = {
    bullet: { minutes: 1, increment: 0 },
    blitz: { minutes: 3, increment: 0 },
    rapid: { minutes: 10, increment: 0 },
    classical: { minutes: 30, increment: 0 },
};

const normalizeStatus = (status) => {
    if (!status) return 'pending';
    const value = status.toLowerCase();
    if (value === 'active' || value === 'live') return 'live';
    if (value === 'completed' || value === 'finished' || value === 'ended') return 'completed';
    return 'pending';
};

const statusStyles = {
    live: {
        badge: 'bg-red-500 text-white',
        label: 'LIVE',
        gradient: 'from-blue-900 to-primary',
        button: 'Join Now',
    },
    pending: {
        badge: 'bg-amber-500 text-white',
        label: 'UPCOMING',
        gradient: 'from-slate-700 to-slate-900',
        button: 'Register',
    },
    completed: {
        badge: 'bg-emerald-500 text-white',
        label: 'COMPLETED',
        gradient: 'from-emerald-900 to-teal-900',
        button: 'Results',
    },
};

const defaultForm = {
    name: '',
    description: '',
    type: 'arena',
    time_control: 'blitz',
    initial_time_minutes: 3,
    increment_seconds: 0,
    start_at: '',
    swiss_rounds: 3,
    arena_duration_minutes: 30,
    rated: true,
    password: '',
};

const formatCountdown = (startAt, nowMs) => {
    if (!startAt) return null;
    const diff = new Date(startAt).getTime() - nowMs;
    if (diff <= 0) return 'Starting...';
    const totalSeconds = Math.floor(diff / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

export default function TournamentsPage() {
    const navigate = useNavigate();
    const { isAuthenticated } = useAuth();
    const [tournaments, setTournaments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [statusFilter, setStatusFilter] = useState('live');
    const [nowMs, setNowMs] = useState(Date.now());

    const [showCreate, setShowCreate] = useState(false);
    const [creating, setCreating] = useState(false);
    const [createError, setCreateError] = useState(null);
    const [form, setForm] = useState(defaultForm);
    const startAtInputRef = useRef(null);
    const [registeredIds, setRegisteredIds] = useState(new Set());
    const [registeringId, setRegisteringId] = useState(null);
    const [listPage, setListPage] = useState(1);

    const handleQuickRegister = async (event, tournamentId) => {
        event.stopPropagation();
        if (!isAuthenticated) { navigate('/login'); return; }
        setRegisteringId(tournamentId);
        try {
            await registerTournament(tournamentId);
            setRegisteredIds((prev) => new Set(prev).add(tournamentId));
            await loadTournaments();
        } catch (err) {
            setError(err?.message || 'Failed to register.');
        } finally {
            setRegisteringId(null);
        }
    };

    const initialTabSet = useRef(false);
    const regCheckedRef = useRef(false);

    const extractResults = (data) => Array.isArray(data) ? data : (data?.results ?? []);

    const loadTournaments = useCallback(async () => {
        try {
            const [liveData, pendingData, completedData] = await Promise.all([
                listTournaments({ status: 'active', page_size: 50 }),
                listTournaments({ status: 'pending', page_size: 50 }),
                listTournaments({ status: 'completed', page_size: 50 }),
            ]);
            const liveResults = extractResults(liveData);
            const pendingResults = extractResults(pendingData);
            const completedResults = extractResults(completedData);
            const all = [...liveResults, ...pendingResults, ...completedResults];
            setTournaments(all);
            setError(null);

            if (!initialTabSet.current) {
                initialTabSet.current = true;
                if (liveResults.length > 0) setStatusFilter('live');
                else if (pendingResults.length > 0) setStatusFilter('pending');
            }

            const ids = new Set();
            all.forEach((t) => { if (t.is_registered) ids.add(t.id); });

            if (!regCheckedRef.current && isAuthenticated) {
                regCheckedRef.current = true;
                const nonCompleted = [...liveResults, ...pendingResults];
                if (nonCompleted.length > 0) {
                    const regChecks = await Promise.allSettled(
                        nonCompleted.map((t) => tournamentMyGame(t.id).then((res) => ({ id: t.id, registered: res?.is_registered })))
                    );
                    regChecks.forEach((result) => {
                        if (result.status === 'fulfilled' && result.value?.registered) {
                            ids.add(result.value.id);
                        }
                    });
                }
            }

            setRegisteredIds((prev) => {
                const merged = new Set(prev);
                ids.forEach((id) => merged.add(id));
                return merged;
            });
        } catch (err) {
            if (err?.status === 401 || err?.status === 403) {
                setError('Please log in to view tournaments.');
            } else {
                setError(err?.message || 'Failed to load tournaments.');
            }
        } finally {
            setLoading(false);
        }
    }, [isAuthenticated]);

    useEffect(() => {
        setLoading(true);
        loadTournaments();
        const polling = setInterval(() => {
            loadTournaments();
        }, 30000);
        return () => clearInterval(polling);
    }, [loadTournaments]);

    useEffect(() => {
        const timer = setInterval(() => setNowMs(Date.now()), 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        if (!showCreate) return undefined;
        const handleEscape = (event) => {
            if (event.key === 'Escape') {
                setShowCreate(false);
            }
        };
        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [showCreate]);

    const filtered = useMemo(
        () => tournaments.filter((tournament) => normalizeStatus(tournament.status) === statusFilter),
        [tournaments, statusFilter],
    );

    const minDatetime = useMemo(() => {
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        return now.toISOString().slice(0, 16);
    }, []);

    const statusCounts = useMemo(() => {
        const counts = { live: 0, pending: 0, completed: 0 };
        tournaments.forEach((t) => { counts[normalizeStatus(t.status)] = (counts[normalizeStatus(t.status)] || 0) + 1; });
        return counts;
    }, [tournaments]);

    const handleCreate = () => {
        if (!isAuthenticated) {
            navigate('/login');
            return;
        }
        setCreateError(null);
        setForm(defaultForm);
        setShowCreate(true);
    };

    const updateForm = (key, value) => {
        setForm((prev) => ({ ...prev, [key]: value }));
    };

    const handleTimeControlChange = (value) => {
        const preset = timeControlDefaults[value];
        setForm((prev) => ({
            ...prev,
            time_control: value,
            initial_time_minutes: preset ? preset.minutes : prev.initial_time_minutes,
            increment_seconds: preset ? preset.increment : prev.increment_seconds,
        }));
    };

    const onSubmitCreate = async (event) => {
        event.preventDefault();
        setCreateError(null);
        if (!form.name.trim()) {
            setCreateError('Tournament name is required.');
            return;
        }
        if (!form.start_at) {
            setCreateError('Start time is required.');
            return;
        }
        if (new Date(form.start_at) <= new Date()) {
            setCreateError('Start time must be in the future.');
            return;
        }

        const startAtIso = new Date(form.start_at).toISOString();
        const payload = {
            name: form.name.trim(),
            description: form.description.trim(),
            type: form.type,
            time_control: form.time_control,
            initial_time_seconds: Number(form.initial_time_minutes) * 60,
            increment_seconds: Number(form.increment_seconds),
            start_at: startAtIso,
            rated: Boolean(form.rated),
            password: form.password || '',
        };

        if (form.type === 'arena') {
            payload.arena_duration_minutes = Number(form.arena_duration_minutes);
        }
        if (form.type === 'swiss') {
            payload.swiss_rounds = Number(form.swiss_rounds);
        }

        setCreating(true);
        try {
            const created = await createTournament(payload);
            setShowCreate(false);
            setStatusFilter('pending');
            await loadTournaments();
            navigate(`/tournaments/${created.id}`);
        } catch (err) {
            setCreateError(err?.message || 'Failed to create tournament.');
        } finally {
            setCreating(false);
        }
    };

    return (
        <Layout showHeader={false} showBottomNav={!showCreate}>
            <div className="flex-1 flex flex-col overflow-hidden">
                <header className="sticky top-0 z-50 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-sm">
                    <div className="flex items-center justify-between px-4 py-3">
                        <button
                            className="p-2 -ml-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-slate-600 dark:text-slate-300"
                            type="button"
                            onClick={() => navigate('/')}
                        >
                            <span className="material-symbols-outlined text-[22px]">arrow_back</span>
                        </button>
                        <h1 className="text-base font-bold tracking-tight">Tournaments</h1>
                        <button
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-blue-600 transition-colors shadow-sm"
                            type="button"
                            onClick={handleCreate}
                            data-testid="tournaments-create-button"
                        >
                            <span className="material-symbols-outlined text-[16px]">add</span>
                            Create
                        </button>
                    </div>
                    <div className="flex gap-1.5 px-4 pb-3">
                        {statusOptions.map((option) => {
                            const count = statusCounts[option.id] || 0;
                            return (
                                <button
                                    key={option.id}
                                    type="button"
                                    onClick={() => { setStatusFilter(option.id); setListPage(1); }}
                                    className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all flex items-center gap-1.5 ${
                                        statusFilter === option.id
                                            ? 'bg-primary text-white shadow-sm'
                                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                                    }`}
                                >
                                    {option.label}
                                    {count > 0 ? (
                                        <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-bold leading-none px-1 ${
                                            statusFilter === option.id
                                                ? 'bg-white/20 text-white'
                                                : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                                        }`}>
                                            {count}
                                        </span>
                                    ) : null}
                                </button>
                            );
                        })}
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto p-4 pb-24 space-y-4 no-scrollbar">
                    {loading ? (
                        <div className="flex items-center justify-center py-16">
                            <div className="text-sm text-slate-500">Loading tournaments...</div>
                        </div>
                    ) : error ? (
                        <div className="flex items-center justify-center py-16">
                            <div className="text-sm text-red-500">{error}</div>
                        </div>
                    ) : (() => {
                        const LIST_PAGE_SIZE = 20;
                        const totalListPages = Math.max(1, Math.ceil(filtered.length / LIST_PAGE_SIZE));
                        const safeListPage = Math.min(listPage, totalListPages);
                        const pagedFiltered = filtered.slice((safeListPage - 1) * LIST_PAGE_SIZE, safeListPage * LIST_PAGE_SIZE);
                        return (
                        <>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {pagedFiltered.map((tournament) => {
                                const normalized = normalizeStatus(tournament.status);
                                const style = statusStyles[normalized];
                                const countdown = formatCountdown(tournament.start_at, nowMs);
                                const registered = registeredIds.has(tournament.id) || Boolean(tournament.is_registered);
                                const isRegistering = registeringId === tournament.id;
                                return (
                                    <div
                                        key={tournament.id}
                                        className={`bg-gradient-to-r ${style.gradient} rounded-xl p-4 text-white relative overflow-hidden text-left cursor-pointer`}
                                        onClick={() => navigate(`/tournaments/${tournament.id}`)}
                                        data-testid={`tournament-card-${tournament.id}`}
                                    >
                                        <div className="relative z-10 flex items-center justify-between">
                                            <div>
                                                <div className={`inline-flex items-center gap-2 text-[10px] font-bold px-2 py-0.5 rounded-full ${style.badge}`}>
                                                    {style.label}
                                                </div>
                                                <h3 className="font-bold text-lg leading-tight mt-2">{tournament.name}</h3>
                                                <p className="text-xs font-medium opacity-80 mt-1">
                                                    {tournament.time_control} • {tournament.type}
                                                </p>
                                                <p className="text-xs opacity-80 mt-1">
                                                    {tournament.participants_count || 0} players
                                                </p>
                                                {normalized === 'pending' && countdown ? (
                                                    <p className="text-xs font-semibold mt-1">Starts in {countdown}</p>
                                                ) : null}
                                            </div>
                                            <div className="text-white/20">
                                                <span className="material-symbols-outlined" style={{ fontSize: 56 }}>trophy</span>
                                            </div>
                                        </div>
                                        <div className="relative z-10 mt-4 flex items-center gap-2">
                                            {registered && normalized !== 'completed' ? (
                                                <span className="inline-flex items-center gap-1.5 bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm">
                                                    <span className="material-symbols-outlined text-[16px]">check_circle</span>
                                                    Registered
                                                </span>
                                            ) : normalized !== 'completed' ? (
                                                <button
                                                    type="button"
                                                    className="inline-flex items-center gap-1.5 bg-white text-primary text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm hover:bg-slate-100 transition-colors disabled:opacity-60"
                                                    onClick={(e) => handleQuickRegister(e, tournament.id)}
                                                    disabled={isRegistering}
                                                >
                                                    {isRegistering ? 'Registering...' : style.button}
                                                </button>
                                            ) : null}
                                            <button
                                                type="button"
                                                className="inline-flex items-center gap-1.5 bg-white/15 hover:bg-white/25 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
                                                onClick={(e) => { e.stopPropagation(); navigate(`/tournaments/${tournament.id}`); }}
                                            >
                                                {normalized === 'completed' ? 'Results' : 'View Details'}
                                            </button>
                                        </div>
                                        <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-white/10 rounded-full blur-2xl"></div>
                                    </div>
                                );
                            })}
                            {!filtered.length ? (
                                <div className="col-span-full flex flex-col items-center justify-center py-12 text-center">
                                    <span className="material-symbols-outlined text-5xl text-slate-300 dark:text-slate-600 mb-3">emoji_events</span>
                                    <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                                        {statusFilter === 'live' ? 'No live tournaments right now' : statusFilter === 'pending' ? 'No upcoming tournaments' : 'No completed tournaments yet'}
                                    </p>
                                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                                        {statusFilter === 'pending' ? 'Create one to get started!' : 'Check back later.'}
                                    </p>
                                    {statusFilter === 'pending' ? (
                                        <button
                                            type="button"
                                            className="mt-4 flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-blue-600 transition-colors shadow-sm"
                                            onClick={handleCreate}
                                        >
                                            <span className="material-symbols-outlined text-[16px]">add</span>
                                            Create Tournament
                                        </button>
                                    ) : null}
                                </div>
                            ) : null}
                        </div>
                        <div className="col-span-full mt-2">
                            <AdBanner format="auto" className="rounded-xl overflow-hidden" />
                        </div>
                        {totalListPages > 1 ? (
                            <div className="flex items-center justify-between mt-4">
                                <button
                                    type="button"
                                    className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-semibold text-slate-500 hover:text-primary hover:bg-primary/5 disabled:opacity-40 disabled:hover:text-slate-500 disabled:hover:bg-transparent transition-colors"
                                    onClick={() => setListPage((p) => Math.max(1, p - 1))}
                                    disabled={safeListPage <= 1}
                                >
                                    <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                                    Previous
                                </button>
                                <span className="text-sm text-slate-500">
                                    Page {safeListPage} of {totalListPages}
                                </span>
                                <button
                                    type="button"
                                    className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-semibold text-slate-500 hover:text-primary hover:bg-primary/5 disabled:opacity-40 disabled:hover:text-slate-500 disabled:hover:bg-transparent transition-colors"
                                    onClick={() => setListPage((p) => Math.min(totalListPages, p + 1))}
                                    disabled={safeListPage >= totalListPages}
                                >
                                    Next
                                    <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                                </button>
                            </div>
                        ) : null}
                        </>
                        );
                    })()}
                </main>
            </div>

            {showCreate ? (
                <div
                    className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm p-3 sm:p-4 flex items-end sm:items-center justify-center overflow-y-auto"
                    onPointerDown={(event) => {
                        if (event.target === event.currentTarget) {
                            setShowCreate(false);
                        }
                    }}
                >
                    <form
                        className="w-full sm:max-w-2xl lg:max-w-4xl max-h-[calc(100dvh-7rem)] sm:max-h-[min(90dvh,56rem)] overflow-y-auto no-scrollbar bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-700 p-3 sm:p-4 space-y-3"
                        onSubmit={onSubmitCreate}
                        onPointerDown={(event) => event.stopPropagation()}
                        data-testid="tournament-create-modal"
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Create Tournament</h2>
                                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                                    Configure format, clock and schedule before publishing.
                                </p>
                            </div>
                            <button
                                type="button"
                                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 dark:border-slate-700 text-slate-500 hover:text-slate-800 hover:border-slate-400 dark:hover:text-slate-100 dark:hover:border-slate-500 transition-colors"
                                onClick={() => setShowCreate(false)}
                            >
                                <span className="material-symbols-outlined text-[22px]">close</span>
                            </button>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                            <section className="rounded-xl border border-slate-200/80 dark:border-slate-700/80 bg-slate-50/70 dark:bg-slate-900/35 p-3 space-y-2.5">
                                <div className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
                                    <span className="material-symbols-outlined text-[18px] text-primary">edit_note</span>
                                    Basic details
                                </div>
                                <label className="block space-y-1.5">
                                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Tournament name</span>
                                    <input
                                        className="w-full min-w-0 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                                        placeholder="Enter tournament name"
                                        value={form.name}
                                        onChange={(e) => updateForm('name', e.target.value)}
                                        maxLength={255}
                                        data-testid="create-tournament-name"
                                        required
                                    />
                                </label>
                                <label className="block space-y-1.5">
                                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Description</span>
                                    <textarea
                                        className="w-full min-w-0 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm min-h-[72px]"
                                        placeholder="Short tournament description"
                                        value={form.description}
                                        onChange={(e) => updateForm('description', e.target.value)}
                                        data-testid="create-tournament-description"
                                    />
                                </label>
                            </section>

                            <section className="rounded-xl border border-slate-200/80 dark:border-slate-700/80 bg-slate-50/70 dark:bg-slate-900/35 p-3 space-y-2.5">
                                <div className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
                                    <span className="material-symbols-outlined text-[18px] text-primary">tune</span>
                                    Format
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <label className="block space-y-1.5">
                                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Tournament type</span>
                                        <select
                                            className="w-full min-w-0 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                                            value={form.type}
                                            onChange={(e) => updateForm('type', e.target.value)}
                                            data-testid="create-tournament-type"
                                        >
                                            {tournamentTypeOptions.map((option) => (
                                                <option key={option.id} value={option.id}>{option.label}</option>
                                            ))}
                                        </select>
                                    </label>
                                    <label className="block space-y-1.5">
                                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Time control</span>
                                        <select
                                            className="w-full min-w-0 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                                            value={form.time_control}
                                            onChange={(e) => handleTimeControlChange(e.target.value)}
                                            data-testid="create-tournament-time-control"
                                        >
                                            {timeControlOptions.map((option) => (
                                                <option key={option.id} value={option.id}>{option.label}</option>
                                            ))}
                                        </select>
                                    </label>
                                </div>

                                <label className="inline-flex w-full items-center justify-between gap-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900/70 px-3 py-2">
                                    <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                                        <span className="material-symbols-outlined text-[18px] text-amber-500">workspace_premium</span>
                                        Rated tournament
                                    </span>
                                    <input
                                        type="checkbox"
                                        checked={form.rated}
                                        onChange={(e) => updateForm('rated', e.target.checked)}
                                        className="h-4 w-4 accent-primary"
                                    />
                                </label>
                            </section>
                        </div>

                        <section className="rounded-xl border border-slate-200/80 dark:border-slate-700/80 bg-slate-50/70 dark:bg-slate-900/35 p-3 space-y-2.5">
                            <div className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
                                <span className="material-symbols-outlined text-[18px] text-primary">schedule</span>
                                Clock & schedule
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <label className="block space-y-1.5">
                                    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
                                        <span className="material-symbols-outlined text-[16px] text-slate-400">timer</span>
                                        Initial time
                                    </span>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            min="1"
                                            inputMode="numeric"
                                            className="w-full min-w-0 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 pr-16 text-sm"
                                            value={form.initial_time_minutes}
                                            onChange={(e) => updateForm('initial_time_minutes', e.target.value)}
                                            placeholder="3"
                                            data-testid="create-tournament-initial-seconds"
                                        />
                                        <span className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                                            min
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">Blitz default: 3 min</p>
                                </label>
                                <label className="block space-y-1.5">
                                    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
                                        <span className="material-symbols-outlined text-[16px] text-slate-400">add_alarm</span>
                                        Increment / move
                                    </span>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            min="0"
                                            inputMode="numeric"
                                            className="w-full min-w-0 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 pr-14 text-sm"
                                            value={form.increment_seconds}
                                            onChange={(e) => updateForm('increment_seconds', e.target.value)}
                                            placeholder="0"
                                            data-testid="create-tournament-increment-seconds"
                                        />
                                        <span className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                                            sec
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">Blitz default: 0 sec</p>
                                </label>
                                <label className="block space-y-1.5">
                                    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
                                        <span className="material-symbols-outlined text-[16px] text-slate-400">calendar_month</span>
                                        Start date & time
                                    </span>
                                    <div className="relative">
                                        <input
                                            ref={startAtInputRef}
                                            type="datetime-local"
                                            min={minDatetime}
                                            className="tournament-datetime-input w-full min-w-0 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 pl-3 pr-11 py-2 text-sm"
                                            value={form.start_at}
                                            onChange={(e) => updateForm('start_at', e.target.value)}
                                            data-testid="create-tournament-start-at"
                                            required
                                        />
                                        <button
                                            type="button"
                                            className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
                                            onClick={() => {
                                                if (startAtInputRef.current?.showPicker) {
                                                    startAtInputRef.current.showPicker();
                                                } else {
                                                    startAtInputRef.current?.focus();
                                                }
                                            }}
                                            aria-label="Open date and time picker"
                                        >
                                            <span className="material-symbols-outlined text-[18px]">event</span>
                                        </button>
                                    </div>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">Pick your local start date and time</p>
                                </label>

                                {form.type === 'arena' ? (
                                    <label className="block space-y-1.5">
                                        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
                                            <span className="material-symbols-outlined text-[16px] text-slate-400">sports_score</span>
                                            Arena duration
                                        </span>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                min="1"
                                                inputMode="numeric"
                                                className="w-full min-w-0 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 pr-14 text-sm"
                                                value={form.arena_duration_minutes}
                                                onChange={(e) => updateForm('arena_duration_minutes', e.target.value)}
                                                placeholder="30"
                                                data-testid="create-tournament-arena-duration"
                                            />
                                            <span className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                                                min
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-500 dark:text-slate-400">Duration in minutes (default: 30)</p>
                                    </label>
                                ) : null}

                                {form.type === 'swiss' ? (
                                    <label className="block space-y-1.5">
                                        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
                                            <span className="material-symbols-outlined text-[16px] text-slate-400">format_list_numbered</span>
                                            Swiss rounds
                                        </span>
                                        <input
                                            type="number"
                                            min="1"
                                            inputMode="numeric"
                                            className="w-full min-w-0 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm"
                                            value={form.swiss_rounds}
                                            onChange={(e) => updateForm('swiss_rounds', e.target.value)}
                                            placeholder="5"
                                            data-testid="create-tournament-swiss-rounds"
                                        />
                                    </label>
                                ) : null}
                            </div>
                        </section>

                        <section className="rounded-xl border border-slate-200/80 dark:border-slate-700/80 bg-slate-50/70 dark:bg-slate-900/35 p-3 space-y-2.5">
                            <div className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
                                <span className="material-symbols-outlined text-[18px] text-primary">lock</span>
                                Access
                            </div>
                            <label className="block space-y-1.5">
                                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Entry code (optional)</span>
                                <div className="relative">
                                    <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-slate-400">
                                        key
                                    </span>
                                    <input
                                        className="w-full min-w-0 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 pl-9 pr-3 py-2 text-sm"
                                        value={form.password}
                                        onChange={(e) => updateForm('password', e.target.value)}
                                        placeholder="Leave empty for public tournament"
                                        data-testid="create-tournament-password"
                                    />
                                </div>
                            </label>
                        </section>

                        {createError ? <p className="text-xs text-red-500">{createError}</p> : null}

                        <button
                            type="submit"
                            disabled={creating}
                            className="w-full bg-primary text-white font-semibold py-2.5 rounded-lg disabled:opacity-60"
                            data-testid="create-tournament-submit"
                        >
                            {creating ? 'Creating...' : 'Create Tournament'}
                        </button>
                    </form>
                </div>
            ) : null}
        </Layout>
    );
}
