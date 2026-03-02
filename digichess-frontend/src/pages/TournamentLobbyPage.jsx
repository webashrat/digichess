import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import { getTournament, registerTournament, unregisterTournament, tournamentStandings, tournamentMyGame } from '../api';
import { useAuth } from '../context/AuthContext';

const statusLabel = (status) => {
    if (status === 'active') return 'Live';
    if (status === 'completed') return 'Completed';
    return 'Upcoming';
};

export default function TournamentLobbyPage() {
    const { tournamentId } = useParams();
    const navigate = useNavigate();
    const { isAuthenticated } = useAuth();
    const [tournament, setTournament] = useState(null);
    const [standings, setStandings] = useState([]);
    const [tab, setTab] = useState('live');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [registration, setRegistration] = useState({ is_registered: false, game_id: null });
    const [actionLoading, setActionLoading] = useState(false);
    const [nowMs, setNowMs] = useState(Date.now());

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
                if (!cancelled && latest && ['pending', 'active'].includes(latest.status)) {
                    polling = setInterval(async () => {
                        try {
                            const updated = await fetchTournamentData();
                            if (updated?.status === 'completed' && polling) {
                                clearInterval(polling);
                                polling = null;
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

    const countdown = useMemo(() => {
        if (!tournament?.start_at) {
            return { hours: '00', minutes: '00', seconds: '00' };
        }
        const diff = new Date(tournament.start_at).getTime() - nowMs;
        if (diff <= 0) {
            return { hours: '00', minutes: '00', seconds: '00' };
        }
        const totalSeconds = Math.floor(diff / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        return {
            hours: String(hours).padStart(2, '0'),
            minutes: String(minutes).padStart(2, '0'),
            seconds: String(seconds).padStart(2, '0'),
        };
    }, [tournament?.start_at, nowMs]);

    const featuredPlayers = standings.slice(0, 2);

    const handleRegister = async () => {
        if (!isAuthenticated) {
            navigate('/login');
            return;
        }
        setActionLoading(true);
        setError(null);
        try {
            let payload = {};
            if (tournament?.is_private) {
                const password = window.prompt('Enter tournament entry code');
                if (password == null) {
                    setActionLoading(false);
                    return;
                }
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

    return (
        <Layout showHeader={false}>
            <div className="flex-1 flex flex-col overflow-hidden">
                <header className="sticky top-0 z-50 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md border-b border-gray-200 dark:border-gray-800">
                    <div className="flex items-center justify-between px-4 py-3">
                        <button
                            className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-gray-900 dark:text-white"
                            type="button"
                            onClick={() => navigate('/')}
                        >
                            <span className="material-symbols-outlined">arrow_back_ios_new</span>
                        </button>
                        <h1 className="text-base font-bold text-gray-900 dark:text-white tracking-tight">Tournament Lobby</h1>
                        <button className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-gray-900 dark:text-white" type="button">
                            <span className="material-symbols-outlined">ios_share</span>
                        </button>
                    </div>
                    {tournament ? (
                        <div className="px-4 pb-2">
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white leading-tight mb-3">{tournament.name}</h2>
                            <div className="flex flex-wrap items-center gap-2 mb-5">
                                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${
                                    tournament.status === 'active'
                                        ? 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'
                                        : tournament.status === 'completed'
                                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                                            : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                                }`} data-testid="tournament-status-badge">
                                    {statusLabel(tournament.status)}
                                </span>
                                <span className="inline-flex items-center px-3 py-1 rounded-full bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs font-semibold border border-gray-300 dark:border-gray-700">
                                    {tournament.current_round ? `Round ${tournament.current_round}` : 'Round --'}
                                </span>
                                <span className="inline-flex items-center px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold border border-primary/20">
                                    {tournament.time_control || 'Blitz'}
                                </span>
                            </div>

                            {tournament.status === 'pending' ? (
                                <div className="flex gap-3 mb-4">
                                    <div className="flex-1 flex flex-col gap-1">
                                        <div className="h-12 flex items-center justify-center bg-white dark:bg-[#1e293b] rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                                            <span className="text-xl font-bold text-gray-900 dark:text-white tabular-nums" data-testid="tournament-countdown-hours">{countdown.hours}</span>
                                        </div>
                                        <span className="text-[10px] text-center uppercase tracking-wide text-gray-500 dark:text-gray-400 font-semibold">Hours</span>
                                    </div>
                                    <div className="flex-1 flex flex-col gap-1">
                                        <div className="h-12 flex items-center justify-center bg-white dark:bg-[#1e293b] rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                                            <span className="text-xl font-bold text-gray-900 dark:text-white tabular-nums" data-testid="tournament-countdown-minutes">{countdown.minutes}</span>
                                        </div>
                                        <span className="text-[10px] text-center uppercase tracking-wide text-gray-500 dark:text-gray-400 font-semibold">Minutes</span>
                                    </div>
                                    <div className="flex-1 flex flex-col gap-1">
                                        <div className="h-12 flex items-center justify-center bg-white dark:bg-[#1e293b] rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                                            <span className="text-xl font-bold text-primary tabular-nums" data-testid="tournament-countdown-seconds">{countdown.seconds}</span>
                                        </div>
                                        <span className="text-[10px] text-center uppercase tracking-wide text-gray-500 dark:text-gray-400 font-semibold">Seconds</span>
                                    </div>
                                </div>
                            ) : null}

                            <div className="bg-gray-200 dark:bg-[#1e293b] p-1 rounded-xl flex mb-2">
                                <button
                                    className={`flex-1 py-1.5 px-3 rounded-lg text-sm font-semibold transition-all ${
                                        tab === 'live'
                                            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                                    }`}
                                    type="button"
                                    onClick={() => setTab('live')}
                                >
                                    Live Games
                                </button>
                                <button
                                    className={`flex-1 py-1.5 px-3 rounded-lg text-sm font-semibold transition-all ${
                                        tab === 'standings'
                                            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                                    }`}
                                    type="button"
                                    onClick={() => setTab('standings')}
                                >
                                    Standings
                                </button>
                                <button
                                    className={`flex-1 py-1.5 px-3 rounded-lg text-sm font-semibold transition-all ${
                                        tab === 'info'
                                            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                                    }`}
                                    type="button"
                                    onClick={() => setTab('info')}
                                >
                                    Chat & Info
                                </button>
                            </div>
                        </div>
                    ) : null}
                </header>

                <main className="flex-1 p-4 pb-24 space-y-6 overflow-y-auto">
                    {loading ? (
                        <div className="text-sm text-slate-500">Loading tournament...</div>
                    ) : error ? (
                        <div className="text-sm text-red-500">{error}</div>
                    ) : tournament ? (
                        <>
                            <section className="bg-white dark:bg-[#1e293b] rounded-2xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
                                <p className="text-sm text-slate-500 dark:text-slate-400">
                                    {tournament.description || 'No description provided.'}
                                </p>
                                {tournament.status !== 'completed' ? (
                                    registration.is_registered ? (
                                        <div className="flex gap-2">
                                            <button
                                                className="flex-1 bg-primary text-white font-semibold py-2.5 rounded-lg"
                                                type="button"
                                                onClick={() => registration.game_id && navigate(`/game/${registration.game_id}`)}
                                                disabled={!registration.game_id}
                                                data-testid="tournament-go-to-game"
                                            >
                                                {registration.game_id ? 'Go to My Game' : 'Waiting for Pairing'}
                                            </button>
                                            <button
                                                className="px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-sm"
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
                                            className="w-full bg-primary text-white font-semibold py-2.5 rounded-lg"
                                            type="button"
                                            onClick={handleRegister}
                                            disabled={actionLoading}
                                            data-testid="tournament-register"
                                        >
                                            Register
                                        </button>
                                    )
                                ) : (
                                    <div className="text-sm text-emerald-600 dark:text-emerald-400 font-semibold">
                                        Tournament completed.
                                    </div>
                                )}
                            </section>

                            {tournament.status === 'completed' && tournament.winners?.length ? (
                                <section className="bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl border border-emerald-200 dark:border-emerald-700/50 p-4">
                                    <h3 className="text-sm font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 mb-2">Winners</h3>
                                    <ol className="space-y-1 text-sm text-emerald-800 dark:text-emerald-200" data-testid="tournament-winners-list">
                                        {tournament.winners.map((winner, index) => (
                                            <li key={`${winner}-${index}`}>{index + 1}. {winner}</li>
                                        ))}
                                    </ol>
                                </section>
                            ) : null}

                            {tab === 'live' ? (
                                <section className="space-y-6">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                                            <span className="material-symbols-outlined text-primary text-lg">star</span>
                                            Top Board
                                        </h3>
                                    </div>
                                    <div className="bg-white dark:bg-[#1e293b] rounded-2xl overflow-hidden shadow-lg border border-gray-200 dark:border-gray-700">
                                        <div className="p-3 bg-gray-50 dark:bg-[#161f2e] border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                                            <div className="flex items-center gap-2">
                                                <div className="h-8 w-8 rounded-full bg-gray-300 overflow-hidden relative border border-gray-400 flex items-center justify-center text-xs font-bold">
                                                    {featuredPlayers[0]?.username?.slice(0, 1) || 'B'}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-bold text-gray-900 dark:text-white leading-none">{featuredPlayers[0]?.username || 'Player A'}</p>
                                                    <p className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-0.5">{featuredPlayers[0]?.score || '--'}</p>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="relative aspect-square w-full bg-[#101622] flex items-center justify-center">
                                            <span className="material-symbols-outlined text-6xl text-slate-600">chess</span>
                                        </div>
                                        <div className="p-3 bg-white dark:bg-[#1e293b] flex justify-between items-center border-t border-gray-200 dark:border-gray-700">
                                            <div className="flex items-center gap-2">
                                                <div className="h-8 w-8 rounded-full bg-gray-100 overflow-hidden relative border border-gray-200 flex items-center justify-center text-xs font-bold">
                                                    {featuredPlayers[1]?.username?.slice(0, 1) || 'W'}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-bold text-gray-900 dark:text-white leading-none">{featuredPlayers[1]?.username || 'Player B'}</p>
                                                    <p className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-0.5">{featuredPlayers[1]?.score || '--'}</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {!standings.length ? (
                                        <p className="text-sm text-slate-500">Live matches will appear once pairings are created.</p>
                                    ) : null}
                                </section>
                            ) : null}

                            {tab === 'standings' ? (
                                <section className="bg-white dark:bg-[#1e293b] rounded-2xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
                                    {standings.map((row, index) => (
                                        <div key={row.user_id} className="flex items-center justify-between text-sm">
                                            <div className="flex items-center gap-3">
                                                <span className="text-slate-400 w-6 text-right">{index + 1}</span>
                                                <div>
                                                    <p className="font-semibold text-gray-900 dark:text-white">{row.username}</p>
                                                    <p className="text-xs text-slate-500">{row.country || 'INT'}</p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-bold text-gray-900 dark:text-white">{row.score}</p>
                                                {row.streak != null ? (
                                                    <p className="text-xs text-slate-500">Streak {row.streak}</p>
                                                ) : null}
                                            </div>
                                        </div>
                                    ))}
                                    {!standings.length ? (
                                        <p className="text-sm text-slate-500">Standings will appear once games start.</p>
                                    ) : null}
                                </section>
                            ) : null}

                            {tab === 'info' ? (
                                <section className="bg-white dark:bg-[#1e293b] rounded-2xl border border-gray-200 dark:border-gray-700 p-4 space-y-2 text-sm text-slate-500">
                                    <p>Status: {tournament.status}</p>
                                    <p>Starts at: {tournament.start_at ? new Date(tournament.start_at).toLocaleString() : 'TBD'}</p>
                                    <p>Type: {tournament.type}</p>
                                    <p>Rated: {tournament.rated ? 'Yes' : 'No'}</p>
                                    <p>Participants: {tournament.participants_count || 0}</p>
                                </section>
                            ) : null}
                        </>
                    ) : null}
                </main>
            </div>
        </Layout>
    );
}
