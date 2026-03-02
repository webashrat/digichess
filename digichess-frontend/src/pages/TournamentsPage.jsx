import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import { createTournament, listTournaments } from '../api';
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

    const loadTournaments = useCallback(async () => {
        try {
            const data = await listTournaments({ page_size: 20 });
            setTournaments(data.results || []);
            setError(null);
        } catch {
            setError('Failed to load tournaments.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        setLoading(true);
        loadTournaments();
        const polling = setInterval(() => {
            loadTournaments();
        }, 10000);
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
                <header className="sticky top-0 z-50 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-background-light/95 to-background-light/90 dark:from-background-dark/95 dark:to-background-dark/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-sm">
                    <button
                        className="flex items-center justify-center p-2 -ml-2 rounded-full active:bg-slate-200 dark:active:bg-slate-800 transition-colors"
                        type="button"
                        onClick={() => navigate('/')}
                    >
                        <span className="material-symbols-outlined text-2xl">arrow_back</span>
                    </button>
                    <h1 className="text-lg font-bold tracking-tight">Tournaments Hub</h1>
                    <div className="w-6" />
                </header>

                <main className="flex-1 overflow-y-auto p-4 pb-24 space-y-6 no-scrollbar">
                    <button
                        className="w-full relative group overflow-hidden rounded-xl bg-primary p-4 shadow-lg shadow-primary/25 active:scale-[0.98] transition-all"
                        type="button"
                        onClick={handleCreate}
                        data-testid="tournaments-create-button"
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                        <div className="flex items-center justify-center gap-3">
                            <span className="material-symbols-outlined text-white text-3xl">add_circle</span>
                            <span className="text-white text-lg font-bold tracking-wide">Create Tournament</span>
                        </div>
                    </button>

                    <div className="flex gap-2 overflow-x-auto pb-2">
                        {statusOptions.map((option) => (
                            <button
                                key={option.id}
                                type="button"
                                onClick={() => setStatusFilter(option.id)}
                                className={`px-4 py-1.5 rounded-full text-sm font-semibold border ${
                                    statusFilter === option.id
                                        ? 'bg-primary text-white border-primary'
                                        : 'bg-white dark:bg-surface-dark border-slate-200 dark:border-slate-700 text-slate-500'
                                }`}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>

                    {loading ? (
                        <div className="text-sm text-slate-500">Loading tournaments...</div>
                    ) : error ? (
                        <div className="text-sm text-red-500">{error}</div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {filtered.map((tournament) => {
                                const normalized = normalizeStatus(tournament.status);
                                const style = statusStyles[normalized];
                                const countdown = formatCountdown(tournament.start_at, nowMs);
                                return (
                                    <button
                                        key={tournament.id}
                                        className={`bg-gradient-to-r ${style.gradient} rounded-xl p-4 text-white relative overflow-hidden text-left`}
                                        type="button"
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
                                        <div className="relative z-10 mt-4">
                                            <span className="inline-flex bg-white text-primary text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm">
                                                {style.button}
                                            </span>
                                        </div>
                                        <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-white/10 rounded-full blur-2xl"></div>
                                    </button>
                                );
                            })}
                            {!filtered.length ? (
                                <div className="text-sm text-slate-500">No tournaments found.</div>
                            ) : null}
                        </div>
                    )}
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
