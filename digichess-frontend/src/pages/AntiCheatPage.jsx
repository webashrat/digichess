import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import ProfileMenu from '../components/layout/ProfileMenu';
import { useAuth } from '../context/AuthContext';
import useSettings from '../hooks/useSettings';
import useNotifications from '../hooks/useNotifications';
import {
    fetchCheatReports,
    fetchIrwinStatus,
    trainIrwinModel,
} from '../api';

const STATUS_LABELS = {
    pending: 'Pending',
    under_review: 'Under Review',
    resolved_clean: 'Clean',
    resolved_cheating: 'Cheating',
    dismissed: 'Dismissed',
};

const REASON_LABELS = {
    engine_use: 'Engine Assistance',
    suspicious_play: 'Suspicious Play',
    other: 'Other',
};

const REPORTS_PER_PAGE = 5;

const MOCK_REPORTS = [
    { id: 'demo-6', reported_user: { username: 'PawnStorm', profile_pic: null, rating_blitz: 980 }, reporter: { username: 'QueenSlayer' }, reason: 'engine_use', status: 'resolved_cheating', game: 156, created_at: new Date(Date.now() - 48 * 3600000).toISOString(), _mock: true, _likelihood: 97 },
    { id: 'demo-1', reported_user: { username: 'GrandmasterX', profile_pic: null, rating_blitz: 2450 }, reporter: { username: 'PlayerOne' }, reason: 'engine_use', status: 'pending', game: 101, created_at: new Date(Date.now() - 2 * 3600000).toISOString(), _mock: true, _likelihood: 92 },
    { id: 'demo-4', reported_user: { username: 'DarkBishop', profile_pic: null, rating_blitz: 2100 }, reporter: { username: 'ChessBot99' }, reason: 'engine_use', status: 'pending', game: 312, created_at: new Date(Date.now() - 3 * 3600000).toISOString(), _mock: true, _likelihood: 88 },
    { id: 'demo-11', reported_user: { username: 'CastleMaster', profile_pic: null, rating_blitz: 2050 }, reporter: { username: 'TacticsNinja' }, reason: 'suspicious_play', status: 'pending', game: 621, created_at: new Date(Date.now() - 1 * 3600000).toISOString(), _mock: true, _likelihood: 79 },
    { id: 'demo-5', reported_user: { username: 'QueenSlayer', profile_pic: null, rating_blitz: 1650 }, reporter: { username: 'DarkBishop' }, reason: 'suspicious_play', status: 'pending', game: 415, created_at: new Date(Date.now() - 7 * 3600000).toISOString(), _mock: true, _likelihood: 71 },
    { id: 'demo-2', reported_user: { username: 'ChessBot99', profile_pic: null, rating_blitz: 1820 }, reporter: { username: 'KnightRider' }, reason: 'suspicious_play', status: 'under_review', game: 204, created_at: new Date(Date.now() - 5 * 3600000).toISOString(), _mock: true, _likelihood: 65 },
    { id: 'demo-12', reported_user: { username: 'RapidFire', profile_pic: null, rating_blitz: 1380 }, reporter: { username: 'CastleMaster' }, reason: 'engine_use', status: 'under_review', game: 702, created_at: new Date(Date.now() - 12 * 3600000).toISOString(), _mock: true, _likelihood: 61 },
    { id: 'demo-7', reported_user: { username: 'SilentRook', profile_pic: null, rating_blitz: 1940 }, reporter: { username: 'PawnStorm' }, reason: 'suspicious_play', status: 'under_review', game: 278, created_at: new Date(Date.now() - 10 * 3600000).toISOString(), _mock: true, _likelihood: 54 },
    { id: 'demo-9', reported_user: { username: 'EndgamePro', profile_pic: null, rating_blitz: 1500 }, reporter: { username: 'BlitzKing' }, reason: 'suspicious_play', status: 'pending', game: 440, created_at: new Date(Date.now() - 6 * 3600000).toISOString(), _mock: true, _likelihood: 43 },
    { id: 'demo-8', reported_user: { username: 'BlitzKing', profile_pic: null, rating_blitz: 2280 }, reporter: { username: 'SilentRook' }, reason: 'engine_use', status: 'dismissed', game: 333, created_at: new Date(Date.now() - 72 * 3600000).toISOString(), _mock: true, _likelihood: 18 },
    { id: 'demo-3', reported_user: { username: 'KnightRider', profile_pic: null, rating_blitz: 1200 }, reporter: { username: 'GrandmasterX' }, reason: 'suspicious_play', status: 'resolved_clean', game: 88, created_at: new Date(Date.now() - 24 * 3600000).toISOString(), _mock: true, _likelihood: 12 },
    { id: 'demo-10', reported_user: { username: 'TacticsNinja', profile_pic: null, rating_blitz: 1750 }, reporter: { username: 'EndgamePro' }, reason: 'engine_use', status: 'resolved_clean', game: 519, created_at: new Date(Date.now() - 96 * 3600000).toISOString(), _mock: true, _likelihood: 8 },
];

function _initials(u) { return u ? u.slice(0, 2).toUpperCase() : '??'; }
function _avatarBg(u) {
    const c = ['bg-blue-600','bg-indigo-600','bg-purple-600','bg-pink-600','bg-teal-600','bg-emerald-600','bg-orange-600','bg-cyan-600'];
    let h = 0; for (let i = 0; i < (u||'').length; i++) h = u.charCodeAt(i) + ((h << 5) - h);
    return c[Math.abs(h) % c.length];
}
function _likelihoodColor(p) {
    if (p >= 75) return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    if (p >= 40) return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
    return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
}
function _statusColor(s) {
    const m = { pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', under_review: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', resolved_clean: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', resolved_cheating: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', dismissed: 'bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-400' };
    return m[s] || '';
}

function UserAvatar({ user, size = 'w-10 h-10', textSize = 'text-sm' }) {
    if (user?.profile_pic) return <img src={user.profile_pic} alt={user.username} className={`${size} rounded-full object-cover`} />;
    return <div className={`${size} rounded-full flex items-center justify-center text-white font-bold ${textSize} ${_avatarBg(user?.username)}`}>{_initials(user?.username)}</div>;
}

function _reasonColor(reason) {
    if (reason === 'engine_use') return 'bg-red-500/10 text-red-500 dark:bg-red-500/20 dark:text-red-400';
    if (reason === 'suspicious_play') return 'bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400';
    return 'bg-gray-500/10 text-gray-500';
}
function _leftBorderColor(likelihood) {
    if (likelihood == null) return 'border-l-gray-400';
    if (likelihood >= 75) return 'border-l-red-500';
    if (likelihood >= 40) return 'border-l-amber-500';
    return 'border-l-green-500';
}

function ReportCard({ report, onSelect }) {
    const u = report.reported_user;
    const rating = u?.rating_blitz || u?.rating_rapid || u?.rating_bullet || 0;
    const likelihood = report._likelihood ?? null;

    return (
        <button
            className={`w-full text-left bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3.5 border border-gray-100 dark:border-gray-700/50 border-l-[3px] ${_leftBorderColor(likelihood)} flex items-center justify-between gap-3 transition-all hover:bg-gray-100 dark:hover:bg-gray-700/50 active:scale-[0.99] cursor-pointer`}
            onClick={onSelect}
        >
            <div className="flex items-center gap-3 min-w-0">
                <UserAvatar user={u} />
                <div className="min-w-0">
                    <div className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">
                        {u?.username || 'Unknown'}
                    </div>
                    <div className="text-xs flex items-center gap-1.5 mt-0.5">
                        <span className="material-symbols-outlined text-[13px] text-amber-500">emoji_events</span>
                        <span className="text-gray-400">{rating || '—'}</span>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${_reasonColor(report.reason)}`}>
                            {REASON_LABELS[report.reason] || report.reason}
                        </span>
                    </div>
                </div>
            </div>
            <div className="text-right shrink-0">
                {likelihood != null ? (
                    <>
                        <div className="text-[10px] text-gray-500 dark:text-gray-400 mb-1">Likelihood</div>
                        <div className={`inline-flex items-center px-2.5 py-0.5 rounded text-sm font-bold ${_likelihoodColor(likelihood)}`}>{likelihood}%</div>
                    </>
                ) : (
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${_statusColor(report.status)}`}>{STATUS_LABELS[report.status]}</span>
                )}
            </div>
        </button>
    );
}

function StatCard({ icon, label, value, color = 'text-gray-900 dark:text-gray-100' }) {
    return (
        <div className="bg-white dark:bg-surface-dark rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-800 text-center">
            <span className={`material-symbols-outlined text-[24px] ${color} mb-1 block`}>{icon}</span>
            <div className={`text-2xl font-bold ${color}`}>{value}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{label}</div>
        </div>
    );
}

export default function AntiCheatPage() {
    const { user, loading: authLoading } = useAuth();
    const navigate = useNavigate();
    const settings = useSettings();
    const { unreadCount, markAllRead } = useNotifications({ pageSize: 5 });
    const [reports, setReports] = useState([]);
    const [statusFilter, setStatusFilter] = useState('');
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [error, setError] = useState(null);
    const [irwinStatus, setIrwinStatus] = useState(null);
    const [trainLoading, setTrainLoading] = useState(false);
    const [trainResult, setTrainResult] = useState(null);
    const [showNotif, setShowNotif] = useState(false);

    const isSuperAdmin = user?.is_superuser === true;
    useEffect(() => { if (!authLoading && !isSuperAdmin) navigate('/'); }, [authLoading, isSuperAdmin, navigate]);

    const loadReports = useCallback(async () => {
        setLoading(true); setError(null);
        try { const d = await fetchCheatReports(statusFilter); setReports(Array.isArray(d) ? d : []); }
        catch (e) { setError(e.message || 'Failed to load'); }
        finally { setLoading(false); }
    }, [statusFilter]);

    const loadIrwin = useCallback(async () => {
        try { setIrwinStatus(await fetchIrwinStatus()); } catch {}
    }, []);

    useEffect(() => { loadReports(); }, [loadReports]);
    useEffect(() => { loadIrwin(); }, [loadIrwin]);

    const handleTrain = async () => {
        setTrainLoading(true); setTrainResult(null);
        try { const r = await trainIrwinModel(); setTrainResult(r); loadIrwin(); }
        catch (e) { setTrainResult({ detail: e?.data?.detail || e.message || 'Failed' }); }
        finally { setTrainLoading(false); }
    };

    useEffect(() => {
        if (!trainResult) return;
        const t = setTimeout(() => setTrainResult(null), 3000);
        return () => clearTimeout(t);
    }, [trainResult]);

    if (authLoading) return null;
    if (!isSuperAdmin) return null;

    const filteredMock = statusFilter ? MOCK_REPORTS.filter(r => r.status === statusFilter) : MOCK_REPORTS;
    const displayReports = reports.length > 0 ? reports : filteredMock;
    const irwin = irwinStatus || { labeled_count: 0, training_threshold: 100, cheating_count: 0, clean_count: 0, is_trained: false, ready_to_train: false };
    const irwinPct = Math.min(100, (irwin.labeled_count / irwin.training_threshold) * 100);
    const irwinRemaining = Math.max(0, irwin.training_threshold - irwin.labeled_count);

    const pendingCount = reports.filter(r => r.status === 'pending' || r.status === 'under_review').length;
    const resolvedCount = reports.filter(r => r.status?.startsWith('resolved')).length;

    return (
        <Layout showHeader={false} showBottomNav>
            <div className="flex-1 overflow-y-auto pb-24 no-scrollbar">
                {/* Custom Header */}
                <header className="sticky top-0 z-30 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md border-b border-gray-200/50 dark:border-gray-800/50 shadow-sm">
                    <div className="mx-auto max-w-[1400px] flex items-center justify-between px-4 py-2.5 sm:py-3">
                        <div className="flex items-center gap-2.5">
                            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary shadow-md shadow-primary/30">
                                <span className="material-symbols-outlined text-white text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>shield</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-sm sm:text-base font-extrabold tracking-tight text-gray-900 dark:text-gray-100 leading-tight">Anti-Cheat</span>
                                <span className="text-[9px] uppercase tracking-[0.15em] text-gray-400 dark:text-gray-500 font-semibold leading-tight">Admin Dashboard</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                className="relative flex items-center justify-center size-9 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                                type="button"
                                onClick={() => { setShowNotif(p => !p); markAllRead(); }}
                            >
                                <span className="material-symbols-outlined text-[20px] text-gray-600 dark:text-gray-300">notifications</span>
                                {unreadCount > 0 ? <span className="absolute top-1 right-1 size-2.5 bg-red-500 rounded-full border-2 border-background-light dark:border-background-dark" /> : null}
                            </button>
                            <ProfileMenu settings={settings} />
                        </div>
                    </div>
                </header>

                <div className="mx-auto max-w-[1400px] px-4 py-6 space-y-6">
                    {error ? <div className="p-3 rounded-xl bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm font-medium">{error}</div> : null}

                    {/* Overview Stats - Desktop: row, Mobile: 2x2 grid */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <StatCard icon="flag" label="Total Reports" value={reports.length} />
                        <StatCard icon="pending_actions" label="Pending" value={pendingCount} color="text-amber-500" />
                        <StatCard icon="check_circle" label="Resolved" value={resolvedCount} color="text-green-500" />
                        <StatCard icon="psychology" label="Irwin Labels" value={`${irwin.labeled_count}/${irwin.training_threshold}`} color="text-primary" />
                    </div>

                    {/* Main Content: Desktop = 50:50, Mobile = stacked */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                        {/* Reports Column */}
                        <div className="bg-white dark:bg-surface-dark rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm flex flex-col">
                            <div className="p-5 flex-1 flex flex-col">
                                <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-4">Reports</h2>

                                <div className="flex flex-wrap gap-1.5 mb-4">
                                    {['', 'pending', 'under_review', 'resolved_clean', 'resolved_cheating', 'dismissed'].map(s => (
                                        <button
                                            key={s}
                                            className={`px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${statusFilter === s ? 'bg-primary text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                                            onClick={() => { setStatusFilter(s); setPage(1); }}
                                        >
                                            {s ? STATUS_LABELS[s] : 'All'}
                                        </button>
                                    ))}
                                </div>

                                {(() => {
                                    if (loading) return <div className="text-center py-12 text-gray-400 text-sm">Loading reports...</div>;
                                    if (displayReports.length === 0) return <div className="text-center py-12 text-gray-400 text-sm">No reports found.</div>;

                                    const totalPages = Math.ceil(displayReports.length / REPORTS_PER_PAGE);
                                    const safePage = Math.min(page, totalPages);
                                    const start = (safePage - 1) * REPORTS_PER_PAGE;
                                    const pageReports = displayReports.slice(start, start + REPORTS_PER_PAGE);

                                    return (
                                        <>
                                            <div className="space-y-2">
                                                {pageReports.map(r => (
                                                    <ReportCard
                                                        key={r.id}
                                                        report={r}
                                                        onSelect={() => navigate(`/anticheat/${r._mock ? 'demo' : r.id}`)}
                                                    />
                                                ))}
                                            </div>
                                            {totalPages > 1 ? (
                                                <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-gray-700/50 mt-4">
                                                    <button
                                                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                                        onClick={() => setPage(p => Math.max(1, p - 1))}
                                                        disabled={safePage <= 1}
                                                    >
                                                        <span className="material-symbols-outlined text-[16px]">chevron_left</span>
                                                        Prev
                                                    </button>
                                                    <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                                                        Page {safePage} of {totalPages}
                                                    </span>
                                                    <button
                                                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                                        disabled={safePage >= totalPages}
                                                    >
                                                        Next
                                                        <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                                                    </button>
                                                </div>
                                            ) : null}
                                        </>
                                    );
                                })()}
                            </div>
                        </div>

                        {/* Sidebar: Irwin Panel */}
                        <div className="space-y-4 flex flex-col">
                            {/* Irwin Neural Network */}
                            <div className="bg-white dark:bg-surface-dark rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm">
                                <div className="p-5">
                                    <div className="flex items-center gap-3 mb-5">
                                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                            <span className="material-symbols-outlined text-primary text-[22px]">psychology</span>
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-base text-gray-900 dark:text-gray-100">Irwin Neural Network</h3>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">AI cheat detection model</p>
                                        </div>
                                    </div>

                                    <div className="space-y-2 mb-5">
                                        <div className="flex justify-between items-end">
                                            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Training Data</span>
                                            <span className="text-sm font-bold">{irwin.labeled_count} / {irwin.training_threshold}</span>
                                        </div>
                                        <div className="h-2.5 w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                            <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${irwinPct}%` }} />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-3 gap-2 mb-5">
                                        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 text-center border border-gray-100 dark:border-gray-700/50">
                                            <div className="text-[10px] text-gray-500 dark:text-gray-400 mb-0.5">Cheating</div>
                                            <div className="font-bold text-lg text-red-600 dark:text-red-400">{irwin.cheating_count}</div>
                                        </div>
                                        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 text-center border border-gray-100 dark:border-gray-700/50">
                                            <div className="text-[10px] text-gray-500 dark:text-gray-400 mb-0.5">Clean</div>
                                            <div className="font-bold text-lg text-green-600 dark:text-green-400">{irwin.clean_count}</div>
                                        </div>
                                        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 text-center border border-gray-100 dark:border-gray-700/50">
                                            <div className="text-[10px] text-gray-500 dark:text-gray-400 mb-0.5">Status</div>
                                            <div className={`font-bold text-sm mt-0.5 ${irwin.is_trained ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-300'}`}>
                                                {irwin.is_trained ? 'Trained' : 'Collecting'}
                                            </div>
                                        </div>
                                    </div>

                                    <button
                                        className="w-full py-3 px-4 bg-primary hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors shadow-sm flex items-center justify-center gap-2 disabled:opacity-60"
                                        onClick={handleTrain}
                                        disabled={trainLoading}
                                    >
                                        {trainLoading ? 'Training...' : (
                                            <><span className="material-symbols-outlined text-[18px]">model_training</span>Train Irwin Model</>
                                        )}
                                    </button>
                                    {trainResult ? (
                                        <div className="mt-3 text-xs text-gray-500 text-center">
                                            {trainResult.detail || `Done: ${Math.round((trainResult.metrics?.train_accuracy||0)*100)}% accuracy`}
                                        </div>
                                    ) : null}
                                </div>
                            </div>

                            {/* Quick Info */}
                            <div className="bg-white dark:bg-surface-dark rounded-2xl border border-gray-100 dark:border-gray-800 p-6 shadow-sm flex-1 flex flex-col justify-center">
                                <h4 className="font-bold text-base text-gray-900 dark:text-gray-100 flex items-center gap-2.5 mb-5">
                                    <span className="material-symbols-outlined text-[22px] text-primary">info</span>
                                    How It Works
                                </h4>
                                <div className="space-y-5 text-sm text-gray-600 dark:text-gray-300">
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                                            <span className="material-symbols-outlined text-[20px] text-amber-500">flag</span>
                                        </div>
                                        <span>Users report opponents after finished games</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                                            <span className="material-symbols-outlined text-[20px] text-blue-500">analytics</span>
                                        </div>
                                        <span>Run Stockfish T% + Irwin analysis on reported games</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
                                            <span className="material-symbols-outlined text-[20px] text-green-500">gavel</span>
                                        </div>
                                        <span>Review results and resolve as Clean, Cheating, or Dismiss</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0">
                                            <span className="material-symbols-outlined text-[20px] text-purple-500">psychology</span>
                                        </div>
                                        <span>Resolutions feed Irwin NN training data automatically</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Layout>
    );
}
