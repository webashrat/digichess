import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import { listTournaments } from '../api';
import { useAuth } from '../context/AuthContext';

const statusOptions = [
    { id: 'live', label: 'Live' },
    { id: 'pending', label: 'Upcoming' },
    { id: 'completed', label: 'Completed' },
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

export default function TournamentsPage() {
    const navigate = useNavigate();
    const { isAuthenticated } = useAuth();
    const [tournaments, setTournaments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [statusFilter, setStatusFilter] = useState('live');

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            setError(null);
            try {
                const data = await listTournaments({ page_size: 20 });
                setTournaments(data.results || []);
            } catch (err) {
                setError('Failed to load tournaments.');
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    const filtered = useMemo(() => {
        return tournaments.filter((tournament) => normalizeStatus(tournament.status) === statusFilter);
    }, [tournaments, statusFilter]);

    const handleCreate = () => {
        if (!isAuthenticated) {
            navigate('/login');
            return;
        }
        setError('Tournament creation will be available soon.');
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
                                return (
                                    <button
                                        key={tournament.id}
                                        className={`bg-gradient-to-r ${style.gradient} rounded-xl p-4 text-white relative overflow-hidden text-left`}
                                        type="button"
                                        onClick={() => navigate(`/tournaments/${tournament.id}`)}
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
        </Layout>
    );
}
