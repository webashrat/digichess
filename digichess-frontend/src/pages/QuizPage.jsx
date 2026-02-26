
import React, { useCallback, useEffect, useRef, useState } from 'react';
import Layout from '../components/layout/Layout';

const PHASE_LOCKED = 'locked';
const PHASE_LIVE = 'live';
const PHASE_RESULTS = 'results';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const ROUND_START_SECONDS = (23 * 60 * 60) + (30 * 60);
const DEMO_LIVE_WINDOW_SECONDS = 40 * 60;

const SAMPLE_QUESTION = {
    tag: 'science/chemistry',
    question: 'What is the chemical symbol for Lead?',
    options: ['Pb', 'Kr', 'Be', 'Cm'],
    answer_index: 0,
};

const LIVE_STANDINGS = [
    { rank: 1, username: 'GrandMaster_T', points: 1240, progress: 7 },
    { rank: 2, username: 'ChessWiz99', points: 1185, progress: 7 },
    { rank: 3, username: 'RookTakesAll', points: 1150, progress: 6 },
    { rank: 14, username: 'You', points: 895, progress: 14, isYou: true },
    { rank: 15, username: 'PawnStar', points: 880, progress: 13 },
    { rank: 16, username: 'KnightMoves', points: 872, progress: 13 },
    { rank: 17, username: 'BishopToE5', points: 850, progress: 12 },
    { rank: 18, username: 'QueenGambit', points: 845, progress: 13 },
    { rank: 19, username: 'CheckMate_88', points: 830, progress: 12 },
    { rank: 20, username: 'EndGamePro', points: 810, progress: 13 },
];

const RESULTS_CALENDAR_MIN = '2023-10-01';
const RESULTS_CALENDAR_MAX = '2023-10-31';

const RESULTS_BY_DAY = {
    2: {
        dateLabel: 'October 2, 2023',
        stats: { score: 2140, correct: '16/20', totalTime: '14m 09s' },
        rows: [
            { rank: 1, username: 'QueenGambit', accuracy: '94%', time: '12m 02s', points: 3010 },
            { rank: 2, username: 'GrandMasterFlash', accuracy: '92%', time: '12m 29s', points: 2890 },
            { rank: 3, username: 'RookAndRoll', accuracy: '90%', time: '13m 02s', points: 2715 },
            { rank: 4, username: 'BishopTakesKnight', accuracy: '90%', time: '13m 22s', points: 2640 },
            { rank: 5, username: 'CheckMateKing', accuracy: '87%', time: '14m 50s', points: 2460 },
            { rank: 6, username: 'You', accuracy: '80%', time: '14m 09s', points: 2140, isYou: true },
        ],
    },
    3: {
        dateLabel: 'October 3, 2023',
        stats: { score: 2285, correct: '17/20', totalTime: '13m 47s' },
        rows: [
            { rank: 1, username: 'PawnStar', accuracy: '95%', time: '11m 39s', points: 3065 },
            { rank: 2, username: 'QueenGambit', accuracy: '93%', time: '12m 11s', points: 2945 },
            { rank: 3, username: 'GrandMasterFlash', accuracy: '92%', time: '12m 34s', points: 2810 },
            { rank: 4, username: 'SicilianPro', accuracy: '89%', time: '13m 44s', points: 2590 },
            { rank: 5, username: 'You', accuracy: '85%', time: '13m 47s', points: 2285, isYou: true },
            { rank: 6, username: 'AnnaChess', accuracy: '83%', time: '14m 13s', points: 2190 },
        ],
    },
    4: {
        dateLabel: 'October 4, 2023',
        stats: { score: 2410, correct: '18/20', totalTime: '12m 58s' },
        rows: [
            { rank: 1, username: 'GrandMasterFlash', accuracy: '96%', time: '11m 31s', points: 3125 },
            { rank: 2, username: 'QueenGambit', accuracy: '94%', time: '11m 55s', points: 2980 },
            { rank: 3, username: 'PawnStar', accuracy: '92%', time: '12m 41s', points: 2790 },
            { rank: 4, username: 'You', accuracy: '88%', time: '12m 58s', points: 2410, isYou: true },
            { rank: 5, username: 'RookAndRoll', accuracy: '87%', time: '13m 12s', points: 2365 },
            { rank: 6, username: 'BishopTakesKnight', accuracy: '85%', time: '14m 00s', points: 2240 },
        ],
    },
    5: {
        dateLabel: 'October 5, 2023',
        stats: { score: 2350, correct: '17/20', totalTime: '13m 22s' },
        rows: [
            { rank: 1, username: 'GrandMasterFlash', accuracy: '95%', time: '11m 58s', points: 3100 },
            { rank: 2, username: 'QueenGambit', accuracy: '93%', time: '12m 30s', points: 2850 },
            { rank: 3, username: 'PawnStar', accuracy: '90%', time: '13m 05s', points: 2700 },
            { rank: 4, username: 'BishopTakesKnight', accuracy: '92%', time: '12m 30s', points: 2650 },
            { rank: 5, username: 'RookAndRoll', accuracy: '89%', time: '11m 45s', points: 2580 },
            { rank: 6, username: 'CheckMateKing', accuracy: '88%', time: '14m 10s', points: 2420 },
            { rank: 7, username: 'AnnaChess', accuracy: '85%', time: '10m 05s', points: 2390 },
            { rank: 8, username: 'You', accuracy: '84%', time: '13m 22s', points: 2350, isYou: true },
            { rank: 9, username: 'SicilianPro', accuracy: '82%', time: '15m 00s', points: 2200 },
        ],
    },
    6: {
        dateLabel: 'October 6, 2023',
        stats: { score: 2195, correct: '16/20', totalTime: '14m 21s' },
        rows: [
            { rank: 1, username: 'QueenGambit', accuracy: '95%', time: '11m 44s', points: 3040 },
            { rank: 2, username: 'GrandMasterFlash', accuracy: '94%', time: '11m 58s', points: 2975 },
            { rank: 3, username: 'RookAndRoll', accuracy: '91%', time: '12m 47s', points: 2760 },
            { rank: 4, username: 'PawnStar', accuracy: '89%', time: '13m 20s', points: 2555 },
            { rank: 5, username: 'You', accuracy: '81%', time: '14m 21s', points: 2195, isYou: true },
            { rank: 6, username: 'SicilianPro', accuracy: '79%', time: '14m 41s', points: 2110 },
        ],
    },
};

function getIstSecondsOfDay() {
    const now = Date.now();
    const istDate = new Date(now + IST_OFFSET_MS);
    const hour = istDate.getUTCHours();
    const minute = istDate.getUTCMinutes();
    const second = istDate.getUTCSeconds();
    return (hour * 60 * 60) + (minute * 60) + second;
}

function getComputedPhase() {
    const secondsOfDay = getIstSecondsOfDay();
    if (secondsOfDay < ROUND_START_SECONDS) {
        return PHASE_LOCKED;
    }
    if (secondsOfDay < (ROUND_START_SECONDS + DEMO_LIVE_WINDOW_SECONDS)) {
        return PHASE_LIVE;
    }
    return PHASE_RESULTS;
}

function getCountdownToNextRound() {
    const current = getIstSecondsOfDay();
    let delta = ROUND_START_SECONDS - current;
    if (delta <= 0) {
        delta += 24 * 60 * 60;
    }
    const hours = Math.floor(delta / 3600);
    const minutes = Math.floor((delta % 3600) / 60);
    const seconds = delta % 60;
    return {
        hours: String(hours).padStart(2, '0'),
        minutes: String(minutes).padStart(2, '0'),
        seconds: String(seconds).padStart(2, '0'),
    };
}

function optionLabel(index) {
    return String.fromCharCode(65 + index);
}

function StandingsTable({ compact = false }) {
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
                {LIVE_STANDINGS.map((row) => (
                    <tr
                        key={`${row.rank}-${row.username}`}
                        className={row.isYou
                            ? 'bg-primary/12 border-l-2 border-primary'
                            : row.rank <= 3
                                ? 'bg-slate-50/70 dark:bg-slate-900/45'
                                : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors'}
                    >
                        <td className={`px-3 py-2.5 text-center font-bold ${row.isYou ? 'text-primary' : 'text-slate-500 dark:text-slate-400'}`}>
                            {row.rank === 1 ? (
                                <span className="material-symbols-outlined text-[16px] text-yellow-500">emoji_events</span>
                            ) : row.rank === 2 ? (
                                <span className="material-symbols-outlined text-[16px] text-slate-400">military_tech</span>
                            ) : row.rank === 3 ? (
                                <span className="material-symbols-outlined text-[16px] text-amber-600">military_tech</span>
                            ) : row.rank}
                        </td>
                        <td className={`px-3 py-2.5 font-medium ${row.isYou ? 'text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-200'}`}>
                            {row.username}
                        </td>
                        <td className={`px-3 py-2.5 text-right font-bold ${row.isYou ? 'text-primary' : 'text-slate-700 dark:text-slate-200'}`}>
                            {row.points.toLocaleString()}
                        </td>
                        {!compact ? (
                            <td className={`px-3 py-2.5 text-right ${row.isYou ? 'text-slate-900 dark:text-white font-medium' : 'text-slate-500 dark:text-slate-400'}`}>
                                {row.progress}/20
                            </td>
                        ) : null}
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

export default function QuizPage() {
    const [, setTick] = useState(0);
    const resultsDateInputRef = useRef(null);
    const [phaseOverride, setPhaseOverride] = useState('');
    const [mobileStandingsOpen, setMobileStandingsOpen] = useState(false);
    const [questionNumber, setQuestionNumber] = useState(7);
    const [secondsLeft, setSecondsLeft] = useState(20);
    const [selectedOption, setSelectedOption] = useState(null);
    const [feedback, setFeedback] = useState(null);
    const [roundPoints, setRoundPoints] = useState(895);
    const [selectedCalendarDay, setSelectedCalendarDay] = useState(5);

    const computedPhase = getComputedPhase();
    const phase = phaseOverride || computedPhase;
    const countdown = getCountdownToNextRound();

    const yourStanding = LIVE_STANDINGS.find((row) => row.isYou) || { rank: '-', points: roundPoints };
    const answeredCurrentQuestion = selectedOption !== null;
    const isLivePhase = phase === PHASE_LIVE;
    const selectedResults = RESULTS_BY_DAY[selectedCalendarDay] || null;
    const hasSelectedResults = Boolean(selectedResults);
    const selectedRows = selectedResults?.rows || [];
    const firstPlace = selectedRows.find((row) => row.rank === 1);
    const secondPlace = selectedRows.find((row) => row.rank === 2);
    const thirdPlace = selectedRows.find((row) => row.rank === 3);
    const latestResultsDay = Math.max(...Object.keys(RESULTS_BY_DAY).map(Number));
    const yesterdayResults = RESULTS_BY_DAY[latestResultsDay] || null;
    const yesterdayRows = yesterdayResults?.rows || [];
    const yesterdayDateLabel = yesterdayResults?.dateLabel || 'Previous Round';
    const yesterdayFirst = yesterdayRows.find((row) => row.rank === 1);
    const yesterdaySecond = yesterdayRows.find((row) => row.rank === 2);
    const yesterdayThird = yesterdayRows.find((row) => row.rank === 3);
    const selectedCalendarDateValue = `2023-10-${String(selectedCalendarDay).padStart(2, '0')}`;

    const progressPercent = Math.round((questionNumber / 20) * 100);
    const timerProgress = Math.max(0, Math.min(100, (secondsLeft / 20) * 100));
    const timerCircumference = 2 * Math.PI * 22;
    const timerOffset = timerCircumference * (1 - (secondsLeft / 20));

    useEffect(() => {
        const intervalId = window.setInterval(() => {
            setTick((value) => value + 1);
        }, 1000);
        return () => window.clearInterval(intervalId);
    }, []);

    const applyTimeoutPenalty = useCallback(() => {
        setSelectedOption(-1);
        setFeedback({ correct: false, points: -15 });
        setRoundPoints((value) => value - 15);
        window.setTimeout(() => {
            if (questionNumber >= 20) {
                setPhaseOverride(PHASE_RESULTS);
            } else {
                setQuestionNumber((value) => Math.min(20, value + 1));
                setSecondsLeft(20);
                setSelectedOption(null);
                setFeedback(null);
            }
        }, 900);
    }, [questionNumber]);

    useEffect(() => {
        if (phase !== PHASE_LIVE || answeredCurrentQuestion) {
            return undefined;
        }
        const timeoutId = window.setTimeout(() => {
            if (secondsLeft <= 1) {
                applyTimeoutPenalty();
                return;
            }
            setSecondsLeft((value) => value - 1);
        }, 1000);
        return () => window.clearTimeout(timeoutId);
    }, [answeredCurrentQuestion, applyTimeoutPenalty, phase, secondsLeft]);

    const handleAnswer = (optionIndex) => {
        if (answeredCurrentQuestion || phase !== PHASE_LIVE) {
            return;
        }
        setSelectedOption(optionIndex);
        const isCorrect = optionIndex === SAMPLE_QUESTION.answer_index;
        const delta = isCorrect ? secondsLeft : -15;
        setRoundPoints((value) => value + delta);
        setFeedback({
            correct: isCorrect,
            points: delta,
        });

        window.setTimeout(() => {
            if (questionNumber >= 20) {
                setPhaseOverride(PHASE_RESULTS);
                return;
            }
            setQuestionNumber((value) => Math.min(20, value + 1));
            setSecondsLeft(20);
            setSelectedOption(null);
            setFeedback(null);
        }, 900);
    };

    const handleResultsDateChange = (event) => {
        const value = event.target.value;
        if (!value) {
            return;
        }
        const day = Number.parseInt(value.slice(-2), 10);
        if (!Number.isFinite(day) || day < 1 || day > 31) {
            return;
        }
        setSelectedCalendarDay(day);
    };

    const openResultsDatePicker = () => {
        const input = resultsDateInputRef.current;
        if (!input) {
            return;
        }
        if (typeof input.showPicker === 'function') {
            input.showPicker();
            return;
        }
        input.focus({ preventScroll: true });
        input.click();
    };

    const openResultsForYesterday = () => {
        setSelectedCalendarDay(latestResultsDay);
        setPhaseOverride(PHASE_RESULTS);
    };

    const renderLocked = () => (
        <div className="space-y-5">
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-surface-dark p-4 md:p-5 lg:p-6 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/12 via-transparent to-transparent pointer-events-none" />
                <div className="absolute -top-24 -right-20 size-72 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
                <div className="relative z-10 grid grid-cols-1 xl:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)] gap-4 items-center">
                    <div className="text-center xl:text-left">
                        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary text-[11px] font-semibold uppercase tracking-wide">
                            <span className="material-symbols-outlined text-[14px]">schedule</span>
                            Upcoming Round
                        </div>
                        <h1 className="mt-3 text-2xl md:text-3xl font-bold text-slate-900 dark:text-white leading-tight">
                            Next Quiz Starts at <span className="text-primary">23:30 IST</span>
                        </h1>
                        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 max-w-2xl mx-auto xl:mx-0">
                            20 quick questions daily. Be on time to maximize points.
                        </p>
                    </div>

                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/45 p-3 md:p-4">
                        <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Round Begins In</div>
                        <div className="mt-2 grid grid-cols-3 gap-2">
                            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/65 p-2.5 text-center">
                                <div className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white font-mono">{countdown.hours}</div>
                                <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 mt-1">Hours</div>
                            </div>
                            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/65 p-2.5 text-center">
                                <div className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white font-mono">{countdown.minutes}</div>
                                <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 mt-1">Min</div>
                            </div>
                            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/65 p-2.5 text-center">
                                <div className="text-xl md:text-2xl font-bold text-primary font-mono">{countdown.seconds}</div>
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
                        <span className="hidden sm:inline text-xs text-slate-500 dark:text-slate-400">{yesterdayDateLabel}</span>
                        <button
                            type="button"
                            className="text-sm font-semibold text-primary hover:underline"
                            onClick={openResultsForYesterday}
                        >
                            View Full
                        </button>
                    </div>
                </div>

                <div className="p-4 md:p-5 space-y-5">
                    <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-gradient-to-b from-primary/10 to-transparent dark:from-primary/10 dark:to-surface-dark p-5 md:p-6 overflow-hidden">
                        <h3 className="text-lg font-bold text-center text-slate-900 dark:text-white">Top Performers</h3>
                        <div className="mt-6 flex items-end justify-center gap-3 md:gap-8">
                            <div className="flex flex-col items-center w-[30%] md:w-40">
                                <div className="size-14 md:size-16 rounded-full border-2 border-slate-400 dark:border-slate-500 bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-sm font-bold text-slate-800 dark:text-slate-100">
                                    {yesterdaySecond?.username?.slice(0, 2).toUpperCase() || '2'}
                                </div>
                                <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-white truncate max-w-full">{yesterdaySecond?.username || '---'}</div>
                                <div className="text-xs font-bold text-slate-500 dark:text-slate-300">{yesterdaySecond?.points?.toLocaleString() || '--'} pts</div>
                                <div className="mt-3 h-20 md:h-24 w-full rounded-t-lg bg-slate-200 dark:bg-slate-700/60 border border-slate-300 dark:border-slate-600 flex items-end justify-center pb-2">
                                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300">#2</span>
                                </div>
                            </div>

                            <div className="flex flex-col items-center w-[34%] md:w-44 -mt-4">
                                <span className="material-symbols-outlined text-yellow-500 text-3xl md:text-4xl">crown</span>
                                <div className="size-16 md:size-20 rounded-full border-2 border-yellow-500 ring-4 ring-yellow-500/20 bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-base font-bold text-slate-900 dark:text-white">
                                    {yesterdayFirst?.username?.slice(0, 2).toUpperCase() || '1'}
                                </div>
                                <div className="mt-2 text-base md:text-lg font-bold text-slate-900 dark:text-white truncate max-w-full">{yesterdayFirst?.username || '---'}</div>
                                <div className="text-sm font-bold text-yellow-600 dark:text-yellow-400">{yesterdayFirst?.points?.toLocaleString() || '--'} pts</div>
                                <div className="mt-3 h-28 md:h-36 w-full rounded-t-lg bg-gradient-to-t from-yellow-500/30 to-yellow-500/10 border border-yellow-500/30 flex items-end justify-center pb-2">
                                    <span className="text-xs font-bold text-yellow-700 dark:text-yellow-300">#1</span>
                                </div>
                            </div>

                            <div className="flex flex-col items-center w-[30%] md:w-40">
                                <div className="size-14 md:size-16 rounded-full border-2 border-amber-700 dark:border-amber-600 bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-sm font-bold text-slate-800 dark:text-slate-100">
                                    {yesterdayThird?.username?.slice(0, 2).toUpperCase() || '3'}
                                </div>
                                <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-white truncate max-w-full">{yesterdayThird?.username || '---'}</div>
                                <div className="text-xs font-bold text-amber-700 dark:text-amber-500">{yesterdayThird?.points?.toLocaleString() || '--'} pts</div>
                                <div className="mt-3 h-16 md:h-20 w-full rounded-t-lg bg-amber-700/15 border border-amber-700/30 flex items-end justify-center pb-2">
                                    <span className="text-xs font-bold text-amber-700 dark:text-amber-500">#3</span>
                                </div>
                            </div>
                        </div>
                    </section>

                </div>
            </section>
        </div>
    );

    const renderLive = () => (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-5 items-start">
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-surface-dark p-4 md:p-5 flex flex-col gap-2 min-h-0">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Question {questionNumber}/20</div>
                        <div className="mt-2 h-2 w-40 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${progressPercent}%` }} />
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            className="lg:hidden px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 text-xs font-semibold"
                            onClick={() => setMobileStandingsOpen(true)}
                        >
                            <span className="material-symbols-outlined align-middle text-[16px] mr-1 text-yellow-500">trophy</span>
                            #{yourStanding.rank} • {yourStanding.points}
                        </button>
                        <div className="relative size-14 flex items-center justify-center">
                            <svg className="size-14 -rotate-90" viewBox="0 0 56 56" aria-hidden="true">
                                <circle cx="28" cy="28" r="22" fill="none" stroke="currentColor" strokeWidth="4" className="text-slate-200 dark:text-slate-800" />
                                <circle
                                    cx="28"
                                    cy="28"
                                    r="22"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="4"
                                    strokeLinecap="round"
                                    strokeDasharray={timerCircumference}
                                    strokeDashoffset={timerOffset}
                                    className={timerProgress > 30 ? 'text-primary' : 'text-red-500'}
                                />
                            </svg>
                            <span className="absolute text-sm font-bold text-slate-900 dark:text-white">{secondsLeft}s</span>
                        </div>
                    </div>
                </div>

                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-3 md:p-4">
                    <div className="flex items-start justify-between gap-3">
                        <h2 className="text-lg md:text-2xl font-bold text-slate-900 dark:text-white leading-snug">
                            {SAMPLE_QUESTION.question}
                        </h2>
                        {feedback ? (
                            <span className={`shrink-0 rounded-md border px-2 py-1 text-xs font-extrabold ${
                                feedback.correct
                                    ? 'bg-green-500/10 border-green-500/35 text-green-500'
                                    : 'bg-red-500/10 border-red-500/35 text-red-500'
                            }`}
                            >
                                {feedback.points > 0 ? `+${feedback.points}` : feedback.points}
                            </span>
                        ) : null}
                    </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-2.5">
                    {SAMPLE_QUESTION.options.map((option, index) => {
                        const isCorrect = index === SAMPLE_QUESTION.answer_index;
                        const isChosen = selectedOption === index;
                        let optionStyle = 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-primary/50';
                        if (answeredCurrentQuestion && isCorrect) {
                            optionStyle = 'border-green-500/40 bg-green-500/10';
                        } else if (isChosen && !isCorrect) {
                            optionStyle = 'border-red-500/40 bg-red-500/10';
                        }
                        return (
                            <button
                                key={option}
                                type="button"
                                className={`w-full min-h-14 rounded-xl border p-2.5 md:p-3 text-left flex items-center gap-3 transition-colors ${optionStyle}`}
                                onClick={() => handleAnswer(index)}
                                disabled={answeredCurrentQuestion}
                            >
                                <span className="size-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-slate-500 dark:text-slate-300 shrink-0">
                                    {optionLabel(index)}
                                </span>
                                <span className="text-base md:text-lg font-semibold text-slate-800 dark:text-slate-100">{option}</span>
                                {answeredCurrentQuestion && isCorrect ? (
                                    <span className="material-symbols-outlined ml-auto text-green-500">check_circle</span>
                                ) : null}
                            </button>
                        );
                    })}
                </div>
            </section>

            <aside className="hidden lg:flex lg:sticky lg:top-[148px] lg:max-h-[calc(100dvh-188px)] flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-surface-dark overflow-hidden">
                <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <span className="material-symbols-outlined text-yellow-500">trophy</span>
                        Live Standings
                    </h3>
                    <span className="text-[10px] uppercase tracking-wide px-2 py-1 rounded bg-primary/10 text-primary border border-primary/20">Live</span>
                </div>
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/70 px-3 py-2">
                        <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Your Rank</div>
                        <div className="text-base font-bold text-primary">#{yourStanding.rank}</div>
                    </div>
                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/70 px-3 py-2">
                        <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Your Points</div>
                        <div className="text-base font-bold text-primary">{roundPoints.toLocaleString()}</div>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto no-scrollbar">
                    <StandingsTable />
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
                            className="inline-flex h-12 w-12 items-center justify-center rounded-xl text-slate-500 dark:text-slate-300 hover:text-primary hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                            <span className="material-symbols-outlined text-[22px]">calendar_month</span>
                        </button>
                        <input
                            ref={resultsDateInputRef}
                            type="date"
                            min={RESULTS_CALENDAR_MIN}
                            max={RESULTS_CALENDAR_MAX}
                            value={selectedCalendarDateValue}
                            onChange={handleResultsDateChange}
                            className="sr-only"
                            tabIndex={-1}
                        />
                    </div>
                </div>
            </section>

            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-gradient-to-b from-primary/10 to-transparent dark:from-primary/10 dark:to-surface-dark p-5 md:p-7 overflow-hidden">
                <h3 className="text-lg md:text-xl font-bold text-center text-slate-900 dark:text-white">Top Performers</h3>
                <div className="mt-8 flex items-end justify-center gap-3 md:gap-8">
                    <div className="flex flex-col items-center w-[30%] md:w-40">
                        <div className="size-14 md:size-16 rounded-full border-2 border-slate-400 dark:border-slate-500 bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-sm font-bold text-slate-800 dark:text-slate-100">
                            {secondPlace?.username?.slice(0, 2).toUpperCase() || '2'}
                        </div>
                        <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-white truncate max-w-full">{secondPlace?.username || '---'}</div>
                        <div className="text-xs font-bold text-slate-500 dark:text-slate-300">{secondPlace?.points?.toLocaleString() || '--'} pts</div>
                        <div className="mt-3 h-20 md:h-24 w-full rounded-t-lg bg-slate-200 dark:bg-slate-700/60 border border-slate-300 dark:border-slate-600 flex items-end justify-center pb-2">
                            <span className="text-xs font-bold text-slate-600 dark:text-slate-300">#2</span>
                        </div>
                    </div>

                    <div className="flex flex-col items-center w-[34%] md:w-44 -mt-4">
                        <span className="material-symbols-outlined text-yellow-500 text-3xl md:text-4xl">crown</span>
                        <div className="size-16 md:size-20 rounded-full border-2 border-yellow-500 ring-4 ring-yellow-500/20 bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-base font-bold text-slate-900 dark:text-white">
                            {firstPlace?.username?.slice(0, 2).toUpperCase() || '1'}
                        </div>
                        <div className="mt-2 text-base md:text-lg font-bold text-slate-900 dark:text-white truncate max-w-full">{firstPlace?.username || '---'}</div>
                        <div className="text-sm font-bold text-yellow-600 dark:text-yellow-400">{firstPlace?.points?.toLocaleString() || '--'} pts</div>
                        <div className="mt-3 h-28 md:h-36 w-full rounded-t-lg bg-gradient-to-t from-yellow-500/30 to-yellow-500/10 border border-yellow-500/30 flex items-end justify-center pb-2">
                            <span className="text-xs font-bold text-yellow-700 dark:text-yellow-300">#1</span>
                        </div>
                    </div>

                    <div className="flex flex-col items-center w-[30%] md:w-40">
                        <div className="size-14 md:size-16 rounded-full border-2 border-amber-700 dark:border-amber-600 bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-sm font-bold text-slate-800 dark:text-slate-100">
                            {thirdPlace?.username?.slice(0, 2).toUpperCase() || '3'}
                        </div>
                        <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-white truncate max-w-full">{thirdPlace?.username || '---'}</div>
                        <div className="text-xs font-bold text-amber-700 dark:text-amber-500">{thirdPlace?.points?.toLocaleString() || '--'} pts</div>
                        <div className="mt-3 h-16 md:h-20 w-full rounded-t-lg bg-amber-700/15 border border-amber-700/30 flex items-end justify-center pb-2">
                            <span className="text-xs font-bold text-amber-700 dark:text-amber-500">#3</span>
                        </div>
                    </div>
                </div>
            </section>

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
                            {hasSelectedResults ? selectedRows.map((row) => (
                                <tr
                                    key={`${row.rank}-${row.username}`}
                                    className={row.isYou
                                        ? 'bg-primary/10 border-l-2 border-primary'
                                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'}
                                >
                                    <td className={`px-4 py-3 font-bold ${row.isYou ? 'text-primary' : 'text-slate-500 dark:text-slate-400'}`}>
                                        {row.rank === 1 ? (
                                            <span className="material-symbols-outlined text-[16px] text-yellow-500">emoji_events</span>
                                        ) : row.rank === 2 ? (
                                            <span className="material-symbols-outlined text-[16px] text-slate-400">military_tech</span>
                                        ) : row.rank === 3 ? (
                                            <span className="material-symbols-outlined text-[16px] text-amber-600">military_tech</span>
                                        ) : row.rank}
                                    </td>
                                    <td className={`px-4 py-3 font-medium ${row.isYou ? 'text-slate-900 dark:text-white' : 'text-slate-800 dark:text-slate-200'}`}>
                                        {row.username}
                                    </td>
                                    <td className="px-4 py-3 hidden sm:table-cell text-slate-500 dark:text-slate-400">{row.accuracy}</td>
                                    <td className="px-4 py-3 hidden md:table-cell text-slate-500 dark:text-slate-400">{row.time}</td>
                                    <td className="px-4 py-3 text-right font-bold text-primary">{row.points.toLocaleString()}</td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                                        No round data available for this date yet.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>
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
                        <div className={`text-xs px-2 py-1 rounded-full border ${
                            phase === PHASE_LOCKED
                                ? 'border-primary/30 bg-primary/10 text-primary'
                                : phase === PHASE_LIVE
                                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                                    : 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                        }`}
                        >
                            {phase === PHASE_LOCKED ? 'Upcoming' : phase === PHASE_LIVE ? 'Live Round' : 'Results'}
                        </div>
                    </div>
                    <div className="px-4 pb-3">
                        <div className="inline-flex rounded-lg p-1 bg-slate-200 dark:bg-surface-dark">
                            <button
                                type="button"
                                className={`px-3 py-1.5 text-xs font-semibold rounded-md ${phase === PHASE_LOCKED ? 'bg-white dark:bg-primary text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}
                                onClick={() => setPhaseOverride(PHASE_LOCKED)}
                            >
                                Upcoming
                            </button>
                            <button
                                type="button"
                                className={`px-3 py-1.5 text-xs font-semibold rounded-md ${phase === PHASE_LIVE ? 'bg-white dark:bg-primary text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}
                                onClick={() => setPhaseOverride(PHASE_LIVE)}
                            >
                                Live
                            </button>
                            <button
                                type="button"
                                className={`px-3 py-1.5 text-xs font-semibold rounded-md ${phase === PHASE_RESULTS ? 'bg-white dark:bg-primary text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}
                                onClick={() => setPhaseOverride(PHASE_RESULTS)}
                            >
                                Results
                            </button>
                        </div>
                    </div>
                </header>

                <div className={isLivePhase
                    ? 'px-4 py-3 md:px-6 max-w-7xl mx-auto'
                    : 'px-4 py-4 md:px-6 max-w-7xl mx-auto space-y-4'}
                >
                    {phase === PHASE_LOCKED ? renderLocked() : null}
                    {phase === PHASE_LIVE ? renderLive() : null}
                    {phase === PHASE_RESULTS ? renderResults() : null}
                </div>
            </div>

            {phase === PHASE_LIVE && mobileStandingsOpen ? (
                <div className="lg:hidden fixed inset-0 z-50">
                    <button
                        type="button"
                        className="absolute inset-0 bg-black/50"
                        onClick={() => setMobileStandingsOpen(false)}
                        aria-label="Close standings"
                    />
                    <div className="absolute bottom-0 left-0 right-0 max-h-[70vh] rounded-t-2xl bg-white dark:bg-surface-dark border-t border-slate-200 dark:border-slate-800 overflow-hidden">
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
                        <div className="overflow-y-auto no-scrollbar max-h-[calc(70vh-64px)]">
                            <StandingsTable compact />
                        </div>
                    </div>
                </div>
            ) : null}
        </Layout>
    );
}
