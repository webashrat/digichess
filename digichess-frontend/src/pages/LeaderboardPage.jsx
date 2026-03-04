import React, { useEffect, useMemo, useState } from 'react';
import AdBanner from '../components/common/AdBanner';
import Layout from '../components/layout/Layout';
import Podium from '../components/leaderboard/Podium';
import PlayerList from '../components/leaderboard/PlayerList';
import { fetchDigiQuizLeaderboard, fetchLeaderboard } from '../api';

const filterChips = ['Standard', 'Blitz', 'Bullet', 'Rapid', 'DigiQuiz'];
const modeLabelMap = {
    classical: 'Standard',
    blitz: 'Blitz',
    bullet: 'Bullet',
    rapid: 'Rapid',
    digiquiz: 'DigiQuiz',
};

export default function LeaderboardPage() {
    const [mode, setMode] = useState('blitz');
    const [players, setPlayers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [showSearch, setShowSearch] = useState(false);
    const [reloadTick, setReloadTick] = useState(0);

    useEffect(() => {
        let active = true;
        const loadData = async () => {
            setLoading(true);
            setError(null);
            try {
                const data = mode === 'digiquiz'
                    ? await fetchDigiQuizLeaderboard(1, 80)
                    : await fetchLeaderboard(mode, 1, 80);
                const rows = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];
                const mappedPlayers = rows.map((player) => ({
                    id: player.id,
                    username: player.username,
                    rating: mode === 'digiquiz' ? player.rating_digiquiz : player.rating,
                    rating_blitz: player.rating_blitz,
                    avatar: player.profile_pic || '',
                    countryCode: player.country || 'INT',
                    flag: player.country || 'INT',
                    is_bot: player.is_bot,
                }));
                if (active) {
                    setPlayers(mappedPlayers);
                }
            } catch (err) {
                if (active) {
                    setError('Failed to load leaderboard. Please try again.');
                }
            } finally {
                if (active) {
                    setLoading(false);
                }
            }
        };

        loadData();
        return () => {
            active = false;
        };
    }, [mode, reloadTick]);

    const filteredPlayers = useMemo(() => {
        if (!searchTerm.trim()) return players;
        const term = searchTerm.trim().toLowerCase();
        return players.filter((player) => player.username?.toLowerCase().includes(term));
    }, [players, searchTerm]);

    const podiumPlayers = filteredPlayers.slice(0, 3);
    const listPlayers = filteredPlayers.slice(3);
    const activeChip = modeLabelMap[mode] || 'Blitz';

    return (
        <Layout showHeader={false}>
            <div className="flex flex-col h-full bg-background-light dark:bg-background-dark">
                <header className="sticky top-0 z-40 bg-gradient-to-b from-background-light/95 to-background-light/90 dark:from-background-dark/95 dark:to-background-dark/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-sm">
                    <div className="px-4 py-3 flex items-center justify-between gap-3">
                        <h1 className="text-xl font-bold tracking-tight">Leaderboard</h1>
                        <div className="flex items-center gap-2">
                            {showSearch ? (
                                <input
                                    className="w-44 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-200"
                                    placeholder="Search players"
                                    value={searchTerm}
                                    onChange={(event) => setSearchTerm(event.target.value)}
                                />
                            ) : null}
                            <button
                                className="flex items-center justify-center p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors text-slate-600 dark:text-slate-300"
                                type="button"
                                onClick={() => {
                                    setShowSearch((prev) => !prev);
                                    if (showSearch) {
                                        setSearchTerm('');
                                    }
                                }}
                                aria-label="Toggle search"
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: 24 }}>search</span>
                            </button>
                        </div>
                    </div>
                    <div className="px-4 pb-4">
                        <div className="flex overflow-x-auto gap-2 no-scrollbar pb-1">
                            {filterChips.map((chip) => (
                                <button
                                    key={chip}
                                    className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium ${
                                        chip === activeChip
                                            ? 'bg-primary text-white'
                                            : 'bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                                    }`}
                                    type="button"
                                    onClick={() => {
                                        if (chip === 'Standard') setMode('classical');
                                        if (chip === 'Blitz') setMode('blitz');
                                        if (chip === 'Bullet') setMode('bullet');
                                        if (chip === 'Rapid') setMode('rapid');
                                        if (chip === 'DigiQuiz') setMode('digiquiz');
                                    }}
                                >
                                    {chip}
                                </button>
                            ))}
                        </div>
                    </div>
                </header>

                <main className="flex-1 px-4 py-4 pb-24 overflow-y-auto no-scrollbar">
                    <div className="w-full space-y-6">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-bold">
                                {mode === 'digiquiz' ? 'DigiQuiz Rankings' : 'Player Rankings'}
                            </h2>
                            {!loading ? (
                                <span className="text-xs text-slate-500">{filteredPlayers.length} players</span>
                            ) : null}
                        </div>

                        {loading ? (
                            <div className="text-sm text-slate-500">Updating leaderboard...</div>
                        ) : null}

                        {error ? (
                            <div className="flex justify-center items-center h-full flex-col gap-2">
                                <span className="text-red-500">{error}</span>
                                <button
                                    type="button"
                                    onClick={() => setReloadTick((prev) => prev + 1)}
                                    className="text-sm text-primary underline"
                                >
                                    Retry
                                </button>
                            </div>
                        ) : (
                            <>
                                <Podium players={podiumPlayers} />
                                <PlayerList players={listPlayers} startRank={4} />
                                <div className="mt-4">
                                    <AdBanner format="auto" className="rounded-xl overflow-hidden" />
                                </div>
                            </>
                        )}
                    </div>
                </main>
            </div>
        </Layout>
    );
}
