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
    createIrwinSingleImport,
    fetchIrwinImportJobs,
    createIrwinCsvImportJob,
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
const CSV_TEMPLATE_COLUMNS = [
    'moves',
    'suspect_color',
    'label',
    'move_times_seconds',
    'start_fen',
    'moves_format',
    'source_ref',
    'external_id',
    'notes',
];
const CSV_TEMPLATE_CONTENT = [
    CSV_TEMPLATE_COLUMNS.join(','),
    '"1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6",white,cheat,"12,9,15,8,21,7,18,6,11,9,14,8,17,10",,auto,https://lichess.org/example-game,lichess-demo-001,"Reviewed external dataset sample"',
    '"e2e4 e7e5 g1f3 b8c6 f1b5 a7a6",black,clean,"5,6,7,8,9,10",,uci,https://www.chess.com/game/live/123456,cc-live-123456,"Imported from external site"',
].join('\n');
const DEFAULT_SINGLE_IMPORT = {
    moves: '',
    suspectColor: 'white',
    label: '',
    moveTimes: '',
    startFen: '',
    moveFormat: 'auto',
    sourceRef: '',
    externalId: '',
    notes: '',
};

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
function _queueStatusColor(status) {
    if (status === 'queued') return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    if (status === 'processing') return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
    if (status === 'completed') return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    if (status === 'failed') return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
}
function _messageBoxColor(type) {
    if (type === 'success') return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    if (type === 'error') return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
}
function _formatFileSize(bytes = 0) {
    if (!bytes) return '0 KB';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
function _formatDateTime(dateString) {
    if (!dateString) return 'Just now';
    try {
        return new Date(dateString).toLocaleString([], {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
        });
    } catch {
        return 'Just now';
    }
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
    const [csvFile, setCsvFile] = useState(null);
    const [csvInputKey, setCsvInputKey] = useState(0);
    const [csvQueue, setCsvQueue] = useState([]);
    const [csvMessage, setCsvMessage] = useState(null);
    const [csvLoading, setCsvLoading] = useState(false);
    const [singleImportForm, setSingleImportForm] = useState(DEFAULT_SINGLE_IMPORT);
    const [singleImportMessage, setSingleImportMessage] = useState(null);
    const [singleImportLoading, setSingleImportLoading] = useState(false);
    const [importMode, setImportMode] = useState('single');

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
    const loadImportJobs = useCallback(async () => {
        try {
            const jobs = await fetchIrwinImportJobs();
            setCsvQueue(Array.isArray(jobs) ? jobs : []);
        } catch {}
    }, []);

    useEffect(() => { loadReports(); }, [loadReports]);
    useEffect(() => { loadIrwin(); }, [loadIrwin]);
    useEffect(() => { if (isSuperAdmin) loadImportJobs(); }, [isSuperAdmin, loadImportJobs]);

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
    useEffect(() => {
        if (!csvMessage) return;
        const t = setTimeout(() => setCsvMessage(null), 3000);
        return () => clearTimeout(t);
    }, [csvMessage]);
    useEffect(() => {
        if (!singleImportMessage) return;
        const t = setTimeout(() => setSingleImportMessage(null), 3000);
        return () => clearTimeout(t);
    }, [singleImportMessage]);

    if (authLoading) return null;
    if (!isSuperAdmin) return null;

    const filteredMock = statusFilter ? MOCK_REPORTS.filter(r => r.status === statusFilter) : MOCK_REPORTS;
    const displayReports = reports.length > 0 ? reports : filteredMock;
    const irwin = irwinStatus || { labeled_count: 0, training_threshold: 100, cheating_count: 0, clean_count: 0, is_trained: false, ready_to_train: false };
    const irwinPct = Math.min(100, (irwin.labeled_count / irwin.training_threshold) * 100);
    const irwinRemaining = Math.max(0, irwin.training_threshold - irwin.labeled_count);

    const pendingCount = reports.filter(r => r.status === 'pending' || r.status === 'under_review').length;
    const resolvedCount = reports.filter(r => r.status?.startsWith('resolved')).length;
    const singleImportSideTone = singleImportForm.suspectColor === 'white'
        ? 'bg-slate-100 text-slate-700 dark:bg-slate-800/80 dark:text-slate-200'
        : 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900';
    const singleImportLabelTone = singleImportForm.label === 'cheat'
        ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
        : singleImportForm.label === 'clean'
            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
            : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
    const singleImportStartTone = singleImportForm.startFen.trim()
        ? 'Custom FEN'
        : 'Standard Start';
    const singleImportTimingTone = singleImportForm.moveTimes.trim()
        ? 'Timing Added'
        : 'No Timing';
    const csvSelectedTone = csvFile?.name || 'No file selected';
    const csvQueueTone = csvQueue.length === 1 ? '1 item queued' : `${csvQueue.length} items queued`;
    const handleCsvTemplateDownload = () => {
        const blob = new Blob([CSV_TEMPLATE_CONTENT], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'irwin-training-template.csv';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };
    const handleCsvFileSelect = (event) => {
        const nextFile = event.target.files?.[0] || null;
        setCsvFile(nextFile);
        if (nextFile) {
            setCsvMessage({
                type: 'info',
                text: `${nextFile.name} selected. Add it to the queue when ready.`,
            });
        }
    };
    const handleQueueCsv = async () => {
        if (!csvFile) {
            setCsvMessage({ type: 'error', text: 'Choose a CSV file before adding it to the queue.' });
            return;
        }
        setCsvLoading(true);
        try {
            const job = await createIrwinCsvImportJob(csvFile);
            setCsvQueue((prev) => [job, ...prev.filter((item) => item.id !== job.id)]);
            setCsvMessage({
                type: 'success',
                text: `${csvFile.name} was queued for import.`,
            });
            setCsvFile(null);
            setCsvInputKey((prev) => prev + 1);
            loadImportJobs();
        } catch (e) {
            setCsvMessage({ type: 'error', text: e?.data?.detail || e.message || 'Could not queue the selected CSV file.' });
        } finally {
            setCsvLoading(false);
        }
    };
    const updateSingleImportField = (field, value) => {
        setSingleImportForm((prev) => ({ ...prev, [field]: value }));
    };
    const handleSingleImportReset = () => {
        setSingleImportForm(DEFAULT_SINGLE_IMPORT);
        setSingleImportMessage(null);
    };
    const handleSingleImportSubmit = async (event) => {
        event.preventDefault();
        if (!singleImportForm.moves.trim()) {
            setSingleImportMessage({ type: 'error', text: 'Game moves are required for a single import.' });
            return;
        }
        if (!singleImportForm.label) {
            setSingleImportMessage({ type: 'error', text: 'Choose the final result label: clean or cheat.' });
            return;
        }
        setSingleImportLoading(true);
        try {
            await createIrwinSingleImport({
                moves: singleImportForm.moves,
                suspect_color: singleImportForm.suspectColor,
                label: singleImportForm.label,
                move_times_seconds: singleImportForm.moveTimes,
                start_fen: singleImportForm.startFen,
                move_format: singleImportForm.moveFormat,
                source_ref: singleImportForm.sourceRef,
                external_id: singleImportForm.externalId,
                notes: singleImportForm.notes,
            });
            setSingleImportForm(DEFAULT_SINGLE_IMPORT);
            setSingleImportMessage({
                type: 'success',
                text: 'Single import saved to Irwin training data.',
            });
            loadIrwin();
        } catch (e) {
            setSingleImportMessage({
                type: 'error',
                text: e?.data?.detail || e.message || 'Single import failed.',
            });
        } finally {
            setSingleImportLoading(false);
        }
    };

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

                    <div className="bg-white dark:bg-surface-dark rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm">
                        <div className="p-5 space-y-5">
                            <div className="flex items-start gap-3">
                                <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center shrink-0">
                                    <span className="material-symbols-outlined text-violet-500 text-[22px]">upload</span>
                                </div>
                                <div className="min-w-0">
                                    <h3 className="font-bold text-base text-gray-900 dark:text-gray-100">Import Game</h3>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                        Import one external game or switch to CSV upload in the same section.
                                    </p>
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => setImportMode('single')}
                                    className={`px-4 py-2 text-sm font-semibold rounded-xl transition-colors ${
                                        importMode === 'single'
                                            ? 'bg-violet-600 text-white'
                                            : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700'
                                    }`}
                                >
                                    Single Import
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setImportMode('csv')}
                                    className={`px-4 py-2 text-sm font-semibold rounded-xl transition-colors ${
                                        importMode === 'csv'
                                            ? 'bg-blue-600 text-white'
                                            : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700'
                                    }`}
                                >
                                    Upload CSV
                                </button>
                            </div>

                            {importMode === 'csv' ? (
                                <div className="space-y-4">
                                    {csvMessage ? (
                                        <div className={`rounded-xl px-4 py-3 text-sm font-medium ${_messageBoxColor(csvMessage.type)}`}>
                                            {csvMessage.text}
                                        </div>
                                    ) : null}

                                    <div className="rounded-3xl border border-blue-200/80 dark:border-blue-800/60 bg-gradient-to-br from-blue-500/12 via-cyan-500/10 to-violet-500/10 dark:from-blue-500/18 dark:via-cyan-500/10 dark:to-violet-500/10 p-5">
                                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                            <div className="space-y-2">
                                                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/80 dark:bg-gray-900/40 text-xs font-semibold text-blue-700 dark:text-blue-300">
                                                    <span className="material-symbols-outlined text-[16px]">upload_file</span>
                                                    Bulk Training Upload
                                                </div>
                                                <div>
                                                    <h4 className="text-lg font-bold text-gray-900 dark:text-gray-100">Queue many labeled games at once</h4>
                                                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                                                        Upload one CSV, keep the format simple, and send the whole batch into the training import queue.
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-white/80 text-gray-700 dark:bg-gray-900/40 dark:text-gray-200">
                                                    {csvSelectedTone}
                                                </span>
                                                <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                                                    {csvQueueTone}
                                                </span>
                                                <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
                                                    Template Ready
                                                </span>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
                                            <div className="rounded-2xl bg-white/75 dark:bg-gray-900/35 border border-white/70 dark:border-white/5 p-3">
                                                <div className="flex items-center gap-2 text-blue-600 dark:text-blue-300 mb-1">
                                                    <span className="material-symbols-outlined text-[18px]">description</span>
                                                    <span className="text-sm font-semibold">Simple format</span>
                                                </div>
                                                <div className="text-xs text-gray-600 dark:text-gray-300">Only three columns are required: moves, suspect_color, and label.</div>
                                            </div>
                                            <div className="rounded-2xl bg-white/75 dark:bg-gray-900/35 border border-white/70 dark:border-white/5 p-3">
                                                <div className="flex items-center gap-2 text-cyan-600 dark:text-cyan-300 mb-1">
                                                    <span className="material-symbols-outlined text-[18px]">queue</span>
                                                    <span className="text-sm font-semibold">Queued import</span>
                                                </div>
                                                <div className="text-xs text-gray-600 dark:text-gray-300">Large CSVs are meant to run through the import queue instead of blocking the page.</div>
                                            </div>
                                            <div className="rounded-2xl bg-white/75 dark:bg-gray-900/35 border border-white/70 dark:border-white/5 p-3">
                                                <div className="flex items-center gap-2 text-violet-600 dark:text-violet-300 mb-1">
                                                    <span className="material-symbols-outlined text-[18px]">download</span>
                                                    <span className="text-sm font-semibold">Template included</span>
                                                </div>
                                                <div className="text-xs text-gray-600 dark:text-gray-300">Download the sample CSV first if you want the exact format.</div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="rounded-3xl border border-gray-100 dark:border-gray-700/60 bg-gray-50/80 dark:bg-gray-900/20 p-5 space-y-4">
                                        <div className="flex items-center gap-2">
                                            <span className="material-symbols-outlined text-[18px] text-blue-500">folder_zip</span>
                                            <h4 className="font-bold text-sm text-gray-900 dark:text-gray-100">CSV File</h4>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white/90 dark:bg-gray-800/80 p-4 md:col-span-2">
                                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                                    <div>
                                                        <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Choose your import file</div>
                                                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                            Required columns: <span className="font-semibold text-gray-700 dark:text-gray-200">moves</span>, <span className="font-semibold text-gray-700 dark:text-gray-200">suspect_color</span>, <span className="font-semibold text-gray-700 dark:text-gray-200">label</span>
                                                        </div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={handleCsvTemplateDownload}
                                                        className="inline-flex items-center justify-center gap-2 px-3.5 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-sm font-semibold text-blue-700 dark:text-blue-300 rounded-xl transition-colors hover:bg-blue-100 dark:hover:bg-blue-900/30"
                                                    >
                                                        <span className="material-symbols-outlined text-[18px]">download</span>
                                                        Sample CSV
                                                    </button>
                                                </div>

                                                <div className="mt-4 rounded-2xl border border-dashed border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10 p-4">
                                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                                                        <label className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-200 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                                                            <span className="material-symbols-outlined text-[18px]">attach_file</span>
                                                            Choose CSV
                                                            <input
                                                                key={csvInputKey}
                                                                type="file"
                                                                accept=".csv,text/csv"
                                                                className="hidden"
                                                                onChange={handleCsvFileSelect}
                                                            />
                                                        </label>
                                                        <button
                                                            type="button"
                                                            onClick={handleQueueCsv}
                                                            disabled={csvLoading}
                                                            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 via-cyan-600 to-blue-600 hover:from-blue-700 hover:via-cyan-700 hover:to-blue-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-lg shadow-blue-500/20 disabled:opacity-60"
                                                        >
                                                            <span className="material-symbols-outlined text-[18px]">queue</span>
                                                            {csvLoading ? 'Queuing...' : 'Add To Queue'}
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white/90 dark:bg-gray-800/80 p-4">
                                                <div className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">
                                                    <span className="material-symbols-outlined text-[18px] text-violet-500">insert_drive_file</span>
                                                    Selected File
                                                </div>
                                                <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                                                    {csvFile?.name || 'No file selected'}
                                                </div>
                                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                                                    {csvFile ? _formatFileSize(csvFile.size) : 'Pick a CSV file, then add it to the queue.'}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="rounded-3xl border border-gray-100 dark:border-gray-700/60 bg-gray-50/80 dark:bg-gray-900/20 p-5 space-y-4">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <span className="material-symbols-outlined text-[18px] text-cyan-500">lists</span>
                                                <h4 className="font-bold text-sm text-gray-900 dark:text-gray-100">Queue</h4>
                                            </div>
                                            <span className="text-xs text-gray-500 dark:text-gray-400">{csvQueue.length} item{csvQueue.length === 1 ? '' : 's'}</span>
                                        </div>
                                        {csvQueue.length ? (
                                            <div className="space-y-2">
                                                {csvQueue.map((job) => (
                                                    <div key={job.id} className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white/90 dark:bg-gray-800/80 px-4 py-3 flex items-center justify-between gap-4">
                                                        <div className="min-w-0">
                                                            <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                                                                <span className="material-symbols-outlined text-[17px] text-blue-500">description</span>
                                                                <span className="truncate">{job.file_name || job.fileName}</span>
                                                            </div>
                                                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                                {job.total_rows ?? job.rowCount ?? 0} row{(job.total_rows ?? job.rowCount ?? 0) === 1 ? '' : 's'}
                                                                {job.size ? ` • ${_formatFileSize(job.size)}` : ''}
                                                                {' • '}
                                                                {_formatDateTime(job.created_at || job.queuedAt)}
                                                                {typeof job.imported_rows === 'number' || typeof job.failed_rows === 'number'
                                                                    ? ` • ${job.imported_rows || 0} imported / ${job.failed_rows || 0} failed`
                                                                    : ''}
                                                            </div>
                                                        </div>
                                                        <span className={`shrink-0 px-2.5 py-1 rounded-lg text-xs font-semibold ${_queueStatusColor(job.status)}`}>
                                                            {job.status === 'queued' ? 'Queued' : job.status}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/40 px-4 py-8 text-center">
                                                <span className="material-symbols-outlined text-[28px] text-blue-400 mb-2">queue</span>
                                                <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">No CSVs in queue yet</div>
                                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Choose a CSV above and add it to the queue.</div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <form className="space-y-5" onSubmit={handleSingleImportSubmit}>
                                    {singleImportMessage ? (
                                        <div className={`rounded-xl px-4 py-3 text-sm font-medium ${_messageBoxColor(singleImportMessage.type)}`}>
                                            {singleImportMessage.text}
                                        </div>
                                    ) : null}

                                    <div className="rounded-3xl border border-violet-200/80 dark:border-violet-800/60 bg-gradient-to-br from-violet-500/12 via-fuchsia-500/10 to-blue-500/10 dark:from-violet-500/20 dark:via-fuchsia-500/12 dark:to-blue-500/10 p-5">
                                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                            <div className="space-y-2">
                                                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/80 dark:bg-gray-900/40 text-xs font-semibold text-violet-700 dark:text-violet-300">
                                                    <span className="material-symbols-outlined text-[16px]">travel_explore</span>
                                                    External Training Sample
                                                </div>
                                                <div>
                                                    <h4 className="text-lg font-bold text-gray-900 dark:text-gray-100">Prepare one reviewed game for Irwin</h4>
                                                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                                                        Paste the full game, choose the verdict, and optionally add timings or a custom FEN.
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                <span className={`px-3 py-1.5 rounded-full text-xs font-bold ${singleImportSideTone}`}>
                                                    {singleImportForm.suspectColor === 'white' ? 'White Side' : 'Black Side'}
                                                </span>
                                                <span className={`px-3 py-1.5 rounded-full text-xs font-bold ${singleImportLabelTone}`}>
                                                    {singleImportForm.label ? (singleImportForm.label === 'cheat' ? 'Cheat Label' : 'Clean Label') : 'Result Needed'}
                                                </span>
                                                <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-white/80 text-gray-700 dark:bg-gray-900/40 dark:text-gray-200">
                                                    {singleImportStartTone}
                                                </span>
                                                <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-white/80 text-gray-700 dark:bg-gray-900/40 dark:text-gray-200">
                                                    {singleImportTimingTone}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
                                            <div className="rounded-2xl bg-white/75 dark:bg-gray-900/35 border border-white/70 dark:border-white/5 p-3">
                                                <div className="flex items-center gap-2 text-violet-600 dark:text-violet-300 mb-1">
                                                    <span className="material-symbols-outlined text-[18px]">tactic</span>
                                                    <span className="text-sm font-semibold">Full move list</span>
                                                </div>
                                                <div className="text-xs text-gray-600 dark:text-gray-300">Accepts PGN, SAN, or UCI from outside sites.</div>
                                            </div>
                                            <div className="rounded-2xl bg-white/75 dark:bg-gray-900/35 border border-white/70 dark:border-white/5 p-3">
                                                <div className="flex items-center gap-2 text-blue-600 dark:text-blue-300 mb-1">
                                                    <span className="material-symbols-outlined text-[18px]">flag</span>
                                                    <span className="text-sm font-semibold">Manual label</span>
                                                </div>
                                                <div className="text-xs text-gray-600 dark:text-gray-300">Clean or cheat becomes the supervised training target.</div>
                                            </div>
                                            <div className="rounded-2xl bg-white/75 dark:bg-gray-900/35 border border-white/70 dark:border-white/5 p-3">
                                                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-300 mb-1">
                                                    <span className="material-symbols-outlined text-[18px]">timer</span>
                                                    <span className="text-sm font-semibold">Timing optional</span>
                                                </div>
                                                <div className="text-xs text-gray-600 dark:text-gray-300">Leave timings blank if the source does not provide them.</div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="rounded-3xl border border-gray-100 dark:border-gray-700/60 bg-gray-50/80 dark:bg-gray-900/20 p-5 space-y-4">
                                        <div className="flex items-center gap-2">
                                            <span className="material-symbols-outlined text-[18px] text-violet-500">dataset</span>
                                            <h4 className="font-bold text-sm text-gray-900 dark:text-gray-100">Game Metadata</h4>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white/90 dark:bg-gray-800/80 p-4">
                                                <label className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">
                                                    <span className="material-symbols-outlined text-[18px] text-slate-500">chess</span>
                                                    Suspect Side
                                                </label>
                                                <select
                                                    value={singleImportForm.suspectColor}
                                                    onChange={(e) => updateSingleImportField('suspectColor', e.target.value)}
                                                    className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3.5 py-3 text-sm text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-violet-500/30"
                                                >
                                                    <option value="white">White</option>
                                                    <option value="black">Black</option>
                                                </select>
                                            </div>
                                            <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white/90 dark:bg-gray-800/80 p-4">
                                                <label className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">
                                                    <span className="material-symbols-outlined text-[18px] text-red-500">verified</span>
                                                    Detection Result
                                                </label>
                                                <select
                                                    value={singleImportForm.label}
                                                    onChange={(e) => updateSingleImportField('label', e.target.value)}
                                                    className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3.5 py-3 text-sm text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-violet-500/30"
                                                >
                                                    <option value="">Select result</option>
                                                    <option value="clean">Clean</option>
                                                    <option value="cheat">Cheat</option>
                                                </select>
                                            </div>
                                            <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white/90 dark:bg-gray-800/80 p-4">
                                                <label className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">
                                                    <span className="material-symbols-outlined text-[18px] text-blue-500">route</span>
                                                    Move Format
                                                </label>
                                                <select
                                                    value={singleImportForm.moveFormat}
                                                    onChange={(e) => updateSingleImportField('moveFormat', e.target.value)}
                                                    className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3.5 py-3 text-sm text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-violet-500/30"
                                                >
                                                    <option value="auto">Auto detect</option>
                                                    <option value="pgn">PGN</option>
                                                    <option value="san">SAN moves</option>
                                                    <option value="uci">UCI moves</option>
                                                </select>
                                            </div>
                                            <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white/90 dark:bg-gray-800/80 p-4">
                                                <label className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">
                                                    <span className="material-symbols-outlined text-[18px] text-amber-500">badge</span>
                                                    External ID
                                                </label>
                                                <input
                                                    type="text"
                                                    value={singleImportForm.externalId}
                                                    onChange={(e) => updateSingleImportField('externalId', e.target.value)}
                                                    placeholder="lichess-abc123"
                                                    className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3.5 py-3 text-sm text-gray-900 dark:text-gray-100 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-violet-500/30"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="rounded-3xl border border-gray-100 dark:border-gray-700/60 bg-gray-50/80 dark:bg-gray-900/20 p-5 space-y-4">
                                        <div className="flex items-center gap-2">
                                            <span className="material-symbols-outlined text-[18px] text-blue-500">link</span>
                                            <h4 className="font-bold text-sm text-gray-900 dark:text-gray-100">Source Details</h4>
                                        </div>
                                        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white/90 dark:bg-gray-800/80 p-4">
                                            <label className="block text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">Source Link / Reference</label>
                                            <input
                                                type="text"
                                                value={singleImportForm.sourceRef}
                                                onChange={(e) => updateSingleImportField('sourceRef', e.target.value)}
                                                placeholder="https://lichess.org/... or reviewer note"
                                                className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3.5 py-3 text-sm text-gray-900 dark:text-gray-100 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-violet-500/30"
                                            />
                                        </div>
                                    </div>

                                    <div className="rounded-3xl border border-violet-100 dark:border-violet-900/40 bg-violet-50/60 dark:bg-violet-900/10 p-5 space-y-4">
                                        <div className="flex items-center gap-2">
                                            <span className="material-symbols-outlined text-[18px] text-violet-500">tactic</span>
                                            <h4 className="font-bold text-sm text-gray-900 dark:text-gray-100">Game Moves</h4>
                                        </div>
                                        <div className="rounded-2xl border border-violet-200/80 dark:border-violet-800/50 bg-white/90 dark:bg-gray-800/80 p-4">
                                            <label className="block text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">Game Moves / PGN</label>
                                            <textarea
                                                value={singleImportForm.moves}
                                                onChange={(e) => updateSingleImportField('moves', e.target.value)}
                                                rows={8}
                                                placeholder="Paste the full PGN, SAN move list, or UCI moves here"
                                                className="w-full rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 text-sm text-gray-900 dark:text-gray-100 outline-none placeholder:text-gray-400 resize-y focus:ring-2 focus:ring-violet-500/30"
                                            />
                                            <div className="mt-2 flex flex-wrap gap-2 text-xs">
                                                <span className="px-2.5 py-1 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 font-semibold">Mandatory</span>
                                                <span className="px-2.5 py-1 rounded-full bg-white text-gray-600 dark:bg-gray-800 dark:text-gray-300 border border-gray-200 dark:border-gray-700">PGN / SAN / UCI accepted</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                        <div className="rounded-3xl border border-gray-100 dark:border-gray-700/60 bg-gray-50/80 dark:bg-gray-900/20 p-5">
                                            <label className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">
                                                <span className="material-symbols-outlined text-[18px] text-emerald-500">flag</span>
                                                Start FEN
                                            </label>
                                            <textarea
                                                value={singleImportForm.startFen}
                                                onChange={(e) => updateSingleImportField('startFen', e.target.value)}
                                                rows={5}
                                                placeholder="Leave blank for normal chess starting position"
                                                className="w-full rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 text-sm text-gray-900 dark:text-gray-100 outline-none placeholder:text-gray-400 resize-y focus:ring-2 focus:ring-violet-500/30"
                                            />
                                            <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">Blank means normal chess start. Fill only for custom positions.</div>
                                        </div>
                                        <div className="rounded-3xl border border-gray-100 dark:border-gray-700/60 bg-gray-50/80 dark:bg-gray-900/20 p-5">
                                            <label className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">
                                                <span className="material-symbols-outlined text-[18px] text-cyan-500">schedule</span>
                                                Move Times In Seconds
                                            </label>
                                            <textarea
                                                value={singleImportForm.moveTimes}
                                                onChange={(e) => updateSingleImportField('moveTimes', e.target.value)}
                                                rows={5}
                                                placeholder="12, 8, 15, 6, 20 ..."
                                                className="w-full rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 text-sm text-gray-900 dark:text-gray-100 outline-none placeholder:text-gray-400 resize-y focus:ring-2 focus:ring-violet-500/30"
                                            />
                                            <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">Optional. Use one timing value per ply in game order.</div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)] gap-4">
                                        <div className="rounded-3xl border border-gray-100 dark:border-gray-700/60 bg-gray-50/80 dark:bg-gray-900/20 p-5">
                                            <label className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">
                                                <span className="material-symbols-outlined text-[18px] text-amber-500">edit_note</span>
                                                Reviewer Notes
                                            </label>
                                            <textarea
                                                value={singleImportForm.notes}
                                                onChange={(e) => updateSingleImportField('notes', e.target.value)}
                                                rows={5}
                                                placeholder="Why this game is being added to the training set"
                                                className="w-full rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 text-sm text-gray-900 dark:text-gray-100 outline-none placeholder:text-gray-400 resize-y focus:ring-2 focus:ring-violet-500/30"
                                            />
                                        </div>

                                        <div className="rounded-3xl border border-violet-100 dark:border-violet-900/40 bg-gradient-to-br from-violet-50 to-fuchsia-50 dark:from-violet-900/10 dark:to-fuchsia-900/10 p-5">
                                            <div className="flex items-center gap-2 mb-3">
                                                <span className="material-symbols-outlined text-[18px] text-violet-500">smart_toy</span>
                                                <div className="font-bold text-sm text-gray-900 dark:text-gray-100">How Irwin Uses This</div>
                                            </div>
                                            <div className="space-y-3 text-xs text-gray-600 dark:text-gray-300">
                                                <div className="flex gap-2">
                                                    <span className="material-symbols-outlined text-[16px] text-violet-500 mt-0.5">play_arrow</span>
                                                    <span>Moves are replayed from the provided FEN, or from the standard chess start if FEN is blank.</span>
                                                </div>
                                                <div className="flex gap-2">
                                                    <span className="material-symbols-outlined text-[16px] text-cyan-500 mt-0.5">timelapse</span>
                                                    <span>Optional timing values become timing features; if missing, neutral defaults are used.</span>
                                                </div>
                                                <div className="flex gap-2">
                                                    <span className="material-symbols-outlined text-[16px] text-emerald-500 mt-0.5">model_training</span>
                                                    <span>Your clean/cheat label is saved into the training set and picked up the next time Irwin is retrained.</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-2 sm:flex-row sm:justify-end pt-1">
                                        <button
                                            type="button"
                                            onClick={handleSingleImportReset}
                                            disabled={singleImportLoading}
                                            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 text-sm font-semibold rounded-xl transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
                                        >
                                            <span className="material-symbols-outlined text-[18px]">restart_alt</span>
                                            Reset
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={singleImportLoading}
                                            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-violet-600 via-fuchsia-600 to-violet-600 hover:from-violet-700 hover:via-fuchsia-700 hover:to-violet-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-lg shadow-violet-500/25 disabled:opacity-60"
                                        >
                                            <span className="material-symbols-outlined text-[18px]">save</span>
                                            {singleImportLoading ? 'Saving...' : 'Save Single Import'}
                                        </button>
                                    </div>
                                </form>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </Layout>
    );
}
