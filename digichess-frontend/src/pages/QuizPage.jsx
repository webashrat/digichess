import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import {
    fetchDigiQuizLiveQuestion,
    fetchDigiQuizLiveStandings,
    fetchDigiQuizResults,
    fetchDigiQuizState,
    joinDigiQuizRound,
    submitDigiQuizAnswer,
} from '../api';
import { tokenStorage } from '../api/client';

const TAB_UPCOMING = 'upcoming';
const TAB_LIVE = 'live';
const TAB_RESULTS = 'results';
const QUIZ_TABS = [
    { id: TAB_UPCOMING, label: 'Upcoming', icon: 'calendar_month', iconClass: 'text-sky-400' },
    { id: TAB_LIVE, label: 'Live', icon: 'fiber_manual_record', iconClass: 'text-red-400' },
    { id: TAB_RESULTS, label: 'Results', icon: 'emoji_events', iconClass: 'text-amber-400' },
];

const STATE_POLL_MS = 4000;
const LIVE_POLL_MS = 1200;
const STANDINGS_POLL_MS = 2400;
const RESULTS_DATE_MIN = '1970-01-01';
const ROUND_FINISHED_POPUP_MS = 2000;

function resolveWsBase() {
    const explicit = import.meta.env.VITE_WS_BASE_URL;
    if (explicit) return explicit.replace(/\/$/, '');
    const apiBase = import.meta.env.VITE_API_BASE_URL;
    if (apiBase && apiBase.startsWith('http')) {
        try {
            const url = new URL(apiBase);
            const protocol = url.protocol === 'https:' ? 'wss' : 'ws';
            return `${protocol}://${url.host}`;
        } catch {
            // ignore invalid API base
        }
    }
    if (typeof window !== 'undefined') {
        const localhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        if (localhost) {
            const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
            return `${protocol}://${window.location.hostname}:8000`;
        }
    }
    return null;
}

function buildWsUrl(path, token) {
    const base = resolveWsBase();
    if (base) {
        return `${base}${path}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    }
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${protocol}://${window.location.host}${path}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
}

function optionLabel(index) {
    return String.fromCharCode(65 + index);
}

function splitClock(totalSeconds) {
    const value = Math.max(0, Number(totalSeconds) || 0);
    const hours = Math.floor(value / 3600);
    const minutes = Math.floor((value % 3600) / 60);
    const seconds = value % 60;
    return {
        hours: String(hours).padStart(2, '0'),
        minutes: String(minutes).padStart(2, '0'),
        seconds: String(seconds).padStart(2, '0'),
    };
}

function parseApiError(error, fallback) {
    if (error?.data?.detail) {
        return String(error.data.detail);
    }
    if (error?.message) {
        return String(error.message);
    }
    return fallback;
}

function toIsoDateLabel(isoDate) {
    if (!isoDate) {
        return 'Previous Round';
    }
    const [year, month, day] = String(isoDate).split('-').map(Number);
    if (!year || !month || !day) {
        return String(isoDate);
    }
    const dt = new Date(Date.UTC(year, month - 1, day));
    return dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function toIstDateTimeLabel(isoDateTime) {
    if (!isoDateTime) return 'March 1, 2026, 23:30 IST';
    const parsed = new Date(isoDateTime);
    if (Number.isNaN(parsed.getTime())) return 'March 1, 2026, 23:30 IST';
    const dateLabel = parsed.toLocaleDateString('en-US', {
        timeZone: 'Asia/Kolkata',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    });
    const timeLabel = parsed.toLocaleTimeString('en-US', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });
    return `${dateLabel}, ${timeLabel} IST`;
}

function formatAnswerTime(totalMs) {
    const ms = Math.max(0, Number(totalMs) || 0);
    const totalSec = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSec / 60);
    const seconds = totalSec % 60;
    return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

function secondsUntil(isoDateTime, nowMs) {
    if (!isoDateTime) {
        return 0;
    }
    const target = Date.parse(isoDateTime);
    if (Number.isNaN(target)) {
        return 0;
    }
    return Math.max(0, Math.floor((target - nowMs) / 1000));
}

function phaseToTab(phase) {
    if (phase === 'results') return TAB_RESULTS;
    if (phase === 'live' || phase === 'join_open') return TAB_LIVE;
    return TAB_UPCOMING;
}

function phaseChip(phase) {
    if (phase === 'results') {
        return { label: 'Results', className: 'border-amber-500/30 bg-amber-500/10 text-amber-400' };
    }
    if (phase === 'live') {
        return { label: 'Live Round', className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' };
    }
    if (phase === 'join_open') {
        return { label: 'Join Open', className: 'border-primary/30 bg-primary/10 text-primary' };
    }
    return { label: 'Upcoming', className: 'border-primary/30 bg-primary/10 text-primary' };
}

function rankCell(rank) {
    if (rank === 1) return <span className="material-symbols-outlined text-[16px] text-yellow-500">emoji_events</span>;
    if (rank === 2) return <span className="material-symbols-outlined text-[16px] text-slate-400">military_tech</span>;
    if (rank === 3) return <span className="material-symbols-outlined text-[16px] text-amber-600">military_tech</span>;
    return rank;
}

function StandingsTable({ rows, yourRow, questionCount, compact = false, onPlayerClick }) {
    const yourUserId = yourRow?.user_id || null;
    return (
        <table className="w-full text-sm text-left">
            <thead className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900 sticky top-0 z-10">
                <tr>
                    <th className="px-3 py-2.5 font-semibold w-14 text-center">Rank</th>
                    <th className="px-3 py-2.5 font-semibold">User</th>
                    <th className="px-3 py-2.5 font-semibold text-right whitespace-nowrap">Round Pts</th>
                    {!compact ? <th className="px-3 py-2.5 font-semibold text-right">Progress</th> : null}
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {(rows || []).map((row) => {
                    const isYou = yourUserId && row.user_id === yourUserId;
                    return (
                        <tr
                            key={`${row.rank}-${row.user_id}`}
                            className={`cursor-pointer ${isYou
                                ? 'bg-primary/12 border-l-2 border-primary'
                                : row.rank <= 3
                                    ? 'bg-slate-50/70 dark:bg-slate-900/45 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'} transition-colors`}
                            onClick={() => onPlayerClick?.(row.username)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => e.key === 'Enter' && onPlayerClick?.(row.username)}
                        >
                            <td className={`px-3 py-2.5 text-center font-bold ${isYou ? 'text-primary' : 'text-slate-500 dark:text-slate-400'}`}>
                                {rankCell(row.rank)}
                            </td>
                            <td className={`px-3 py-2.5 font-medium hover:text-primary transition-colors ${isYou ? 'text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-200'}`}>
                                {row.username}
                            </td>
                            <td className={`px-3 py-2.5 text-right font-bold ${isYou ? 'text-primary' : 'text-slate-700 dark:text-slate-200'}`}>
                                {(row.points || 0).toLocaleString()}
                            </td>
                            {!compact ? (
                                <td className={`px-3 py-2.5 text-right ${isYou ? 'text-slate-900 dark:text-white font-medium' : 'text-slate-500 dark:text-slate-400'}`}>
                                    {(row.progress || row.resolved || 0)}/{questionCount}
                                </td>
                            ) : null}
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
}

function Podium({ podium, onPlayerClick }) {
    const first = (podium || []).find((row) => row.rank === 1);
    const second = (podium || []).find((row) => row.rank === 2);
    const third = (podium || []).find((row) => row.rank === 3);

    const clickProps = (username) => username ? { onClick: () => onPlayerClick?.(username), role: 'button', tabIndex: 0, onKeyDown: (e) => e.key === 'Enter' && onPlayerClick?.(username) } : {};

    return (
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-gradient-to-b from-primary/10 to-transparent dark:from-primary/10 dark:to-surface-dark p-5 md:p-7 overflow-hidden">
            <h3 className="text-lg md:text-xl font-bold text-center text-slate-900 dark:text-white">Top Performers</h3>
            <div className="mt-8 flex items-end justify-center gap-3 md:gap-8">
                <div className="flex flex-col items-center w-[30%] md:w-40 cursor-pointer" {...clickProps(second?.username)}>
                    <div className="size-14 md:size-16 rounded-full border-2 border-slate-400 dark:border-slate-500 bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-sm font-bold text-slate-800 dark:text-slate-100">
                        {second?.username?.slice(0, 2).toUpperCase() || '2'}
                    </div>
                    <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-white truncate max-w-full hover:text-primary transition-colors">{second?.username || '---'}</div>
                    <div className="text-xs font-bold text-slate-500 dark:text-slate-300">{(second?.points || 0).toLocaleString()} pts</div>
                    <div className="mt-3 h-20 md:h-24 w-full rounded-t-lg bg-slate-200 dark:bg-slate-700/60 border border-slate-300 dark:border-slate-600 flex items-end justify-center pb-2">
                        <span className="text-xs font-bold text-slate-600 dark:text-slate-300">#2</span>
                    </div>
                </div>

                <div className="flex flex-col items-center w-[34%] md:w-44 -mt-4 cursor-pointer" {...clickProps(first?.username)}>
                    <span className="material-symbols-outlined text-yellow-500 text-3xl md:text-4xl">crown</span>
                    <div className="size-16 md:size-20 rounded-full border-2 border-yellow-500 ring-4 ring-yellow-500/20 bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-base font-bold text-slate-900 dark:text-white">
                        {first?.username?.slice(0, 2).toUpperCase() || '1'}
                    </div>
                    <div className="mt-2 text-base md:text-lg font-bold text-slate-900 dark:text-white truncate max-w-full hover:text-primary transition-colors">{first?.username || '---'}</div>
                    <div className="text-sm font-bold text-yellow-600 dark:text-yellow-400">{(first?.points || 0).toLocaleString()} pts</div>
                    <div className="mt-3 h-28 md:h-36 w-full rounded-t-lg bg-gradient-to-t from-yellow-500/30 to-yellow-500/10 border border-yellow-500/30 flex items-end justify-center pb-2">
                        <span className="text-xs font-bold text-yellow-700 dark:text-yellow-300">#1</span>
                    </div>
                </div>

                <div className="flex flex-col items-center w-[30%] md:w-40 cursor-pointer" {...clickProps(third?.username)}>
                    <div className="size-14 md:size-16 rounded-full border-2 border-amber-700 dark:border-amber-600 bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-sm font-bold text-slate-800 dark:text-slate-100">
                        {third?.username?.slice(0, 2).toUpperCase() || '3'}
                    </div>
                    <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-white truncate max-w-full hover:text-primary transition-colors">{third?.username || '---'}</div>
                    <div className="text-xs font-bold text-amber-700 dark:text-amber-500">{(third?.points || 0).toLocaleString()} pts</div>
                    <div className="mt-3 h-16 md:h-20 w-full rounded-t-lg bg-amber-700/15 border border-amber-700/30 flex items-end justify-center pb-2">
                        <span className="text-xs font-bold text-amber-700 dark:text-amber-500">#3</span>
                    </div>
                </div>
            </div>
        </section>
    );
}

function EmptyRoundsPanel({ title = 'No rounds played yet', subtitle }) {
    return (
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-surface-dark p-4 md:p-5">
            <div className="rounded-2xl border border-slate-200/70 dark:border-slate-700/70 bg-slate-50/60 dark:bg-slate-900/20 px-5 py-6 md:px-6 md:py-7">
                <div className="max-w-3xl flex items-start gap-4 md:gap-5">
                    <div className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
                        <span className="material-symbols-outlined text-[18px]">info</span>
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-[2rem] md:text-2xl font-bold leading-tight text-slate-900 dark:text-white">{title}</h3>
                        <p className="mt-2 max-w-[56ch] text-sm md:text-base leading-relaxed text-slate-500 dark:text-slate-400">{subtitle}</p>
                    </div>
                </div>
            </div>
        </section>
    );
}

export default function QuizPage() {
    const navigate = useNavigate();
    const resultsDateInputRef = useRef(null);

    const [nowMs, setNowMs] = useState(Date.now());
    const [tabOverride, setTabOverride] = useState('');
    const [mobileStandingsOpen, setMobileStandingsOpen] = useState(false);

    const [stateData, setStateData] = useState(null);
    const [stateLoading, setStateLoading] = useState(true);
    const [stateError, setStateError] = useState('');
    const [actionError, setActionError] = useState('');
    const [joining, setJoining] = useState(false);

    const [liveData, setLiveData] = useState(null);
    const [liveLoading, setLiveLoading] = useState(false);
    const [liveError, setLiveError] = useState('');
    const [standingsData, setStandingsData] = useState({ rows: [], your_row: null, total_participants: 0 });
    const [standingsError, setStandingsError] = useState('');
    const [feedback, setFeedback] = useState(null);
    const [submittingAnswer, setSubmittingAnswer] = useState(false);

    const [previewResults, setPreviewResults] = useState(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewError, setPreviewError] = useState('');

    const [resultsDate, setResultsDate] = useState('');
    const [resultsData, setResultsData] = useState(null);
    const [resultsLoading, setResultsLoading] = useState(false);
    const [resultsError, setResultsError] = useState('');
    const [wsConnected, setWsConnected] = useState(false);
    const [showRoundFinishedPopup, setShowRoundFinishedPopup] = useState(false);

    const wsRef = useRef(null);
    const wsReconnectRef = useRef(null);
    const wsRefreshTimerRef = useRef(null);
    const wsRoundIdRef = useRef(null);
    const roundDateRef = useRef('');
    const joinedRef = useRef(false);
    const activeTabRef = useRef(TAB_UPCOMING);
    const resultsDateRef = useRef('');
    const roundFinishTimerRef = useRef(null);
    const previousRoundPhaseRef = useRef('');
    const liveQuestionRef = useRef(null);

    const blockProtectedEvent = useCallback((event) => {
        event.preventDefault();
    }, []);

    useEffect(() => {
        const timerId = window.setInterval(() => setNowMs(Date.now()), 1000);
        return () => window.clearInterval(timerId);
    }, []);

    const round = stateData?.round || null;
    const roundPhase = round?.phase || 'upcoming';
    const roundDate = round?.round_date || '';
    const autoTab = phaseToTab(roundPhase);
    const joined = Boolean(stateData?.user?.joined);
    const safeAutoTab = autoTab === TAB_LIVE && !joined ? TAB_UPCOMING : autoTab;
    const activeTab = tabOverride || safeAutoTab;
    const joinEnabled = Boolean(stateData?.join_enabled);
    const questionCount = round?.questions_count || 20;
    const questionDuration = round?.question_duration_seconds || 10;
    const chipPhase = activeTab === TAB_UPCOMING
        ? 'upcoming'
        : activeTab === TAB_RESULTS
            ? 'results'
            : roundPhase;
    const chip = phaseChip(chipPhase);
    const firstOfficialLabel = toIstDateTimeLabel(stateData?.first_official_round_ist);
    const liveTabEnabled = joined && (roundPhase === 'join_open' || roundPhase === 'live');

    useEffect(() => {
        roundDateRef.current = roundDate;
    }, [roundDate]);

    useEffect(() => {
        joinedRef.current = joined;
    }, [joined]);

    useEffect(() => {
        activeTabRef.current = activeTab;
    }, [activeTab]);

    useEffect(() => {
        resultsDateRef.current = resultsDate;
    }, [resultsDate]);

    useEffect(() => {
        const protectionEnabled = activeTab === TAB_LIVE && roundPhase === 'live';
        if (!protectionEnabled || typeof document === 'undefined') return undefined;

        const clearSelection = () => {
            if (typeof window === 'undefined') return;
            const selection = window.getSelection?.();
            if (selection && selection.rangeCount > 0) {
                selection.removeAllRanges();
            }
        };

        const isWithinProtectedArea = (target) => {
            if (!liveQuestionRef.current) return false;
            return Boolean(target && liveQuestionRef.current.contains(target));
        };

        const blockIfProtected = (event) => {
            if (isWithinProtectedArea(event.target)) {
                event.preventDefault();
                clearSelection();
            }
        };

        const blockShortcuts = (event) => {
            const key = String(event.key || '').toLowerCase();
            const blockedCombo = (event.ctrlKey || event.metaKey) && ['a', 'c', 'x', 'u', 's', 'p'].includes(key);
            const blockedKey = key === 'f12';
            if (blockedCombo || blockedKey) {
                event.preventDefault();
            }
        };

        document.addEventListener('copy', blockIfProtected);
        document.addEventListener('cut', blockIfProtected);
        document.addEventListener('contextmenu', blockIfProtected);
        document.addEventListener('dragstart', blockIfProtected);
        document.addEventListener('selectstart', blockIfProtected);
        document.addEventListener('keydown', blockShortcuts);

        return () => {
            document.removeEventListener('copy', blockIfProtected);
            document.removeEventListener('cut', blockIfProtected);
            document.removeEventListener('contextmenu', blockIfProtected);
            document.removeEventListener('dragstart', blockIfProtected);
            document.removeEventListener('selectstart', blockIfProtected);
            document.removeEventListener('keydown', blockShortcuts);
        };
    }, [activeTab, roundPhase]);

    useEffect(() => {
        if (!tabOverride) return;
        if (tabOverride !== TAB_LIVE) return;
        if (liveTabEnabled) return;
        if (roundPhase === 'results') return;
        setTabOverride(TAB_UPCOMING);
    }, [liveTabEnabled, roundPhase, tabOverride]);

    const loadState = useCallback(async ({ silent = false } = {}) => {
        if (!silent) {
            setStateLoading(true);
        }
        try {
            const payload = await fetchDigiQuizState();
            setStateData(payload);
            setStateError('');
        } catch (error) {
            setStateError(parseApiError(error, 'Failed to load DigiQuiz state.'));
        } finally {
            if (!silent) {
                setStateLoading(false);
            }
        }
    }, []);

    useEffect(() => {
        loadState();
        const intervalId = window.setInterval(() => {
            loadState({ silent: true });
        }, STATE_POLL_MS);
        return () => window.clearInterval(intervalId);
    }, [loadState]);

    const loadPreviewResults = useCallback(async () => {
        setPreviewLoading(true);
        try {
            const payload = await fetchDigiQuizResults({ limit: 20 });
            setPreviewResults(payload);
            setPreviewError('');
        } catch (error) {
            setPreviewError(parseApiError(error, 'Failed to load yesterday leaderboard.'));
        } finally {
            setPreviewLoading(false);
        }
    }, []);

    useEffect(() => {
        loadPreviewResults();
    }, [loadPreviewResults]);

    const loadResults = useCallback(async (dateValue = '') => {
        setResultsLoading(true);
        try {
            const params = { limit: 100 };
            if (dateValue) {
                params.date = dateValue;
            }
            const payload = await fetchDigiQuizResults(params);
            setResultsData(payload);
            setResultsError('');
        } catch (error) {
            setResultsError(parseApiError(error, 'Failed to load quiz results.'));
        } finally {
            setResultsLoading(false);
        }
    }, []);

    const handleRoundFinishedTransition = useCallback((dateValue = '') => {
        if (activeTabRef.current !== TAB_LIVE) {
            return;
        }
        const targetDate = dateValue || roundDateRef.current || '';
        setShowRoundFinishedPopup(true);
        if (roundFinishTimerRef.current) {
            window.clearTimeout(roundFinishTimerRef.current);
        }
        roundFinishTimerRef.current = window.setTimeout(async () => {
            roundFinishTimerRef.current = null;
            setShowRoundFinishedPopup(false);
            if (targetDate) {
                setResultsDate(targetDate);
            }
            setTabOverride(TAB_RESULTS);
            await loadResults(targetDate);
        }, ROUND_FINISHED_POPUP_MS);
    }, [loadResults]);

    useEffect(() => () => {
        if (roundFinishTimerRef.current) {
            window.clearTimeout(roundFinishTimerRef.current);
            roundFinishTimerRef.current = null;
        }
    }, []);

    useEffect(() => {
        const previousPhase = previousRoundPhaseRef.current;
        if (previousPhase && previousPhase !== 'results' && roundPhase === 'results') {
            handleRoundFinishedTransition(roundDate);
        }
        previousRoundPhaseRef.current = roundPhase;
    }, [roundPhase, roundDate, handleRoundFinishedTransition]);

    useEffect(() => {
        if (activeTab !== TAB_RESULTS) {
            return;
        }
        loadResults(resultsDate);
    }, [activeTab, loadResults, resultsDate]);

    const loadLiveQuestion = useCallback(async (dateValue, { silent = false } = {}) => {
        if (!dateValue || !joined) {
            setLiveData(null);
            return;
        }
        if (!silent) {
            setLiveLoading(true);
        }
        try {
            const payload = await fetchDigiQuizLiveQuestion({ round_date: dateValue });
            setLiveData(payload);
            setLiveError('');
        } catch (error) {
            setLiveError(parseApiError(error, 'Failed to load live question.'));
        } finally {
            if (!silent) {
                setLiveLoading(false);
            }
        }
    }, [joined]);

    const loadStandings = useCallback(async (dateValue, { silent = false } = {}) => {
        if (!dateValue) {
            return;
        }
        try {
            const payload = await fetchDigiQuizLiveStandings({ date: dateValue, limit: 50 });
            setStandingsData(payload);
            setStandingsError('');
        } catch (error) {
            if (!silent) {
                setStandingsError(parseApiError(error, 'Failed to load live standings.'));
            }
        }
    }, []);

    const scheduleWebsocketRefresh = useCallback(({ includeResults = false } = {}) => {
        if (wsRefreshTimerRef.current) {
            return;
        }
        wsRefreshTimerRef.current = window.setTimeout(async () => {
            wsRefreshTimerRef.current = null;
            const currentDate = roundDateRef.current;
            await loadState({ silent: true });
            if (currentDate) {
                await loadStandings(currentDate, { silent: true });
                if (joinedRef.current) {
                    await loadLiveQuestion(currentDate, { silent: true });
                }
            }
            if (includeResults && activeTabRef.current === TAB_RESULTS) {
                await loadResults(resultsDateRef.current || currentDate || '');
            }
        }, 120);
    }, [loadLiveQuestion, loadResults, loadStandings, loadState]);

    useEffect(() => {
        const roundId = round?.id;
        if (!roundId) {
            setWsConnected(false);
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
            if (wsReconnectRef.current) {
                clearTimeout(wsReconnectRef.current);
                wsReconnectRef.current = null;
            }
            return undefined;
        }

        wsRoundIdRef.current = roundId;
        let cancelled = false;

        const connect = () => {
            if (cancelled) return;
            const token = tokenStorage.get();
            const ws = new WebSocket(buildWsUrl(`/ws/quiz/round/${roundId}/`, token));
            wsRef.current = ws;

            ws.onopen = () => {
                if (cancelled || wsRoundIdRef.current !== roundId) {
                    ws.close();
                    return;
                }
                setWsConnected(true);
            };

            ws.onmessage = (event) => {
                if (cancelled || wsRoundIdRef.current !== roundId) return;
                try {
                    const payload = JSON.parse(event.data);
                    const eventType = payload?.type;
                    if (!eventType) return;
                    if (eventType === 'round_finalized') {
                        handleRoundFinishedTransition(roundDateRef.current);
                        scheduleWebsocketRefresh({ includeResults: true });
                        return;
                    }
                    if (eventType === 'participant_joined' || eventType === 'answer_submitted') {
                        scheduleWebsocketRefresh({ includeResults: false });
                        return;
                    }
                    scheduleWebsocketRefresh({ includeResults: false });
                } catch {
                    // ignore malformed payloads
                }
            };

            ws.onclose = () => {
                if (cancelled || wsRoundIdRef.current !== roundId) return;
                setWsConnected(false);
                if (!wsReconnectRef.current) {
                    wsReconnectRef.current = setTimeout(() => {
                        wsReconnectRef.current = null;
                        if (!cancelled && wsRoundIdRef.current === roundId) {
                            connect();
                        }
                    }, 2000);
                }
            };

            ws.onerror = () => {
                if (cancelled || wsRoundIdRef.current !== roundId) return;
                setWsConnected(false);
            };
        };

        connect();

        return () => {
            cancelled = true;
            setWsConnected(false);
            if (wsReconnectRef.current) {
                clearTimeout(wsReconnectRef.current);
                wsReconnectRef.current = null;
            }
            if (wsRefreshTimerRef.current) {
                clearTimeout(wsRefreshTimerRef.current);
                wsRefreshTimerRef.current = null;
            }
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
        };
    }, [round?.id, scheduleWebsocketRefresh, handleRoundFinishedTransition]);

    useEffect(() => {
        if (activeTab !== TAB_LIVE || !roundDate) {
            return;
        }
        loadStandings(roundDate);
        if (joined) {
            loadLiveQuestion(roundDate);
        } else {
            setLiveData(null);
        }

        const standingsTimer = window.setInterval(() => {
            loadStandings(roundDate, { silent: true });
        }, STANDINGS_POLL_MS);

        const liveTimer = window.setInterval(() => {
            if (joined) {
                loadLiveQuestion(roundDate, { silent: true });
            }
        }, LIVE_POLL_MS);

        return () => {
            window.clearInterval(standingsTimer);
            window.clearInterval(liveTimer);
        };
    }, [activeTab, joined, loadLiveQuestion, loadStandings, roundDate]);

    useEffect(() => {
        setFeedback(null);
    }, [liveData?.question?.question_no]);

    const handleJoinRound = async () => {
        if (!roundDate || !joinEnabled || joined || joining) {
            return;
        }
        setJoining(true);
        setActionError('');
        try {
            await joinDigiQuizRound({ round_date: roundDate });
            await loadState({ silent: true });
            await Promise.all([
                loadStandings(roundDate, { silent: true }),
                loadLiveQuestion(roundDate, { silent: true }),
            ]);
            setTabOverride(TAB_LIVE);
        } catch (error) {
            setActionError(parseApiError(error, 'Failed to join round.'));
        } finally {
            setJoining(false);
        }
    };

    const handleAnswer = async (optionIndex) => {
        const question = liveData?.question;
        if (!roundDate || !question || question.answered || submittingAnswer || roundPhase !== 'live') {
            return;
        }
        setSubmittingAnswer(true);
        setActionError('');
        try {
            const payload = await submitDigiQuizAnswer({
                round_date: roundDate,
                question_no: question.question_no,
                selected_index: optionIndex,
            });
            setFeedback({
                points: payload?.answer?.points || 0,
                correct: Boolean(payload?.answer?.is_correct),
            });
            await Promise.all([
                loadState({ silent: true }),
                loadStandings(roundDate, { silent: true }),
                loadLiveQuestion(roundDate, { silent: true }),
            ]);
        } catch (error) {
            setActionError(parseApiError(error, 'Failed to submit answer.'));
        } finally {
            setSubmittingAnswer(false);
        }
    };

    const openResultsDatePicker = () => {
        const input = resultsDateInputRef.current;
        if (!input) return;
        if (typeof input.showPicker === 'function') {
            input.showPicker();
            return;
        }
        input.focus({ preventScroll: true });
        input.click();
    };

    const openResultsForDate = (dateValue) => {
        if (dateValue) {
            setResultsDate(dateValue);
        }
        setTabOverride(TAB_RESULTS);
    };

    const previewRound = previewResults?.round || null;
    const previewRows = previewResults?.rows || [];
    const previewPodium = previewResults?.podium || [];
    const previewLabel = toIsoDateLabel(previewRound?.round_date);
    const hasFinishedRounds = Boolean(previewRound?.round_date);

    const liveQuestion = liveData?.question || null;
    const currentQuestionNo = liveQuestion?.question_no || round?.current_question_no || 0;
    const progressPercent = questionCount > 0
        ? Math.round((Math.min(currentQuestionNo, questionCount) / questionCount) * 100)
        : 0;
    const secondsLeft = liveQuestion?.ends_at
        ? secondsUntil(liveQuestion.ends_at, nowMs)
        : Math.max(0, liveQuestion?.seconds_left || 0);
    const timerRatio = Math.max(0, Math.min(1, questionDuration > 0 ? secondsLeft / questionDuration : 0));
    const timerCircumference = 2 * Math.PI * 22;
    const timerOffset = timerCircumference * (1 - timerRatio);

    const yourStanding = standingsData?.your_row || null;
    const yourRank = yourStanding?.rank || stateData?.user?.rank || '-';
    const yourPoints = yourStanding?.points ?? stateData?.user?.points ?? 0;

    const resultRows = resultsData?.rows || [];
    const resultPodium = resultsData?.podium || [];
    const resultRoundDate = resultsData?.round?.round_date || '';
    const hasResultData = resultRows.length > 0;

    const countdownSeconds = roundPhase === 'results'
        ? Math.max(0, Number(round?.countdown_seconds) || 0)
        : secondsUntil(round?.start_at, nowMs);
    const countdownToStart = splitClock(countdownSeconds);
    const lobbySeconds = secondsUntil(round?.start_at, nowMs);
    const resultsMinDate = RESULTS_DATE_MIN;
    const fallbackToday = new Date(nowMs).toISOString().slice(0, 10);
    const resultsMaxDate = roundDate || fallbackToday;
    const effectiveResultsDate = resultsDate || resultRoundDate || '';
    const safeResultsDateValue = (
        effectiveResultsDate
        && effectiveResultsDate >= resultsMinDate
        && effectiveResultsDate <= resultsMaxDate
    ) ? effectiveResultsDate : resultsMaxDate;
    const resultsDateLabel = safeResultsDateValue ? toIsoDateLabel(safeResultsDateValue) : 'Select date';

    const renderUpcoming = () => (
        <div className="space-y-5">
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-surface-dark p-4 md:p-5 lg:p-6 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/12 via-transparent to-transparent pointer-events-none" />
                <div className="absolute -top-24 -right-20 size-72 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
                <div className="relative z-10 grid grid-cols-1 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)] gap-4 items-center">
                    <div className="text-center xl:text-left">
                        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary text-[11px] font-semibold uppercase tracking-wide">
                            <span className="material-symbols-outlined text-[14px]">schedule</span>
                            Upcoming Round
                        </div>
                        <h1 className="mt-3 text-2xl md:text-3xl font-bold text-slate-900 dark:text-white leading-tight">
                            Next Quiz Starts at <span className="text-primary">23:30 IST</span>
                        </h1>
                        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 max-w-2xl mx-auto xl:mx-0">
                            Join from 23:20 IST, wait in lobby, and the 20-question live round starts exactly at 23:30 IST.
                        </p>
                        <div className="mt-4">
                            <button
                                type="button"
                                onClick={() => {
                                    if (joined && (roundPhase === 'join_open' || roundPhase === 'live')) {
                                        setTabOverride(TAB_LIVE);
                                        return;
                                    }
                                    handleJoinRound();
                                }}
                                disabled={joining || (!(joinEnabled && !joined) && !(joined && (roundPhase === 'join_open' || roundPhase === 'live')))}
                                className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                                    (joinEnabled && !joined) || (joined && (roundPhase === 'join_open' || roundPhase === 'live'))
                                        ? 'border-primary/40 bg-primary text-white hover:bg-primary/90'
                                        : 'border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                                }`}
                            >
                                {joining
                                    ? 'Joining...'
                                    : joined && (roundPhase === 'join_open' || roundPhase === 'live')
                                        ? 'Quiz In Progress Join'
                                        : (joinEnabled ? 'Join Quiz' : 'Join Opens at 23:20 IST')}
                            </button>
                        </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/45 p-3 md:p-4">
                        <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Round Begins In</div>
                        <div className="mt-2 grid grid-cols-3 gap-2">
                            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/65 p-2.5 text-center">
                                <div className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white font-mono">{countdownToStart.hours}</div>
                                <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 mt-1">Hours</div>
                            </div>
                            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/65 p-2.5 text-center">
                                <div className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white font-mono">{countdownToStart.minutes}</div>
                                <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 mt-1">Min</div>
                            </div>
                            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/65 p-2.5 text-center">
                                <div className="text-xl md:text-2xl font-bold text-primary font-mono">{countdownToStart.seconds}</div>
                                <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 mt-1">Sec</div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-surface-dark overflow-hidden">
                <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                    <h2 className="text-lg font-bold flex items-center gap-2">
                        <span className="material-symbols-outlined text-yellow-500">trophy</span>
                        Yesterday&apos;s Leaderboard
                    </h2>
                    <div className="flex items-center gap-3">
                        <span className="hidden sm:inline text-xs text-slate-500 dark:text-slate-400">
                            {hasFinishedRounds ? previewLabel : 'No rounds yet'}
                        </span>
                        <button
                            type="button"
                            className="text-sm font-semibold text-primary hover:underline"
                            onClick={() => openResultsForDate(previewRound?.round_date)}
                        >
                            View Full
                        </button>
                    </div>
                </div>

                <div className="p-4 md:p-5 space-y-5">
                    {previewLoading ? (
                        <div className="text-sm text-slate-500 dark:text-slate-400">Loading leaderboard...</div>
                    ) : null}
                    {previewError ? (
                        <div className="text-sm text-red-500">{previewError}</div>
                    ) : null}
                    {!previewLoading && !previewError && hasFinishedRounds ? <Podium podium={previewPodium} onPlayerClick={(u) => navigate(`/profile/${u}`)} /> : null}
                    {!previewLoading && !previewError && !hasFinishedRounds ? (
                        <EmptyRoundsPanel
                            title="No rounds played yet"
                            subtitle={`Round history will appear here after the first completed DigiQuiz round (${firstOfficialLabel}).`}
                        />
                    ) : null}

                    {!previewLoading && !previewError && hasFinishedRounds ? (
                        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-surface-dark overflow-hidden">
                            <div className="max-h-[40vh] overflow-y-auto no-scrollbar">
                                <table className="w-full text-left border-collapse">
                                    <thead className="sticky top-0 z-10">
                                        <tr className="bg-slate-50 dark:bg-slate-900/95 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wide">
                                            <th className="px-4 py-3 font-bold">Rank</th>
                                            <th className="px-4 py-3 font-bold">Player</th>
                                            <th className="px-4 py-3 font-bold hidden sm:table-cell">Accuracy</th>
                                            <th className="px-4 py-3 font-bold hidden md:table-cell">Time</th>
                                            <th className="px-4 py-3 font-bold text-right">Points</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                                        {previewRows.map((row) => (
                                            <tr key={`${row.rank}-${row.user_id}`} className={`cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors ${row.rank <= 3 ? 'bg-slate-50/40 dark:bg-slate-900/30' : ''}`} onClick={() => navigate(`/profile/${row.username}`)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && navigate(`/profile/${row.username}`)}>
                                                <td className="px-4 py-3 font-bold text-slate-500 dark:text-slate-400">{rankCell(row.rank)}</td>
                                                <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200 hover:text-primary transition-colors">{row.username}</td>
                                                <td className="px-4 py-3 hidden sm:table-cell text-slate-500 dark:text-slate-400">{typeof row.accuracy === 'number' ? `${Math.round(row.accuracy)}%` : '--'}</td>
                                                <td className="px-4 py-3 hidden md:table-cell text-slate-500 dark:text-slate-400">{formatAnswerTime(row.total_answer_time_ms)}</td>
                                                <td className="px-4 py-3 text-right font-bold text-primary">{(row.points || 0).toLocaleString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    ) : null}
                </div>
            </section>
        </div>
    );

    const renderLiveMainPanel = () => {
        if (!joined) {
            return (
                <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-surface-dark p-5 md:p-6 space-y-3">
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">Join required</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        Live page unlocks after you press <strong>Join Quiz</strong> during the join window (from 23:20 IST) or while the round is in progress.
                    </p>
                    <button
                        type="button"
                        className="px-4 py-2 rounded-lg text-sm font-semibold border border-primary/30 text-primary hover:bg-primary/10"
                        onClick={() => setTabOverride(TAB_UPCOMING)}
                    >
                        Go to Upcoming
                    </button>
                </section>
            );
        }

        if (roundPhase === 'join_open') {
            const lobbyClock = splitClock(lobbySeconds);
            return (
                <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-surface-dark p-4 md:p-5 space-y-4">
                    <div className="text-[11px] uppercase tracking-wide text-primary font-semibold">Lobby Open</div>
                    <h2 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white">Round starts in {lobbyClock.minutes}:{lobbyClock.seconds}</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        You are in the lobby. Stay on this page. Question 1 begins exactly at 23:30 IST.
                    </p>
                </section>
            );
        }

        if (roundPhase === 'upcoming') {
            return (
                <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-surface-dark p-4 md:p-5">
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">Live lobby opens at 23:20 IST</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                        You can join this round at 23:20 IST, then wait in lobby until question 1 starts at 23:30 IST.
                    </p>
                    <button
                        type="button"
                        className="mt-3 px-4 py-2 rounded-lg text-sm font-semibold border border-primary/30 text-primary hover:bg-primary/10"
                        onClick={() => setTabOverride(TAB_UPCOMING)}
                    >
                        Back to Upcoming
                    </button>
                </section>
            );
        }

        if (roundPhase === 'results') {
            if (!hasFinishedRounds) {
                return (
                    <EmptyRoundsPanel
                        title="No rounds played yet"
                        subtitle={`Live standings will appear here after the first completed round (${firstOfficialLabel}).`}
                    />
                );
            }
            return (
                <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-surface-dark p-4 md:p-5">
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">Round finished</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Check the results tab for final rankings.</p>
                    <button
                        type="button"
                        className="mt-3 px-4 py-2 rounded-lg text-sm font-semibold border border-primary/30 text-primary hover:bg-primary/10"
                        onClick={() => setTabOverride(TAB_RESULTS)}
                    >
                        View Results
                    </button>
                </section>
            );
        }

        return (
            <section
                ref={liveQuestionRef}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-surface-dark p-4 md:p-5 space-y-3 select-none"
                onCopy={blockProtectedEvent}
                onCut={blockProtectedEvent}
                onPaste={blockProtectedEvent}
                onContextMenu={blockProtectedEvent}
                onDragStart={blockProtectedEvent}
                onSelectStart={blockProtectedEvent}
            >
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <div className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400 font-semibold">
                            Question {Math.min(currentQuestionNo || 1, questionCount)}/{questionCount}
                        </div>
                        <div className="mt-2 h-3 w-60 max-w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                            <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${progressPercent}%` }} />
                        </div>
                    </div>
                    <div className="relative size-16">
                        <svg viewBox="0 0 52 52" className="size-full -rotate-90">
                            <circle cx="26" cy="26" r="22" strokeWidth="4" className="fill-none stroke-slate-200 dark:stroke-slate-800" />
                            <circle
                                cx="26"
                                cy="26"
                                r="22"
                                strokeWidth="4"
                                className="fill-none stroke-primary transition-all duration-500"
                                strokeLinecap="round"
                                strokeDasharray={timerCircumference}
                                strokeDashoffset={timerOffset}
                            />
                        </svg>
                        <span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-slate-900 dark:text-white">{secondsLeft}s</span>
                    </div>
                </div>

                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-3">
                    <div className="flex items-start justify-between gap-3">
                        <h2 className="text-lg md:text-2xl font-bold text-slate-900 dark:text-white leading-snug">
                            {liveLoading ? 'Loading question...' : (liveQuestion?.question || 'Waiting for question...')}
                        </h2>
                        {(feedback || liveQuestion?.answered) ? (
                            <span
                                className={`shrink-0 rounded-md border px-2 py-1 text-xs font-extrabold ${
                                    (feedback?.points ?? liveQuestion?.points ?? 0) >= 0
                                        ? 'bg-green-500/10 border-green-500/35 text-green-500'
                                        : 'bg-red-500/10 border-red-500/35 text-red-500'
                                }`}
                            >
                                {(feedback?.points ?? liveQuestion?.points ?? 0) > 0
                                    ? `+${feedback?.points ?? liveQuestion?.points ?? 0}`
                                    : (feedback?.points ?? liveQuestion?.points ?? 0)}
                            </span>
                        ) : null}
                    </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-2.5">
                    {(liveQuestion?.options || []).map((option, index) => {
                        const answered = Boolean(liveQuestion?.answered);
                        const selectedIndex = liveQuestion?.selected_index;
                        const correctIndex = liveQuestion?.correct_index;
                        const isCorrect = index === correctIndex;
                        const isChosen = index === selectedIndex;
                        let optionStyle = 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-primary/50';
                        if (answered && isCorrect) {
                            optionStyle = 'border-green-500/40 bg-green-500/10';
                        } else if (answered && isChosen && !isCorrect) {
                            optionStyle = 'border-red-500/40 bg-red-500/10';
                        }
                        return (
                            <button
                                key={`${index}-${option}`}
                                type="button"
                                className={`w-full min-h-14 rounded-xl border p-2.5 md:p-3 text-left flex items-center gap-3 transition-colors ${optionStyle}`}
                                onClick={() => handleAnswer(index)}
                                disabled={answered || submittingAnswer || liveLoading}
                            >
                                <span className="size-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-slate-500 dark:text-slate-300 shrink-0">
                                    {optionLabel(index)}
                                </span>
                                <span className="text-base md:text-lg font-semibold text-slate-800 dark:text-slate-100">{option}</span>
                                {answered && isCorrect ? (
                                    <span className="material-symbols-outlined ml-auto text-green-500">check_circle</span>
                                ) : null}
                            </button>
                        );
                    })}
                </div>
            </section>
        );
    };

    const renderLive = () => (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_520px] gap-4 items-start">
            <div className="space-y-3">
                {renderLiveMainPanel()}
                <div className="lg:hidden">
                    <button
                        type="button"
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-surface-dark px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center justify-center gap-2"
                        onClick={() => setMobileStandingsOpen(true)}
                    >
                        <span className="material-symbols-outlined text-[18px] text-yellow-500">trophy</span>
                        View Live Standings
                    </button>
                </div>
                {liveError ? <div className="text-sm text-red-500">{liveError}</div> : null}
                {standingsError ? <div className="text-sm text-red-500">{standingsError}</div> : null}
            </div>

            <aside className="hidden lg:flex lg:sticky lg:top-[148px] lg:max-h-[calc(100dvh-188px)] flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-surface-dark overflow-hidden">
                <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <span className="material-symbols-outlined text-yellow-500">trophy</span>
                        Live Standings
                    </h3>
                    <span className={`text-[10px] uppercase tracking-wide px-2 py-1 rounded border ${wsConnected ? 'bg-primary/10 text-primary border-primary/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>
                        {wsConnected ? 'Live' : 'Syncing'}
                    </span>
                </div>
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/70 px-3 py-2">
                        <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Your Rank</div>
                        <div className="text-base font-bold text-primary">#{yourRank}</div>
                    </div>
                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/70 px-3 py-2">
                        <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Your Points</div>
                        <div className="text-base font-bold text-primary">{Number(yourPoints || 0).toLocaleString()}</div>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto no-scrollbar">
                    <StandingsTable
                        rows={standingsData?.rows || []}
                        yourRow={standingsData?.your_row || null}
                        questionCount={questionCount}
                        onPlayerClick={(u) => navigate(`/profile/${u}`)}
                    />
                </div>
            </aside>
        </div>
    );

    const renderResults = () => (
        <div className="space-y-4">
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-surface-dark p-4 md:p-5">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">DigiQuiz Leaderboard</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Browse past round standings by date.</p>
                    </div>
                    <div className="relative">
                        <button
                            type="button"
                            onClick={openResultsDatePicker}
                            aria-label="Select results date"
                            className="inline-flex h-10 min-w-[0] items-center justify-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900/70 px-3 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:border-primary/50 hover:text-primary transition-colors cursor-pointer"
                        >
                            <span className="material-symbols-outlined text-[18px]">calendar_month</span>
                            <span>{resultsDateLabel}</span>
                        </button>
                        <input
                            ref={resultsDateInputRef}
                            type="date"
                            min={resultsMinDate}
                            max={resultsMaxDate}
                            value={safeResultsDateValue}
                            onChange={(event) => setResultsDate(event.target.value)}
                            className="absolute -z-10 h-0 w-0 opacity-0 pointer-events-none"
                            aria-label="Select results date"
                        />
                    </div>
                </div>
            </section>

            {resultsLoading ? (
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-surface-dark p-5 text-sm text-slate-500 dark:text-slate-400">
                    Loading results...
                </div>
            ) : null}

            {resultsError ? (
                <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-500">
                    {resultsError}
                </div>
            ) : null}

            {!resultsLoading && !resultsError && resultsData?.round ? <Podium podium={resultPodium} onPlayerClick={(u) => navigate(`/profile/${u}`)} /> : null}

            {!resultsLoading && !resultsError && !resultsData?.round && !hasFinishedRounds ? (
                <EmptyRoundsPanel
                    title="No rounds played yet"
                    subtitle={`Results and rankings will be available after the first completed round (${firstOfficialLabel}).`}
                />
            ) : null}

            {resultsData?.round ? (
                <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-surface-dark overflow-hidden">
                    <div className="p-4 border-b border-slate-200 dark:border-slate-800">
                        <h3 className="font-bold text-lg">Full Rankings</h3>
                    </div>
                    <div className="max-h-[52vh] overflow-y-auto overflow-x-auto no-scrollbar">
                        <table className="w-full text-left border-collapse">
                            <thead className="sticky top-0 z-10">
                                <tr className="bg-slate-50 dark:bg-slate-900/95 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wide">
                                    <th className="px-4 py-3 font-bold">Rank</th>
                                    <th className="px-4 py-3 font-bold">Player</th>
                                    <th className="px-4 py-3 font-bold hidden sm:table-cell">Accuracy</th>
                                    <th className="px-4 py-3 font-bold hidden md:table-cell">Time</th>
                                    <th className="px-4 py-3 font-bold text-right">Points</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                                {hasResultData ? resultRows.map((row) => {
                                    const isYou = resultsData?.your_row?.user_id && row.user_id === resultsData.your_row.user_id;
                                    return (
                                        <tr
                                            key={`${row.rank}-${row.user_id}`}
                                            className={`cursor-pointer transition-colors ${isYou ? 'bg-primary/10 border-l-2 border-primary' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'}`}
                                            onClick={() => navigate(`/profile/${row.username}`)}
                                            role="button"
                                            tabIndex={0}
                                            onKeyDown={(e) => e.key === 'Enter' && navigate(`/profile/${row.username}`)}
                                        >
                                            <td className={`px-4 py-3 font-bold ${isYou ? 'text-primary' : 'text-slate-500 dark:text-slate-400'}`}>{rankCell(row.rank)}</td>
                                            <td className={`px-4 py-3 font-medium hover:text-primary transition-colors ${isYou ? 'text-slate-900 dark:text-white' : 'text-slate-800 dark:text-slate-200'}`}>{row.username}</td>
                                            <td className="px-4 py-3 hidden sm:table-cell text-slate-500 dark:text-slate-400">{typeof row.accuracy === 'number' ? `${Math.round(row.accuracy)}%` : '--'}</td>
                                            <td className="px-4 py-3 hidden md:table-cell text-slate-500 dark:text-slate-400">{formatAnswerTime(row.total_answer_time_ms)}</td>
                                            <td className="px-4 py-3 text-right font-bold text-primary">{(row.points || 0).toLocaleString()}</td>
                                        </tr>
                                    );
                                }) : (
                                    <tr>
                                        <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                                            No participants for this round yet.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>
            ) : null}
        </div>
    );

    return (
        <Layout showHeader={false}>
            <div className="flex-1 overflow-y-auto pb-24 no-scrollbar">
                <header className="sticky top-0 z-30 bg-gradient-to-b from-background-light/95 to-background-light/90 dark:from-background-dark/95 dark:to-background-dark/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-sm">
                    <div className="px-4 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary">quiz</span>
                            <h1 className="text-lg font-bold">DigiQuiz</h1>
                        </div>
                        <div className={`text-xs px-2 py-1 rounded-full border ${chip.className}`}>{chip.label}</div>
                    </div>
                    <div className="px-4 pb-3">
                        <div className="mt-1 flex items-center gap-2 overflow-x-auto no-scrollbar">
                            {QUIZ_TABS.map((tab) => {
                                const isLiveTab = tab.id === TAB_LIVE;
                                const tabEnabled = isLiveTab ? liveTabEnabled : true;
                                const isActive = activeTab === tab.id;
                                return (
                                    <button
                                        key={tab.id}
                                        type="button"
                                        className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                                            isActive
                                                ? 'bg-primary text-white shadow-md shadow-primary/25'
                                                : tabEnabled
                                                    ? 'bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                                                    : 'bg-slate-100 dark:bg-slate-900/70 text-slate-400 dark:text-slate-500 cursor-not-allowed opacity-75'
                                        }`}
                                        onClick={() => {
                                            if (!tabEnabled) return;
                                            setTabOverride(tab.id);
                                        }}
                                        disabled={!tabEnabled}
                                        title={isLiveTab && !tabEnabled ? 'Join Quiz first to access live page' : tab.label}
                                    >
                                        <span
                                            className={`material-symbols-outlined leading-none ${
                                                tab.id === TAB_LIVE ? 'text-[12px]' : 'text-[16px]'
                                            } ${isActive ? 'text-white' : tab.iconClass}`}
                                        >
                                            {tab.icon}
                                        </span>
                                        {tab.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </header>

                <div className={activeTab === TAB_LIVE
                    ? 'px-4 py-3 md:px-6'
                    : 'px-4 py-4 md:px-6 space-y-4'}
                >
                    {stateLoading ? (
                        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-surface-dark p-5 text-sm text-slate-500 dark:text-slate-400">
                            Loading DigiQuiz...
                        </div>
                    ) : null}
                    {stateError ? (
                        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-500">
                            {stateError}
                        </div>
                    ) : null}
                    {actionError ? (
                        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-500">
                            {actionError}
                        </div>
                    ) : null}

                    {!stateLoading && !stateError && activeTab === TAB_UPCOMING ? renderUpcoming() : null}
                    {!stateLoading && !stateError && activeTab === TAB_LIVE ? renderLive() : null}
                    {!stateLoading && !stateError && activeTab === TAB_RESULTS ? renderResults() : null}
                </div>
            </div>

            {showRoundFinishedPopup ? (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 px-4">
                    <div className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-surface-dark p-6 text-center shadow-2xl">
                        <div className="mx-auto mb-3 inline-flex size-12 items-center justify-center rounded-full bg-primary/15 text-primary">
                            <span className="material-symbols-outlined">emoji_events</span>
                        </div>
                        <h3 className="text-xl font-bold text-slate-900 dark:text-white">Round Finished</h3>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                            Preparing today&apos;s results...
                        </p>
                    </div>
                </div>
            ) : null}

            {activeTab === TAB_LIVE && mobileStandingsOpen ? (
                <div className="lg:hidden fixed inset-0 z-[70]">
                    <button
                        type="button"
                        className="absolute inset-0 bg-black/50"
                        onClick={() => setMobileStandingsOpen(false)}
                        aria-label="Close standings"
                    />
                    <div className="absolute bottom-0 left-0 right-0 h-[82dvh] max-h-[82dvh] rounded-t-2xl bg-white dark:bg-surface-dark border-t border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
                        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                            <h3 className="font-bold text-slate-900 dark:text-white">Live Round Standings</h3>
                            <button
                                type="button"
                                className="size-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
                                onClick={() => setMobileStandingsOpen(false)}
                            >
                                <span className="material-symbols-outlined text-[18px]">close</span>
                            </button>
                        </div>
                        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 grid grid-cols-2 gap-2">
                            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/70 px-3 py-2">
                                <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Your Rank</div>
                                <div className="text-base font-bold text-primary">#{yourRank}</div>
                            </div>
                            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/70 px-3 py-2">
                                <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Your Points</div>
                                <div className="text-base font-bold text-primary">{Number(yourPoints || 0).toLocaleString()}</div>
                            </div>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y no-scrollbar pb-[calc(env(safe-area-inset-bottom)+8px)]">
                            <StandingsTable
                                rows={standingsData?.rows || []}
                                yourRow={standingsData?.your_row || null}
                                questionCount={questionCount}
                                compact
                                onPlayerClick={(u) => navigate(`/profile/${u}`)}
                            />
                        </div>
                    </div>
                </div>
            ) : null}
        </Layout>
    );
}
