import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import { cancelMatchmaking, createBotGame, createGame, enqueueMatchmaking, fetchPublicAccount, listBots } from '../api';
import { useAuth } from '../context/AuthContext';
import useNotifications from '../hooks/useNotifications';

const queueOptions = [
    { id: 'bullet', label: 'Bullet', time: '1+0' },
    { id: 'blitz', label: 'Blitz', time: '3+0' },
    { id: 'rapid', label: 'Rapid', time: '10+0' },
    { id: 'classical', label: 'Classical', time: '30+0' },
];

export default function PlayPage() {
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const { isAuthenticated, user } = useAuth();
    const [playError, setPlayError] = useState(null);
    const [queueingControl, setQueueingControl] = useState(null);
    const [queueLoading, setQueueLoading] = useState(false);
    const [bots, setBots] = useState([]);
    const [botLoading, setBotLoading] = useState(false);
    const [botError, setBotError] = useState(null);
    const [botMode, setBotMode] = useState('blitz');
    const [activeGameId, setActiveGameId] = useState(null);
    const opponentId = params.get('opponent');
    const opponentName = params.get('username') || 'Opponent';

    useEffect(() => {
        const loadBots = async () => {
            setBotLoading(true);
            setBotError(null);
            try {
                const data = await listBots(botMode);
                setBots(data.bots || []);
            } catch (err) {
                setBotError('Failed to load bots.');
            } finally {
                setBotLoading(false);
            }
        };
        loadBots();
    }, [botMode]);

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

    const requireAuth = () => {
        if (!isAuthenticated) {
            navigate('/login');
            return false;
        }
        return true;
    };

    useNotifications({
        onMatchFound: (gameId) => {
            if (!queueingControl) return;
            setQueueingControl(null);
            setQueueLoading(false);
            if (gameId) navigate(`/game/${gameId}`);
        },
    });

    const handleQueueGame = async (timeControl) => {
        if (!requireAuth()) return;
        if (queueingControl) return;
        setQueueLoading(true);
        try {
            const result = await enqueueMatchmaking(timeControl);
            if (result?.id) {
                navigate(`/game/${result.id}`);
                return;
            }
            setQueueingControl(timeControl);
        } catch (err) {
            setPlayError(err.message || 'Failed to join queue.');
        } finally {
            setQueueLoading(false);
        }
    };

    const handleChallengeGame = async (timeControl) => {
        if (!requireAuth()) return;
        if (!opponentId) return;
        setPlayError(null);
        try {
            const game = await createGame({
                opponent_id: Number(opponentId),
                time_control: timeControl,
                rated: true,
                preferred_color: 'auto',
            });
            if (game?.id) {
                navigate(`/game/${game.id}`);
            }
        } catch (err) {
            setPlayError(err.message || 'Failed to send challenge.');
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

    const handleCreateBotGame = async (botId) => {
        if (!requireAuth()) return;
        setBotError(null);
        try {
            const game = await createBotGame(botId, { time_control: botMode, preferred_color: 'auto' });
            navigate(`/game/${game.id}`);
        } catch (err) {
            setBotError(err.message || 'Failed to create bot game.');
        }
    };

    return (
        <Layout headerProps={{ title: "Play", segments: null, showBack: false, rightAction: "notifications" }}>
            <div className="flex-1 overflow-y-auto p-4 pb-24 space-y-6 no-scrollbar">
                {activeGameId ? (
                    <button
                        className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-between gap-3 w-full text-left hover:bg-red-500/15 transition-colors"
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
                {opponentId ? (
                    <section className="bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-gray-800 rounded-2xl p-4 shadow-sm">
                        <h2 className="text-lg font-bold mb-1">Challenge {opponentName}</h2>
                        <p className="text-xs text-slate-500 mb-3">Select a time control to send a challenge.</p>
                        <div className="grid grid-cols-2 gap-3">
                            {queueOptions.map((option) => (
                                <button
                                    key={option.id}
                                    onClick={() => handleChallengeGame(option.id)}
                                    className="group relative flex flex-col items-center justify-center p-4 rounded-xl bg-white dark:bg-gradient-to-br dark:from-[#1e232e] dark:to-[#13161c] border border-slate-200 dark:border-gray-800 hover:border-primary transition-all"
                                    type="button"
                                >
                                    <span className="material-symbols-outlined text-primary mb-2 text-3xl">swords</span>
                                    <span className="text-lg font-bold">{option.time}</span>
                                    <span className="text-xs text-slate-500 dark:text-slate-400">{option.label}</span>
                                </button>
                            ))}
                        </div>
                    </section>
                ) : null}

                <section className="bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-gray-800 rounded-2xl p-4 shadow-sm">
                    <h2 className="text-lg font-bold mb-3">Quick Play</h2>
                    <div className="grid grid-cols-2 gap-3">
                        {queueOptions.map((option) => (
                            <button
                                key={option.id}
                                onClick={() => handleQueueGame(option.id)}
                                disabled={queueLoading || Boolean(queueingControl)}
                                className="group relative flex flex-col items-center justify-center p-4 rounded-xl bg-white dark:bg-gradient-to-br dark:from-[#1e232e] dark:to-[#13161c] border border-slate-200 dark:border-gray-800 hover:border-primary transition-all"
                                type="button"
                            >
                                <span className="material-symbols-outlined text-primary mb-2 text-3xl">swords</span>
                                <span className="text-lg font-bold">{option.time}</span>
                                <span className="text-xs text-slate-500 dark:text-slate-400">{option.label}</span>
                            </button>
                        ))}
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
                    ) : null}
                    {playError ? <p className="text-sm text-red-500 mt-3">{playError}</p> : null}
                </section>

                <section className="bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-gray-800 rounded-2xl p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-lg font-bold">Play vs Bot</h2>
                        <select
                            value={botMode}
                            onChange={(event) => setBotMode(event.target.value)}
                            className="text-xs bg-white dark:bg-[#1b2230] border border-slate-200 dark:border-gray-700 rounded-lg px-2 py-1"
                        >
                            {queueOptions.map((option) => (
                                <option key={option.id} value={option.id}>{option.label}</option>
                            ))}
                        </select>
                    </div>
                    {botLoading ? (
                        <div className="text-sm text-slate-500">Loading bots...</div>
                    ) : (
                        <div className="grid gap-3">
                            {bots.map((bot) => (
                                <div key={bot.id} className="flex items-center justify-between bg-white dark:bg-[#1b2230] border border-slate-200 dark:border-gray-700 rounded-xl p-3">
                                    <div className="flex items-center gap-3">
                                        <div className="size-10 rounded-lg bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-lg">
                                            {bot.bot_avatar || '🤖'}
                                        </div>
                                        <div>
                                            <p className="font-semibold text-sm">{bot.first_name || bot.username}</p>
                                            <p className="text-xs text-slate-500">Rating {bot.rating}</p>
                                        </div>
                                    </div>
                                    <button
                                        className="bg-primary text-white text-xs font-semibold px-3 py-2 rounded-lg"
                                        type="button"
                                        onClick={() => handleCreateBotGame(bot.id)}
                                    >
                                        Play
                                    </button>
                                </div>
                            ))}
                            {!bots.length && !botLoading ? (
                                <div className="text-sm text-slate-500">No bots available.</div>
                            ) : null}
                        </div>
                    )}
                    {botError ? <p className="text-sm text-red-500 mt-2">{botError}</p> : null}
                </section>
            </div>
        </Layout>
    );
}
