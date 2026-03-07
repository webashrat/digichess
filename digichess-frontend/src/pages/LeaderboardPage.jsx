import React, { useEffect, useMemo, useState } from 'react';
import AdBanner from '../components/common/AdBanner';
import Layout from '../components/layout/Layout';
import Podium from '../components/leaderboard/Podium';
import PlayerList from '../components/leaderboard/PlayerList';
import { fetchDigiQuizLeaderboard, fetchLeaderboard } from '../api';

const PAGE_SIZE = 50;
const formatOptions = [
    {
        id: 'classical',
        chipLabel: 'Standard',
        title: 'Classical',
        description: 'Longer games and deep calculation.',
        icon: 'hourglass_empty',
        iconClass: 'text-sky-300',
        iconBg: 'bg-sky-500/15',
        activeChipClass: 'border-sky-400/30 bg-gradient-to-r from-sky-500/12 via-blue-500/10 to-transparent text-slate-900 dark:text-white ring-1 ring-sky-400/15',
        accentTextClass: 'text-sky-300',
        heroBorderClass: 'border-sky-400/20',
        heroGradientClass: 'from-sky-500/14 via-blue-500/10 to-transparent',
    },
    {
        id: 'blitz',
        chipLabel: 'Blitz',
        title: 'Blitz',
        description: 'Fast tactical battles and sharp attacks.',
        icon: 'flash_on',
        iconClass: 'text-yellow-300',
        iconBg: 'bg-yellow-500/15',
        activeChipClass: 'border-yellow-400/30 bg-gradient-to-r from-yellow-500/12 via-amber-500/10 to-transparent text-slate-900 dark:text-white ring-1 ring-yellow-400/15',
        accentTextClass: 'text-yellow-300',
        heroBorderClass: 'border-yellow-400/20',
        heroGradientClass: 'from-yellow-500/14 via-amber-500/10 to-transparent',
    },
    {
        id: 'bullet',
        chipLabel: 'Bullet',
        title: 'Bullet',
        description: 'Ultra-fast games where speed matters most.',
        icon: 'local_fire_department',
        iconClass: 'text-orange-300',
        iconBg: 'bg-orange-500/15',
        activeChipClass: 'border-orange-400/30 bg-gradient-to-r from-orange-500/12 via-amber-500/10 to-transparent text-slate-900 dark:text-white ring-1 ring-orange-400/15',
        accentTextClass: 'text-orange-300',
        heroBorderClass: 'border-orange-400/20',
        heroGradientClass: 'from-orange-500/14 via-amber-500/10 to-transparent',
    },
    {
        id: 'rapid',
        chipLabel: 'Rapid',
        title: 'Rapid',
        description: 'Balanced time controls for practical play.',
        icon: 'timer',
        iconClass: 'text-emerald-300',
        iconBg: 'bg-emerald-500/15',
        activeChipClass: 'border-emerald-400/30 bg-gradient-to-r from-emerald-500/12 via-green-500/10 to-transparent text-slate-900 dark:text-white ring-1 ring-emerald-400/15',
        accentTextClass: 'text-emerald-300',
        heroBorderClass: 'border-emerald-400/20',
        heroGradientClass: 'from-emerald-500/14 via-green-500/10 to-transparent',
    },
    {
        id: 'digiquiz',
        chipLabel: 'DigiQuiz',
        title: 'DigiQuiz',
        description: 'Quiz rankings based on puzzle and trivia performance.',
        icon: 'quiz',
        iconClass: 'text-primary',
        iconBg: 'bg-primary/15',
        activeChipClass: 'border-primary/30 bg-gradient-to-r from-primary/12 via-blue-500/10 to-transparent text-slate-900 dark:text-white ring-1 ring-primary/15',
        accentTextClass: 'text-primary',
        heroBorderClass: 'border-primary/20',
        heroGradientClass: 'from-primary/14 via-blue-500/10 to-transparent',
    },
];

export default function LeaderboardPage() {
    const [mode, setMode] = useState('blitz');
    const [players, setPlayers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [showSearch, setShowSearch] = useState(false);
    const [reloadTick, setReloadTick] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPlayers, setTotalPlayers] = useState(0);

    useEffect(() => {
        let active = true;
        const loadData = async () => {
            setLoading(true);
            setError(null);
            try {
                const data = mode === 'digiquiz'
                    ? await fetchDigiQuizLeaderboard(currentPage, PAGE_SIZE)
                    : await fetchLeaderboard(mode, currentPage, PAGE_SIZE);
                const rows = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];
                const mappedPlayers = rows.map((player, index) => ({
                    id: player.id,
                    username: player.username,
                    rating: mode === 'digiquiz' ? player.rating_digiquiz : player.rating,
                    rating_blitz: player.rating_blitz,
                    avatar: player.profile_pic || '',
                    countryCode: player.country || 'INT',
                    flag: player.country || 'INT',
                    is_bot: player.is_bot,
                    rank: (currentPage - 1) * PAGE_SIZE + index + 1,
                }));
                if (active) {
                    setPlayers(mappedPlayers);
                    setTotalPlayers(data?.total ?? mappedPlayers.length);
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
    }, [mode, reloadTick, currentPage]);

    const filteredPlayers = useMemo(() => {
        if (!searchTerm.trim()) return players;
        const term = searchTerm.trim().toLowerCase();
        return players.filter((player) => player.username?.toLowerCase().includes(term));
    }, [players, searchTerm]);

    const totalPages = Math.max(1, Math.ceil(totalPlayers / PAGE_SIZE));
    const showPodium = currentPage === 1 && !searchTerm.trim();
    const podiumPlayers = showPodium ? filteredPlayers.slice(0, 3) : [];
    const listPlayers = showPodium ? filteredPlayers.slice(3) : filteredPlayers;
    const activeFormat = formatOptions.find((option) => option.id === mode) || formatOptions[1];
    const pageStart = totalPlayers ? ((currentPage - 1) * PAGE_SIZE) + 1 : 0;
    const pageEnd = totalPlayers ? Math.min(totalPlayers, currentPage * PAGE_SIZE) : 0;
    const hasSearch = Boolean(searchTerm.trim());
    const resultSummary = hasSearch
        ? `${filteredPlayers.length} matches on this page`
        : `${pageStart}-${pageEnd} of ${totalPlayers}`;
    const paginationItems = useMemo(() => {
        if (totalPages <= 5) {
            return Array.from({ length: totalPages }, (_, index) => index + 1);
        }
        if (currentPage <= 3) {
            return [1, 2, 3, 'ellipsis-end', totalPages];
        }
        if (currentPage >= totalPages - 2) {
            return [1, 'ellipsis-start', totalPages - 2, totalPages - 1, totalPages];
        }
        return [1, 'ellipsis-start', currentPage - 1, currentPage, currentPage + 1, 'ellipsis-end', totalPages];
    }, [currentPage, totalPages]);

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
                            {formatOptions.map((option) => {
                                const isActive = option.id === mode;
                                return (
                                <button
                                    key={option.id}
                                    className={`shrink-0 flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-semibold transition-all ${
                                        isActive
                                            ? option.activeChipClass
                                            : 'border-slate-200 dark:border-slate-700 bg-surface-light dark:bg-surface-dark text-slate-600 dark:text-slate-300 hover:border-primary/20 hover:text-slate-900 dark:hover:text-slate-100'
                                    }`}
                                    type="button"
                                    onClick={() => {
                                        setCurrentPage(1);
                                        setMode(option.id);
                                    }}
                                >
                                    <span className={`inline-flex size-8 items-center justify-center rounded-xl ${option.iconBg}`}>
                                        <span className={`material-symbols-outlined text-[18px] ${option.iconClass}`}>{option.icon}</span>
                                    </span>
                                    <span>{option.chipLabel}</span>
                                </button>
                                );
                            })}
                        </div>
                    </div>
                </header>

                <main className="flex-1 px-4 py-4 pb-24 overflow-y-auto no-scrollbar">
                    <div className="w-full space-y-6">
                        <div className={`relative overflow-hidden rounded-3xl border bg-gradient-to-br ${activeFormat.heroGradientClass} ${activeFormat.heroBorderClass} from-surface-light to-surface-light dark:from-surface-dark dark:to-surface-dark p-4 sm:p-5 shadow-sm`}>
                            <div className="absolute inset-y-0 right-0 w-40 bg-gradient-to-l from-white/10 dark:from-white/5 to-transparent pointer-events-none" />
                            <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                                <div className="flex items-start gap-3 min-w-0">
                                    <span className={`inline-flex size-12 shrink-0 items-center justify-center rounded-2xl ${activeFormat.iconBg}`}>
                                        <span className={`material-symbols-outlined text-[24px] ${activeFormat.iconClass}`}>{activeFormat.icon}</span>
                                    </span>
                                    <div className="min-w-0">
                                        <p className={`text-[10px] font-bold uppercase tracking-[0.18em] ${activeFormat.accentTextClass}`}>
                                            {activeFormat.chipLabel} Leaderboard
                                        </p>
                                        <h2 className="mt-1 text-xl sm:text-2xl font-bold">
                                            {activeFormat.title} Rankings
                                        </h2>
                                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                            {activeFormat.description}
                                        </p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
                                    <div className="rounded-2xl border border-slate-200/70 dark:border-slate-700/70 bg-white/60 dark:bg-slate-900/50 px-3 py-2">
                                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">Players</p>
                                        <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{totalPlayers}</p>
                                    </div>
                                    <div className="rounded-2xl border border-slate-200/70 dark:border-slate-700/70 bg-white/60 dark:bg-slate-900/50 px-3 py-2">
                                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">Page</p>
                                        <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{currentPage} / {totalPages}</p>
                                    </div>
                                    <div className="col-span-2 rounded-2xl border border-slate-200/70 dark:border-slate-700/70 bg-white/60 dark:bg-slate-900/50 px-3 py-2 sm:min-w-[210px]">
                                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">Showing</p>
                                        <p className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-200">{resultSummary}</p>
                                    </div>
                                </div>
                            </div>
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
                        ) : filteredPlayers.length ? (
                            <>
                                {showPodium && podiumPlayers.length ? <Podium players={podiumPlayers} /> : null}
                                <PlayerList
                                    players={listPlayers}
                                    startRank={showPodium ? 4 : ((currentPage - 1) * PAGE_SIZE) + 1}
                                    ratingLabel={activeFormat.title}
                                />
                                {totalPages > 1 ? (
                                    <div className="mt-5 flex flex-col items-center gap-2">
                                        <p className="text-xs text-slate-500 dark:text-slate-400">
                                            Page <span className="font-semibold text-slate-700 dark:text-slate-200">{currentPage}</span> of <span className="font-semibold text-slate-700 dark:text-slate-200">{totalPages}</span>
                                        </p>
                                        <div className="inline-flex max-w-full items-center gap-1.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-surface-light dark:bg-surface-dark p-2 shadow-sm">
                                            <button
                                                type="button"
                                                className="inline-flex h-10 items-center justify-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm font-semibold text-slate-600 dark:text-slate-300 transition-colors hover:border-primary/25 hover:text-primary disabled:opacity-40"
                                                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                                                disabled={currentPage <= 1}
                                                aria-label="Previous page"
                                            >
                                                <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                                                <span className="hidden sm:inline">Prev</span>
                                            </button>
                                            <div className="flex items-center gap-1">
                                                {paginationItems.map((item) => {
                                                    if (typeof item !== 'number') {
                                                        return (
                                                            <span
                                                                key={item}
                                                                className="inline-flex h-10 min-w-7 items-center justify-center px-1 text-sm font-semibold text-slate-400 dark:text-slate-500"
                                                            >
                                                                ...
                                                            </span>
                                                        );
                                                    }
                                                    const isActive = item === currentPage;
                                                    return (
                                                        <button
                                                            key={item}
                                                            type="button"
                                                            className={`inline-flex h-10 min-w-10 items-center justify-center rounded-xl px-3 text-sm font-semibold transition-all ${
                                                                isActive
                                                                    ? 'bg-primary text-white shadow-lg shadow-primary/20'
                                                                    : 'border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:border-primary/25 hover:text-primary'
                                                            }`}
                                                            onClick={() => setCurrentPage(item)}
                                                            aria-label={`Go to page ${item}`}
                                                            aria-current={isActive ? 'page' : undefined}
                                                        >
                                                            {item}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                            <button
                                                type="button"
                                                className="inline-flex h-10 items-center justify-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm font-semibold text-slate-600 dark:text-slate-300 transition-colors hover:border-primary/25 hover:text-primary disabled:opacity-40"
                                                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                                                disabled={currentPage >= totalPages}
                                                aria-label="Next page"
                                            >
                                                <span className="hidden sm:inline">Next</span>
                                                <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                                            </button>
                                        </div>
                                    </div>
                                ) : null}
                                <div className="mt-4">
                                    <AdBanner format="auto" className="rounded-xl overflow-hidden" />
                                </div>
                            </>
                        ) : (
                            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-surface-light dark:bg-surface-dark px-4 py-6 text-sm text-slate-500 text-center">
                                No players found on this page.
                            </div>
                        )}
                    </div>
                </main>
            </div>
        </Layout>
    );
}
