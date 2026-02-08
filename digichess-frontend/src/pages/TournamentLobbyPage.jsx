import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import { getTournament, registerTournament, unregisterTournament, tournamentStandings, tournamentMyGame } from '../api';
import { useAuth } from '../context/AuthContext';

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

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            setError(null);
            try {
                const [tourney, standingsRes] = await Promise.all([
                    getTournament(tournamentId),
                    tournamentStandings(tournamentId),
                ]);
                setTournament(tourney);
                setStandings(standingsRes.standings || []);
                if (isAuthenticated) {
                    const myGame = await tournamentMyGame(tournamentId);
                    setRegistration({ is_registered: myGame.is_registered, game_id: myGame.game_id });
                }
            } catch (err) {
                setError('Failed to load tournament.');
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [tournamentId, isAuthenticated]);

    const countdown = useMemo(() => {
        if (!tournament?.start_at) {
            return { hours: '00', minutes: '00', seconds: '00' };
        }
        const diff = new Date(tournament.start_at).getTime() - Date.now();
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
    }, [tournament?.start_at]);

    const featuredPlayers = standings.slice(0, 2);

    const handleRegister = async () => {
        if (!isAuthenticated) {
            navigate('/login');
            return;
        }
        setActionLoading(true);
        setError(null);
        try {
            await registerTournament(tournamentId);
            const myGame = await tournamentMyGame(tournamentId);
            setRegistration({ is_registered: myGame.is_registered, game_id: myGame.game_id });
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
                            onClick={() => navigate(-1)}
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
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-bold uppercase tracking-wider border border-red-500/20">
                                    <span className="relative flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                                    </span>
                                    {tournament.status === 'active' ? 'Live' : 'Upcoming'}
                                </span>
                                <span className="inline-flex items-center px-3 py-1 rounded-full bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs font-semibold border border-gray-300 dark:border-gray-700">
                                    {tournament.current_round ? `Round ${tournament.current_round}` : 'Round --'}
                                </span>
                                <span className="inline-flex items-center px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold border border-primary/20">
                                    {tournament.time_control || 'Blitz'}
                                </span>
                            </div>
                            <div className="flex gap-3 mb-4">
                                <div className="flex-1 flex flex-col gap-1">
                                    <div className="h-12 flex items-center justify-center bg-white dark:bg-[#1e293b] rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                                        <span className="text-xl font-bold text-gray-900 dark:text-white tabular-nums">{countdown.hours}</span>
                                    </div>
                                    <span className="text-[10px] text-center uppercase tracking-wide text-gray-500 dark:text-gray-400 font-semibold">Hours</span>
                                </div>
                                <div className="flex-1 flex flex-col gap-1">
                                    <div className="h-12 flex items-center justify-center bg-white dark:bg-[#1e293b] rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                                        <span className="text-xl font-bold text-gray-900 dark:text-white tabular-nums">{countdown.minutes}</span>
                                    </div>
                                    <span className="text-[10px] text-center uppercase tracking-wide text-gray-500 dark:text-gray-400 font-semibold">Minutes</span>
                                </div>
                                <div className="flex-1 flex flex-col gap-1">
                                    <div className="h-12 flex items-center justify-center bg-white dark:bg-[#1e293b] rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                                        <span className="text-xl font-bold text-primary tabular-nums">{countdown.seconds}</span>
                                    </div>
                                    <span className="text-[10px] text-center uppercase tracking-wide text-gray-500 dark:text-gray-400 font-semibold">Seconds</span>
                                </div>
                            </div>
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
                                {registration.is_registered ? (
                                    <div className="flex gap-2">
                                        <button
                                            className="flex-1 bg-primary text-white font-semibold py-2.5 rounded-lg"
                                            type="button"
                                            onClick={() => registration.game_id && navigate(`/game/${registration.game_id}`)}
                                            disabled={!registration.game_id}
                                        >
                                            {registration.game_id ? 'Go to My Game' : 'Waiting for Pairing'}
                                        </button>
                                        <button
                                            className="px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-sm"
                                            type="button"
                                            onClick={handleUnregister}
                                            disabled={actionLoading}
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
                                    >
                                        Register
                                    </button>
                                )}
                            </section>

                            {tab === 'live' ? (
                                <section className="space-y-6">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                                            <span className="material-symbols-outlined text-primary text-lg">star</span>
                                            Top Board
                                        </h3>
                                        <button className="text-primary text-xs font-semibold" type="button">
                                            View Analysis
                                        </button>
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
                                            <div className="bg-gray-800 text-white px-2 py-1 rounded font-mono text-sm font-bold tabular-nums">
                                                03:55
                                            </div>
                                        </div>
                                        <div className="relative aspect-square w-full bg-[#101622] flex items-center justify-center">
                                            <span className="material-symbols-outlined text-6xl text-slate-600">chess</span>
                                        </div>
                                        <div className="p-3 bg-white dark:bg-[#1e293b] flex justify-between items-center border-t border-gray-200 dark:border-gray-700 relative">
                                            <div className="absolute top-0 left-0 h-1 w-full flex">
                                                <div className="h-full bg-white w-[55%]"></div>
                                                <div className="h-full bg-gray-800 w-[45%]"></div>
                                            </div>
                                            <div className="flex items-center gap-2 mt-2">
                                                <div className="h-8 w-8 rounded-full bg-gray-100 overflow-hidden relative border border-gray-200 flex items-center justify-center text-xs font-bold">
                                                    {featuredPlayers[1]?.username?.slice(0, 1) || 'W'}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-bold text-gray-900 dark:text-white leading-none">{featuredPlayers[1]?.username || 'Player B'}</p>
                                                    <p className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-0.5">{featuredPlayers[1]?.score || '--'}</p>
                                                </div>
                                            </div>
                                            <div className="bg-gray-200 text-gray-900 px-2 py-1 rounded font-mono text-sm font-bold mt-2 tabular-nums border border-gray-300">
                                                04:20
                                            </div>
                                        </div>
                                    </div>

                                    <section>
                                        <div className="flex items-center justify-between mb-3">
                                            <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Other Matches</h3>
                                            <button className="text-primary text-xs font-semibold" type="button">
                                                View All
                                            </button>
                                        </div>
                                        <div className="space-y-3">
                                            {standings.slice(2, 6).map((row, index) => (
                                                <div key={row.user_id || index} className="flex items-center justify-between bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700 rounded-xl p-3">
                                                    <div>
                                                        <p className="text-sm font-semibold text-gray-900 dark:text-white">{row.username}</p>
                                                        <p className="text-xs text-slate-500">Score {row.score}</p>
                                                    </div>
                                                    <span className="text-xs text-slate-400">vs.</span>
                                                    <div>
                                                        <p className="text-sm font-semibold text-gray-900 dark:text-white">Opponent</p>
                                                        <p className="text-xs text-slate-500">Round {tournament.current_round || '--'}</p>
                                                    </div>
                                                </div>
                                            ))}
                                            {!standings.length ? (
                                                <p className="text-sm text-slate-500">Other matches will appear once games start.</p>
                                            ) : null}
                                        </div>
                                    </section>
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
