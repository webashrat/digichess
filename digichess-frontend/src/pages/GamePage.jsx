import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import {
    abortGame,
    makeMove,
    offerDraw,
    resignGame,
    acceptGame,
    rejectGame,
    respondDraw,
    requestRematch,
    acceptRematch,
    rejectRematch,
    cancelRematch,
    fetchGameAnalysis,
    fetchGameAnalysisStatus,
    requestGameAnalysis,
    submitCheatReport,
} from '../api';
import ChessPiece from '../components/chess/ChessPiece';
import ClockDisplay from '../components/chess/ClockDisplay';
import ProfileMenu from '../components/layout/ProfileMenu';
import { useAuth } from '../context/AuthContext';
import useGameSync from '../hooks/useGameSync';
import useSettings from '../hooks/useSettings';
import { BOARD_THEMES, PIECE_SETS } from '../utils/boardPresets';
import { getBlitzTag, getRatingTagClasses } from '../utils/ratingTags';

import brilliantIcon from '../../chess_move_classification_emojis/brilliant.png';
import bestIcon from '../../chess_move_classification_emojis/best.png';
import excellentIcon from '../../chess_move_classification_emojis/excellent.png';
import goodIcon from '../../chess_move_classification_emojis/good.png';
import inaccuracyIcon from '../../chess_move_classification_emojis/inaccuracy.png';
import mistakeIcon from '../../chess_move_classification_emojis/mistake.png';
import blunderIcon from '../../chess_move_classification_emojis/blunder.png';

const CLASSIFICATION_ICONS = { brilliant: brilliantIcon, best: bestIcon, excellent: excellentIcon, good: goodIcon, inaccuracy: inaccuracyIcon, mistake: mistakeIcon, blunder: blunderIcon };
const NOTABLE_ICONS = { brilliant: brilliantIcon, inaccuracy: inaccuracyIcon, mistake: mistakeIcon, blunder: blunderIcon };
const CLASSIFICATION_LABELS = { brilliant: 'Brilliant', best: 'Best', excellent: 'Excellent', good: 'Good', inaccuracy: 'Inaccuracy', mistake: 'Mistake', blunder: 'Blunder' };
const CLASSIFICATION_COLORS = {
    brilliant: 'bg-cyan-700/60 text-cyan-200 border-cyan-400/70 shadow-[0_0_12px_rgba(6,182,212,0.5)] animate-pulse',
    best: 'bg-green-700/60 text-green-200 border-green-400/70 shadow-[0_0_12px_rgba(34,197,94,0.5)]',
    excellent: 'bg-teal-700/60 text-teal-200 border-teal-400/70 shadow-[0_0_10px_rgba(20,184,166,0.4)]',
    good: 'bg-blue-700/60 text-blue-200 border-blue-400/70 shadow-[0_0_10px_rgba(59,130,246,0.4)]',
    inaccuracy: 'bg-amber-700/60 text-amber-200 border-amber-400/70 shadow-[0_0_12px_rgba(245,158,11,0.5)]',
    mistake: 'bg-orange-700/60 text-orange-200 border-orange-400/70 shadow-[0_0_12px_rgba(249,115,22,0.5)]',
    blunder: 'bg-red-700/60 text-red-200 border-red-400/70 shadow-[0_0_14px_rgba(239,68,68,0.6)] animate-pulse',
};

const DEFAULT_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const BOARD_SETTING_EVENT = 'board-settings-change';
const LOCAL_STORAGE_SOUND = 'soundEnabled';
const LOCAL_STORAGE_AUTO_QUEEN = 'autoQueenEnabled';
const SETTINGS_CHANGE_EVENT = 'digichess-settings-change';
const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const EMPTY_SET = new Set();
const MOVE_ANIMATION_MS_DESKTOP = 150;
const MOVE_ANIMATION_MS_MOBILE = 190;

const parseFen = (fen) => {
    if (!fen) return [];
    const [position] = fen.split(' ');
    const rows = position.split('/');
    return rows.map((row) => {
        const squares = [];
        for (const char of row) {
            if (Number.isNaN(Number(char))) {
                squares.push(char);
            } else {
                const empties = Number(char);
                for (let i = 0; i < empties; i += 1) {
                    squares.push(null);
                }
            }
        }
        return squares;
    });
};

const coordToDisplayPosition = (coord, isWhitePerspective) => {
    if (!coord || coord.length < 2) return null;
    const file = coord[0];
    const rank = Number(coord[1]);
    const actualCol = FILES.indexOf(file);
    const actualRow = 8 - rank;
    if (actualCol < 0 || actualRow < 0 || actualRow > 7) return null;
    return {
        row: isWhitePerspective ? actualRow : 7 - actualRow,
        col: isWhitePerspective ? actualCol : 7 - actualCol,
    };
};

export default function GamePage() {
    const { gameId } = useParams();
    const navigate = useNavigate();
    const { isAuthenticated, token, user, loading: authLoading } = useAuth();
    const settings = useSettings();
    const [error, setError] = useState(null);
    const [spectate, setSpectate] = useState(!isAuthenticated);
    const [pendingMove, setPendingMove] = useState(false);
    const [optimisticState, setOptimisticState] = useState(null);
    const [previewIndex, setPreviewIndex] = useState(0);
    const [selectedSquare, setSelectedSquare] = useState(null);
    const [legalTargets, setLegalTargetsRaw] = useState(EMPTY_SET);
    const setLegalTargets = useCallback((next) => {
        if (next === EMPTY_SET || (next instanceof Set && next.size === 0)) {
            setLegalTargetsRaw((prev) => (prev === EMPTY_SET ? prev : EMPTY_SET));
            return;
        }
        setLegalTargetsRaw((prev) => {
            if (prev.size !== next.size) return next;
            for (const v of next) { if (!prev.has(v)) return next; }
            return prev;
        });
    }, []);
    const [dragFrom, setDragFrom] = useState(null);
    const [dragPiece, setDragPiece] = useState(null);
    const dragGhostRef = useRef(null);
    const [lastMoveUci, setLastMoveUci] = useState(null);
    const [drawNotice, setDrawNotice] = useState(null);
    const [rematchNotice, setRematchNotice] = useState(null);
    const [rematchLoading, setRematchLoading] = useState(false);
    const [analysisStatus, setAnalysisStatus] = useState(null);
    const [analysisData, setAnalysisData] = useState(null);
    const [analysisError, setAnalysisError] = useState(null);
    const [analysisLoading, setAnalysisLoading] = useState(false);
    const [showAnalysis, setShowAnalysis] = useState(false);
    const [evalTooltip, setEvalTooltip] = useState(null);
    const [quickEval, setQuickEval] = useState(null);
    const [chatInput, setChatInput] = useState('');
    const [chatRoom, setChatRoom] = useState('players');
    const [localChat, setLocalChat] = useState([]);
    const [showSettings, setShowSettings] = useState(false);
    const [boardThemeIndex, setBoardThemeIndex] = useState(() => {
        if (typeof window === 'undefined') return 6;
        const stored = Number(localStorage.getItem('boardTheme'));
        return Number.isFinite(stored) ? stored : 6;
    });
    const [pieceSet, setPieceSet] = useState(() => {
        if (typeof window === 'undefined') return 'cburnett';
        return localStorage.getItem('pieceSet') || 'cburnett';
    });
    const [soundEnabled, setSoundEnabled] = useState(() => {
        if (typeof window === 'undefined') return true;
        const stored = localStorage.getItem(LOCAL_STORAGE_SOUND);
        return stored ? stored === 'true' : true;
    });
    const [autoQueenEnabled, setAutoQueenEnabled] = useState(() => {
        if (typeof window === 'undefined') return true;
        const stored = localStorage.getItem(LOCAL_STORAGE_AUTO_QUEEN);
        return stored ? stored === 'true' : true;
    });
    const [serverOffsetMs, setServerOffsetMs] = useState(0);
    const [firstMoveRemaining, setFirstMoveRemaining] = useState(null);
    const boardRef = useRef(null);
    const dragPointerRef = useRef(null);
    const dragStartRef = useRef(null);
    const dragMovedRef = useRef(false);
    const dragPosRef = useRef(null);
    const dragRafRef = useRef(null);
    const suppressClickRef = useRef(false);
    const tapSelectedRef = useRef(null);
    const analysisPollRef = useRef(null);
    const drawOfferRef = useRef(null);
    const clockAnchorRef = useRef(null);
    const lastSoundMoveRef = useRef(0);
    const soundInitRef = useRef(false);
    const lastTickRef = useRef(null);
    const audioCtxRef = useRef(null);
    const audioGestureAtRef = useRef(0);
    const animatedMoveRef = useRef(null);
    const skipNextMoveAnimationRef = useRef(false);
    const squareClickRef = useRef(null);
    const piecePointerDownRef = useRef(null);
    const [boardPixelSize, setBoardPixelSize] = useState(560);
    const clockNowRef = useRef(Date.now());
    const [resignConfirm, setResignConfirm] = useState(false);
    const [resignLoading, setResignLoading] = useState(false);
    const [reportModalOpen, setReportModalOpen] = useState(false);
    const [reportReason, setReportReason] = useState('engine_use');
    const [reportDescription, setReportDescription] = useState('');
    const [reportLoading, setReportLoading] = useState(false);
    const [reportResult, setReportResult] = useState(null);
    const [pendingPromotion, setPendingPromotion] = useState(null);
    const [premove, setPremove] = useState(null);
    const [premoveNotice, setPremoveNotice] = useState(null);
    const [mobileBoardSize, setMobileBoardSize] = useState(null);
    const [leftDrawerOpen, setLeftDrawerOpen] = useState(false);
    const [rightDrawerOpen, setRightDrawerOpen] = useState(false);
    const [isMobileLayout, setIsMobileLayout] = useState(false);
    const [mobileChatOpen, setMobileChatOpen] = useState(false);
    const mobileMovesRef = useRef(null);
    const pieceMotionRef = useRef(null);
    const moveAnimOverlayRef = useRef(null);
    const touchStateRef = useRef(null);
    const topBarRef = useRef(null);
    const bottomBarRef = useRef(null);
    const pageRef = useRef(null);

    const { game, state, chat, sendChat, syncEvents, error: syncError } = useGameSync({
        gameId,
        spectate,
        token,
    });

    const displayFen = optimisticState?.fen || state?.fen || game?.current_fen || DEFAULT_FEN;
    const displayMoves = optimisticState?.moves || state?.moves || game?.moves || '';
    const legalMoves = optimisticState?.legal_moves || state?.legal_moves || game?.legal_moves || [];
    const legalMovesSan = state?.game_state?.legal_moves?.san || legalMoves || [];
    const legalMovesUci = state?.legal_moves_uci || state?.game_state?.legal_moves?.uci || game?.legal_moves_uci || [];

    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('boardTheme', String(boardThemeIndex));
            window.dispatchEvent(new CustomEvent(BOARD_SETTING_EVENT));
        }
    }, [boardThemeIndex]);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('pieceSet', pieceSet);
            window.dispatchEvent(new CustomEvent(BOARD_SETTING_EVENT));
        }
    }, [pieceSet]);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem(LOCAL_STORAGE_AUTO_QUEEN, String(autoQueenEnabled));
        }
    }, [autoQueenEnabled]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (!isMobileLayout) {
            setMobileBoardSize(null);
            return;
        }
        const computeSize = () => {
            const topHeight = topBarRef.current?.getBoundingClientRect().height || 0;
            const bottomHeight = bottomBarRef.current?.getBoundingClientRect().height || 0;
            const headerHeight = 52;
            const verticalPadding = 16;
            const availableHeight = window.innerHeight - topHeight - bottomHeight - headerHeight - verticalPadding;
            const maxWidth = window.innerWidth;
            const size = Math.floor(Math.min(maxWidth, Math.max(200, availableHeight)));
            setMobileBoardSize(size > 0 ? size : null);
        };
        const raf = requestAnimationFrame(computeSize);
        window.addEventListener('resize', computeSize);
        window.addEventListener('orientationchange', computeSize);
        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener('resize', computeSize);
            window.removeEventListener('orientationchange', computeSize);
        };
    }, [isMobileLayout, game?.id]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const syncFromStorage = () => {
            const soundStored = localStorage.getItem(LOCAL_STORAGE_SOUND);
            const autoQueenStored = localStorage.getItem(LOCAL_STORAGE_AUTO_QUEEN);
            setSoundEnabled(soundStored ? soundStored === 'true' : true);
            setAutoQueenEnabled(autoQueenStored ? autoQueenStored === 'true' : true);
        };
        const handleStorage = (event) => {
            if (event.key === LOCAL_STORAGE_SOUND) {
                setSoundEnabled(event.newValue ? event.newValue === 'true' : true);
            }
            if (event.key === LOCAL_STORAGE_AUTO_QUEEN) {
                setAutoQueenEnabled(event.newValue ? event.newValue === 'true' : true);
            }
        };
        const handleSettingsChange = () => {
            syncFromStorage();
        };
        window.addEventListener('storage', handleStorage);
        window.addEventListener(SETTINGS_CHANGE_EVENT, handleSettingsChange);
        return () => {
            window.removeEventListener('storage', handleStorage);
            window.removeEventListener(SETTINGS_CHANGE_EVENT, handleSettingsChange);
        };
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const media = window.matchMedia('(max-width: 1023px)');
        const update = () => setIsMobileLayout(media.matches);
        update();
        if (media.addEventListener) {
            media.addEventListener('change', update);
        } else {
            media.addListener(update);
        }
        return () => {
            if (media.removeEventListener) {
                media.removeEventListener('change', update);
            } else {
                media.removeListener(update);
            }
        };
    }, []);

    useEffect(() => {
        if (!isMobileLayout) {
            setLeftDrawerOpen(false);
            setRightDrawerOpen(false);
        }
    }, [isMobileLayout]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }, [gameId]);


    useEffect(() => {
        if (state?.server_time) {
            setServerOffsetMs(state.server_time * 1000 - Date.now());
        }
    }, [state?.server_time]);

    useEffect(() => {
        if (!boardRef.current || typeof ResizeObserver === 'undefined') return;
        const updateSize = () => {
            if (boardRef.current) {
                const width = boardRef.current.clientWidth;
                if (width) setBoardPixelSize(width);
            }
        };
        updateSize();
        const observer = new ResizeObserver(updateSize);
        observer.observe(boardRef.current);
        return () => observer.disconnect();
    }, [game?.id]);

    const moves = useMemo(() => (displayMoves ? displayMoves.split(' ') : []), [displayMoves]);
    const navCacheRef = useRef({ movesKey: '', fens: [], uciList: [], phaseList: [], chessState: null });
    const navigation = useMemo(() => {
        const movesKey = displayMoves || '';
        const cache = navCacheRef.current;
        if (cache.movesKey && movesKey.startsWith(cache.movesKey) && cache.fens.length > 0) {
            const prevCount = cache.movesKey.trim() ? cache.movesKey.split(' ').length : 0;
            if (prevCount <= moves.length) {
                const chess = cache.chessState ? new Chess(cache.chessState) : new Chess();
                const fens = [...cache.fens];
                const uciList = [...cache.uciList];
                const phaseList = [...cache.phaseList];
                let ok = true;
                for (let index = prevCount; index < moves.length; index += 1) {
                    try {
                        const move = chess.move(moves[index], { sloppy: true });
                        if (!move) { ok = false; break; }
                        uciList.push(`${move.from}${move.to}${move.promotion || ''}`);
                        fens.push(chess.fen());
                        const mn = index + 1;
                        phaseList.push(mn <= 10 ? 'opening' : mn > 30 ? 'endgame' : 'middlegame');
                    } catch { ok = false; break; }
                }
                if (ok) {
                    navCacheRef.current = { movesKey, fens, uciList, phaseList, chessState: chess.fen() };
                    return { fens, uciList, phaseList };
                }
            }
        }
        const chess = new Chess();
        const fens = [chess.fen()];
        const uciList = [];
        const phaseList = [];
        for (let index = 0; index < moves.length; index += 1) {
            try {
                const move = chess.move(moves[index], { sloppy: true });
                if (!move) break;
                uciList.push(`${move.from}${move.to}${move.promotion || ''}`);
                fens.push(chess.fen());
                const mn = index + 1;
                phaseList.push(mn <= 10 ? 'opening' : mn > 30 ? 'endgame' : 'middlegame');
            } catch { break; }
        }
        navCacheRef.current = { movesKey, fens, uciList, phaseList, chessState: chess.fen() };
        return { fens, uciList, phaseList };
    }, [moves]);
    const maxPreviewIndex = Math.min(moves.length, navigation.fens.length - 1);
    const prevMaxRef = useRef(0);
    useEffect(() => {
        const prevMax = prevMaxRef.current;
        setPreviewIndex((prev) => {
            if (prev == null) return maxPreviewIndex;
            if (prev === prevMax) return maxPreviewIndex;
            if (prev > maxPreviewIndex) return maxPreviewIndex;
            return prev;
        });
        prevMaxRef.current = maxPreviewIndex;
    }, [maxPreviewIndex]);
    const isPreviewing = previewIndex < maxPreviewIndex;
    const previewFen = navigation.fens[previewIndex] || displayFen;
    const board = useMemo(() => parseFen(isPreviewing ? previewFen : displayFen), [displayFen, isPreviewing, previewFen]);
    const moveCount = Math.max(
        Number(state?.move_count ?? 0),
        Number(game?.move_count ?? 0),
        moves.length
    );
    const movePairs = useMemo(() => {
        const pairs = [];
        for (let i = 0; i < moves.length; i += 2) {
            pairs.push({ white: moves[i], black: moves[i + 1] });
        }
        return pairs;
    }, [moves]);
    const squareMap = useMemo(() => {
        const map = {};
        board.forEach((row, rowIdx) => {
            row.forEach((piece, colIdx) => {
                map[`${FILES[colIdx]}${8 - rowIdx}`] = piece;
            });
        });
        return map;
    }, [board]);
    const baseFen = optimisticState?.fen || state?.fen || game?.current_fen || displayFen || DEFAULT_FEN;
    const fallbackLegalMoves = useMemo(() => {
        try {
            const chess = new Chess(baseFen || DEFAULT_FEN);
            const moves = chess.moves({ verbose: true });
            const uci = moves.map((move) => `${move.from}${move.to}${move.promotion || ''}`);
            const san = moves.map((move) => move.san);
            return { uci, san };
        } catch (err) {
            return { uci: [], san: [] };
        }
    }, [baseFen]);

    const useFallbackMoves = fallbackLegalMoves.uci.length > 0;
    const effectiveLegalMovesUci = useFallbackMoves ? fallbackLegalMoves.uci : legalMovesUci;
    const effectiveLegalMovesSan = useFallbackMoves ? fallbackLegalMoves.san : legalMovesSan;

    const movesByFrom = useMemo(() => {
        const map = {};
        effectiveLegalMovesUci.forEach((uci) => {
            const from = uci.slice(0, 2);
            if (!map[from]) map[from] = [];
            map[from].push(uci);
        });
        return map;
    }, [effectiveLegalMovesUci]);
    const moveMap = useMemo(() => {
        const map = new Map();
        if (effectiveLegalMovesUci.length && effectiveLegalMovesSan.length && effectiveLegalMovesUci.length === effectiveLegalMovesSan.length) {
            effectiveLegalMovesUci.forEach((uci, index) => {
                map.set(uci, effectiveLegalMovesSan[index]);
            });
        }
        return map;
    }, [effectiveLegalMovesUci, effectiveLegalMovesSan]);
    const boardTheme = useMemo(
        () => BOARD_THEMES[boardThemeIndex] || BOARD_THEMES[6] || BOARD_THEMES[0],
        [boardThemeIndex]
    );
    const pieceSize = useMemo(() => Math.max(24, Math.floor((boardPixelSize / 8) * 0.86)), [boardPixelSize]);

    const playerIds = useMemo(() => {
        const ids = new Set();
        if (game?.white?.id != null) ids.add(String(game.white.id));
        if (game?.black?.id != null) ids.add(String(game.black.id));
        return ids;
    }, [game?.white?.id, game?.black?.id]);
    const isUserPlayer = Boolean(user?.id != null && playerIds.has(String(user.id)));
    const isUserWhite = useMemo(() => {
        if (!user?.id && !user?.username) return true;
        if (game?.white?.id != null) {
            return String(game.white.id) === String(user.id);
        }
        if (game?.black?.id != null && user?.id != null) {
            if (String(game.black.id) === String(user.id)) {
                return false;
            }
        }
        if (game?.white?.username && user?.username) {
            return game.white.username === user.username;
        }
        if (game?.black?.username && user?.username) {
            return game.black.username !== user.username;
        }
        return true;
    }, [game?.white?.id, game?.black?.id, game?.white?.username, game?.black?.username, user?.id, user?.username]);
    const premoveFen = useMemo(() => {
        if (!isUserPlayer || !displayFen) return null;
        try {
            const parts = displayFen.split(' ');
            if (parts.length < 2) return displayFen;
            const turnToken = isUserWhite ? 'w' : 'b';
            if (parts[1] === turnToken) return displayFen;
            return [parts[0], turnToken, ...parts.slice(2)].join(' ');
        } catch (err) {
            return displayFen;
        }
    }, [displayFen, isUserPlayer, isUserWhite]);
    const premoveMoveData = useMemo(() => {
        if (!premoveFen || !isUserPlayer) return { uci: [], san: [] };
        try {
            const chess = new Chess(premoveFen);
            const moves = chess.moves({ verbose: true });
            return {
                uci: moves.map((move) => `${move.from}${move.to}${move.promotion || ''}`),
                san: moves.map((move) => move.san),
            };
        } catch (err) {
            return { uci: [], san: [] };
        }
    }, [premoveFen, isUserPlayer]);
    const premoveMovesByFrom = useMemo(() => {
        const map = {};
        premoveMoveData.uci.forEach((uci) => {
            const from = uci.slice(0, 2);
            if (!map[from]) map[from] = [];
            map[from].push(uci);
        });
        return map;
    }, [premoveMoveData.uci]);
    const isCreator = Boolean(game?.creator?.id && user?.id && String(game.creator.id) === String(user.id));
    const opponentName = isUserPlayer
        ? (isUserWhite ? game?.black?.username : game?.white?.username)
        : null;
    const myColor = isUserPlayer ? (isUserWhite ? 'white' : 'black') : null;
    const playerChat = useMemo(
        () => chat.filter((msg) => (msg.room ? msg.room === 'players' : playerIds.has(msg.user_id))),
        [chat, playerIds]
    );
    const spectatorChat = useMemo(
        () => chat.filter((msg) => (msg.room ? msg.room === 'spectators' : !playerIds.has(msg.user_id))),
        [chat, playerIds]
    );
    const effectiveChatRoom = isUserPlayer ? 'players' : 'spectators';
    const activeChat = effectiveChatRoom === 'players' ? playerChat : spectatorChat;
    const mergedChat = useMemo(() => {
        const existing = new Set(activeChat.map((msg) => `${msg.user_id || msg.user || ''}|${msg.message}`));
        const roomFiltered = localChat.filter((msg) => !msg.room || msg.room === effectiveChatRoom);
        const merged = [...activeChat];
        roomFiltered.forEach((msg) => {
            const key = `${msg.user_id || msg.user || ''}|${msg.message}`;
            if (!existing.has(key)) {
                merged.push(msg);
            }
        });
        return merged;
    }, [activeChat, effectiveChatRoom, localChat]);
    const chatNotice = !isAuthenticated ? 'Sign in to chat.' : null;

    useEffect(() => {
        setChatRoom(effectiveChatRoom);
    }, [effectiveChatRoom]);
    useEffect(() => {
        setLocalChat([]);
    }, [gameId]);

    useEffect(() => {
        const status = state?.status || game?.status;
        if (!game || !isUserPlayer || !myColor) {
            setFirstMoveRemaining(null);
            return;
        }
        if (moveCount >= 2 || status !== 'active') {
            setFirstMoveRemaining(null);
            return;
        }
        let deadlineMs = null;
        let color = null;
        const deadline = state?.first_move_deadline ?? game?.first_move_deadline;
        const deadlineColor = state?.first_move_color ?? game?.first_move_color;
        if (deadline && deadlineColor) {
            deadlineMs = Number(deadline) * 1000;
            color = deadlineColor;
        } else if (game?.started_at) {
            const graceMs = 20000;
            if (moveCount === 0) {
                deadlineMs = new Date(game.started_at).getTime() + graceMs;
                color = 'white';
            } else if (moveCount === 1) {
                deadlineMs = new Date(game.started_at).getTime() + graceMs;
                color = 'black';
            }
        }
        if (!deadlineMs || !color || color !== myColor) {
            setFirstMoveRemaining(null);
            return;
        }
        const update = () => {
            const now = Date.now() + serverOffsetMs;
            const remainingMs = Math.max(0, deadlineMs - now);
            const remainingSeconds = Math.ceil(remainingMs / 1000);
            setFirstMoveRemaining(remainingSeconds);
        };
        update();
        const interval = setInterval(update, 1000);
        return () => clearInterval(interval);
    }, [
        game,
        isUserPlayer,
        myColor,
        moveCount,
        state?.status,
        game?.status,
        state?.first_move_deadline,
        state?.first_move_color,
        game?.first_move_deadline,
        game?.first_move_color,
        game?.started_at,
        serverOffsetMs,
    ]);
    const fenTurn = baseFen.split(' ')[1] === 'w' ? 'white' : 'black';
    const currentTurn = state?.turn || fenTurn;
    const currentStatus = state?.status || game?.status;
    const isGameOver = currentStatus === 'finished' || currentStatus === 'aborted';
    const displayError = !isGameOver ? (error || syncError) : null;
    const isUserTurn = isUserPlayer
        && ((isUserWhite && currentTurn === 'white') || (!isUserWhite && currentTurn === 'black'));
    const canInteract = isAuthenticated && isUserPlayer && !spectate && currentStatus === 'active' && isUserTurn && !pendingMove && !isPreviewing;
    const drawOfferBy = state && Object.prototype.hasOwnProperty.call(state, 'draw_offer_by')
        ? state.draw_offer_by
        : (game?.draw_offer_by ?? null);
    const canOfferDraw = isAuthenticated && isUserPlayer && currentStatus === 'active' && !drawOfferBy;
    const canResign = isAuthenticated && isUserPlayer && currentStatus === 'active';
    const isTournamentGame = Boolean(game?.tournament_id);
    const canAbort = isAuthenticated && isUserPlayer && currentStatus === 'active' && moveCount < 2 && !isTournamentGame;
    const clockTurn = state?.turn || fenTurn;
    const clockSource = useMemo(() => {
        const whiteRaw = state?.white_time_left ?? game?.white_time_left;
        const blackRaw = state?.black_time_left ?? game?.black_time_left;
        if (whiteRaw == null && blackRaw == null) return null;
        const white = whiteRaw != null ? Number(whiteRaw) : null;
        const black = blackRaw != null ? Number(blackRaw) : null;
        const serverTime = state?.server_time ?? null;
        const lastMoveAt = state?.last_move_at ?? game?.last_move_at ?? null;
        return {
            white,
            black,
            turn: clockTurn,
            serverTime: serverTime != null ? Number(serverTime) : null,
            lastMoveAt: lastMoveAt != null ? Number(lastMoveAt) : null,
        };
    }, [
        state?.white_time_left,
        state?.black_time_left,
        state?.server_time,
        state?.last_move_at,
        clockTurn,
        game?.white_time_left,
        game?.black_time_left,
        game?.last_move_at,
    ]);

    useEffect(() => {
        if (!clockSource) return;
        const anchorAt = clockSource.serverTime
            ? clockSource.serverTime * 1000
            : Date.now() + serverOffsetMs;
        clockAnchorRef.current = {
            ...clockSource,
            at: anchorAt,
        };
    }, [clockSource, serverOffsetMs]);

    useEffect(() => {
        clockNowRef.current = Date.now();
    }, [state?.fen, state?.moves]);
    useEffect(() => {
        if (currentStatus === 'finished' || currentStatus === 'aborted') {
            setShowAnalysis(true);
        } else if (currentStatus === 'active') {
            setShowAnalysis(false);
        }
    }, [currentStatus]);
    useEffect(() => {
        const container = mobileMovesRef.current;
        if (!container || !isMobileLayout) return;
        const active = container.querySelector('[data-active-move="true"]');
        if (active) {
            active.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
        }
    }, [previewIndex, isMobileLayout, moves.length]);
    const isOwnPiece = useCallback((piece) => {
        if (!piece) return false;
        const isWhitePiece = piece === piece.toUpperCase();
        return isUserWhite ? isWhitePiece : !isWhitePiece;
    }, [isUserWhite]);
    const resolveTargets = useCallback(
        (fromSquare) => (movesByFrom[fromSquare] || []).map((uci) => uci.slice(2, 4)),
        [movesByFrom]
    );
    const resolvePseudoTargets = useCallback((fromSquare) => {
        if (!fromSquare || !board?.length) return [];
        const file = fromSquare[0];
        const rank = Number(fromSquare[1]);
        const col = FILES.indexOf(file);
        const row = 8 - rank;
        if (col < 0 || row < 0 || row > 7) return [];
        const piece = board?.[row]?.[col];
        if (!piece) return [];
        const isWhitePiece = piece === piece.toUpperCase();
        const targets = [];
        const addTarget = (r, c) => {
            if (r >= 0 && r <= 7 && c >= 0 && c <= 7) {
                targets.push(`${FILES[c]}${8 - r}`);
            }
        };
        const slide = (dr, dc) => {
            let r = row + dr;
            let c = col + dc;
            while (r >= 0 && r <= 7 && c >= 0 && c <= 7) {
                addTarget(r, c);
                r += dr;
                c += dc;
            }
        };
        switch (piece.toLowerCase()) {
        case 'p': {
            const dir = isWhitePiece ? -1 : 1;
            const startRow = isWhitePiece ? 6 : 1;
            const oneRow = row + dir;
            if (oneRow >= 0 && oneRow <= 7) {
                addTarget(oneRow, col);
                if (row === startRow) addTarget(row + dir * 2, col);
                if (col > 0) addTarget(oneRow, col - 1);
                if (col < 7) addTarget(oneRow, col + 1);
            }
            break;
        }
        case 'n': {
            const jumps = [
                [-2, -1],
                [-2, 1],
                [-1, -2],
                [-1, 2],
                [1, -2],
                [1, 2],
                [2, -1],
                [2, 1],
            ];
            jumps.forEach(([dr, dc]) => addTarget(row + dr, col + dc));
            break;
        }
        case 'b':
            slide(-1, -1);
            slide(-1, 1);
            slide(1, -1);
            slide(1, 1);
            break;
        case 'r':
            slide(-1, 0);
            slide(1, 0);
            slide(0, -1);
            slide(0, 1);
            break;
        case 'q':
            slide(-1, -1);
            slide(-1, 1);
            slide(1, -1);
            slide(1, 1);
            slide(-1, 0);
            slide(1, 0);
            slide(0, -1);
            slide(0, 1);
            break;
        case 'k': {
            for (let dr = -1; dr <= 1; dr += 1) {
                for (let dc = -1; dc <= 1; dc += 1) {
                    if (dr === 0 && dc === 0) continue;
                    addTarget(row + dr, col + dc);
                }
            }
            break;
        }
        default:
            break;
        }
        return targets;
    }, [board]);
    const resolvePremoveTargets = useCallback((fromSquare) => {
        const premoveTargets = (premoveMovesByFrom[fromSquare] || []).map((uci) => uci.slice(2, 4));
        const pseudoTargets = resolvePseudoTargets(fromSquare);
        if (!pseudoTargets.length) return premoveTargets;
        const merged = new Set([...premoveTargets, ...pseudoTargets]);
        return Array.from(merged);
    }, [premoveMovesByFrom, resolvePseudoTargets]);
    const getPromotionOptions = useCallback((fromSquare, toSquare, usePremove = false) => {
        const source = usePremove ? premoveMovesByFrom : movesByFrom;
        const candidates = (source[fromSquare] || [])
            .filter((uci) => uci.slice(2, 4) === toSquare && uci.length === 5);
        if (candidates.length) {
            const order = ['q', 'r', 'b', 'n'];
            return order.filter((piece) => candidates.some((uci) => uci.endsWith(piece)));
        }
        if (usePremove) {
            const piece = squareMap[fromSquare];
            const rank = Number(toSquare[1]);
            if (piece && piece.toLowerCase() === 'p' && (rank === 1 || rank === 8)) {
                return ['q', 'r', 'b', 'n'];
            }
        }
        return [];
    }, [movesByFrom, premoveMovesByFrom, squareMap]);
    const resolveMoveUci = useCallback((fromSquare, toSquare) => {
        const candidates = (movesByFrom[fromSquare] || []).filter((uci) => uci.slice(2, 4) === toSquare);
        if (!candidates.length) return null;
        const queenPromotion = candidates.find((uci) => uci.length === 5 && uci.endsWith('q'));
        return queenPromotion || candidates[0];
    }, [movesByFrom]);
    const queuePremove = useCallback((fromSquare, toSquare) => {
        setSelectedSquare(null);
        setLegalTargets(EMPTY_SET);
        const piece = squareMap[fromSquare];
        if (!piece) return;
        const isPawn = piece.toLowerCase() === 'p';
        const isPromotion = isPawn && (toSquare[1] === '1' || toSquare[1] === '8');
        if (isPromotion) {
            if (!autoQueenEnabled) {
                const isWhitePiece = piece === piece?.toUpperCase();
                setPendingPromotion({
                    from: fromSquare,
                    to: toSquare,
                    options: ['q', 'r', 'b', 'n'],
                    color: isWhitePiece ? 'w' : 'b',
                    mode: 'premove',
                });
                return;
            }
            setPremove({ from: fromSquare, to: toSquare, promotion: 'q' });
            setPremoveNotice(null);
            return;
        }
        setPremove({ from: fromSquare, to: toSquare });
        setPremoveNotice(null);
    }, [autoQueenEnabled, squareMap]);
    const activeMoveIndex = isPreviewing ? previewIndex - 1 : navigation.uciList.length - 1;
    const activeMoveUci = (activeMoveIndex >= 0 && navigation.uciList[activeMoveIndex])
        || lastMoveUci
        || null;
    const lastMoveSquares = useMemo(() => {
        if (!activeMoveUci || activeMoveUci.length < 4) return null;
        return {
            from: activeMoveUci.slice(0, 2),
            to: activeMoveUci.slice(2, 4),
        };
    }, [activeMoveUci]);
    useLayoutEffect(() => {
        const overlay = moveAnimOverlayRef.current;
        const clearOverlay = () => {
            pieceMotionRef.current = null;
            if (overlay) overlay.style.display = 'none';
            const prev = boardRef.current?.querySelector('[data-anim-hide="true"]');
            if (prev) {
                prev.style.visibility = '';
                prev.removeAttribute('data-anim-hide');
            }
        };

        if (!activeMoveUci || activeMoveUci.length < 4 || isPreviewing || dragFrom) {
            if (skipNextMoveAnimationRef.current) skipNextMoveAnimationRef.current = false;
            clearOverlay();
            return;
        }
        if (skipNextMoveAnimationRef.current) {
            skipNextMoveAnimationRef.current = false;
            animatedMoveRef.current = activeMoveUci;
            clearOverlay();
            return;
        }
        if (animatedMoveRef.current === activeMoveUci) return;
        const from = activeMoveUci.slice(0, 2);
        const to = activeMoveUci.slice(2, 4);
        const piece = squareMap[to];
        if (!piece) {
            animatedMoveRef.current = activeMoveUci;
            return;
        }
        const fromPos = coordToDisplayPosition(from, isUserWhite);
        const toPos = coordToDisplayPosition(to, isUserWhite);
        if (!fromPos || !toPos) {
            animatedMoveRef.current = activeMoveUci;
            return;
        }
        if (!overlay || !boardRef.current) {
            animatedMoveRef.current = activeMoveUci;
            return;
        }
        const squareSize = Math.max(1, boardPixelSize / 8);
        const duration = isMobileLayout ? MOVE_ANIMATION_MS_MOBILE : MOVE_ANIMATION_MS_DESKTOP;
        animatedMoveRef.current = activeMoveUci;

        const PIECE_MAP = { p: 'P', r: 'R', n: 'N', b: 'B', q: 'Q', k: 'K' };
        const isWhitePiece = piece === piece.toUpperCase();
        const pieceType = piece.toLowerCase();
        const pieceCode = (isWhitePiece ? 'w' : 'b') + (PIECE_MAP[pieceType] || pieceType.toUpperCase());
        const pieceSetVal = typeof pieceSet === 'string' ? pieceSet : 'cburnett';
        const imgUrl = `https://lichess1.org/assets/piece/${pieceSetVal}/${pieceCode}.svg`;

        const startX = fromPos.col * squareSize;
        const startY = fromPos.row * squareSize;
        const endX = toPos.col * squareSize;
        const endY = toPos.row * squareSize;

        const destPieceEl = boardRef.current.querySelector(`[data-square="${to}"] [data-anim-piece]`);
        if (destPieceEl) {
            destPieceEl.setAttribute('data-anim-hide', 'true');
            destPieceEl.style.visibility = 'hidden';
        }

        pieceMotionRef.current = { to, piece };
        overlay.style.cssText = `
            position:absolute;left:${startX}px;top:${startY}px;
            width:${squareSize}px;height:${squareSize}px;
            pointer-events:none;z-index:40;display:flex;
            align-items:center;justify-content:center;
            transition:none;will-change:transform;
            transform:translate(0px,0px);
        `;
        overlay.innerHTML = `<img src="${imgUrl}" style="width:${squareSize}px;height:${squareSize}px;display:block;margin:auto;filter:drop-shadow(0 2px 2px rgba(0,0,0,0.3));object-fit:contain;user-select:none;" draggable="false" />`;

        let outerRaf;
        let innerRaf;
        outerRaf = requestAnimationFrame(() => {
            innerRaf = requestAnimationFrame(() => {
                overlay.style.transition = `transform ${duration}ms cubic-bezier(0.22, 0.8, 0.2, 1)`;
                overlay.style.transform = `translate(${endX - startX}px, ${endY - startY}px)`;
            });
        });
        const timeout = setTimeout(() => {
            clearOverlay();
        }, duration + 50);
        return () => {
            cancelAnimationFrame(outerRaf);
            cancelAnimationFrame(innerRaf);
            clearTimeout(timeout);
            clearOverlay();
        };
    }, [activeMoveUci, boardPixelSize, dragFrom, isMobileLayout, isPreviewing, isUserWhite, pieceSet, squareMap]);
    const checkSquare = useMemo(() => {
        try {
            const fen = isPreviewing ? previewFen : displayFen;
            if (!fen) return null;
            const turnFromFen = fen.split(' ')[1];
            const color = turnFromFen === 'b' ? 'b' : 'w';

            if (!isPreviewing && state?.is_check === false) return null;

            let isInCheck;
            if (!isPreviewing && state?.is_check != null) {
                isInCheck = state.is_check;
            } else {
                const chess = new Chess(fen || DEFAULT_FEN);
                isInCheck = typeof chess.isCheck === 'function'
                    ? chess.isCheck()
                    : typeof chess.inCheck === 'function'
                        ? chess.inCheck()
                        : typeof chess.in_check === 'function'
                            ? chess.in_check()
                            : false;
            }
            if (!isInCheck) return null;
            if (isUserPlayer) {
                const userColor = isUserWhite ? 'w' : 'b';
                if (color !== userColor) return null;
            }
            const kingChar = color === 'w' ? 'K' : 'k';
            if (board) {
                for (let row = 0; row < board.length; row += 1) {
                    for (let col = 0; col < (board[row]?.length || 0); col += 1) {
                        if (board[row][col] === kingChar) {
                            return `${FILES[col]}${8 - row}`;
                        }
                    }
                }
            }
            return null;
        } catch (err) {
            return null;
        }
    }, [board, displayFen, previewFen, isPreviewing, isUserPlayer, isUserWhite, state?.is_check]);
    const drawerOpen = leftDrawerOpen || rightDrawerOpen;

    useEffect(() => {
        if (!dragFrom) return;
        setSelectedSquare(dragFrom);
        if (canInteract) {
            setLegalTargets(new Set(resolveTargets(dragFrom)));
            return;
        }
        if (!isUserTurn && isUserPlayer && currentStatus === 'active' && !isPreviewing) {
            setLegalTargets(new Set(resolvePremoveTargets(dragFrom)));
            return;
        }
        setLegalTargets(EMPTY_SET);
    }, [
        canInteract,
        currentStatus,
        dragFrom,
        isPreviewing,
        isUserPlayer,
        isUserTurn,
        resolvePremoveTargets,
        resolveTargets,
    ]);

    const preSelectRef = useRef(null);
    useEffect(() => {
        if (!canInteract) {
            if (selectedSquare) {
                preSelectRef.current = selectedSquare;
            }
            if (!dragFrom && !selectedSquare) {
                setLegalTargets(EMPTY_SET);
            }
            setPendingPromotion(null);
            return;
        }
        const sq = selectedSquare || preSelectRef.current;
        preSelectRef.current = null;
        if (sq && !dragFrom) {
            const piece = squareMap[sq];
            if (piece && isOwnPiece(piece)) {
                if (sq !== selectedSquare) setSelectedSquare(sq);
                setLegalTargets(new Set(resolveTargets(sq)));
            } else {
                setSelectedSquare(null);
                setLegalTargets(EMPTY_SET);
            }
        }
    }, [canInteract, dragFrom, selectedSquare, squareMap, isOwnPiece, resolveTargets]);
    useEffect(() => {
        if (currentStatus !== 'active') {
            setPremove(null);
        }
    }, [currentStatus]);
    useEffect(() => {
        setPendingPromotion(null);
    }, [displayFen]);

    useEffect(() => {
        if (optimisticState) {
            const serverFen = state?.fen || game?.current_fen;
            const serverMoves = state?.moves || game?.moves || '';
            let shouldClear = false;
            if (serverFen && optimisticState.fen && serverFen === optimisticState.fen) shouldClear = true;
            if (!shouldClear && serverMoves && optimisticState.moves && serverMoves === optimisticState.moves) shouldClear = true;
            if (!shouldClear && serverMoves && optimisticState.moves) {
                const serverCount = serverMoves.trim() ? serverMoves.split(' ').length : 0;
                const optimisticCount = optimisticState.moves.trim() ? optimisticState.moves.split(' ').length : 0;
                if (serverCount >= optimisticCount) shouldClear = true;
            }
            if (shouldClear) {
                setOptimisticState(null);
                if (state?.uci) setLastMoveUci(state.uci);
                return;
            }
        }
        if (state?.uci) setLastMoveUci(state.uci);
    }, [optimisticState, state?.fen, state?.moves, state?.uci, game?.current_fen, game?.moves]);

    useEffect(() => {
        if (currentStatus !== 'active') {
            setResignConfirm(false);
        }
    }, [currentStatus, gameId]);
    useEffect(() => {
        setLastMoveUci(null);
        animatedMoveRef.current = null;
        skipNextMoveAnimationRef.current = false;
        pieceMotionRef.current = null;
        if (moveAnimOverlayRef.current) moveAnimOverlayRef.current.style.display = 'none';
    }, [gameId]);
    useEffect(() => {
        const prevOffer = drawOfferRef.current;
        const result = state?.result || game?.result;
        if (prevOffer && prevOffer === user?.id && !drawOfferBy) {
            if (!(currentStatus === 'finished' && result === '1/2-1/2')) {
                setDrawNotice('Draw offer declined.');
            }
        }
        drawOfferRef.current = drawOfferBy;
    }, [drawOfferBy, currentStatus, game?.result, state?.result, user?.id]);
    useEffect(() => {
        if (!state?.rematch_status) return;
        if (state.rematch_status === 'rematch_rejected') {
            setRematchNotice('Rematch offer rejected.');
        } else if (state.rematch_status === 'rematch_cancelled') {
            setRematchNotice('Rematch offer cancelled.');
        } else if (state.rematch_status === 'rematch_expired') {
            setRematchNotice('Rematch offer expired.');
        }
    }, [state?.rematch_status]);
    useEffect(() => {
        if (!drawNotice) return;
        const timeout = setTimeout(() => setDrawNotice(null), 3500);
        return () => clearTimeout(timeout);
    }, [drawNotice]);
    useEffect(() => {
        if (!rematchNotice) return;
        const timeout = setTimeout(() => setRematchNotice(null), 3500);
        return () => clearTimeout(timeout);
    }, [rematchNotice]);
    useEffect(() => {
        if (!premoveNotice) return;
        const timeout = setTimeout(() => setPremoveNotice(null), 2500);
        return () => clearTimeout(timeout);
    }, [premoveNotice]);
    useEffect(() => {
        if (!game?.id) return;
        if (isUserPlayer) {
            if (spectate) setSpectate(false);
            return;
        }
        if (!spectate) {
            setSpectate(true);
        }
    }, [game?.id, isUserPlayer, spectate]);
    useEffect(() => {
        if (syncError && syncError.toLowerCase().includes('not active')) {
            setSpectate(false);
        }
    }, [syncError]);

    const stopAnalysisPolling = useCallback(() => {
        if (analysisPollRef.current) {
            clearInterval(analysisPollRef.current);
            analysisPollRef.current = null;
        }
    }, []);

    const loadAnalysisStatus = useCallback(async () => {
        if (!gameId) return;
        try {
            const data = await fetchGameAnalysisStatus(gameId);
            setAnalysisStatus(data?.status || null);
            setAnalysisData(data || null);
            setAnalysisError(data?.error || null);
            if (data?.status === 'queued' || data?.status === 'running') {
                if (!analysisPollRef.current) {
                    analysisPollRef.current = setInterval(loadAnalysisStatus, 4000);
                }
            } else {
                stopAnalysisPolling();
            }
        } catch (err) {
            setAnalysisError('Failed to load analysis status.');
        }
    }, [gameId, stopAnalysisPolling]);

    const loadQuickAnalysis = useCallback(async () => {
        if (!gameId) return;
        try {
            const data = await fetchGameAnalysis(gameId);
            const score = data?.engine?.score;
            const numericScore = typeof score === 'number' ? score / 100 : null;
            setQuickEval(numericScore);
        } catch (err) {
            setQuickEval(null);
        }
    }, [gameId]);

    useEffect(() => {
        if (game?.status === 'finished') {
            loadAnalysisStatus();
        } else {
            setAnalysisStatus(null);
            setAnalysisData(null);
            setAnalysisError(null);
            stopAnalysisPolling();
        }
        return () => stopAnalysisPolling();
    }, [game?.status, loadAnalysisStatus, stopAnalysisPolling]);

    useEffect(() => {
        const canQuickAnalyze = game?.id
            && (!isAuthenticated || (!authLoading && user && (!isUserPlayer || currentStatus !== 'active')));
        if (!canQuickAnalyze) {
            setQuickEval(null);
            return;
        }
        loadQuickAnalysis();
    }, [game?.id, authLoading, currentStatus, isAuthenticated, isUserPlayer, loadQuickAnalysis, user]);
    const topPlayer = isUserWhite ? game?.black : game?.white;
    const bottomPlayer = isUserWhite ? game?.white : game?.black;
    const liveClock = useMemo(() => {
        if (!clockSource) {
            return { white: null, black: null, turn: clockTurn };
        }
        let white = clockSource.white;
        let black = clockSource.black;
        if (clockSource.serverTime && currentStatus === 'active') {
            const transitSec = Math.max(0, (Date.now() - clockSource.serverTime * 1000) / 1000);
            if (clockSource.turn === 'white' && white != null) {
                white = Math.max(0, white - transitSec);
            } else if (clockSource.turn === 'black' && black != null) {
                black = Math.max(0, black - transitSec);
            }
        }
        return { white, black, turn: clockSource.turn || clockTurn };
    }, [clockSource, clockTurn, currentStatus]);
    const topClock = isUserWhite ? liveClock.black : liveClock.white;
    const bottomClock = isUserWhite ? liveClock.white : liveClock.black;
    const analysisMoves = useMemo(() => analysisData?.analysis?.moves ?? [], [analysisData]);
    const analysisSummary = analysisData?.analysis?.summary || null;
    const classificationMap = useMemo(() => {
        const map = {};
        for (const m of analysisMoves) {
            if (m.classification) map[m.move_number] = m.classification;
        }
        return map;
    }, [analysisMoves]);
    const analyzedMovesCount = analysisSummary?.analyzed_moves
        ?? analysisMoves.filter((move) => typeof move?.eval === 'number').length;
    const totalAnalysisMoves = analysisSummary?.total_moves ?? analysisMoves.length;
    const analysisProgress = totalAnalysisMoves
        ? Math.min(100, Math.round((analyzedMovesCount / totalAnalysisMoves) * 100))
        : 0;
    const analysisIncomplete = analysisStatus === 'completed'
        && totalAnalysisMoves > 0
        && analyzedMovesCount < totalAnalysisMoves;
    const analysisEvalSeries = useMemo(() => {
        const targetLength = Math.max(analysisMoves.length, moves.length);
        if (!targetLength) return [];
        let last = null;
        return Array.from({ length: targetLength }, (_, index) => {
            const raw = analysisMoves[index]?.eval;
            if (typeof raw === 'number') {
                last = raw;
            }
            return last != null ? last : 0;
        });
    }, [analysisMoves, moves.length]);
    const evalGraph = useMemo(() => {
        if (!analysisEvalSeries.length) return null;
        const n = analysisEvalSeries.length;
        const viewW = Math.max(n - 1, 1);
        const viewH = 200;
        const cy = viewH / 2;
        const points = analysisEvalSeries.map((val, i) => {
            const c = Math.max(-10, Math.min(10, Number.isFinite(val) ? val : 0));
            return { x: i, y: cy - (c / 10) * cy };
        });
        const areaPath = `M 0,${cy} ${points.map((p) => `L ${p.x},${p.y}`).join(' ')} L ${viewW},${cy} Z`;
        const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`).join(' ');
        return { points, areaPath, linePath, viewW, viewH, cy, n };
    }, [analysisEvalSeries]);
    const phaseBoundaries = useMemo(() => {
        const list = navigation.phaseList;
        const bounds = [];
        for (let i = 1; i < list.length; i++) {
            if (list[i] !== list[i - 1]) bounds.push({ index: i, label: list[i] });
        }
        return bounds;
    }, [navigation.phaseList]);
    const phaseCounts = useMemo(() => {
        const counts = { opening: 0, middlegame: 0, endgame: 0 };
        navigation.phaseList.forEach((phase) => {
            if (counts[phase] != null) counts[phase] += 1;
        });
        return counts;
    }, [navigation.phaseList]);
    const phaseTotal = phaseCounts.opening + phaseCounts.middlegame + phaseCounts.endgame;
    const phasePercents = phaseTotal
        ? {
            opening: Math.round((phaseCounts.opening / phaseTotal) * 100),
            middlegame: Math.round((phaseCounts.middlegame / phaseTotal) * 100),
            endgame: Math.round((phaseCounts.endgame / phaseTotal) * 100),
        }
        : { opening: 0, middlegame: 0, endgame: 0 };
    const analysisEval = useMemo(() => {
        if (!analysisMoves.length) return null;
        const targetIndex = Math.max(0, Math.min(activeMoveIndex, analysisMoves.length - 1));
        const direct = analysisMoves[targetIndex]?.eval;
        if (typeof direct === 'number') return direct;
        for (let i = targetIndex; i >= 0; i -= 1) {
            const score = analysisMoves[i]?.eval;
            if (typeof score === 'number') return score;
        }
        for (let i = targetIndex + 1; i < analysisMoves.length; i += 1) {
            const score = analysisMoves[i]?.eval;
            if (typeof score === 'number') return score;
        }
        return null;
    }, [analysisMoves, activeMoveIndex]);
    const quickEvalWhite = useMemo(() => {
        if (quickEval == null) return null;
        return currentTurn === 'white' ? quickEval : -quickEval;
    }, [quickEval, currentTurn]);
    const effectiveEval = analysisEval ?? quickEvalWhite;
    const evalSplit = useMemo(() => {
        if (effectiveEval == null) {
            return { white: 50, black: 50 };
        }
        const clamped = Math.max(-10, Math.min(10, effectiveEval));
        const white = Math.round(50 + (clamped / 20) * 100);
        return { white: Math.max(0, Math.min(100, white)), black: Math.max(0, 100 - white) };
    }, [effectiveEval]);
    const showEvalBar = showAnalysis && effectiveEval != null;
    const evalBarFlip = isUserWhite;
    const activeClock = liveClock.turn === 'white' ? liveClock.white : liveClock.black;
    const rematchBy = state?.rematch_requested_by ?? game?.rematch_requested_by ?? null;
    const rematchAt = state?.rematch_requested_at ?? game?.rematch_requested_at ?? null;
    const rematchStatus = state?.rematch_status ?? game?.rematch_status ?? null;
    const rematchGameId = state?.rematch_game_id ?? game?.rematch_game_id ?? null;
    const rematchRequestedAtMs = rematchAt ? new Date(rematchAt).getTime() : null;
    const rematchExpired = rematchRequestedAtMs
        ? Date.now() > rematchRequestedAtMs + 5 * 60 * 1000
        : false;
    const rematchExpiredDisplay = rematchExpired || rematchStatus === 'rematch_expired';
    const rematchActive = Boolean(rematchBy)
        && !rematchExpiredDisplay
        && !['rematch_cancelled', 'rematch_rejected'].includes(rematchStatus || '');
    const isRematchRequester = rematchBy && user?.id && String(rematchBy) === String(user.id);
    const rematchWindowEndMs = game?.finished_at
        ? new Date(game.finished_at).getTime() + 10 * 60 * 1000
        : null;
    const rematchWindowExpired = rematchWindowEndMs ? Date.now() > rematchWindowEndMs : false;
    const showRematchActions = isUserPlayer
        && (currentStatus === 'finished' || currentStatus === 'aborted')
        && !rematchWindowExpired
        && !isTournamentGame;

    useEffect(() => {
        if (!rematchWindowEndMs) return;
        const remaining = rematchWindowEndMs - Date.now();
        if (remaining <= 0) return;
        const timeout = setTimeout(() => {
            setRematchNotice(null);
        }, remaining + 50);
        return () => clearTimeout(timeout);
    }, [rematchWindowEndMs]);

    useEffect(() => {
        if (!rematchStatus) return;
        if (rematchWindowExpired) return;
        if (rematchStatus === 'rematch_rejected') {
            setRematchNotice('Rematch offer declined.');
        } else if (rematchStatus === 'rematch_cancelled') {
            setRematchNotice('Rematch offer cancelled.');
        } else if (rematchStatus === 'rematch_expired') {
            setRematchNotice('Rematch offer expired.');
        }
    }, [rematchStatus, rematchWindowExpired]);

    const topAvatar = topPlayer?.profile_pic || topPlayer?.avatar || topPlayer?.image || '';
    const bottomAvatar = bottomPlayer?.profile_pic || bottomPlayer?.avatar || bottomPlayer?.image || '';
    const topInitials = topPlayer?.username?.slice(0, 2).toUpperCase() || 'OP';
    const bottomInitials = bottomPlayer?.username?.slice(0, 2).toUpperCase() || 'ME';
    const resolveRating = (player) => {
        if (!player) return '--';
        const control = game?.time_control || 'blitz';
        const fieldMap = {
            bullet: 'rating_bullet',
            blitz: 'rating_blitz',
            rapid: 'rating_rapid',
            classical: 'rating_classical',
        };
        const key = fieldMap[control] || 'rating_blitz';
        return player[key] ?? player.rating ?? player.rating_blitz ?? '--';
    };
    const formatRatingDelta = (delta) => {
        if (delta == null) return null;
        const value = Number(delta);
        if (!Number.isFinite(value) || value === 0) return null;
        return {
            text: value > 0 ? `+${value}` : `${value}`,
            className: value > 0 ? 'text-emerald-500' : 'text-rose-500',
        };
    };
    const whiteDelta = formatRatingDelta(game?.white_rating_delta);
    const blackDelta = formatRatingDelta(game?.black_rating_delta);
    const topMeta = topPlayer
        ? `${resolveRating(topPlayer)} • ${topPlayer.country || 'INT'}`
        : '-- • --';
    const bottomMeta = bottomPlayer
        ? `${resolveRating(bottomPlayer)} • ${bottomPlayer.country || 'INT'}`
        : '-- • --';
    const topColor = isUserWhite ? 'black' : 'white';
    const bottomColor = isUserWhite ? 'white' : 'black';
    const topTag = topPlayer?.is_bot ? null : getBlitzTag(topPlayer?.rating_blitz);
    const bottomTag = bottomPlayer?.is_bot ? null : getBlitzTag(bottomPlayer?.rating_blitz);
    const showFirstMoveCountdown = firstMoveRemaining != null && currentStatus === 'active' && moveCount < 2 && !isTournamentGame;
    const isFirstMoveUrgent = firstMoveRemaining != null && firstMoveRemaining <= 10;
    const showMoveHints = Boolean(selectedSquare);
    const topClockDisplay = topClock;
    const bottomClockDisplay = bottomClock;
    const topClockActive = liveClock.turn === topColor;
    const bottomClockActive = liveClock.turn === bottomColor;
    const firstMoveLabel = 'Play your first move';

    const outcome = useMemo(() => {
        if (!game) return null;
        const status = game.status || state?.status;
        const result = game.result || state?.result;
        const reason = state?.reason || state?.finish_reason;
        if (status === 'aborted') {
            const reasonLabel = reason === 'first_move_timeout'
                ? 'First move timed out'
                : reason === 'challenge_expired'
                    ? 'Challenge expired'
                    : reason === 'challenge_rejected'
                        ? 'Challenge rejected'
                        : reason === 'challenge_aborted'
                            ? 'Challenge aborted'
                    : 'Game aborted';
            return { label: 'Game aborted', sublabel: reasonLabel, tone: 'warning' };
        }
        if (status === 'finished') {
            if (result === '1/2-1/2') {
                return { label: 'Draw', sublabel: 'Game ended in a draw', tone: 'neutral' };
            }
            const winner = result === '1-0' ? game.white : game.black;
            const winnerName = winner?.username || (result === '1-0' ? 'White' : 'Black');
            if (!isUserPlayer) {
                return {
                    label: result === '1-0' ? 'White wins' : 'Black wins',
                    sublabel: `Winner: ${winnerName}`,
                    tone: 'neutral',
                };
            }
            const userWon = (result === '1-0' && isUserWhite) || (result === '0-1' && !isUserWhite);
            return {
                label: userWon ? 'You won' : 'You lost',
                sublabel: userWon ? `Winner: ${winnerName}` : `Winner: ${winnerName}`,
                tone: userWon ? 'success' : 'danger',
            };
        }
        return null;
    }, [game, state?.status, state?.result, state?.reason, state?.finish_reason, isUserWhite, isUserPlayer]);
    useEffect(() => {
        if (state?.rematch_status !== 'rematch_accepted') return;
        if (!rematchGameId) return;
        if (String(rematchGameId) === String(gameId)) return;
        navigate(`/game/${rematchGameId}`);
    }, [gameId, navigate, rematchGameId, state?.rematch_status]);

    const formatClock = (seconds) => {
        if (seconds == null) return '--:--';
        const mins = Math.floor(seconds / 60);
        const secs = Math.max(seconds % 60, 0);
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    };

    const ensureAudioContext = useCallback((force = false) => {
        if (!soundEnabled || typeof window === 'undefined') return null;
        if (force) {
            audioGestureAtRef.current = Date.now();
        }
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return null;
        if (!audioCtxRef.current) {
            if (!force) return null;
            try {
                audioCtxRef.current = new AudioContextClass();
            } catch (err) {
                return null;
            }
        }
        if (audioCtxRef.current.state === 'suspended') {
            audioCtxRef.current.resume().catch(() => {});
        }
        return audioCtxRef.current;
    }, [soundEnabled]);

    const playTone = useCallback((frequency, duration, type, volume) => {
        try {
            const interactedRecently = Date.now() - audioGestureAtRef.current < 1500;
            const context = ensureAudioContext(interactedRecently);
            if (!context) return;
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            const now = context.currentTime;
            oscillator.type = type;
            oscillator.frequency.setValueAtTime(frequency, now);
            gain.gain.setValueAtTime(volume, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
            oscillator.connect(gain);
            gain.connect(context.destination);
            oscillator.start(now);
            oscillator.stop(now + duration);
        } catch (err) {
            // ignore audio errors to avoid breaking the UI
        }
    }, [ensureAudioContext]);

    const playMoveSound = useCallback((isCapture = false) => {
        if (!soundEnabled) return;
        playTone(
            isCapture ? 190 : 260,
            isCapture ? 0.1 : 0.06,
            isCapture ? 'sine' : 'triangle',
            isCapture ? 0.12 : 0.08
        );
    }, [playTone, soundEnabled]);

    const playTickSound = useCallback(() => {
        if (!soundEnabled) return;
        playTone(820, 0.03, 'square', 0.03);
    }, [playTone, soundEnabled]);

    useEffect(() => {
        if (typeof window === 'undefined' || !soundEnabled) return;
        const unlock = () => {
            const context = ensureAudioContext(true);
            if (context && context.state === 'suspended') {
                context.resume().catch(() => {});
            }
        };
        window.addEventListener('pointerdown', unlock, true);
        window.addEventListener('touchstart', unlock, true);
        window.addEventListener('mousedown', unlock, true);
        window.addEventListener('keydown', unlock, true);
        window.addEventListener('click', unlock, true);
        return () => {
            window.removeEventListener('pointerdown', unlock, true);
            window.removeEventListener('touchstart', unlock, true);
            window.removeEventListener('mousedown', unlock, true);
            window.removeEventListener('keydown', unlock, true);
            window.removeEventListener('click', unlock, true);
        };
    }, [ensureAudioContext, soundEnabled]);

    useEffect(() => {
        if (soundEnabled) return;
        soundInitRef.current = false;
        lastSoundMoveRef.current = 0;
    }, [soundEnabled]);

    useEffect(() => {
        if (!soundEnabled) return;
        if (!soundInitRef.current) {
            soundInitRef.current = true;
            lastSoundMoveRef.current = moves.length;
            return;
        }
        if (!moves.length) {
            lastSoundMoveRef.current = 0;
            return;
        }
        const count = moves.length;
        if (count < lastSoundMoveRef.current) {
            lastSoundMoveRef.current = count;
            return;
        }
        if (count === lastSoundMoveRef.current) return;
        if (isPreviewing) {
            lastSoundMoveRef.current = count;
            return;
        }
        try {
            const lastSan = moves[count - 1] || '';
            const isCapture = lastSan.includes('x');
            playMoveSound(isCapture);
        } catch (err) {
            // ignore errors to avoid crashing the UI
        }
        lastSoundMoveRef.current = count;
    }, [moves, isPreviewing, playMoveSound, soundEnabled]);

    useEffect(() => {
        lastTickRef.current = null;
    }, [liveClock.turn, currentStatus, gameId]);

    useEffect(() => {
        if (!soundEnabled || currentStatus !== 'active' || moveCount < 2) return;
        if (activeClock == null) return;
        const seconds = Math.ceil(activeClock);
        if (seconds <= 10 && seconds !== lastTickRef.current) {
            lastTickRef.current = seconds;
            playTickSound();
        }
    }, [activeClock, currentStatus, moveCount, playTickSound, soundEnabled]);

    const handleResign = async () => {
        if (!isAuthenticated) {
            navigate('/login');
            return;
        }
        setResignConfirm((prev) => !prev);
    };

    const confirmResign = async () => {
        if (!isAuthenticated) {
            navigate('/login');
            return;
        }
        setResignLoading(true);
        try {
            await resignGame(gameId);
            setResignConfirm(false);
            if (syncEvents) {
                await syncEvents(true);
                setTimeout(() => {
                    syncEvents(true);
                }, 800);
            }
        } catch (err) {
            setError(err.message || 'Failed to resign.');
        } finally {
            setResignLoading(false);
        }
    };

    const handleSubmitReport = async () => {
        if (!isAuthenticated || !game?.id) return;
        setReportLoading(true);
        setReportResult(null);
        try {
            await submitCheatReport({ game: game.id, reason: reportReason, description: reportDescription });
            setReportResult('success');
            setTimeout(() => setReportModalOpen(false), 1500);
        } catch (err) {
            const msg = err?.data?.detail || err?.data?.game?.[0] || err?.data?.non_field_errors?.[0] || err?.message || 'Failed to submit report.';
            setReportResult(msg);
        } finally {
            setReportLoading(false);
        }
    };

    const handleOfferDraw = async () => {
        if (!isAuthenticated) {
            navigate('/login');
            return;
        }
        try {
            await offerDraw(gameId);
        } catch (err) {
            setError(err.message || 'Failed to offer draw.');
        }
    };

    const handleRespondDraw = async (decision) => {
        if (!isAuthenticated) {
            navigate('/login');
            return;
        }
        try {
            await respondDraw(gameId, decision);
        } catch (err) {
            setError(err.message || 'Failed to respond to draw.');
        }
    };

    const handleRequestRematch = async () => {
        if (!isAuthenticated) {
            navigate('/login');
            return;
        }
        setRematchLoading(true);
        try {
            await requestRematch(gameId);
        } catch (err) {
            setRematchNotice(err.message || 'Failed to request rematch.');
        } finally {
            setRematchLoading(false);
        }
    };

    const handleAcceptRematch = async () => {
        if (!isAuthenticated) {
            navigate('/login');
            return;
        }
        setRematchLoading(true);
        try {
            const response = await acceptRematch(gameId);
            if (response?.id) {
                navigate(`/game/${response.id}`);
            }
        } catch (err) {
            setRematchNotice(err.message || 'Failed to accept rematch.');
        } finally {
            setRematchLoading(false);
        }
    };

    const handleRejectRematch = async () => {
        if (!isAuthenticated) {
            navigate('/login');
            return;
        }
        setRematchLoading(true);
        try {
            await rejectRematch(gameId);
        } catch (err) {
            setRematchNotice(err.message || 'Failed to reject rematch.');
        } finally {
            setRematchLoading(false);
        }
    };

    const handleCancelRematch = async () => {
        if (!isAuthenticated) {
            navigate('/login');
            return;
        }
        setRematchLoading(true);
        try {
            await cancelRematch(gameId);
            setRematchNotice('Rematch offer cancelled.');
        } catch (err) {
            setRematchNotice(err.message || 'Failed to cancel rematch.');
        } finally {
            setRematchLoading(false);
        }
    };

    const handleRequestAnalysis = async (force = false) => {
        if (!gameId) return;
        setAnalysisLoading(true);
        setAnalysisError(null);
        try {
            const data = await requestGameAnalysis(gameId, force ? { force: true } : {});
            setAnalysisStatus(data?.status || null);
            setAnalysisData(data || null);
            setShowAnalysis(true);
            if (data?.status === 'queued' || data?.status === 'running') {
                if (!analysisPollRef.current) {
                    analysisPollRef.current = setInterval(loadAnalysisStatus, 4000);
                }
            }
        } catch (err) {
            setAnalysisError(err.message || 'Failed to request analysis.');
        } finally {
            setAnalysisLoading(false);
        }
    };

    const handleAbort = async () => {
        if (!isAuthenticated) {
            navigate('/login');
            return;
        }
        if (!canAbort) {
            setError('Abort is no longer available.');
            return;
        }
        try {
            await abortGame(gameId);
            if (syncEvents) {
                await syncEvents(true);
                setTimeout(() => {
                    syncEvents(true);
                }, 800);
            }
        } catch (err) {
            setError(err.message || 'Failed to abort.');
        }
    };

    const handleAccept = async () => {
        if (!isAuthenticated) {
            navigate('/login');
            return;
        }
        try {
            await acceptGame(gameId);
        } catch (err) {
            setError(err.message || 'Failed to accept game.');
        }
    };

    const handleReject = async () => {
        if (!isAuthenticated) {
            navigate('/login');
            return;
        }
        try {
            await rejectGame(gameId);
            navigate('/play');
        } catch (err) {
            setError(err.message || 'Failed to reject game.');
        }
    };

    const handleCancelChallenge = async () => {
        if (!isAuthenticated) {
            navigate('/login');
            return;
        }
        try {
            await abortGame(gameId);
            if (syncEvents) {
                await syncEvents(true);
            }
        } catch (err) {
            setError(err.message || 'Failed to cancel challenge.');
        }
    };

    const applyLocalMove = useCallback((move, format = 'san') => {
        try {
            const chess = new Chess(displayFen);
            let applied;
            if (format === 'uci') {
                const from = move.slice(0, 2);
                const to = move.slice(2, 4);
                const promotion = move.length > 4 ? move[4] : undefined;
                applied = chess.move({ from, to, promotion });
            } else {
                applied = chess.move(move, { sloppy: true });
            }
            if (!applied) return null;
            const san = applied.san;
            const nextMoves = displayMoves ? `${displayMoves} ${san}` : san;
            const uci = `${applied.from}${applied.to}${applied.promotion || ''}`;
            const nextCount = nextMoves ? nextMoves.split(' ').length : 0;
            if (nextCount) {
                lastSoundMoveRef.current = nextCount;
            }
            playMoveSound(Boolean(applied.captured));
            return {
                san,
                uci,
                fen: chess.fen(),
                moves: nextMoves,
                legal_moves: null,
                captured: Boolean(applied.captured),
            };
        } catch (err) {
            return null;
        }
    }, [displayFen, displayMoves, playMoveSound]);

    const submitMoveFromUci = useCallback(async (uciMove) => {
        if (!isAuthenticated) {
            navigate('/login');
            return;
        }
        if (pendingMove) return;
        if (!canInteract) {
            if (currentStatus === 'active') {
                setError('You cannot move right now.');
            }
            return;
        }
        setPendingMove(true);
        setError(null);
        const local = applyLocalMove(uciMove, 'uci');
        if (local) {
            setOptimisticState({
                fen: local.fen,
                moves: local.moves,
                legal_moves: local.legal_moves,
            });
            setLastMoveUci(local.uci);
        }
        try {
            const sanMove = local?.san || moveMap.get(uciMove);
            if (!sanMove) {
                throw new Error('Move not available yet. Please try again.');
            }
            await makeMove(gameId, sanMove);
        } catch (err) {
            const message = err.message || 'Move rejected.';
            if (!(message.toLowerCase().includes('not active') && currentStatus !== 'active')) {
                setError(message);
            }
            setOptimisticState(null);
        } finally {
            setPendingMove(false);
        }
    }, [applyLocalMove, canInteract, currentStatus, gameId, isAuthenticated, moveMap, navigate, pendingMove]);

    useEffect(() => {
        if (!premove || !isUserPlayer || !isUserTurn || pendingMove || isPreviewing || currentStatus !== 'active') return;
        const uci = `${premove.from}${premove.to}${premove.promotion || ''}`;
        if (effectiveLegalMovesUci.includes(uci)) {
            setPremove(null);
            submitMoveFromUci(uci);
            return;
        }
        setPremove(null);
        setPremoveNotice(null);
    }, [currentStatus, effectiveLegalMovesUci, isPreviewing, isUserPlayer, isUserTurn, pendingMove, premove, submitMoveFromUci]);

    const handlePromotionSelect = async (promotion) => {
        if (!pendingPromotion) return;
        const { from, to, mode, origin } = pendingPromotion;
        setPendingPromotion(null);
        if (mode === 'premove') {
            setPremove({ from, to, promotion });
            setPremoveNotice(null);
            return;
        }
        if (origin === 'drag') {
            skipNextMoveAnimationRef.current = true;
        }
        await submitMoveFromUci(`${from}${to}${promotion}`);
    };

    const handleSquareClick = async (squareCoord) => {
        if (pendingPromotion) return;
        if (premove) {
            setPremove(null);
            setPremoveNotice(null);
            return;
        }
        const justTapped = tapSelectedRef.current;
        if (justTapped) tapSelectedRef.current = null;

        if (!canInteract) {
            if (!isUserTurn && isUserPlayer && currentStatus === 'active' && !isPreviewing) {
                const piece = squareMap[squareCoord];
                if (!selectedSquare) {
                    if (piece && isOwnPiece(piece)) {
                        setSelectedSquare(squareCoord);
                        preSelectRef.current = squareCoord;
                        setLegalTargets(new Set(resolvePremoveTargets(squareCoord)));
                    }
                    return;
                }
                if (selectedSquare === squareCoord) {
                    if (justTapped === squareCoord) return;
                    setSelectedSquare(null);
                    preSelectRef.current = null;
                    setLegalTargets(EMPTY_SET);
                    return;
                }
                if (selectedSquare && selectedSquare !== squareCoord) {
                    preSelectRef.current = null;
                    queuePremove(selectedSquare, squareCoord);
                    return;
                }
                if (piece && isOwnPiece(piece)) {
                    setSelectedSquare(squareCoord);
                    preSelectRef.current = squareCoord;
                    setLegalTargets(new Set(resolvePremoveTargets(squareCoord)));
                }
            }
            return;
        }
        const piece = squareMap[squareCoord];
        if (!selectedSquare) {
            if (piece && isOwnPiece(piece)) {
                setSelectedSquare(squareCoord);
                setLegalTargets(new Set(resolveTargets(squareCoord)));
            }
            return;
        }
        if (selectedSquare === squareCoord) {
            if (justTapped === squareCoord) return;
            setSelectedSquare(null);
            setLegalTargets(EMPTY_SET);
            return;
        }
        if (legalTargets.has(squareCoord)) {
            setSelectedSquare(null);
            setLegalTargets(EMPTY_SET);
            const promotionOptions = getPromotionOptions(selectedSquare, squareCoord);
            if (promotionOptions.length && !autoQueenEnabled) {
                const piece = squareMap[selectedSquare];
                const isWhitePiece = piece === piece?.toUpperCase();
                setPendingPromotion({
                    from: selectedSquare,
                    to: squareCoord,
                    options: promotionOptions,
                    color: isWhitePiece ? 'w' : 'b',
                    origin: 'click',
                });
                return;
            }
            const uciMove = resolveMoveUci(selectedSquare, squareCoord);
            if (uciMove) {
                await submitMoveFromUci(uciMove);
            }
            return;
        }
        if (piece && isOwnPiece(piece)) {
            setSelectedSquare(squareCoord);
            setLegalTargets(new Set(resolveTargets(squareCoord)));
        }
    };

    const stableSquareClick = useCallback((coord) => squareClickRef.current?.(coord), []);
    const stablePiecePointerDown = useCallback((e, coord) => piecePointerDownRef.current?.(e, coord), []);

    const updateDragPosition = useCallback((x, y) => {
        dragPosRef.current = { x, y };
        const ghost = dragGhostRef.current;
        if (ghost) {
            ghost.style.transform = `translate(${x}px, ${y}px)`;
            ghost.style.display = '';
        }
    }, []);

    const clearDragState = useCallback((clearSelection = true) => {
        setDragFrom(null);
        setDragPiece(null);
        if (dragGhostRef.current) dragGhostRef.current.style.display = 'none';
        if (clearSelection) {
            setSelectedSquare(null);
            setLegalTargets(EMPTY_SET);
        }
        dragPointerRef.current = null;
        dragStartRef.current = null;
        dragMovedRef.current = false;
        dragPosRef.current = null;
        if (dragRafRef.current) {
            cancelAnimationFrame(dragRafRef.current);
            dragRafRef.current = null;
        }
    }, []);

    const resolveCoordFromPoint = useCallback((clientX, clientY) => {
        const rect = boardRef.current?.getBoundingClientRect();
        if (!rect) return null;
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null;
        const squareSize = rect.width / 8;
        const displayCol = Math.floor(x / squareSize);
        const displayRow = Math.floor(y / squareSize);
        if (displayCol < 0 || displayCol > 7 || displayRow < 0 || displayRow > 7) return null;
        const actualRow = isUserWhite ? displayRow : 7 - displayRow;
        const actualCol = isUserWhite ? displayCol : 7 - displayCol;
        return `${FILES[actualCol]}${8 - actualRow}`;
    }, [isUserWhite]);

    const handlePiecePointerDown = (event, squareCoord) => {
        if (pendingPromotion) return;
        if (premove) {
            setPremove(null);
            setPremoveNotice(null);
            return;
        }
        if (!canInteract) {
            if (isUserTurn || !isUserPlayer || currentStatus !== 'active' || isPreviewing) return;
            if (selectedSquare && selectedSquare !== squareCoord) {
                suppressClickRef.current = true;
                queuePremove(selectedSquare, squareCoord);
                return;
            }
        } else if (selectedSquare && selectedSquare !== squareCoord && legalTargets.has(squareCoord)) {
            suppressClickRef.current = true;
            setSelectedSquare(null);
            setLegalTargets(EMPTY_SET);
            const uci = resolveMoveUci(selectedSquare, squareCoord);
            if (uci) submitMoveFromUci(uci);
            return;
        }
        const piece = squareMap[squareCoord];
        if (!piece || !isOwnPiece(piece)) return;
        const rect = boardRef.current?.getBoundingClientRect();
        if (!rect) return;
        dragPointerRef.current = event.pointerId;
        dragMovedRef.current = false;
        tapSelectedRef.current = selectedSquare === squareCoord ? null : squareCoord;
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        dragStartRef.current = { x, y };
        setDragFrom(squareCoord);
        setDragPiece(piece);
        updateDragPosition(x, y);
        setSelectedSquare(squareCoord);
        if (canInteract) {
            setLegalTargets(new Set(resolveTargets(squareCoord)));
        } else {
            preSelectRef.current = squareCoord;
            setLegalTargets(new Set(resolvePremoveTargets(squareCoord)));
        }
        if (event.currentTarget?.setPointerCapture) {
            event.currentTarget.setPointerCapture(event.pointerId);
        }
    };

    useEffect(() => {
        if (!dragFrom) return;
        const handleMove = (event) => {
            if (dragPointerRef.current != null && event.pointerId !== dragPointerRef.current) return;
            const rect = boardRef.current?.getBoundingClientRect();
            if (!rect) return;
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            updateDragPosition(x, y);
            if (dragStartRef.current && !dragMovedRef.current) {
                const dx = x - dragStartRef.current.x;
                const dy = y - dragStartRef.current.y;
                if (Math.hypot(dx, dy) > 4) {
                    dragMovedRef.current = true;
                }
            }
        };
        const handleUp = async (event) => {
            if (dragPointerRef.current != null && event.pointerId !== dragPointerRef.current) return;
            const moved = dragMovedRef.current;
            if (moved) {
                suppressClickRef.current = true;
                tapSelectedRef.current = null;
            }
            const fromSquare = dragFrom;
            const targetSquare = moved ? resolveCoordFromPoint(event.clientX, event.clientY) : null;
            clearDragState(moved);
            if (moved && fromSquare && targetSquare) {
                if (canInteract) {
                    const targets = resolveTargets(fromSquare);
                    if (targets.includes(targetSquare)) {
                        const promotionOptions = getPromotionOptions(fromSquare, targetSquare);
                        if (promotionOptions.length && !autoQueenEnabled) {
                            const piece = squareMap[fromSquare];
                            const isWhitePiece = piece === piece?.toUpperCase();
                            setPendingPromotion({
                                from: fromSquare,
                                to: targetSquare,
                                options: promotionOptions,
                                color: isWhitePiece ? 'w' : 'b',
                                origin: 'drag',
                            });
                            return;
                        }
                        const uciMove = resolveMoveUci(fromSquare, targetSquare);
                        if (uciMove) {
                            skipNextMoveAnimationRef.current = true;
                            await submitMoveFromUci(uciMove);
                        }
                    }
                } else if (!isUserTurn && isUserPlayer && currentStatus === 'active' && !isPreviewing) {
                    if (targetSquare && fromSquare && targetSquare !== fromSquare) {
                        queuePremove(fromSquare, targetSquare);
                    }
                }
            }
            if (suppressClickRef.current) {
                setTimeout(() => {
                    suppressClickRef.current = false;
                }, 0);
            }
        };
        const handleCancel = () => {
            clearDragState(true);
            tapSelectedRef.current = null;
            suppressClickRef.current = false;
        };
        const handleVisibilityChange = () => {
            if (document.hidden) {
                handleCancel();
            }
        };
        window.addEventListener('pointermove', handleMove);
        window.addEventListener('pointerup', handleUp);
        window.addEventListener('pointercancel', handleCancel);
        window.addEventListener('blur', handleCancel);
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            window.removeEventListener('pointermove', handleMove);
            window.removeEventListener('pointerup', handleUp);
            window.removeEventListener('pointercancel', handleCancel);
            window.removeEventListener('blur', handleCancel);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [
        autoQueenEnabled,
        canInteract,
        clearDragState,
        currentStatus,
        dragFrom,
        getPromotionOptions,
        isPreviewing,
        isUserPlayer,
        isUserTurn,
        queuePremove,
        resolveCoordFromPoint,
        resolveMoveUci,
        resolveTargets,
        squareMap,
        submitMoveFromUci,
        updateDragPosition,
    ]);

    squareClickRef.current = handleSquareClick;
    piecePointerDownRef.current = handlePiecePointerDown;

    const clampPreviewIndex = useCallback((value) => {
        const next = Math.max(0, Math.min(maxPreviewIndex, value));
        setPreviewIndex(next);
    }, [maxPreviewIndex]);

    const handlePrevMove = () => clampPreviewIndex(previewIndex - 1);
    const handleNextMove = () => clampPreviewIndex(previewIndex + 1);
    const handleFirstMove = () => clampPreviewIndex(0);
    const handleLastMove = () => clampPreviewIndex(maxPreviewIndex);

    const openLeftDrawer = useCallback(() => {
        setLeftDrawerOpen(true);
        setRightDrawerOpen(false);
    }, []);

    const openRightDrawer = useCallback(() => {
        setRightDrawerOpen(true);
        setLeftDrawerOpen(false);
    }, []);

    const closeDrawers = useCallback(() => {
        setLeftDrawerOpen(false);
        setRightDrawerOpen(false);
    }, []);

    useEffect(() => {
        return;
        /* eslint-disable no-unreachable */
        const node = pageRef.current;
        if (!node) return;
        const EDGE_PX = 28;
        const SWIPE_TRIGGER = 60;
        const MAX_VERTICAL = 50;

        const handleTouchStart = (event) => {
            if (pendingPromotion || dragFrom) return;
            if (!event.touches || event.touches.length !== 1) return;
            const touch = event.touches[0];
            const startX = touch.clientX;
            const startY = touch.clientY;
            const width = window.innerWidth || 0;
            const isEdge = startX <= EDGE_PX || startX >= width - EDGE_PX;
            const boardRect = boardRef.current?.getBoundingClientRect();
            const isOnBoard = Boolean(
                boardRect
                && startX >= boardRect.left
                && startX <= boardRect.right
                && startY >= boardRect.top
                && startY <= boardRect.bottom
            );
            if (isOnBoard && !isEdge && !leftDrawerOpen && !rightDrawerOpen) {
                return;
            }
            let mode = null;
            if (startX <= EDGE_PX) {
                mode = 'open-left';
            } else if (startX >= width - EDGE_PX) {
                mode = 'open-right';
            } else if (leftDrawerOpen && startX < width * 0.65) {
                mode = 'close-left';
            } else if (rightDrawerOpen && startX > width * 0.35) {
                mode = 'close-right';
            }
            if (!mode) return;
            touchStateRef.current = { startX, startY, mode };
        };

        const handleTouchEnd = (event) => {
            const state = touchStateRef.current;
            touchStateRef.current = null;
            if (!state) return;
            if (!event.changedTouches || event.changedTouches.length !== 1) return;
            const touch = event.changedTouches[0];
            const dx = touch.clientX - state.startX;
            const dy = touch.clientY - state.startY;
            if (Math.abs(dy) > MAX_VERTICAL && Math.abs(dy) > Math.abs(dx)) return;
            if (state.mode === 'open-left' && dx > SWIPE_TRIGGER) {
                openLeftDrawer();
            }
            if (state.mode === 'open-right' && dx < -SWIPE_TRIGGER) {
                openRightDrawer();
            }
            if (state.mode === 'close-left' && dx < -SWIPE_TRIGGER) {
                setLeftDrawerOpen(false);
            }
            if (state.mode === 'close-right' && dx > SWIPE_TRIGGER) {
                setRightDrawerOpen(false);
            }
        };

        node.addEventListener('touchstart', handleTouchStart, { passive: true });
        node.addEventListener('touchend', handleTouchEnd, { passive: true });
        return () => {
            node.removeEventListener('touchstart', handleTouchStart);
            node.removeEventListener('touchend', handleTouchEnd);
        };
    }, [dragFrom, isMobileLayout, leftDrawerOpen, openLeftDrawer, openRightDrawer, pendingPromotion, rightDrawerOpen]);

    const handleSendChat = () => {
        const message = chatInput.trim();
        if (!message || chatNotice) return;
        sendChat(message, chatRoom);
        setLocalChat((prev) => [
            ...prev,
            {
                user: user?.username || 'You',
                user_id: user?.id,
                message,
                room: chatRoom,
                timestamp: Date.now(),
            },
        ]);
        setChatInput('');
    };

    const handleEvalGraphInteraction = useCallback((event, svgEl) => {
        if (!evalGraph || !svgEl) return;
        const rect = svgEl.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const ratio = Math.max(0, Math.min(1, x / rect.width));
        const moveIdx = Math.round(ratio * (evalGraph.n - 1));
        const evalVal = analysisEvalSeries[moveIdx];
        const moveNum = Math.floor(moveIdx / 2) + 1;
        const isWhiteMove = moveIdx % 2 === 0;
        const san = moves[moveIdx] || '';
        setEvalTooltip({
            moveIdx,
            label: `${moveNum}${isWhiteMove ? '.' : '...'} ${san}`,
            eval: typeof evalVal === 'number' ? (evalVal > 0 ? `+${evalVal.toFixed(1)}` : evalVal.toFixed(1)) : '0.0',
            pctX: ratio * 100,
        });
        clampPreviewIndex(moveIdx + 1);
    }, [evalGraph, analysisEvalSeries, moves, clampPreviewIndex]);

    const handleProfileNavigate = useCallback((player) => {
        if (!player?.username) return;
        navigate(`/profile/${player.username}`);
    }, [navigate]);
    const handleBack = useCallback(() => {
        navigate('/');
    }, [navigate]);

    const boardGridMemo = useMemo(() => (
        <div className="grid grid-cols-8 grid-rows-8 w-full h-full">
            {Array.from({ length: 8 }).flatMap((_, displayRow) => (
                Array.from({ length: 8 }).map((_, displayCol) => {
                    const actualRow = isUserWhite ? displayRow : 7 - displayRow;
                    const actualCol = isUserWhite ? displayCol : 7 - displayCol;
                    const square = board?.[actualRow]?.[actualCol] || null;
                    const coord = `${FILES[actualCol]}${8 - actualRow}`;
                    const isDark = (actualRow + actualCol) % 2 === 1;
                    const isSelected = showMoveHints && selectedSquare === coord;
                    const isTarget = showMoveHints && legalTargets.has(coord);
                    const isCaptureTarget = isTarget && Boolean(squareMap[coord]);
                    const isLastMove = lastMoveSquares
                        && (lastMoveSquares.from === coord || lastMoveSquares.to === coord);
                    const isCheckSquare = checkSquare === coord;
                    const isPremoveSquare = premove
                        && (premove.from === coord || premove.to === coord);
                    const isDragging = dragFrom === coord;
                    const squareStyle = {
                        backgroundColor: isDark ? boardTheme.dark : boardTheme.light,
                    };
                    return (
                        <div
                            key={`${displayRow}-${displayCol}-${coord}`}
                            role="button"
                            tabIndex={-1}
                            className="relative flex items-center justify-center"
                            style={squareStyle}
                            data-square={coord}
                            data-selected={isSelected ? 'true' : 'false'}
                            data-target={isTarget ? 'true' : 'false'}
                            data-premove={isPremoveSquare ? 'true' : 'false'}
                            onClick={() => {
                                if (suppressClickRef.current) {
                                    suppressClickRef.current = false;
                                    return;
                                }
                                stableSquareClick(coord);
                            }}
                        >
                            {isLastMove ? <span className="absolute inset-0 bg-yellow-500/40" /> : null}
                            {isPremoveSquare ? <span className="absolute inset-0 bg-blue-400/30" /> : null}
                            {isCheckSquare ? <span className="absolute inset-0 bg-red-600/40" /> : null}
                            {isSelected ? <span className="absolute inset-0 bg-blue-400/25" /> : null}
                            {isTarget ? (
                                <span className={`absolute inset-0 ${isCaptureTarget ? 'bg-emerald-700/45' : 'bg-emerald-600/35'}`} />
                            ) : null}
                            {square ? (
                                <div
                                    data-anim-piece="true"
                                    onPointerDown={(e) => stablePiecePointerDown(e, coord)}
                                    style={{ touchAction: 'none' }}
                                    className={`flex items-center justify-center outline-none focus:outline-none ${isDragging ? 'opacity-0' : ''}`}
                                >
                                    <ChessPiece piece={square} size={pieceSize} pieceSet={pieceSet} />
                                </div>
                            ) : null}
                        </div>
                    );
                })
            ))}
        </div>
    ), [board, boardTheme, checkSquare, dragFrom, isUserWhite, lastMoveSquares, legalTargets, pieceSet, pieceSize, premove, selectedSquare, showMoveHints, squareMap, stablePiecePointerDown, stableSquareClick]);

    return (
        <Layout showHeader={false} showBottomNav={false}>
            <div
                ref={pageRef}
                className={`flex-1 flex flex-col min-h-[100dvh] md:h-[100dvh] ${
                    drawerOpen ? 'overflow-hidden' : 'overflow-y-auto'
                } md:overflow-hidden bg-background-light dark:bg-background-dark relative`}
            >
                {isMobileLayout ? (
                    <header className="lg:hidden sticky top-0 z-30 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md border-b border-slate-200/50 dark:border-slate-800/50 px-4 py-2 shadow-sm">
                        <button type="button" className="flex items-center gap-2.5" onClick={handleBack}>
                            <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-primary shadow-md shadow-primary/30">
                                <span className="text-white text-base font-bold leading-none">&#9822;</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-sm font-extrabold tracking-tight text-slate-900 dark:text-slate-100 leading-tight">DigiChess</span>
                                <span className="text-[9px] uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500 font-semibold leading-tight">Live Arena</span>
                            </div>
                        </button>
                    </header>
                ) : null}
                {!game ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-sm text-slate-400 dark:text-slate-500 gap-3 px-4 text-center">
                        <span className="material-symbols-outlined text-4xl text-slate-300 dark:text-slate-600">chess</span>
                        <div>{displayError || 'Loading game...'}</div>
                        {!spectate && displayError ? (
                            <button
                                className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold"
                                type="button"
                                onClick={() => setSpectate(true)}
                            >
                                Spectate Game
                            </button>
                        ) : null}
                        <button
                            className="px-4 py-2 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-sm font-semibold"
                            type="button"
                            onClick={handleBack}
                        >
                            Back to Home
                        </button>
                    </div>
                ) : (
                    <>
                        {isMobileLayout && drawerOpen ? (
                            <div
                                className="fixed inset-0 bg-black/30 z-40"
                                role="button"
                                tabIndex={-1}
                                onClick={closeDrawers}
                                onKeyDown={(event) => {
                                    if (event.key === 'Escape') {
                                        closeDrawers();
                                    }
                                }}
                            />
                        ) : null}
                        {displayError ? (
                            <div className="px-4 pt-2 text-sm text-red-500">
                                {displayError}
                            </div>
                        ) : null}
                        {game?.status === 'pending' && isUserPlayer ? (
                            <div className="px-4 py-3">
                                <div className="bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-semibold">
                                            {isCreator ? 'Challenge sent' : 'Game challenge pending'}
                                        </p>
                                        <p className="text-xs text-slate-500">
                                            {isCreator
                                                ? `Waiting for ${opponentName || 'opponent'} to respond.`
                                                : 'Accept to start the game.'
                                            }
                                        </p>
                                    </div>
                                    <div className="flex gap-2">
                                        {isCreator ? (
                                            <button className="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-sm" type="button" onClick={handleCancelChallenge}>
                                                Cancel
                                            </button>
                                        ) : (
                                            <>
                                                <button className="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-sm" type="button" onClick={handleReject}>
                                                    Reject
                                                </button>
                                                <button className="px-3 py-1.5 rounded-lg bg-primary text-white text-sm" type="button" onClick={handleAccept}>
                                                    Accept
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ) : null}

                        <div className="flex-1 flex flex-col lg:flex-row lg:gap-0 gap-4 px-0 lg:px-0 sm:px-4 lg:pb-0 pb-4 min-h-0 relative overflow-hidden">
                            <aside
                                className={`lg:w-72 w-[min(88vw,320px)] lg:static fixed inset-y-0 left-0 z-50 bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-gray-800 lg:rounded-none rounded-2xl p-3 flex flex-col min-h-0 overflow-y-auto no-scrollbar shadow-2xl lg:shadow-none transform transition-transform duration-300 ease-out ${
                                    leftDrawerOpen ? 'translate-x-0' : '-translate-x-full'
                                } lg:translate-x-0`}
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <button
                                        className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                                        type="button"
                                        onClick={handleBack}
                                    >
                                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary shadow-sm">
                                            <span className="text-white text-sm font-bold leading-none">&#9822;</span>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-xs font-extrabold tracking-tight leading-tight">DigiChess</span>
                                            <span className="text-[8px] uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500 font-semibold leading-tight">Live Arena</span>
                                        </div>
                                    </button>
                                    <button
                                        className="lg:hidden p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors"
                                        type="button"
                                        onClick={closeDrawers}
                                        aria-label="Close panel"
                                    >
                                        <span className="material-symbols-outlined text-[20px]">close</span>
                                    </button>
                                </div>
                                <div className="flex items-center justify-between mb-2 mt-2">
                                    <h3 className="text-sm font-semibold">Moves</h3>
                                    <span className="text-xs text-slate-500">{moves.length} moves</span>
                                </div>
                                <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                                    <div className="flex items-center gap-1">
                                        <button
                                            type="button"
                                            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700"
                                            onClick={handleFirstMove}
                                            disabled={previewIndex === 0}
                                            title="First move"
                                        >
                                            <span className="material-symbols-outlined text-sm">skip_previous</span>
                                        </button>
                                        <button
                                            type="button"
                                            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700"
                                            onClick={handlePrevMove}
                                            disabled={previewIndex === 0}
                                            title="Previous move"
                                        >
                                            <span className="material-symbols-outlined text-sm">chevron_left</span>
                                        </button>
                                        <button
                                            type="button"
                                            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700"
                                            onClick={handleNextMove}
                                            disabled={previewIndex === maxPreviewIndex}
                                            title="Next move"
                                        >
                                            <span className="material-symbols-outlined text-sm">chevron_right</span>
                                        </button>
                                        <button
                                            type="button"
                                            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700"
                                            onClick={handleLastMove}
                                            disabled={previewIndex === maxPreviewIndex}
                                            title="Latest move"
                                        >
                                            <span className="material-symbols-outlined text-sm">skip_next</span>
                                        </button>
                                    </div>
                                </div>
                                <div className="pr-1 space-y-4">
                                    <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-gray-800">
                                        <div className="grid grid-cols-[2.5rem_1fr_1fr] sm:grid-cols-[3rem_1fr_1fr] text-xs text-slate-500 font-medium py-1.5 bg-surface-light dark:bg-surface-dark border-b border-slate-200 dark:border-gray-800">
                                            <div className="text-center">#</div>
                                            <div className="pl-2">White</div>
                                            <div className="pl-2">Black</div>
                                        </div>
                                        <div className="max-h-[200px] sm:max-h-[280px] overflow-y-auto no-scrollbar">
                                            {movePairs.length ? (
                                                movePairs.map((pair, index) => {
                                                    const whiteIndex = index * 2 + 1;
                                                    const blackIndex = index * 2 + 2;
                                                    const isWhiteActive = previewIndex === whiteIndex;
                                                    const isBlackActive = previewIndex === blackIndex;
                                                    return (
                                                        <div
                                                            key={`${pair.white || 'move'}-${index}`}
                                                            className={`grid grid-cols-[2.5rem_1fr_1fr] sm:grid-cols-[3rem_1fr_1fr] py-1.5 text-sm border-b border-slate-200/60 dark:border-gray-800/50 ${index % 2 === 1 ? 'bg-slate-100/50 dark:bg-white/5' : ''}`}
                                                        >
                                                            <div className="text-slate-500 font-mono text-center">{index + 1}.</div>
                                                            <button
                                                                type="button"
                                                                className={`pl-2 text-left font-mono font-medium rounded flex items-center gap-1 ${isWhiteActive ? 'text-primary' : 'text-slate-900 dark:text-white'}`}
                                                                onClick={() => clampPreviewIndex(whiteIndex)}
                                                            >
                                                                {pair.white || ''}
                                                                {showAnalysis && CLASSIFICATION_ICONS[classificationMap[whiteIndex]] ? (
                                                                    <img src={CLASSIFICATION_ICONS[classificationMap[whiteIndex]]} alt="" className="w-3.5 h-3.5 inline-block" />
                                                                ) : null}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className={`pl-2 text-left font-mono font-medium rounded flex items-center gap-1 ${isBlackActive ? 'text-primary' : 'text-slate-900 dark:text-white'}`}
                                                                onClick={() => clampPreviewIndex(blackIndex)}
                                                            >
                                                                {pair.black || ''}
                                                                {showAnalysis && CLASSIFICATION_ICONS[classificationMap[blackIndex]] ? (
                                                                    <img src={CLASSIFICATION_ICONS[classificationMap[blackIndex]]} alt="" className="w-3.5 h-3.5 inline-block" />
                                                                ) : null}
                                                            </button>
                                                        </div>
                                                    );
                                                })
                                            ) : (
                                                <div className="text-sm text-slate-500 py-3 px-3">No moves yet.</div>
                                            )}
                                        </div>
                                    </div>
                                    {drawNotice ? (
                                        <div className="text-xs text-amber-500 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2 py-1">
                                            {drawNotice}
                                        </div>
                                    ) : null}
                                    {premoveNotice ? (
                                        <div className="text-xs text-slate-500 bg-slate-500/10 border border-slate-500/20 rounded-lg px-2 py-1">
                                            {premoveNotice}
                                        </div>
                                    ) : null}
                                    {drawOfferBy && currentStatus === 'active' && isUserPlayer ? (
                                        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-800/70 p-3 text-xs text-slate-600 dark:text-slate-300">
                                            {drawOfferBy === user?.id ? (
                                                <div>Draw offer sent. Waiting for response.</div>
                                            ) : (
                                                <>
                                                    <div className="font-semibold text-slate-700 dark:text-slate-200">
                                                        Opponent offered a draw.
                                                    </div>
                                                    <div className="mt-2 flex gap-2">
                                                        <button
                                                            className="px-2 py-1 rounded-lg bg-primary text-white text-xs font-semibold"
                                                            type="button"
                                                            onClick={() => handleRespondDraw('accept')}
                                                        >
                                                            Accept
                                                        </button>
                                                        <button
                                                            className="px-2 py-1 rounded-lg bg-slate-200 dark:bg-slate-700 text-xs font-semibold"
                                                            type="button"
                                                            onClick={() => handleRespondDraw('decline')}
                                                        >
                                                            Decline
                                                        </button>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    ) : null}
                                </div>
                                {isUserPlayer && currentStatus === 'active' ? (
                                    <div className={`mt-3 grid gap-2 ${canAbort ? 'grid-cols-3' : 'grid-cols-2'}`}>
                                        {canResign ? (
                                            <button className="flex flex-col items-center justify-center gap-1 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 text-slate-500 hover:text-red-500 transition-colors" type="button" onClick={handleResign}>
                                                <span className="material-symbols-outlined text-xl">flag_circle</span>
                                                <span className="text-[10px] uppercase font-bold tracking-wide">Resign</span>
                                            </button>
                                        ) : null}
                                        {canOfferDraw ? (
                                            <button className="flex flex-col items-center justify-center gap-1 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors" type="button" onClick={handleOfferDraw}>
                                                <span className="material-symbols-outlined text-xl">handshake</span>
                                                <span className="text-[10px] uppercase font-bold tracking-wide">Draw</span>
                                            </button>
                                        ) : null}
                                        {canAbort ? (
                                            <button className="flex flex-col items-center justify-center gap-1 py-2 rounded-lg bg-primary hover:bg-blue-600 text-white transition-colors shadow-lg shadow-blue-900/20" type="button" onClick={handleAbort}>
                                                <span className="material-symbols-outlined text-xl">check</span>
                                                <span className="text-[10px] uppercase font-bold tracking-wide">Abort</span>
                                            </button>
                                        ) : null}
                                    </div>
                                ) : null}
                                {resignConfirm ? (
                                    <div className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-200">
                                        <div className="font-semibold">Confirm resign?</div>
                                        <div className="mt-2 flex gap-2">
                                            <button
                                                className="px-2 py-1 rounded-lg bg-red-500 text-white text-xs font-semibold disabled:opacity-60"
                                                type="button"
                                                onClick={confirmResign}
                                                disabled={resignLoading}
                                            >
                                                Resign
                                            </button>
                                            <button
                                                className="px-2 py-1 rounded-lg bg-slate-200 dark:bg-slate-700 text-xs font-semibold disabled:opacity-60"
                                                type="button"
                                                onClick={() => setResignConfirm(false)}
                                                disabled={resignLoading}
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                ) : null}
                            </aside>

                            <main className={`flex-1 flex flex-col relative min-h-0 ${isMobileLayout ? 'overflow-y-auto no-scrollbar' : 'overflow-hidden justify-center'}`}>
                                <div ref={topBarRef} className="px-2 py-2 flex items-center justify-between shrink-0 bg-slate-100/60 dark:bg-slate-900/60 lg:bg-transparent relative">
                                    {showAnalysis && isPreviewing && classificationMap[previewIndex] && CLASSIFICATION_ICONS[classificationMap[previewIndex]] && ((topColor === 'white' && previewIndex % 2 === 1) || (topColor === 'black' && previewIndex % 2 === 0)) ? (
                                        <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 z-10">
                                            <span className={`inline-flex items-center gap-2 text-sm font-extrabold px-4 py-1.5 rounded-full border-2 backdrop-blur-sm ${CLASSIFICATION_COLORS[classificationMap[previewIndex]] || ''}`}>
                                                <img src={CLASSIFICATION_ICONS[classificationMap[previewIndex]]} alt="" className="w-6 h-6 drop-shadow-lg" />
                                                {CLASSIFICATION_LABELS[classificationMap[previewIndex]]}
                                            </span>
                                        </div>
                                    ) : null}
                                    <div
                                        className="flex items-center gap-3 overflow-hidden cursor-pointer"
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => handleProfileNavigate(topPlayer)}
                                        onKeyDown={(event) => {
                                            if (event.key === 'Enter') {
                                                handleProfileNavigate(topPlayer);
                                            }
                                        }}
                                    >
                                        <div className="relative shrink-0">
                                            <div
                                                className={`w-10 h-10 rounded-full border-2 border-surface-dark dark:border-gray-700 ${topAvatar ? 'bg-cover bg-center' : 'bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-xs font-bold'}`}
                                                style={topAvatar ? { backgroundImage: `url('${topAvatar}')` } : undefined}
                                            >
                                                {!topAvatar ? topInitials : null}
                                            </div>
                                        </div>
                                        <div className="flex flex-col min-w-0">
                                            <div className="flex items-center gap-2">
                                                <p className="font-bold text-sm truncate">{topPlayer?.username || 'Opponent'}</p>
                                                {topTag ? (
                                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${getRatingTagClasses(topTag)}`}>
                                                        {topTag}
                                                    </span>
                                                ) : null}
                                            </div>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">{topMeta}</p>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end gap-1">
                                        <div className={`${topClockActive ? 'bg-primary border border-blue-400 text-white shadow-[0_0_15px_rgba(19,91,236,0.4)]' : 'bg-white/80 dark:bg-slate-700/80 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100'} rounded px-3 py-1.5 min-w-[90px] text-center`}>
                                            <ClockDisplay seconds={topClockDisplay} isActive={topClockActive && currentStatus === 'active'} className={`text-2xl font-bold font-mono ${topClockActive ? 'text-white' : 'text-gray-800 dark:text-gray-100'}`} />
                                        </div>
                                    </div>
                                </div>

                                <div className="relative flex-none flex items-center justify-center min-h-0">
                                    <div
                                        ref={boardRef}
                                        className="aspect-square w-[min(100vw,520px)] sm:w-[min(90vw,560px)] md:w-[min(72vh,720px)] max-w-[100vw] md:max-w-[720px] max-h-[100vw] sm:max-h-[90vw] md:max-h-[72vh] relative shadow-2xl overflow-hidden shrink-0 select-none touch-pan-y"
                                        style={isMobileLayout && mobileBoardSize ? { width: mobileBoardSize, height: mobileBoardSize } : undefined}
                                        data-testid="game-board"
                                        onContextMenu={(event) => {
                                            if (!premove) return;
                                            event.preventDefault();
                                            setPremove(null);
                                            setPremoveNotice(null);
                                        }}
                                    >
                                    {boardGridMemo}
                                    <div ref={moveAnimOverlayRef} style={{ display: 'none' }} />
                                    {pendingPromotion ? (
                                        <div className="absolute inset-0 z-50 bg-black/40 flex items-center justify-center">
                                            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 p-3 shadow-xl space-y-2">
                                                <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                                                    Choose promotion
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {pendingPromotion.options.map((opt) => {
                                                        const piece = pendingPromotion.color === 'w' ? opt.toUpperCase() : opt;
                                                        return (
                                                            <button
                                                                key={opt}
                                                                type="button"
                                                                className="w-12 h-12 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center"
                                                                onClick={() => handlePromotionSelect(opt)}
                                                            >
                                                                <ChessPiece piece={piece} size={Math.max(28, Math.floor(pieceSize * 0.5))} pieceSet={pieceSet} />
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                                <button
                                                    type="button"
                                                    className="w-full text-xs font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-300 dark:hover:text-white"
                                                    onClick={() => setPendingPromotion(null)}
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        </div>
                                    ) : null}
                                    {showFirstMoveCountdown && (
                                        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40">
                                            <div className={`px-3 py-1 rounded-full text-xs font-semibold tracking-wide border shadow-lg ${
                                                isFirstMoveUrgent
                                                    ? 'bg-red-600/70 border-red-400/70 text-white'
                                                    : 'bg-black/80 border-white/20 text-white'
                                            }`}>
                                                {firstMoveLabel} in {formatClock(firstMoveRemaining)}
                                            </div>
                                        </div>
                                    )}
                                    <div
                                        ref={dragGhostRef}
                                        data-testid="drag-ghost"
                                        style={{
                                            position: 'absolute',
                                            left: -pieceSize / 2,
                                            top: -pieceSize / 2,
                                            width: pieceSize,
                                            height: pieceSize,
                                            pointerEvents: 'none',
                                            zIndex: 50,
                                            display: dragFrom && dragPiece ? '' : 'none',
                                            willChange: 'transform',
                                        }}
                                    >
                                        {dragPiece ? <ChessPiece piece={dragPiece} size={pieceSize} pieceSet={pieceSet} /> : null}
                                    </div>
                                    </div>
                                    {showEvalBar && !isMobileLayout ? (
                                        <div className={`absolute top-0 bottom-0 hidden lg:flex w-3 bg-gray-800 rounded-sm overflow-hidden ${evalBarFlip ? 'flex-col-reverse' : 'flex-col'} border border-gray-700 shadow-inner`} style={{ left: 'calc(50% - min(36vh, 360px) - 20px)' }}>
                                            <div className="bg-white w-full shadow-[0_0_10px_rgba(255,255,255,0.3)]" style={{ height: `${evalSplit.white}%` }}></div>
                                        </div>
                                    ) : null}
                                </div>
                                {showEvalBar && isMobileLayout ? (
                                    <div className="sm:hidden px-2 pb-1">
                                        <div className="mx-auto w-[min(92vw,520px)] rounded-lg border border-gray-700/80 bg-gray-900/95 px-2 py-1.5">
                                            <div className="h-2 rounded-full border border-gray-700 bg-gray-950/90 overflow-hidden flex">
                                                {evalBarFlip ? (
                                                    <>
                                                        <div className="h-full bg-slate-950/95" style={{ width: `${evalSplit.black}%` }} />
                                                        <div className="h-full bg-slate-100/95 shadow-[0_0_8px_rgba(255,255,255,0.25)]" style={{ width: `${evalSplit.white}%` }} />
                                                    </>
                                                ) : (
                                                    <>
                                                        <div className="h-full bg-slate-100/95 shadow-[0_0_8px_rgba(255,255,255,0.25)]" style={{ width: `${evalSplit.white}%` }} />
                                                        <div className="h-full bg-slate-950/95" style={{ width: `${evalSplit.black}%` }} />
                                                    </>
                                                )}
                                            </div>
                                            <div className="mt-1 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-slate-300">
                                                <span>White {evalSplit.white}%</span>
                                                <span>Black {evalSplit.black}%</span>
                                            </div>
                                        </div>
                                    </div>
                                ) : null}

                                <div ref={bottomBarRef} className="px-2 py-2 flex items-center justify-between shrink-0 bg-slate-100/60 dark:bg-slate-900/60 lg:bg-transparent relative">
                                    {showAnalysis && isPreviewing && classificationMap[previewIndex] && CLASSIFICATION_ICONS[classificationMap[previewIndex]] && ((bottomColor === 'white' && previewIndex % 2 === 1) || (bottomColor === 'black' && previewIndex % 2 === 0)) ? (
                                        <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 z-10">
                                            <span className={`inline-flex items-center gap-2 text-sm font-extrabold px-4 py-1.5 rounded-full border-2 backdrop-blur-sm ${CLASSIFICATION_COLORS[classificationMap[previewIndex]] || ''}`}>
                                                <img src={CLASSIFICATION_ICONS[classificationMap[previewIndex]]} alt="" className="w-6 h-6 drop-shadow-lg" />
                                                {CLASSIFICATION_LABELS[classificationMap[previewIndex]]}
                                            </span>
                                        </div>
                                    ) : null}
                                    <div
                                        className="flex items-center gap-3 overflow-hidden cursor-pointer"
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => handleProfileNavigate(bottomPlayer)}
                                        onKeyDown={(event) => {
                                            if (event.key === 'Enter') {
                                                handleProfileNavigate(bottomPlayer);
                                            }
                                        }}
                                    >
                                        <div className="relative shrink-0">
                                            <div
                                                className={`w-10 h-10 rounded-full border-2 border-surface-dark dark:border-gray-700 ${bottomAvatar ? 'bg-cover bg-center' : 'bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-xs font-bold'}`}
                                                style={bottomAvatar ? { backgroundImage: `url('${bottomAvatar}')` } : undefined}
                                            >
                                                {!bottomAvatar ? bottomInitials : null}
                                            </div>
                                        </div>
                                        <div className="flex flex-col min-w-0">
                                            <div className="flex items-center gap-2">
                                                <p className="font-bold text-sm truncate">{bottomPlayer?.username || 'You'}</p>
                                                {bottomTag ? (
                                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${getRatingTagClasses(bottomTag)}`}>
                                                        {bottomTag}
                                                    </span>
                                                ) : null}
                                            </div>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">{bottomMeta}</p>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end gap-1">
                                        <div className={`${bottomClockActive ? 'bg-primary border border-blue-400 text-white shadow-[0_0_15px_rgba(19,91,236,0.4)]' : 'bg-white/80 dark:bg-slate-700/80 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100'} rounded px-3 py-1.5 min-w-[90px] text-center`}>
                                            <ClockDisplay seconds={bottomClockDisplay} isActive={bottomClockActive && currentStatus === 'active'} className={`text-2xl font-bold font-mono ${bottomClockActive ? 'text-white' : 'text-gray-800 dark:text-gray-100'}`} />
                                        </div>
                                    </div>
                                </div>

                                {isMobileLayout ? (
                                    <div className="lg:hidden flex flex-col gap-2 px-2 pb-4">
                                        {isUserPlayer && currentStatus === 'active' ? (
                                            <div className="flex items-center justify-center gap-1 py-1">
                                                {canOfferDraw ? (
                                                    <button className="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 transition-colors" type="button" onClick={handleOfferDraw} title="Offer draw">
                                                        <span className="material-symbols-outlined text-xl">handshake</span>
                                                    </button>
                                                ) : null}
                                                {canResign ? (
                                                    <button className="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 hover:text-red-500 transition-colors" type="button" onClick={handleResign} title="Resign">
                                                        <span className="material-symbols-outlined text-xl">flag</span>
                                                    </button>
                                                ) : null}
                                                {canAbort ? (
                                                    <button className="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 transition-colors" type="button" onClick={handleAbort} title="Abort">
                                                        <span className="material-symbols-outlined text-xl">close</span>
                                                    </button>
                                                ) : null}
                                                <button className={`flex items-center justify-center w-10 h-10 rounded-lg transition-colors ${mobileChatOpen ? 'bg-primary/10 text-primary' : 'hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500'}`} type="button" onClick={() => setMobileChatOpen((p) => !p)} title="Chat">
                                                    <span className="material-symbols-outlined text-xl">chat</span>
                                                </button>
                                            </div>
                                        ) : !isUserPlayer && currentStatus === 'active' ? (
                                            <div className="flex items-center justify-center gap-1 py-1">
                                                <button className={`flex items-center justify-center w-10 h-10 rounded-lg transition-colors ${mobileChatOpen ? 'bg-primary/10 text-primary' : 'hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500'}`} type="button" onClick={() => setMobileChatOpen((p) => !p)} title="Chat">
                                                    <span className="material-symbols-outlined text-xl">chat</span>
                                                </button>
                                            </div>
                                        ) : null}

                                        {resignConfirm ? (
                                            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs">
                                                <span className="font-semibold text-red-400">Confirm resign?</span>
                                                <div className="mt-1.5 flex gap-2">
                                                    <button className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-xs font-semibold disabled:opacity-60" type="button" onClick={confirmResign} disabled={resignLoading}>Resign</button>
                                                    <button className="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-xs font-semibold" type="button" onClick={() => setResignConfirm(false)}>Cancel</button>
                                                </div>
                                            </div>
                                        ) : null}
                                        {drawOfferBy && currentStatus === 'active' && isUserPlayer ? (
                                            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-800/70 p-2 text-xs">
                                                {drawOfferBy === user?.id ? (
                                                    <div className="text-slate-500">Draw offer sent. Waiting for response.</div>
                                                ) : (
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className="font-semibold">Opponent offered a draw.</span>
                                                        <div className="flex gap-2">
                                                            <button className="px-2 py-1 rounded-lg bg-primary text-white text-xs font-semibold" type="button" onClick={() => handleRespondDraw('accept')}>Accept</button>
                                                            <button className="px-2 py-1 rounded-lg bg-slate-200 dark:bg-slate-700 text-xs font-semibold" type="button" onClick={() => handleRespondDraw('decline')}>Decline</button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ) : null}
                                        {drawNotice ? (
                                            <div className="text-xs text-amber-500 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2 py-1">{drawNotice}</div>
                                        ) : null}

                                        <div className="flex items-center gap-1 bg-surface-light dark:bg-surface-dark rounded-xl border border-slate-200 dark:border-slate-700 px-1 py-1">
                                            <button type="button" className="shrink-0 p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 disabled:opacity-30" onClick={handleFirstMove} disabled={previewIndex === 0}>
                                                <span className="material-symbols-outlined text-[18px]">first_page</span>
                                            </button>
                                            <button type="button" className="shrink-0 p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 disabled:opacity-30" onClick={handlePrevMove} disabled={previewIndex === 0}>
                                                <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                                            </button>
                                            <div ref={mobileMovesRef} className="flex-1 overflow-x-auto flex items-center gap-0.5 no-scrollbar px-1 min-h-[32px]">
                                                {moves.length ? moves.map((move, index) => (
                                                    <React.Fragment key={index}>
                                                        {index % 2 === 0 ? (
                                                            <span className="text-[10px] text-slate-400 font-mono shrink-0 mr-0.5">{Math.floor(index / 2) + 1}.</span>
                                                        ) : null}
                                                        <button
                                                            type="button"
                                                            data-active-move={previewIndex === index + 1 ? 'true' : undefined}
                                                            className={`shrink-0 px-1.5 py-0.5 rounded text-xs font-mono font-semibold transition-colors ${
                                                                previewIndex === index + 1
                                                                    ? 'bg-primary text-white'
                                                                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                                                            }`}
                                                            onClick={() => clampPreviewIndex(index + 1)}
                                                        >
                                                            {move}
                                                        </button>
                                                    </React.Fragment>
                                                )) : (
                                                    <span className="text-xs text-slate-400">No moves yet</span>
                                                )}
                                            </div>
                                            <button type="button" className="shrink-0 p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 disabled:opacity-30" onClick={handleNextMove} disabled={previewIndex === maxPreviewIndex}>
                                                <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                                            </button>
                                            <button type="button" className="shrink-0 p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 disabled:opacity-30" onClick={handleLastMove} disabled={previewIndex === maxPreviewIndex}>
                                                <span className="material-symbols-outlined text-[18px]">last_page</span>
                                            </button>
                                        </div>

                                        {isGameOver ? (
                                            <div className="space-y-2">
                                                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-surface-light dark:bg-surface-dark p-3 space-y-1.5 text-xs">
                                                    <div className="text-center font-semibold text-sm text-slate-800 dark:text-slate-100">
                                                        {outcome?.label || (currentStatus === 'aborted' ? 'Game aborted' : 'Game finished')}
                                                    </div>
                                                    <div className="flex justify-center gap-4 text-slate-600 dark:text-slate-300">
                                                        <span>{game?.white?.username || 'White'} ({resolveRating(game?.white)}{whiteDelta ? <span className={`ml-0.5 font-semibold ${whiteDelta.className}`}>{whiteDelta.text}</span> : null})</span>
                                                        <span>{game?.black?.username || 'Black'} ({resolveRating(game?.black)}{blackDelta ? <span className={`ml-0.5 font-semibold ${blackDelta.className}`}>{blackDelta.text}</span> : null})</span>
                                                    </div>
                                                </div>

                                                {showRematchActions ? (
                                                    <div className="space-y-2">
                                                        {rematchExpiredDisplay ? (
                                                            <div className="w-full rounded-xl bg-slate-200/70 dark:bg-slate-800/70 px-3 py-2.5 text-xs font-semibold text-slate-500 text-center">Rematch option expired.</div>
                                                        ) : rematchActive ? (
                                                            isRematchRequester ? (
                                                                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-800/70 px-3 py-2.5 text-xs text-center">
                                                                    <div className="font-semibold">Rematch requested. Waiting...</div>
                                                                    <button className="mt-2 w-full px-3 py-2 rounded-lg bg-slate-200 dark:bg-slate-700 text-xs font-semibold disabled:opacity-60" type="button" onClick={handleCancelRematch} disabled={rematchLoading}>Cancel request</button>
                                                                </div>
                                                            ) : (
                                                                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-800/70 px-3 py-2.5 text-xs">
                                                                    <div className="font-semibold text-center">Opponent wants a rematch!</div>
                                                                    <div className="mt-2 flex gap-2">
                                                                        <button className="flex-1 px-3 py-2 rounded-lg bg-primary text-white text-xs font-semibold disabled:opacity-60" type="button" onClick={handleAcceptRematch} disabled={rematchLoading}>Accept</button>
                                                                        <button className="flex-1 px-3 py-2 rounded-lg bg-slate-200 dark:bg-slate-700 text-xs font-semibold disabled:opacity-60" type="button" onClick={handleRejectRematch} disabled={rematchLoading}>Decline</button>
                                                                    </div>
                                                                </div>
                                                            )
                                                        ) : (
                                                            <button className="w-full px-3 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-60" type="button" onClick={handleRequestRematch} disabled={rematchLoading}>
                                                                {rematchLoading ? 'Requesting...' : 'Rematch'}
                                                            </button>
                                                        )}
                                                        {rematchNotice ? <div className="text-xs text-slate-500 text-center">{rematchNotice}</div> : null}
                                                    </div>
                                                ) : null}
                                                {isTournamentGame ? (
                                                    <button className="w-full px-3 py-2.5 rounded-xl bg-slate-200 dark:bg-slate-800 text-sm font-semibold flex items-center justify-center gap-2" type="button" onClick={() => navigate(`/tournaments/${game.tournament_id}`)}>
                                                        <span className="material-symbols-outlined text-[16px]">emoji_events</span>
                                                        Back to Tournament
                                                    </button>
                                                ) : null}

                                                {currentStatus === 'finished' && isUserPlayer && !game?.white?.is_bot && !game?.black?.is_bot ? (
                                                    <div className="relative">
                                                        <button
                                                            className="w-full px-3 py-2.5 rounded-xl border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs font-semibold flex items-center justify-center gap-2 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
                                                            type="button"
                                                            onClick={() => { setReportModalOpen(true); setReportResult(null); }}
                                                        >
                                                            <span className="material-symbols-outlined text-[16px]">flag</span>
                                                            Report Opponent
                                                        </button>
                                                        {reportModalOpen ? (
                                                            <div className="fixed inset-0 z-[200] flex items-center justify-center px-4 py-8 bg-black/60 backdrop-blur-sm overflow-y-auto" onClick={() => !reportLoading && setReportModalOpen(false)}>
                                                                <div className="w-full max-w-[400px] my-auto bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
                                                                    <div className="flex items-center justify-between">
                                                                        <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Report {opponentName || 'Opponent'}</h3>
                                                                        <button className="text-slate-400 hover:text-slate-600" type="button" onClick={() => !reportLoading && setReportModalOpen(false)}>
                                                                            <span className="material-symbols-outlined text-[20px]">close</span>
                                                                        </button>
                                                                    </div>
                                                                    <div className="space-y-3">
                                                                        <div>
                                                                            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Reason</label>
                                                                            <select
                                                                                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-sm"
                                                                                value={reportReason}
                                                                                onChange={(e) => setReportReason(e.target.value)}
                                                                                disabled={reportLoading}
                                                                            >
                                                                                <option value="engine_use">Engine Assistance</option>
                                                                                <option value="suspicious_play">Suspicious Play</option>
                                                                            </select>
                                                                        </div>
                                                                        <div>
                                                                            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Details (optional)</label>
                                                                            <textarea
                                                                                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-sm resize-none"
                                                                                rows={3}
                                                                                placeholder="Describe why you believe this player was cheating..."
                                                                                value={reportDescription}
                                                                                onChange={(e) => setReportDescription(e.target.value)}
                                                                                disabled={reportLoading}
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                    {reportResult === 'success' ? (
                                                                        <div className="text-center text-green-600 dark:text-green-400 text-sm font-semibold py-2">Report submitted. Thank you.</div>
                                                                    ) : reportResult && reportResult !== 'success' ? (
                                                                        <div className="text-center text-red-500 text-xs">{reportResult}</div>
                                                                    ) : null}
                                                                    <div className="flex gap-2">
                                                                        <button
                                                                            className="flex-1 px-3 py-2.5 rounded-lg bg-red-500 text-white text-sm font-semibold disabled:opacity-60"
                                                                            type="button"
                                                                            onClick={handleSubmitReport}
                                                                            disabled={reportLoading || reportResult === 'success'}
                                                                        >
                                                                            {reportLoading ? 'Submitting...' : 'Submit Report'}
                                                                        </button>
                                                                        <button
                                                                            className="flex-1 px-3 py-2.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-sm font-semibold"
                                                                            type="button"
                                                                            onClick={() => setReportModalOpen(false)}
                                                                            disabled={reportLoading}
                                                                        >
                                                                            Cancel
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                ) : null}

                                                {currentStatus === 'finished' ? (
                                                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-surface-light dark:bg-surface-dark p-3 space-y-2 text-xs">
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-sm font-semibold">Analysis</span>
                                                            {analysisStatus === 'completed' ? (
                                                                <button className="text-xs font-semibold text-primary" type="button" onClick={() => setShowAnalysis((p) => !p)}>{showAnalysis ? 'Hide' : 'Show'}</button>
                                                            ) : null}
                                                        </div>
                                                        {analysisError ? <div className="text-red-500">{analysisError}</div> : null}
                                                        {analysisStatus === 'failed' ? (
                                                            <button className="px-3 py-2 rounded-lg bg-primary text-white text-xs font-semibold disabled:opacity-60" type="button" onClick={() => handleRequestAnalysis(true)} disabled={analysisLoading}>{analysisLoading ? 'Retrying...' : 'Retry analysis'}</button>
                                                        ) : null}
                                                        {(analysisStatus === 'not_requested' || !analysisStatus) && analysisStatus !== 'failed' ? (
                                                            <button className="px-3 py-2 rounded-lg bg-primary text-white text-xs font-semibold disabled:opacity-60" type="button" onClick={handleRequestAnalysis} disabled={analysisLoading}>{analysisLoading ? 'Starting...' : 'Run analysis'}</button>
                                                        ) : null}
                                                        {(analysisStatus === 'queued' || analysisStatus === 'running') ? (
                                                            <div className="space-y-1.5">
                                                                <div className="text-slate-500">Analysis in progress ({analysisProgress}%)</div>
                                                                <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                                                                    <div className="h-full bg-primary" style={{ width: `${analysisProgress}%` }} />
                                                                </div>
                                                            </div>
                                                        ) : null}
                                                        {analysisStatus === 'completed' && showAnalysis ? (
                                                            <>
                                                                {analysisIncomplete ? (
                                                                    <div className="space-y-1.5">
                                                                        <div className="text-amber-500">Analysis incomplete. Run again for full evaluation.</div>
                                                                        <button className="px-3 py-2 rounded-lg bg-primary text-white text-xs font-semibold disabled:opacity-60" type="button" onClick={() => handleRequestAnalysis(true)} disabled={analysisLoading}>{analysisLoading ? 'Retrying...' : 'Re-run analysis'}</button>
                                                                    </div>
                                                                ) : null}
                                                                {analysisSummary?.errors?.length ? <div className="text-amber-500">{analysisSummary.errors[0]}</div> : null}
                                                                {evalGraph ? (
                                                                    <div>
                                                                    <div className="relative rounded-lg overflow-hidden bg-slate-900 border border-slate-700" onMouseLeave={() => setEvalTooltip(null)}>
                                                                        <svg
                                                                            viewBox={`0 0 ${evalGraph.viewW} ${evalGraph.viewH}`}
                                                                            preserveAspectRatio="none"
                                                                            className="w-full h-36 md:h-44 cursor-crosshair"
                                                                            onClick={(e) => handleEvalGraphInteraction(e, e.currentTarget)}
                                                                            onMouseMove={(e) => handleEvalGraphInteraction(e, e.currentTarget)}
                                                                        >
                                                                            <defs>
                                                                                <clipPath id="m-clip-top"><rect x="0" y="0" width={evalGraph.viewW} height={evalGraph.cy} /></clipPath>
                                                                                <clipPath id="m-clip-bot"><rect x="0" y={evalGraph.cy} width={evalGraph.viewW} height={evalGraph.cy} /></clipPath>
                                                                            </defs>
                                                                            <path d={evalGraph.areaPath} fill="rgba(255,255,255,0.15)" clipPath="url(#m-clip-top)" />
                                                                            <path d={evalGraph.areaPath} fill="rgba(0,0,0,0.3)" clipPath="url(#m-clip-bot)" />
                                                                            <line x1="0" y1={evalGraph.cy} x2={evalGraph.viewW} y2={evalGraph.cy} stroke="rgba(148,163,184,0.25)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                                                                            {phaseBoundaries.map((b) => (
                                                                                <line key={`mb-${b.index}`} x1={b.index} y1="0" x2={b.index} y2={evalGraph.viewH} stroke="rgba(148,163,184,0.25)" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeDasharray="3,3" />
                                                                            ))}
                                                                            <path d={evalGraph.linePath} fill="none" stroke="#f59e0b" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
                                                                            {evalTooltip ? <line x1={evalGraph.points[evalTooltip.moveIdx]?.x ?? 0} y1="0" x2={evalGraph.points[evalTooltip.moveIdx]?.x ?? 0} y2={evalGraph.viewH} stroke="rgba(245,158,11,0.6)" strokeWidth="0.8" vectorEffect="non-scaling-stroke" /> : null}
                                                                        </svg>
                                                                        {phaseBoundaries.length || phaseCounts.opening ? (
                                                                            <div className="absolute top-0 inset-x-0 flex text-[8px] font-bold uppercase tracking-wider text-slate-400/60 pointer-events-none">
                                                                                {phaseCounts.opening ? <div style={{ width: `${phasePercents.opening}%` }} className="text-center truncate px-0.5">Opening</div> : null}
                                                                                {phaseCounts.middlegame ? <div style={{ width: `${phasePercents.middlegame}%` }} className="text-center truncate px-0.5">Middlegame</div> : null}
                                                                                {phaseCounts.endgame ? <div style={{ width: `${phasePercents.endgame}%` }} className="text-center truncate px-0.5">Endgame</div> : null}
                                                                            </div>
                                                                        ) : null}
                                                                        {evalTooltip ? (
                                                                            <div className="absolute bottom-1 px-2 py-1 rounded bg-slate-800/90 border border-slate-600 text-[10px] text-white font-mono pointer-events-none whitespace-nowrap" style={{ left: `clamp(0px, calc(${evalTooltip.pctX}% - 40px), calc(100% - 80px))` }}>
                                                                                {evalTooltip.label} <span className="text-amber-400">{evalTooltip.eval}</span>
                                                                            </div>
                                                                        ) : null}
                                                                    </div>
                                                                    <div className="text-center text-[9px] text-slate-500/60 font-semibold mt-1 select-none">Powered By DigiChess</div>
                                                                    </div>
                                                                ) : <div className="text-slate-500">No evaluation data yet.</div>}
                                                            </>
                                                        ) : null}
                                                    </div>
                                                ) : null}
                                            </div>
                                        ) : null}

                                        {currentStatus === 'active' && mobileChatOpen ? (
                                            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-surface-light dark:bg-surface-dark flex flex-col max-h-[240px]">
                                                <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200/70 dark:border-slate-700/70">
                                                    <span className="text-xs font-semibold">{effectiveChatRoom === 'players' ? 'Players Chat' : 'Spectators Chat'}</span>
                                                    <button type="button" className="p-1 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400" onClick={() => setMobileChatOpen(false)}>
                                                        <span className="material-symbols-outlined text-[16px]">close</span>
                                                    </button>
                                                </div>
                                                {chatNotice ? <div className="px-3 pt-1.5 text-[11px] text-slate-500">{chatNotice}</div> : null}
                                                <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-1.5 text-xs no-scrollbar">
                                                    {mergedChat.length ? mergedChat.map((msg, i) => (
                                                        <div key={`mc-${msg.user}-${i}`} className="flex gap-1.5 items-start">
                                                            <span className="font-semibold text-slate-800 dark:text-slate-100 shrink-0">{msg.user || 'User'}:</span>
                                                            <span className="text-slate-600 dark:text-slate-300">{msg.message}</span>
                                                        </div>
                                                    )) : <div className="text-slate-400">No messages yet.</div>}
                                                </div>
                                                <div className="flex gap-2 p-2 border-t border-slate-200/70 dark:border-slate-700/70">
                                                    <input
                                                        placeholder={chatNotice || 'Message...'}
                                                        className="flex-1 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs disabled:opacity-60"
                                                        value={chatInput}
                                                        onChange={(e) => setChatInput(e.target.value)}
                                                        onKeyDown={(e) => { if (e.key === 'Enter') handleSendChat(); }}
                                                        disabled={Boolean(chatNotice)}
                                                    />
                                                    <button className="h-8 w-8 rounded-full bg-primary text-white flex items-center justify-center disabled:opacity-60 shrink-0" type="button" onClick={handleSendChat} disabled={Boolean(chatNotice) || !chatInput.trim()} aria-label="Send">
                                                        <span className="material-symbols-outlined text-sm">send</span>
                                                    </button>
                                                </div>
                                            </div>
                                        ) : null}

                                    </div>
                                ) : null}
                            </main>

                            {currentStatus === 'active' ? (
                                <aside
                                    className={`lg:w-72 w-[min(88vw,320px)] lg:static fixed inset-y-0 right-0 z-50 bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-gray-800 lg:rounded-none rounded-2xl p-3 flex flex-col min-h-0 overflow-y-auto no-scrollbar shadow-2xl lg:shadow-none transform transition-transform duration-300 ease-out ${
                                        rightDrawerOpen ? 'translate-x-0' : 'translate-x-full'
                                    } lg:translate-x-0`}
                                >
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-sm font-semibold">
                                                {effectiveChatRoom === 'players' ? 'Players Chat' : 'Spectators Chat'}
                                            </h3>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button
                                                className="flex items-center justify-center p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors text-slate-600 dark:text-slate-300"
                                                type="button"
                                                onClick={() => setShowSettings((prev) => !prev)}
                                            >
                                                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>settings</span>
                                            </button>
                                            <button
                                                className="lg:hidden flex items-center justify-center p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors text-slate-500 dark:text-slate-400"
                                                type="button"
                                                onClick={closeDrawers}
                                                aria-label="Close panel"
                                            >
                                                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
                                            </button>
                                        </div>
                                    </div>
                                    {showSettings ? (
                                        <div className="mb-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/80 p-3 space-y-3">
                                            <div>
                                                <div className="text-xs font-semibold text-slate-500 mb-2">Board theme</div>
                                                <div className="flex items-center gap-3">
                                                    <div className="grid grid-cols-2 grid-rows-2 w-8 h-8 rounded overflow-hidden border border-slate-200 dark:border-slate-700">
                                                        <div style={{ backgroundColor: boardTheme.light }} />
                                                        <div style={{ backgroundColor: boardTheme.dark }} />
                                                        <div style={{ backgroundColor: boardTheme.dark }} />
                                                        <div style={{ backgroundColor: boardTheme.light }} />
                                                    </div>
                                                    <select
                                                        value={boardThemeIndex}
                                                        onChange={(e) => setBoardThemeIndex(Number(e.target.value))}
                                                        className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200"
                                                    >
                                                        {BOARD_THEMES.map((theme, idx) => (
                                                            <option key={theme.name} value={idx}>
                                                                {theme.name}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>
                                            <div>
                                                <div className="text-xs font-semibold text-slate-500 mb-2">Piece set</div>
                                                <select
                                                    value={pieceSet}
                                                    onChange={(e) => setPieceSet(e.target.value)}
                                                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200"
                                                >
                                                    {PIECE_SETS.map((set) => (
                                                        <option key={set.value} value={set.value}>
                                                            {set.name}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <div className="text-xs font-semibold text-slate-500">Auto queen</div>
                                                <button
                                                    className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
                                                        autoQueenEnabled ? 'bg-primary/10 text-primary' : 'bg-slate-200 text-slate-600'
                                                    }`}
                                                    type="button"
                                                    onClick={() => setAutoQueenEnabled((prev) => !prev)}
                                                >
                                                    {autoQueenEnabled ? 'Enabled' : 'Disabled'}
                                                </button>
                                            </div>
                                        </div>
                                    ) : null}
                                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 flex flex-col min-h-[200px] sm:min-h-[280px]">
                                        {chatNotice ? (
                                            <div className="px-3 pt-2 text-[11px] text-slate-500">{chatNotice}</div>
                                        ) : null}
                                        <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-2 text-sm text-slate-700 dark:text-slate-300 no-scrollbar">
                                            {mergedChat.length ? mergedChat.map((msg, index) => (
                                                <div key={`${msg.user}-${msg.message}-${index}`} className="flex gap-2 items-start">
                                                    {msg.user ? (
                                                        <button
                                                            type="button"
                                                            className="font-semibold text-slate-800 dark:text-slate-100 hover:text-primary"
                                                            onClick={() => navigate(`/profile/${msg.user}`)}
                                                        >
                                                            {msg.user}:
                                                        </button>
                                                    ) : (
                                                        <span className="font-semibold text-slate-800 dark:text-slate-100">User:</span>
                                                    )}
                                                    <span className="text-slate-600 dark:text-slate-300">{msg.message}</span>
                                                </div>
                                            )) : (
                                                <div className="text-sm text-slate-500">No chat messages yet.</div>
                                            )}
                                        </div>
                                        <div className="flex gap-2 p-2 border-t border-slate-200/70 dark:border-slate-700/70">
                                            <input
                                                placeholder={chatNotice || 'Send a message...'}
                                                className="flex-1 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-white disabled:opacity-60"
                                                value={chatInput}
                                                onChange={(event) => setChatInput(event.target.value)}
                                                onKeyDown={(event) => {
                                                    if (event.key === 'Enter') {
                                                        handleSendChat();
                                                    }
                                                }}
                                                disabled={Boolean(chatNotice)}
                                            />
                                            <button
                                                className="h-10 w-10 rounded-full bg-primary text-white text-sm font-semibold disabled:opacity-60 flex items-center justify-center shrink-0"
                                                type="button"
                                                onClick={handleSendChat}
                                                disabled={Boolean(chatNotice) || !chatInput.trim()}
                                                aria-label="Send message"
                                            >
                                                <span className="material-symbols-outlined text-base">send</span>
                                            </button>
                                        </div>
                                    </div>
                                </aside>
                            ) : currentStatus === 'pending' ? (
                                <aside
                                    className={`lg:w-72 w-[min(88vw,320px)] lg:static fixed inset-y-0 right-0 z-50 bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-gray-800 lg:rounded-none rounded-2xl p-3 flex flex-col min-h-0 overflow-y-auto no-scrollbar shadow-2xl lg:shadow-none transform transition-transform duration-300 ease-out ${
                                        rightDrawerOpen ? 'translate-x-0' : 'translate-x-full'
                                    } lg:translate-x-0`}
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <h3 className="text-sm font-semibold">Challenge Pending</h3>
                                        <div className="flex items-center gap-1">
                                            <button
                                                className="flex items-center justify-center p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors text-slate-600 dark:text-slate-300"
                                                type="button"
                                                onClick={() => setShowSettings((prev) => !prev)}
                                            >
                                                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>settings</span>
                                            </button>
                                            <button
                                                className="lg:hidden flex items-center justify-center p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors text-slate-500 dark:text-slate-400"
                                                type="button"
                                                onClick={closeDrawers}
                                                aria-label="Close panel"
                                            >
                                                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
                                            </button>
                                        </div>
                                    </div>
                                    {showSettings ? (
                                        <div className="mb-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/80 p-3 space-y-3">
                                            <div>
                                                <div className="text-xs font-semibold text-slate-500 mb-2">Board theme</div>
                                                <div className="flex items-center gap-3">
                                                    <div className="grid grid-cols-2 grid-rows-2 w-8 h-8 rounded overflow-hidden border border-slate-200 dark:border-slate-700">
                                                        <div style={{ backgroundColor: boardTheme.light }} />
                                                        <div style={{ backgroundColor: boardTheme.dark }} />
                                                        <div style={{ backgroundColor: boardTheme.dark }} />
                                                        <div style={{ backgroundColor: boardTheme.light }} />
                                                    </div>
                                                    <select
                                                        value={boardThemeIndex}
                                                        onChange={(e) => setBoardThemeIndex(Number(e.target.value))}
                                                        className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200"
                                                    >
                                                        {BOARD_THEMES.map((theme, idx) => (
                                                            <option key={theme.name} value={idx}>
                                                                {theme.name}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>
                                            <div>
                                                <div className="text-xs font-semibold text-slate-500 mb-2">Piece set</div>
                                                <select
                                                    value={pieceSet}
                                                    onChange={(e) => setPieceSet(e.target.value)}
                                                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200"
                                                >
                                                    {PIECE_SETS.map((set) => (
                                                        <option key={set.value} value={set.value}>
                                                            {set.name}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <div className="text-xs font-semibold text-slate-500">Auto queen</div>
                                                <button
                                                    className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
                                                        autoQueenEnabled ? 'bg-primary/10 text-primary' : 'bg-slate-200 text-slate-600'
                                                    }`}
                                                    type="button"
                                                    onClick={() => setAutoQueenEnabled((prev) => !prev)}
                                                >
                                                    {autoQueenEnabled ? 'Enabled' : 'Disabled'}
                                                </button>
                                            </div>
                                        </div>
                                    ) : null}
                                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 p-3 space-y-2 text-xs text-slate-600 dark:text-slate-300">
                                        <div className="font-semibold text-slate-700 dark:text-slate-200">
                                            {isCreator ? 'Challenge sent' : 'Game challenge pending'}
                                        </div>
                                        <div className="text-slate-500 dark:text-slate-400">
                                            {isCreator
                                                ? `Waiting for ${opponentName || 'opponent'} to respond.`
                                                : 'Accept to start the game.'}
                                        </div>
                                        {!isCreator ? (
                                            <div className="mt-2 flex gap-2">
                                                <button
                                                    className="px-2 py-1 rounded-lg bg-primary text-white text-xs font-semibold"
                                                    type="button"
                                                    onClick={handleAccept}
                                                >
                                                    Accept
                                                </button>
                                                <button
                                                    className="px-2 py-1 rounded-lg bg-slate-200 dark:bg-slate-700 text-xs font-semibold"
                                                    type="button"
                                                    onClick={handleReject}
                                                >
                                                    Reject
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                className="mt-2 px-2 py-1 rounded-lg bg-slate-200 dark:bg-slate-700 text-xs font-semibold"
                                                type="button"
                                                onClick={handleCancelChallenge}
                                            >
                                                Cancel challenge
                                            </button>
                                        )}
                                    </div>
                                </aside>
                            ) : (
                                <aside
                                    className={`lg:w-72 w-[min(88vw,320px)] lg:static fixed inset-y-0 right-0 z-50 bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-gray-800 lg:rounded-none rounded-2xl p-3 flex flex-col min-h-0 overflow-y-auto no-scrollbar shadow-2xl lg:shadow-none transform transition-transform duration-300 ease-out ${
                                        rightDrawerOpen ? 'translate-x-0' : 'translate-x-full'
                                    } lg:translate-x-0`}
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <h3 className="text-sm font-semibold">Game Summary</h3>
                                        <div className="flex items-center gap-1">
                                            <button
                                                className="flex items-center justify-center p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors text-slate-600 dark:text-slate-300"
                                                type="button"
                                                onClick={() => setShowSettings((prev) => !prev)}
                                            >
                                                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>settings</span>
                                            </button>
                                            <button
                                                className="lg:hidden flex items-center justify-center p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors text-slate-500 dark:text-slate-400"
                                                type="button"
                                                onClick={closeDrawers}
                                                aria-label="Close panel"
                                            >
                                                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
                                            </button>
                                        </div>
                                    </div>
                                    {showSettings ? (
                                        <div className="mb-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/80 p-3 space-y-3">
                                            <div>
                                                <div className="text-xs font-semibold text-slate-500 mb-2">Board theme</div>
                                                <div className="flex items-center gap-3">
                                                    <div className="grid grid-cols-2 grid-rows-2 w-8 h-8 rounded overflow-hidden border border-slate-200 dark:border-slate-700">
                                                        <div style={{ backgroundColor: boardTheme.light }} />
                                                        <div style={{ backgroundColor: boardTheme.dark }} />
                                                        <div style={{ backgroundColor: boardTheme.dark }} />
                                                        <div style={{ backgroundColor: boardTheme.light }} />
                                                    </div>
                                                    <select
                                                        value={boardThemeIndex}
                                                        onChange={(e) => setBoardThemeIndex(Number(e.target.value))}
                                                        className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200"
                                                    >
                                                        {BOARD_THEMES.map((theme, idx) => (
                                                            <option key={theme.name} value={idx}>
                                                                {theme.name}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>
                                            <div>
                                                <div className="text-xs font-semibold text-slate-500 mb-2">Piece set</div>
                                                <select
                                                    value={pieceSet}
                                                    onChange={(e) => setPieceSet(e.target.value)}
                                                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200"
                                                >
                                                    {PIECE_SETS.map((set) => (
                                                        <option key={set.value} value={set.value}>
                                                            {set.name}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <div className="text-xs font-semibold text-slate-500">Auto queen</div>
                                                <button
                                                    className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
                                                        autoQueenEnabled ? 'bg-primary/10 text-primary' : 'bg-slate-200 text-slate-600'
                                                    }`}
                                                    type="button"
                                                    onClick={() => setAutoQueenEnabled((prev) => !prev)}
                                                >
                                                    {autoQueenEnabled ? 'Enabled' : 'Disabled'}
                                                </button>
                                            </div>
                                        </div>
                                    ) : null}
                                    <div className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
                                        <div>
                                            Result: <span className="font-semibold text-slate-800 dark:text-slate-200">
                                                {outcome?.label || (currentStatus === 'aborted' ? 'Game aborted' : currentStatus === 'finished' ? 'Finished' : 'Pending')}
                                            </span>
                                        </div>
                                        <div>
                                            White: {game?.white?.username || 'White'} ({resolveRating(game?.white)}
                                            {whiteDelta ? (
                                                <span className={`ml-1 font-semibold ${whiteDelta.className}`}>{whiteDelta.text}</span>
                                            ) : null}
                                            )
                                        </div>
                                        <div>
                                            Black: {game?.black?.username || 'Black'} ({resolveRating(game?.black)}
                                            {blackDelta ? (
                                                <span className={`ml-1 font-semibold ${blackDelta.className}`}>{blackDelta.text}</span>
                                            ) : null}
                                            )
                                        </div>
                                    </div>
                                    {showRematchActions ? (
                                        <div className="mt-3 space-y-2">
                                            {rematchExpiredDisplay ? (
                                                <div className="w-full rounded-lg bg-slate-200/70 dark:bg-slate-800/70 px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 text-center">
                                                    Rematch option expired.
                                                </div>
                                            ) : rematchActive ? (
                                                isRematchRequester ? (
                                                    <div className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-800/70 px-3 py-2 text-xs">
                                                        <div className="font-semibold text-slate-700 dark:text-slate-200">
                                                            Rematch requested.
                                                        </div>
                                                        <div className="mt-1 text-slate-500 dark:text-slate-400">
                                                            Waiting for opponent response...
                                                        </div>
                                                        <button
                                                            className="mt-2 w-full px-3 py-2 rounded-lg bg-slate-200 dark:bg-slate-700 text-xs font-semibold disabled:opacity-60"
                                                            type="button"
                                                            onClick={handleCancelRematch}
                                                            disabled={rematchLoading}
                                                        >
                                                            Cancel request
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-800/70 px-3 py-2 text-xs">
                                                        <div className="font-semibold text-slate-700 dark:text-slate-200">
                                                            Rematch requested.
                                                        </div>
                                                        <div className="mt-2 flex gap-2">
                                                            <button
                                                                className="flex-1 px-3 py-2 rounded-lg bg-primary text-white text-xs font-semibold disabled:opacity-60"
                                                                type="button"
                                                                onClick={handleAcceptRematch}
                                                                disabled={rematchLoading}
                                                            >
                                                                Accept
                                                            </button>
                                                            <button
                                                                className="flex-1 px-3 py-2 rounded-lg bg-slate-200 dark:bg-slate-700 text-xs font-semibold disabled:opacity-60"
                                                                type="button"
                                                                onClick={handleRejectRematch}
                                                                disabled={rematchLoading}
                                                            >
                                                                Reject
                                                            </button>
                                                        </div>
                                                    </div>
                                                )
                                            ) : (
                                                <button
                                                    className="w-full px-3 py-2 rounded-lg bg-primary text-white text-xs font-semibold disabled:opacity-60"
                                                    type="button"
                                                    onClick={handleRequestRematch}
                                                    disabled={rematchLoading}
                                                >
                                                    {rematchLoading ? 'Requesting...' : 'Rematch'}
                                                </button>
                                            )}
                                            {rematchNotice ? (
                                                <div className="text-xs text-slate-500 bg-slate-500/10 border border-slate-500/20 rounded-lg px-2 py-1">
                                                    {rematchNotice}
                                                </div>
                                            ) : null}
                                        </div>
                                    ) : null}
                                    {isTournamentGame && (currentStatus === 'finished' || currentStatus === 'aborted') ? (
                                        <div className="mt-3">
                                            <button
                                                className="w-full px-3 py-2.5 rounded-lg bg-primary text-white text-xs font-semibold flex items-center justify-center gap-2 hover:bg-blue-600 transition-colors"
                                                type="button"
                                                onClick={() => navigate(`/tournaments/${game.tournament_id}`)}
                                                data-testid="back-to-tournament"
                                            >
                                                <span className="material-symbols-outlined text-[16px]">emoji_events</span>
                                                Back to Tournament
                                            </button>
                                        </div>
                                    ) : null}
                                    {currentStatus === 'finished' ? (
                                        <div className="mt-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-800/70 p-3 space-y-2 text-xs">
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Analysis</span>
                                                {analysisStatus === 'completed' ? (
                                                    <button
                                                        className="text-xs font-semibold text-primary hover:underline"
                                                        type="button"
                                                        onClick={() => setShowAnalysis((prev) => !prev)}
                                                    >
                                                        {showAnalysis ? 'Hide' : 'Show'}
                                                    </button>
                                                ) : null}
                                            </div>
                                            {analysisError ? (
                                                <div className="text-red-500">{analysisError}</div>
                                            ) : null}
                                            {analysisStatus === 'failed' ? (
                                                <button
                                                    className="px-3 py-2 rounded-lg bg-primary text-white text-xs font-semibold"
                                                    type="button"
                                                    onClick={() => handleRequestAnalysis(true)}
                                                    disabled={analysisLoading}
                                                >
                                                    {analysisLoading ? 'Retrying...' : 'Retry analysis'}
                                                </button>
                                            ) : null}
                                            {(analysisStatus === 'not_requested' || !analysisStatus) && analysisStatus !== 'failed' ? (
                                                <button
                                                    className="px-3 py-2 rounded-lg bg-primary text-white text-xs font-semibold"
                                                    type="button"
                                                    onClick={handleRequestAnalysis}
                                                    disabled={analysisLoading}
                                                >
                                                    {analysisLoading ? 'Starting...' : 'Run analysis'}
                                                </button>
                                            ) : null}
                                            {(analysisStatus === 'queued' || analysisStatus === 'running') ? (
                                                <div className="space-y-2">
                                                    <div className="text-slate-600 dark:text-slate-300">
                                                        Analysis in progress ({analysisProgress}%)
                                                    </div>
                                                    <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                                                        <div className="h-full bg-primary" style={{ width: `${analysisProgress}%` }} />
                                                    </div>
                                                </div>
                                            ) : null}
                                            {analysisStatus === 'completed' && showAnalysis ? (
                                                <div className="space-y-1 text-slate-600 dark:text-slate-300">
                                                    {analysisIncomplete ? (
                                                        <div className="space-y-2">
                                                            <div className="text-amber-500">
                                                                Analysis incomplete. Run analysis again for full evaluation.
                                                            </div>
                                                            <button
                                                                className="px-3 py-2 rounded-lg bg-primary text-white text-xs font-semibold"
                                                                type="button"
                                                                onClick={() => handleRequestAnalysis(true)}
                                                                disabled={analysisLoading}
                                                            >
                                                                {analysisLoading ? 'Retrying...' : 'Re-run analysis'}
                                                            </button>
                                                        </div>
                                                    ) : null}
                                                    {analysisSummary?.errors?.length ? (
                                                        <div className="text-amber-500">
                                                            {analysisSummary.errors[0]}
                                                        </div>
                                                    ) : null}
                                                </div>
                                            ) : null}
                                            {analysisStatus === 'completed' && showAnalysis ? (
                                                <div className="space-y-2">
                                                    {evalGraph ? (
                                                        <div>
                                                        <div className="relative rounded-lg overflow-hidden bg-slate-900 border border-slate-700" onMouseLeave={() => setEvalTooltip(null)}>
                                                            <svg
                                                                viewBox={`0 0 ${evalGraph.viewW} ${evalGraph.viewH}`}
                                                                preserveAspectRatio="none"
                                                                className="w-full h-36 md:h-44 cursor-crosshair"
                                                                onClick={(e) => handleEvalGraphInteraction(e, e.currentTarget)}
                                                                onMouseMove={(e) => handleEvalGraphInteraction(e, e.currentTarget)}
                                                            >
                                                                <defs>
                                                                    <clipPath id="d-clip-top"><rect x="0" y="0" width={evalGraph.viewW} height={evalGraph.cy} /></clipPath>
                                                                    <clipPath id="d-clip-bot"><rect x="0" y={evalGraph.cy} width={evalGraph.viewW} height={evalGraph.cy} /></clipPath>
                                                                </defs>
                                                                <path d={evalGraph.areaPath} fill="rgba(255,255,255,0.15)" clipPath="url(#d-clip-top)" />
                                                                <path d={evalGraph.areaPath} fill="rgba(0,0,0,0.3)" clipPath="url(#d-clip-bot)" />
                                                                <line x1="0" y1={evalGraph.cy} x2={evalGraph.viewW} y2={evalGraph.cy} stroke="rgba(148,163,184,0.25)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                                                                {phaseBoundaries.map((b) => (
                                                                    <line key={`db-${b.index}`} x1={b.index} y1="0" x2={b.index} y2={evalGraph.viewH} stroke="rgba(148,163,184,0.25)" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeDasharray="3,3" />
                                                                ))}
                                                                <path d={evalGraph.linePath} fill="none" stroke="#f59e0b" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
                                                                {evalTooltip ? <line x1={evalGraph.points[evalTooltip.moveIdx]?.x ?? 0} y1="0" x2={evalGraph.points[evalTooltip.moveIdx]?.x ?? 0} y2={evalGraph.viewH} stroke="rgba(245,158,11,0.6)" strokeWidth="0.8" vectorEffect="non-scaling-stroke" /> : null}
                                                            </svg>
                                                            {phaseBoundaries.length || phaseCounts.opening ? (
                                                                <div className="absolute top-0 inset-x-0 flex text-[8px] font-bold uppercase tracking-wider text-slate-400/60 pointer-events-none">
                                                                    {phaseCounts.opening ? <div style={{ width: `${phasePercents.opening}%` }} className="text-center truncate px-0.5">Opening</div> : null}
                                                                    {phaseCounts.middlegame ? <div style={{ width: `${phasePercents.middlegame}%` }} className="text-center truncate px-0.5">Middlegame</div> : null}
                                                                    {phaseCounts.endgame ? <div style={{ width: `${phasePercents.endgame}%` }} className="text-center truncate px-0.5">Endgame</div> : null}
                                                                </div>
                                                            ) : null}
                                                            {evalTooltip ? (
                                                                <div className="absolute bottom-1 px-2 py-1 rounded bg-slate-800/90 border border-slate-600 text-[10px] text-white font-mono pointer-events-none whitespace-nowrap" style={{ left: `clamp(0px, calc(${evalTooltip.pctX}% - 40px), calc(100% - 80px))` }}>
                                                                    {evalTooltip.label} <span className="text-amber-400">{evalTooltip.eval}</span>
                                                                </div>
                                                            ) : null}
                                                        </div>
                                                        <div className="text-center text-[9px] text-slate-500/60 font-semibold mt-1 select-none">Powered By DigiChess</div>
                                                        </div>
                                                    ) : (
                                                        <div className="text-xs text-slate-500">No evaluation data yet.</div>
                                                    )}
                                                </div>
                                            ) : null}
                                        </div>
                                    ) : null}
                                </aside>
                            )}
                        </div>
                    </>
                )}
            </div>
        </Layout>
    );
}
