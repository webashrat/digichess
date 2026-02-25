import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
    initial_time_seconds: 300,
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
            initial_time_seconds: Number(form.initial_time_seconds),
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
        <Layout showHeader={false}>
            <div className="flex-1 flex flex-col overflow-hidden">
                <header className="sticky top-0 z-50 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-background-light/95 to-background-light/90 dark:from-background-dark/95 dark:to-background-dark/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-sm">
                    <button
                        className="flex items-center justify-center p-2 -ml-2 rounded-full active:bg-slate-200 dark:active:bg-slate-800 transition-colors"
                        type="button"
                        onClick={() => navigate(-1)}
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
                <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm p-4 flex items-end sm:items-center justify-center">
                    <form
                        className="w-full sm:max-w-xl bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-700 p-4 space-y-3"
                        onSubmit={onSubmitCreate}
                        data-testid="tournament-create-modal"
                    >
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Create Tournament</h2>
                            <button
                                type="button"
                                className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                                onClick={() => setShowCreate(false)}
                            >
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        <input
                            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                            placeholder="Tournament name"
                            value={form.name}
                            onChange={(e) => updateForm('name', e.target.value)}
                            maxLength={255}
                            data-testid="create-tournament-name"
                            required
                        />

                        <textarea
                            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm min-h-[70px]"
                            placeholder="Description"
                            value={form.description}
                            onChange={(e) => updateForm('description', e.target.value)}
                            data-testid="create-tournament-description"
                        />

                        <div className="grid grid-cols-2 gap-3">
                            <select
                                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                                value={form.type}
                                onChange={(e) => updateForm('type', e.target.value)}
                                data-testid="create-tournament-type"
                            >
                                {tournamentTypeOptions.map((option) => (
                                    <option key={option.id} value={option.id}>{option.label}</option>
                                ))}
                            </select>
                            <select
                                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                                value={form.time_control}
                                onChange={(e) => updateForm('time_control', e.target.value)}
                                data-testid="create-tournament-time-control"
                            >
                                {timeControlOptions.map((option) => (
                                    <option key={option.id} value={option.id}>{option.label}</option>
                                ))}
                            </select>
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                            <input
                                type="number"
                                min="30"
                                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                                value={form.initial_time_seconds}
                                onChange={(e) => updateForm('initial_time_seconds', e.target.value)}
                                placeholder="Initial sec"
                                data-testid="create-tournament-initial-seconds"
                            />
                            <input
                                type="number"
                                min="0"
                                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                                value={form.increment_seconds}
                                onChange={(e) => updateForm('increment_seconds', e.target.value)}
                                placeholder="Increment"
                                data-testid="create-tournament-increment-seconds"
                            />
                            <input
                                type="datetime-local"
                                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                                value={form.start_at}
                                onChange={(e) => updateForm('start_at', e.target.value)}
                                data-testid="create-tournament-start-at"
                                required
                            />
                        </div>

                        {form.type === 'arena' ? (
                            <input
                                type="number"
                                min="1"
                                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                                value={form.arena_duration_minutes}
                                onChange={(e) => updateForm('arena_duration_minutes', e.target.value)}
                                placeholder="Arena duration (minutes)"
                                data-testid="create-tournament-arena-duration"
                            />
                        ) : null}

                        {form.type === 'swiss' ? (
                            <input
                                type="number"
                                min="1"
                                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                                value={form.swiss_rounds}
                                onChange={(e) => updateForm('swiss_rounds', e.target.value)}
                                placeholder="Swiss rounds"
                                data-testid="create-tournament-swiss-rounds"
                            />
                        ) : null}

                        <input
                            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                            value={form.password}
                            onChange={(e) => updateForm('password', e.target.value)}
                            placeholder="Entry code (optional)"
                            data-testid="create-tournament-password"
                        />

                        <label className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                            <input
                                type="checkbox"
                                checked={form.rated}
                                onChange={(e) => updateForm('rated', e.target.checked)}
                            />
                            Rated tournament
                        </label>

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
