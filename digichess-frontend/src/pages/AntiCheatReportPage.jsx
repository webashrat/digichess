import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import ProfileMenu from '../components/layout/ProfileMenu';
import { useAuth } from '../context/AuthContext';
import useSettings from '../hooks/useSettings';
import {
    fetchCheatReportDetail,
    runCheatAnalysis,
    resolveCheatReport,
} from '../api';

const STATUS_LABELS = { pending: 'Pending', under_review: 'Under Review', resolved_clean: 'Clean', resolved_cheating: 'Cheating', dismissed: 'Dismissed' };
const STATUS_COLORS = { pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', under_review: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', resolved_clean: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', resolved_cheating: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', dismissed: 'bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-400' };
const VERDICT_COLORS = { clean: 'bg-green-500', suspicious: 'bg-amber-500', likely_cheating: 'bg-red-500' };
const REASON_LABELS = { engine_use: 'Engine Assistance', suspicious_play: 'Suspicious Play', other: 'Other' };

function _initials(u) { return u ? u.slice(0, 2).toUpperCase() : '??'; }
function _avatarBg(u) {
    const c = ['bg-blue-600','bg-indigo-600','bg-purple-600','bg-pink-600','bg-teal-600','bg-emerald-600','bg-orange-600','bg-cyan-600'];
    let h = 0; for (let i = 0; i < (u||'').length; i++) h = u.charCodeAt(i) + ((h << 5) - h);
    return c[Math.abs(h) % c.length];
}

function UserAvatar({ user, size = 'w-12 h-12', textSize = 'text-base' }) {
    if (user?.profile_pic) return <img src={user.profile_pic} alt={user.username} className={`${size} rounded-full object-cover`} />;
    return <div className={`${size} rounded-full flex items-center justify-center text-white font-bold ${textSize} ${_avatarBg(user?.username)}`}>{_initials(user?.username)}</div>;
}

function VerdictBadge({ verdict, confidence }) {
    const label = verdict === 'likely_cheating' ? 'Likely Cheating' : verdict === 'suspicious' ? 'Suspicious' : 'Clean';
    return <span className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-white text-sm font-bold ${VERDICT_COLORS[verdict] || 'bg-gray-500'}`}>{label} ({Math.round((confidence || 0) * 100)}%)</span>;
}

function TPercentTable({ analysis }) {
    if (!analysis) return null;
    const cats = ['all', 'undecided', 'losing', 'winning', 'post_losing'];
    const catLabels = { all: 'All', undecided: 'Undecided', losing: 'Losing', winning: 'Winning', post_losing: 'Post-Losing' };
    const ps = analysis.position_stats || {};
    const g = (cat, f) => cat === 'all' ? analysis[f] ?? '-' : ps[cat]?.[f] ?? '-';
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-xs">
                <thead><tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="py-2 px-2 text-left font-semibold text-gray-500"></th>
                    {cats.map(c => <th key={c} className={`py-2 px-2 text-center font-semibold ${c === 'undecided' || c === 'losing' ? 'text-red-500' : 'text-gray-500 dark:text-gray-400'}`}>{catLabels[c]}</th>)}
                </tr></thead>
                <tbody>
                    {[1,2,3,4,5].map(n => <tr key={n} className="border-b border-gray-100 dark:border-gray-800"><td className="py-1.5 px-2 font-semibold">T{n}%</td>{cats.map(c => <td key={c} className={`py-1.5 px-2 text-center ${c==='undecided'||c==='losing'?'font-bold':''}`}>{g(c,`t${n}_pct`)}%</td>)}</tr>)}
                    <tr className="border-b border-gray-100 dark:border-gray-800"><td className="py-1.5 px-2 font-semibold">ACPL</td>{cats.map(c => <td key={c} className="py-1.5 px-2 text-center">{c==='all'?analysis.avg_centipawn_loss:ps[c]?.acpl??'-'}</td>)}</tr>
                    <tr><td className="py-1.5 px-2 font-semibold">Moves</td>{cats.map(c => <td key={c} className="py-1.5 px-2 text-center">{c==='all'?analysis.total_moves_analyzed:ps[c]?.count??0}</td>)}</tr>
                </tbody>
            </table>
        </div>
    );
}

function CPLossDistribution({ dist }) {
    if (!dist) return null;
    const b = ['>0','>10','>25','>50','>100','>200'];
    const mx = Math.max(...b.map(k => dist[k]||0), 1);
    return (
        <div className="space-y-1.5">
            {b.map(k => (
                <div key={k} className="flex items-center gap-2 text-xs">
                    <span className="w-12 text-right font-mono text-gray-500">{k}cp</span>
                    <div className="flex-1 h-5 bg-gray-100 dark:bg-gray-800/50 rounded overflow-hidden">
                        <div className="h-full bg-primary rounded transition-all" style={{ width: `${((dist[k]||0)/mx)*100}%` }} />
                    </div>
                    <span className="w-8 text-right font-mono font-semibold">{dist[k]||0}</span>
                </div>
            ))}
        </div>
    );
}

function MoveTable({ moves }) {
    if (!moves?.length) return null;
    const cc = { best:'text-green-500', excellent:'text-teal-500', good:'text-blue-500', inaccuracy:'text-amber-500', mistake:'text-orange-500', blunder:'text-red-500' };
    return (
        <div className="max-h-[400px] overflow-y-auto no-scrollbar">
            <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white dark:bg-surface-dark z-10">
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="py-2 px-2 text-left text-gray-500">#</th>
                        <th className="py-2 px-2 text-left text-gray-500">Move</th>
                        <th className="py-2 px-2 text-center text-gray-500">CP Loss</th>
                        <th className="py-2 px-2 text-center text-gray-500">Rank</th>
                        <th className="py-2 px-2 text-center text-gray-500">Category</th>
                        <th className="py-2 px-2 text-center text-gray-500">Class</th>
                    </tr>
                </thead>
                <tbody>
                    {moves.map((m,i) => (
                        <tr key={i} className={`border-b border-gray-50 dark:border-gray-800/50 ${m.is_suspicious?'bg-red-50 dark:bg-red-900/10':''}`}>
                            <td className="py-2 px-2 text-gray-400">{m.ply+1}</td>
                            <td className="py-2 px-2 font-mono font-semibold">{m.move_san}</td>
                            <td className="py-2 px-2 text-center">{m.cp_loss}</td>
                            <td className="py-2 px-2 text-center">{m.rank?`T${m.rank}`:'-'}{m.is_forced?<span className="ml-1 text-[9px] text-gray-400">(F)</span>:''}</td>
                            <td className="py-2 px-2 text-center capitalize text-gray-500">{m.position_category}</td>
                            <td className={`py-2 px-2 text-center font-semibold capitalize ${cc[m.classification]||''}`}>{m.classification}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

const MOCK_MOVES = [
    { ply: 20, move_san: 'Nf3', cp_loss: 0, wcl: 0, rank: 1, is_forced: false, position_category: 'undecided', classification: 'best', is_suspicious: false },
    { ply: 22, move_san: 'Bb5', cp_loss: 0, wcl: 0, rank: 1, is_forced: false, position_category: 'undecided', classification: 'best', is_suspicious: true },
    { ply: 24, move_san: 'O-O', cp_loss: 5, wcl: 0.01, rank: 2, is_forced: false, position_category: 'undecided', classification: 'excellent', is_suspicious: false },
    { ply: 26, move_san: 'Re1', cp_loss: 0, wcl: 0, rank: 1, is_forced: true, position_category: 'undecided', classification: 'best', is_suspicious: false },
    { ply: 28, move_san: 'Bxc6', cp_loss: 12, wcl: 0.02, rank: 2, is_forced: false, position_category: 'undecided', classification: 'good', is_suspicious: false },
    { ply: 30, move_san: 'd4', cp_loss: 0, wcl: 0, rank: 1, is_forced: false, position_category: 'undecided', classification: 'best', is_suspicious: true },
    { ply: 32, move_san: 'Nbd2', cp_loss: 45, wcl: 0.06, rank: 3, is_forced: false, position_category: 'undecided', classification: 'inaccuracy', is_suspicious: false },
    { ply: 34, move_san: 'dxe5', cp_loss: 0, wcl: 0, rank: 1, is_forced: true, position_category: 'winning', classification: 'best', is_suspicious: false },
    { ply: 36, move_san: 'Nxe5', cp_loss: 0, wcl: 0, rank: 1, is_forced: false, position_category: 'winning', classification: 'best', is_suspicious: false },
    { ply: 38, move_san: 'Qh5', cp_loss: 0, wcl: 0, rank: 1, is_forced: false, position_category: 'winning', classification: 'best', is_suspicious: true },
    { ply: 40, move_san: 'Nf3', cp_loss: 120, wcl: 0.15, rank: null, is_forced: false, position_category: 'winning', classification: 'mistake', is_suspicious: false },
    { ply: 42, move_san: 'Bg5', cp_loss: 0, wcl: 0, rank: 1, is_forced: false, position_category: 'undecided', classification: 'best', is_suspicious: false },
    { ply: 44, move_san: 'Rad1', cp_loss: 22, wcl: 0.03, rank: 2, is_forced: false, position_category: 'undecided', classification: 'good', is_suspicious: false },
    { ply: 46, move_san: 'Qf5', cp_loss: 350, wcl: 0.4, rank: null, is_forced: false, position_category: 'losing', classification: 'blunder', is_suspicious: false },
    { ply: 48, move_san: 'Rd7', cp_loss: 0, wcl: 0, rank: 1, is_forced: false, position_category: 'losing', classification: 'best', is_suspicious: false },
];

const MOCK_REPORT_DETAIL = {
    id: 'demo',
    reported_user: { username: 'GrandmasterX', profile_pic: null, rating_blitz: 2450, rating_rapid: 2380 },
    reporter: { username: 'PlayerOne', profile_pic: null },
    reason: 'engine_use',
    status: 'under_review',
    game: 101,
    description: 'This player found the best move in every complex position. Moves were made very consistently in 3-4 seconds throughout the game.',
    created_at: new Date(Date.now() - 2 * 3600000).toISOString(),
    admin_notes: '',
    game_summary: { id: 101, white_username: 'PlayerOne', black_username: 'GrandmasterX', time_control: 'blitz', result: '0-1', move_count: 52, finished_at: new Date(Date.now() - 3 * 3600000).toISOString() },
    analysis: {
        t1_pct: 78.6, t2_pct: 89.3, t3_pct: 92.9, t4_pct: 96.4, t5_pct: 96.4,
        avg_centipawn_loss: 14.2, avg_winning_chances_loss: 0.018, best_move_streak: 9, accuracy_score: 91.3,
        position_stats: {
            undecided: { count: 12, t1_pct: 83.3, t2_pct: 91.7, t3_pct: 91.7, acpl: 9.5 },
            losing: { count: 4, t1_pct: 75.0, t2_pct: 100.0, t3_pct: 100.0, acpl: 18.0 },
            winning: { count: 8, t1_pct: 75.0, t2_pct: 87.5, t3_pct: 100.0, acpl: 17.8 },
            post_losing: { count: 4, t1_pct: 75.0, t2_pct: 75.0, t3_pct: 75.0, acpl: 12.5 },
        },
        move_classifications: MOCK_MOVES,
        forced_moves_excluded: 3, book_moves_excluded: 20,
        cp_loss_distribution: { '>0': 6, '>10': 4, '>25': 3, '>50': 2, '>100': 2, '>200': 1 },
        suspicious_moves: [{ ply: 22, move_san: 'Bb5', legal_moves: 32 }, { ply: 30, move_san: 'd4', legal_moves: 28 }, { ply: 38, move_san: 'Qh5', legal_moves: 25 }],
        irwin_score: null, verdict: 'suspicious', confidence: 0.72, total_moves_analyzed: 15, analyzed_at: new Date().toISOString(),
    },
};

export default function AntiCheatReportPage() {
    const { reportId } = useParams();
    const { user, loading: authLoading } = useAuth();
    const navigate = useNavigate();
    const settings = useSettings();
    const isSuperAdmin = user?.is_superuser === true;
    const isDemo = reportId === 'demo';

    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [analysisLoading, setAnalysisLoading] = useState(false);
    const [resolveLoading, setResolveLoading] = useState(false);
    const [resolveNotes, setResolveNotes] = useState('');

    useEffect(() => { if (!authLoading && !isSuperAdmin) navigate('/'); }, [authLoading, isSuperAdmin, navigate]);

    const loadReport = useCallback(async () => {
        if (isDemo) { setReport(MOCK_REPORT_DETAIL); setLoading(false); return; }
        setLoading(true); setError(null);
        try { setReport(await fetchCheatReportDetail(reportId)); }
        catch (e) { setError(e.message || 'Failed to load report'); }
        finally { setLoading(false); }
    }, [reportId, isDemo]);

    useEffect(() => { loadReport(); }, [loadReport]);

    const handleRunAnalysis = async () => {
        if (isDemo) { setAnalysisLoading(true); setTimeout(() => { setReport(p => ({ ...p, analysis: MOCK_REPORT_DETAIL.analysis })); setAnalysisLoading(false); }, 1500); return; }
        setAnalysisLoading(true); setError(null);
        try {
            const analysis = await runCheatAnalysis(reportId);
            setReport(p => ({ ...p, analysis }));
        } catch (e) { setError(e?.data?.detail || e.message || 'Analysis failed'); }
        finally { setAnalysisLoading(false); }
    };

    const handleResolve = async (resolution) => {
        if (isDemo) return;
        setResolveLoading(true);
        try { const u = await resolveCheatReport(reportId, { resolution, admin_notes: resolveNotes }); setReport(u); setResolveNotes(''); }
        catch (e) { setError(e?.data?.detail || e.message); }
        finally { setResolveLoading(false); }
    };

    if (authLoading) return null;
    if (!isSuperAdmin) return null;

    const analysis = report?.analysis;
    const isResolved = report?.status?.startsWith('resolved') || report?.status === 'dismissed';
    const reportedUser = report?.reported_user;
    const rating = reportedUser?.rating_blitz || reportedUser?.rating_rapid || 0;

    return (
        <Layout showHeader={false} showBottomNav>
            <div className="flex-1 overflow-y-auto pb-24 no-scrollbar">
                {/* Header */}
                <header className="sticky top-0 z-30 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md border-b border-gray-200/50 dark:border-gray-800/50 shadow-sm">
                    <div className="mx-auto max-w-[1200px] flex items-center justify-between px-4 py-2.5 sm:py-3">
                        <div className="flex items-center gap-2">
                            <button className="p-1.5 -ml-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" type="button" onClick={() => navigate('/anticheat')}>
                                <span className="material-symbols-outlined text-[22px] text-gray-500 dark:text-gray-400">arrow_back</span>
                            </button>
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>shield</span>
                                <span className="text-sm sm:text-base font-bold tracking-tight text-gray-900 dark:text-gray-100">Report Details</span>
                            </div>
                        </div>
                        <ProfileMenu settings={settings} />
                    </div>
                </header>

                <div className="mx-auto max-w-[1200px] px-4 py-6 space-y-6">
                    {loading ? (
                        <div className="text-center py-20 text-gray-400">Loading report...</div>
                    ) : error && !report ? (
                        <div className="text-center py-20">
                            <span className="material-symbols-outlined text-[48px] text-gray-300 dark:text-gray-600 block mb-3">error_outline</span>
                            <div className="text-red-500 text-sm mb-3">{error}</div>
                            <button className="text-primary text-sm font-semibold hover:underline" onClick={() => navigate('/anticheat')}>Back to Reports</button>
                        </div>
                    ) : report ? (
                        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                            {/* Left: Report Info */}
                            <div className="lg:col-span-2 space-y-4">
                                {/* Player Card */}
                                <div className="bg-white dark:bg-surface-dark rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-5">
                                    <div className="flex items-center gap-4 mb-4">
                                        <UserAvatar user={reportedUser} size="w-16 h-16" textSize="text-xl" />
                                        <div>
                                            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{reportedUser?.username}</h2>
                                            <div className="text-sm text-gray-500 flex items-center gap-1 mt-0.5">
                                                <span className="material-symbols-outlined text-[14px] text-amber-500">emoji_events</span>
                                                Elo: {rating || '—'}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 mb-4">
                                        <span className={`text-xs font-bold px-3 py-1.5 rounded-full ${STATUS_COLORS[report.status]}`}>{STATUS_LABELS[report.status]}</span>
                                        <span className={`text-xs font-semibold px-2.5 py-1 rounded ${report.reason === 'engine_use' ? 'bg-red-500/10 text-red-500' : 'bg-amber-500/10 text-amber-500'}`}>{REASON_LABELS[report.reason]}</span>
                                    </div>
                                    <div className="space-y-3 text-sm">
                                        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                                            <span className="material-symbols-outlined text-[16px]">person</span>
                                            <span>Reported by <strong className="text-gray-700 dark:text-gray-200">{report.reporter?.username}</strong></span>
                                        </div>
                                        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                                            <span className="material-symbols-outlined text-[16px]">calendar_today</span>
                                            <span>{new Date(report.created_at).toLocaleString()}</span>
                                        </div>
                                        {report.game_summary ? (
                                            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                                                <span className="material-symbols-outlined text-[16px]">sports_esports</span>
                                                <span>{report.game_summary.white_username} vs {report.game_summary.black_username}</span>
                                                <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-[10px] uppercase">{report.game_summary.time_control}</span>
                                            </div>
                                        ) : null}
                                        {report.game_summary ? (
                                            <div className="flex items-center gap-3 text-gray-500 dark:text-gray-400">
                                                <span className="text-xs">Result: <strong>{report.game_summary.result}</strong></span>
                                                <span className="text-xs">{report.game_summary.move_count} moves</span>
                                                <button className="text-primary text-xs font-semibold hover:underline" onClick={() => navigate(`/game/${report.game}`)}>View Game →</button>
                                            </div>
                                        ) : null}
                                    </div>
                                </div>

                                {/* Description */}
                                {report.description ? (
                                    <div className="bg-white dark:bg-surface-dark rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-5">
                                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Reporter's Description</h4>
                                        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed italic">"{report.description}"</p>
                                    </div>
                                ) : null}

                                {/* Resolve Actions */}
                                {!isResolved && analysis ? (
                                    <div className="bg-white dark:bg-surface-dark rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-5 space-y-3">
                                        <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100">Resolve Report</h4>
                                        <textarea
                                            className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                                            rows={2}
                                            placeholder="Admin notes (optional)..."
                                            value={resolveNotes}
                                            onChange={e => setResolveNotes(e.target.value)}
                                        />
                                        <div className="flex gap-2">
                                            <button className="flex-1 py-2.5 bg-green-500 hover:bg-green-600 text-white text-xs font-bold rounded-lg disabled:opacity-60 transition-colors" onClick={() => handleResolve('resolved_clean')} disabled={resolveLoading || isDemo}>Mark Clean</button>
                                            <button className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white text-xs font-bold rounded-lg disabled:opacity-60 transition-colors" onClick={() => handleResolve('resolved_cheating')} disabled={resolveLoading || isDemo}>Mark Cheating</button>
                                            <button className="flex-1 py-2.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-xs font-bold rounded-lg disabled:opacity-60 transition-colors" onClick={() => handleResolve('dismissed')} disabled={resolveLoading || isDemo}>Dismiss</button>
                                        </div>
                                    </div>
                                ) : null}

                                {isResolved && report.admin_notes ? (
                                    <div className="bg-white dark:bg-surface-dark rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-5">
                                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Admin Notes</h4>
                                        <p className="text-sm text-gray-700 dark:text-gray-300">{report.admin_notes}</p>
                                    </div>
                                ) : null}
                            </div>

                            {/* Right: Analysis */}
                            <div className="lg:col-span-3 space-y-4">
                                {error ? <div className="p-3 rounded-xl bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm">{error}</div> : null}

                                {!analysis ? (
                                    <div className="bg-white dark:bg-surface-dark rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-8 text-center space-y-4">
                                        <span className="material-symbols-outlined text-[56px] text-gray-300 dark:text-gray-600 block">analytics</span>
                                        <div className="text-gray-500 text-sm">Run the cheat detection engine to analyze this game with Stockfish T% and Irwin.</div>
                                        <button
                                            className="px-6 py-3 bg-primary hover:bg-blue-600 text-white font-semibold text-sm rounded-xl disabled:opacity-60 transition-colors shadow-sm inline-flex items-center gap-2"
                                            onClick={handleRunAnalysis}
                                            disabled={analysisLoading}
                                        >
                                            <span className="material-symbols-outlined text-[18px]">play_arrow</span>
                                            {analysisLoading ? 'Running Analysis...' : 'Run Cheat Analysis'}
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        {/* Verdict + Stats */}
                                        <div className="bg-white dark:bg-surface-dark rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-5 space-y-4">
                                            <div className="flex items-center justify-between flex-wrap gap-2">
                                                <VerdictBadge verdict={analysis.verdict} confidence={analysis.confidence} />
                                                {analysis.irwin_score != null ? (
                                                    <span className="text-sm font-bold text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 px-3 py-1 rounded-lg">Irwin NN: {analysis.irwin_score}/100</span>
                                                ) : (
                                                    <span className="text-xs text-gray-400 bg-gray-50 dark:bg-gray-800 px-3 py-1 rounded-lg">Irwin NN: not trained</span>
                                                )}
                                            </div>
                                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                                {[
                                                    { label: 'T1%', value: `${analysis.t1_pct}%`, color: 'text-blue-500' },
                                                    { label: 'ACPL', value: analysis.avg_centipawn_loss, color: 'text-amber-500' },
                                                    { label: 'Best Streak', value: analysis.best_move_streak, color: 'text-red-500' },
                                                    { label: 'Accuracy', value: `${analysis.accuracy_score}%`, color: 'text-green-500' },
                                                ].map(s => (
                                                    <div key={s.label} className="text-center p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700/50">
                                                        <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
                                                        <div className="text-[10px] text-gray-500 font-semibold mt-0.5">{s.label}</div>
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="text-[11px] text-gray-400 flex flex-wrap gap-2">
                                                <span>{analysis.total_moves_analyzed} moves analyzed</span><span>·</span>
                                                <span>{analysis.forced_moves_excluded} forced excluded</span><span>·</span>
                                                <span>{analysis.book_moves_excluded} book skipped</span>
                                                {analysis.suspicious_moves?.length > 0 ? <><span>·</span><span className="text-red-500 font-semibold">{analysis.suspicious_moves.length} suspicious moves</span></> : null}
                                            </div>
                                        </div>

                                        {/* T% Breakdown */}
                                        <div className="bg-white dark:bg-surface-dark rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-5 space-y-3">
                                            <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100">T% Breakdown by Position</h4>
                                            <TPercentTable analysis={analysis} />
                                        </div>

                                        {/* CP Loss Distribution */}
                                        <div className="bg-white dark:bg-surface-dark rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-5 space-y-3">
                                            <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100">Centipawn Loss Distribution</h4>
                                            <CPLossDistribution dist={analysis.cp_loss_distribution} />
                                        </div>

                                        {/* Move Table */}
                                        <div className="bg-white dark:bg-surface-dark rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-5 space-y-3">
                                            <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100">Move-by-Move Analysis</h4>
                                            <MoveTable moves={analysis.move_classifications} />
                                        </div>

                                        {/* Re-run */}
                                        <button
                                            className="w-full py-2.5 px-4 rounded-xl border-2 border-primary text-primary text-sm font-semibold disabled:opacity-60 hover:bg-primary/5 transition-colors"
                                            onClick={handleRunAnalysis}
                                            disabled={analysisLoading}
                                        >
                                            {analysisLoading ? 'Re-analyzing...' : 'Re-run Analysis'}
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    ) : null}
                </div>
            </div>
        </Layout>
    );
}
