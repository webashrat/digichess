import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import {
    abortGame,
    makeMove,
    offerDraw,
    optimisticMove,
    resignGame,
    acceptGame,
    rejectGame,
    respondDraw,
    fetchGameAnalysis,
    fetchGameAnalysisStatus,
    requestGameAnalysis,
    createPrediction,
} from '../api';
import ChessPiece from '../components/chess/ChessPiece';
import { useAuth } from '../context/AuthContext';
import useGameSync from '../hooks/useGameSync';
import { BOARD_THEMES, PIECE_SETS } from '../utils/boardPresets';
import { getBlitzTag, getRatingTagClasses } from '../utils/ratingTags';

const DEFAULT_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const BOARD_SETTING_EVENT = 'board-settings-change';
const LOCAL_STORAGE_SOUND = 'soundEnabled';
const LOCAL_STORAGE_AUTO_QUEEN = 'autoQueenEnabled';
const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

const outcomeToneStyles = {
    success: 'bg-green-500/15 border-green-500/30 text-green-400',
    danger: 'bg-red-500/15 border-red-500/30 text-red-400',
    warning: 'bg-amber-500/15 border-amber-500/30 text-amber-400',
    neutral: 'bg-slate-500/15 border-slate-500/30 text-slate-300',
};

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

export default function GamePage() {
    const { gameId } = useParams();
    const navigate = useNavigate();
    const { isAuthenticated, token, user } = useAuth();
    const [error, setError] = useState(null);
    const [spectate, setSpectate] = useState(!isAuthenticated);
    const [pendingMove, setPendingMove] = useState(false);
    const [optimisticState, setOptimisticState] = useState(null);
    const [previewIndex, setPreviewIndex] = useState(0);
    const [selectedSquare, setSelectedSquare] = useState(null);
    const [legalTargets, setLegalTargets] = useState([]);
    const [dragFrom, setDragFrom] = useState(null);
    const [dragPiece, setDragPiece] = useState(null);
    const [dragPosition, setDragPosition] = useState(null);
    const [lastMoveUci, setLastMoveUci] = useState(null);
    const [drawNotice, setDrawNotice] = useState(null);
    const [analysisStatus, setAnalysisStatus] = useState(null);
    const [analysisData, setAnalysisData] = useState(null);
    const [analysisError, setAnalysisError] = useState(null);
    const [analysisLoading, setAnalysisLoading] = useState(false);
    const [showAnalysis, setShowAnalysis] = useState(false);
    const [quickEval, setQuickEval] = useState(null);
    const [quickEvalMeta, setQuickEvalMeta] = useState(null);
    const [predictionStatus, setPredictionStatus] = useState(null);
    const [predictionError, setPredictionError] = useState(null);
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
    const analysisPollRef = useRef(null);
    const drawOfferRef = useRef(null);
    const clockAnchorRef = useRef(null);
    const lastSoundMoveRef = useRef(0);
    const soundInitRef = useRef(false);
    const lastTickRef = useRef(null);
    const audioCtxRef = useRef(null);
    const [boardPixelSize, setBoardPixelSize] = useState(560);
    const [clockNow, setClockNow] = useState(() => Date.now());
    const [resignConfirm, setResignConfirm] = useState(false);
    const [resignLoading, setResignLoading] = useState(false);
    const [pendingPromotion, setPendingPromotion] = useState(null);
    const [premove, setPremove] = useState(null);
    const [premoveNotice, setPremoveNotice] = useState(null);
    const [mobileBoardSize, setMobileBoardSize] = useState(null);
    const [leftDrawerOpen, setLeftDrawerOpen] = useState(false);
    const [rightDrawerOpen, setRightDrawerOpen] = useState(false);
    const [isMobileLayout, setIsMobileLayout] = useState(false);
    const touchStateRef = useRef(null);
    const topBarRef = useRef(null);
    const bottomBarRef = useRef(null);
    const pageRef = useRef(null);

    const { game, state, chat, connected, sendChat, syncEvents, error: syncError } = useGameSync({
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
            const verticalPadding = 16;
            const availableHeight = window.innerHeight - topHeight - bottomHeight - verticalPadding;
            const size = Math.floor(Math.min(window.innerWidth, availableHeight));
            setMobileBoardSize(size > 0 ? size : null);
        };
        computeSize();
        window.addEventListener('resize', computeSize);
        window.addEventListener('orientationchange', computeSize);
        return () => {
            window.removeEventListener('resize', computeSize);
            window.removeEventListener('orientationchange', computeSize);
        };
    }, [isMobileLayout]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const handleStorage = (event) => {
            if (event.key === LOCAL_STORAGE_SOUND) {
                setSoundEnabled(event.newValue ? event.newValue === 'true' : true);
            }
            if (event.key === LOCAL_STORAGE_AUTO_QUEEN) {
                setAutoQueenEnabled(event.newValue ? event.newValue === 'true' : true);
            }
        };
        window.addEventListener('storage', handleStorage);
        return () => window.removeEventListener('storage', handleStorage);
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
    }, []);

    const moves = useMemo(() => (displayMoves ? displayMoves.split(' ') : []), [displayMoves]);
    const navigation = useMemo(() => {
        const chess = new Chess();
        const fens = [chess.fen()];
        const uciList = [];
        const phaseList = [];
        for (let index = 0; index < moves.length; index += 1) {
            const san = moves[index];
            try {
                const move = chess.move(san, { sloppy: true });
                if (!move) break;
                const uci = `${move.from}${move.to}${move.promotion || ''}`;
                uciList.push(uci);
                fens.push(chess.fen());
                const moveNumber = index + 1;
                let phase = 'middlegame';
                if (moveNumber <= 10) {
                    phase = 'opening';
                } else if (moveNumber > 30) {
                    phase = 'endgame';
                }
                phaseList.push(phase);
            } catch (err) {
                break;
            }
        }
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
        const interval = setInterval(update, 250);
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
    const canAbort = isAuthenticated && isUserPlayer && currentStatus === 'active' && moveCount < 2;
    const canPredict = currentStatus === 'active' && !isUserPlayer && moveCount <= 10;
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
        if (!game?.id || currentStatus !== 'active') return;
        const interval = setInterval(() => setClockNow(Date.now()), 100);
        return () => clearInterval(interval);
    }, [game?.id, currentStatus]);
    useEffect(() => {
        if (currentStatus === 'finished' || currentStatus === 'aborted') {
            setShowAnalysis(true);
        } else if (currentStatus === 'active') {
            setShowAnalysis(false);
        }
    }, [currentStatus]);
    const isOwnPiece = (piece) => {
        if (!piece) return false;
        const isWhitePiece = piece === piece.toUpperCase();
        return isUserWhite ? isWhitePiece : !isWhitePiece;
    };
    const resolveTargets = (fromSquare) => (movesByFrom[fromSquare] || []).map((uci) => uci.slice(2, 4));
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
            if (r < 0 || r > 7 || c < 0 || c > 7) return false;
            const targetPiece = board?.[r]?.[c];
            if (targetPiece) {
                const targetIsWhite = targetPiece === targetPiece.toUpperCase();
                if (targetIsWhite === isWhitePiece) return false;
                targets.push(`${FILES[c]}${8 - r}`);
                return false;
            }
            targets.push(`${FILES[c]}${8 - r}`);
            return true;
        };
        const slide = (dr, dc) => {
            let r = row + dr;
            let c = col + dc;
            while (r >= 0 && r <= 7 && c >= 0 && c <= 7) {
                if (!addTarget(r, c)) break;
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
                if (!board?.[oneRow]?.[col]) {
                    addTarget(oneRow, col);
                    const twoRow = row + dir * 2;
                    if (row === startRow && !board?.[twoRow]?.[col]) {
                        addTarget(twoRow, col);
                    }
                }
                [-1, 1].forEach((dc) => {
                    const c = col + dc;
                    if (c < 0 || c > 7) return;
                    const targetPiece = board?.[oneRow]?.[c];
                    if (!targetPiece) return;
                    const targetIsWhite = targetPiece === targetPiece.toUpperCase();
                    if (targetIsWhite !== isWhitePiece) {
                        targets.push(`${FILES[c]}${8 - oneRow}`);
                    }
                });
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
    const resolvePremoveTargets = (fromSquare) => {
        const premoveTargets = (premoveMovesByFrom[fromSquare] || []).map((uci) => uci.slice(2, 4));
        const pseudoTargets = resolvePseudoTargets(fromSquare);
        if (!pseudoTargets.length) return premoveTargets;
        const merged = new Set([...premoveTargets, ...pseudoTargets]);
        return Array.from(merged);
    };
    const getPromotionOptions = (fromSquare, toSquare, usePremove = false) => {
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
    };
    const resolveMoveUci = (fromSquare, toSquare) => {
        const candidates = (movesByFrom[fromSquare] || []).filter((uci) => uci.slice(2, 4) === toSquare);
        if (!candidates.length) return null;
        const queenPromotion = candidates.find((uci) => uci.length === 5 && uci.endsWith('q'));
        return queenPromotion || candidates[0];
    };
    const resolvePremoveUci = (fromSquare, toSquare) => {
        const candidates = (premoveMovesByFrom[fromSquare] || []).filter((uci) => uci.slice(2, 4) === toSquare);
        if (candidates.length) {
            const queenPromotion = candidates.find((uci) => uci.length === 5 && uci.endsWith('q'));
            return queenPromotion || candidates[0];
        }
        const piece = squareMap[fromSquare];
        const rank = Number(toSquare[1]);
        if (piece && piece.toLowerCase() === 'p' && (rank === 1 || rank === 8)) {
            return `${fromSquare}${toSquare}q`;
        }
        return `${fromSquare}${toSquare}`;
    };
    const queuePremove = (fromSquare, toSquare) => {
        setSelectedSquare(null);
        setLegalTargets([]);
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
            setPremoveNotice('Premove set.');
            return;
        }
        setPremove({ from: fromSquare, to: toSquare });
        setPremoveNotice('Premove set.');
    };
    const resolveMoveSan = (uci) => moveMap.get(uci) || null;
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
    const checkSquare = useMemo(() => {
        try {
            const fen = isPreviewing ? previewFen : displayFen;
            const chess = new Chess(fen || DEFAULT_FEN);
            const isInCheck = typeof chess.in_check === 'function'
                ? chess.in_check()
                : typeof chess.isCheck === 'function'
                    ? chess.isCheck()
                    : typeof chess.inCheck === 'function'
                        ? chess.inCheck()
                        : false;
            if (!isInCheck) return null;
            const color = chess.turn();
            if (isUserPlayer) {
                const userColor = isUserWhite ? 'w' : 'b';
                if (color !== userColor) return null;
            }
            if (typeof chess.king === 'function') {
                return chess.king(color);
            }
            const boardState = chess.board?.();
            if (Array.isArray(boardState)) {
                for (let row = 0; row < boardState.length; row += 1) {
                    for (let col = 0; col < boardState[row].length; col += 1) {
                        const piece = boardState[row][col];
                        if (piece && piece.type === 'k' && piece.color === color) {
                            return `${FILES[col]}${8 - row}`;
                        }
                    }
                }
            }
            return null;
        } catch (err) {
            return null;
        }
    }, [displayFen, previewFen, isPreviewing, isUserPlayer, isUserWhite]);
    const drawerOpen = leftDrawerOpen || rightDrawerOpen;

    useEffect(() => {
        setSelectedSquare(null);
        setLegalTargets([]);
        setDragFrom(null);
        setDragPiece(null);
        setDragPosition(null);
    }, [displayFen]);

    useEffect(() => {
        if (!canInteract) {
            setSelectedSquare(null);
            setLegalTargets([]);
            setDragFrom(null);
            setDragPiece(null);
            setDragPosition(null);
            setPendingPromotion(null);
        }
    }, [canInteract]);
    useEffect(() => {
        if (currentStatus !== 'active') {
            setPremove(null);
        }
    }, [currentStatus]);
    useEffect(() => {
        setPendingPromotion(null);
    }, [displayFen]);

    useEffect(() => {
        if (!optimisticState) return;
        const serverFen = state?.fen || game?.current_fen;
        const serverMoves = state?.moves || game?.moves;
        if ((serverFen && optimisticState.fen && serverFen === optimisticState.fen)
            || (serverMoves && optimisticState.moves && serverMoves === optimisticState.moves)) {
            setOptimisticState(null);
        }
    }, [optimisticState, state?.fen, state?.moves, game?.current_fen, game?.moves]);

    useEffect(() => {
        if (currentStatus !== 'active') {
            setResignConfirm(false);
        }
    }, [currentStatus, gameId]);
    useEffect(() => {
        if (!optimisticState) return;
        const serverMoves = state?.moves || game?.moves || '';
        if (!serverMoves || !optimisticState.moves) return;
        const serverCount = serverMoves.trim() ? serverMoves.split(' ').length : 0;
        const optimisticCount = optimisticState.moves.trim() ? optimisticState.moves.split(' ').length : 0;
        if (serverCount >= optimisticCount) {
            setOptimisticState(null);
        }
    }, [optimisticState, state?.moves, game?.moves]);
    useEffect(() => {
        setLastMoveUci(null);
    }, [gameId]);
    useEffect(() => {
        setPredictionStatus(null);
        setPredictionError(null);
    }, [gameId]);
    useEffect(() => {
        if (state?.uci) {
            setLastMoveUci(state.uci);
        }
    }, [state?.uci]);
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
        if (!drawNotice) return;
        const timeout = setTimeout(() => setDrawNotice(null), 3500);
        return () => clearTimeout(timeout);
    }, [drawNotice]);
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
            setQuickEvalMeta({
                bestMove: data?.engine?.best_move,
                mate: data?.engine?.mate,
                depth: data?.engine?.depth,
                source: data?.engine?.source,
            });
        } catch (err) {
            setQuickEval(null);
            setQuickEvalMeta(null);
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
        const canQuickAnalyze = game?.id && (!isUserPlayer || currentStatus !== 'active');
        if (!canQuickAnalyze) {
            setQuickEval(null);
            setQuickEvalMeta(null);
            return;
        }
        loadQuickAnalysis();
    }, [game?.id, currentStatus, isUserPlayer, loadQuickAnalysis]);
    const topPlayer = isUserWhite ? game?.black : game?.white;
    const bottomPlayer = isUserWhite ? game?.white : game?.black;
    const liveClock = useMemo(() => {
        if (!clockSource) {
            return { white: null, black: null, turn: clockTurn };
        }
        const anchor = clockAnchorRef.current || {
            ...clockSource,
            at: clockSource.serverTime
                ? clockSource.serverTime * 1000
                : Date.now() + serverOffsetMs,
        };
        let whiteLeft = clockSource.white;
        let blackLeft = clockSource.black;
        if (currentStatus === 'active' && moveCount >= 2 && anchor.at) {
            const nowMs = clockSource.serverTime ? clockNow + serverOffsetMs : clockNow;
            const elapsedMs = Math.max(0, nowMs - anchor.at);
            const elapsed = Math.floor(elapsedMs / 1000);
            if (anchor.turn === 'white') {
                whiteLeft = Math.max(0, (anchor.white ?? 0) - elapsed);
                blackLeft = anchor.black ?? blackLeft;
            } else if (anchor.turn === 'black') {
                blackLeft = Math.max(0, (anchor.black ?? 0) - elapsed);
                whiteLeft = anchor.white ?? whiteLeft;
            }
        }
        return {
            white: whiteLeft,
            black: blackLeft,
            turn: anchor.turn || clockTurn,
        };
    }, [clockNow, clockSource, clockTurn, currentStatus, moveCount, serverOffsetMs]);
    const topClock = isUserWhite ? liveClock.black : liveClock.white;
    const bottomClock = isUserWhite ? liveClock.white : liveClock.black;
    const analysisMoves = analysisData?.analysis?.moves || [];
    const analysisSummary = analysisData?.analysis?.summary || null;
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
    const analysisGraphBars = useMemo(() => {
        if (!analysisEvalSeries.length) return [];
        const width = 100 / analysisEvalSeries.length;
        return analysisEvalSeries.map((value, index) => {
            const numeric = Number.isFinite(value) ? value : 0;
            const clamped = Math.max(-10, Math.min(10, numeric));
            const height = Math.max(2, Math.round((Math.abs(clamped) / 10) * 50));
            return {
                left: index * width,
                width,
                height,
                isWhite: clamped >= 0,
            };
        });
    }, [analysisEvalSeries]);
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
    const formattedEval = useMemo(() => {
        if (effectiveEval == null) return null;
        const value = Number(effectiveEval.toFixed(2));
        return value > 0 ? `+${value}` : `${value}`;
    }, [effectiveEval]);
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
    const showFirstMoveCountdown = firstMoveRemaining != null && currentStatus === 'active' && moveCount < 2;
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

    const formatClock = (seconds) => {
        if (seconds == null) return '--:--';
        const mins = Math.floor(seconds / 60);
        const secs = Math.max(seconds % 60, 0);
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    };

    const ensureAudioContext = useCallback((force = false) => {
        if (!soundEnabled || typeof window === 'undefined') return null;
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
            const context = ensureAudioContext();
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
        if (typeof window === 'undefined') return;
        const unlock = () => {
            ensureAudioContext(true);
        };
        window.addEventListener('pointerdown', unlock, { once: true });
        return () => window.removeEventListener('pointerdown', unlock);
    }, [ensureAudioContext]);

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
            const chess = new Chess();
            let lastMove = null;
            for (let i = 0; i < count; i += 1) {
                lastMove = chess.move(moves[i], { sloppy: true });
                if (!lastMove) break;
            }
            if (lastMove) {
                playMoveSound(Boolean(lastMove.captured));
            }
        } catch (err) {
            // ignore invalid SAN to avoid crashing the UI
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

    const handlePrediction = async (result) => {
        if (!isAuthenticated) {
            navigate('/login');
            return;
        }
        if (!gameId || !result) return;
        setPredictionError(null);
        setPredictionStatus('loading');
        try {
            await createPrediction(gameId, result);
            setPredictionStatus('submitted');
        } catch (err) {
            const message = err?.message || 'Failed to submit prediction.';
            if (message.toLowerCase().includes('already predicted')) {
                setPredictionStatus('submitted');
            } else {
                setPredictionStatus('error');
                setPredictionError(message);
            }
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

    const applyLocalMove = (move, format = 'san') => {
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
                legal_moves: chess.moves(),
                captured: Boolean(applied.captured),
            };
        } catch (err) {
            return null;
        }
    };

    const submitMoveFromUci = async (uciMove) => {
        if (!isAuthenticated) {
            navigate('/login');
            return;
        }
        if (!canInteract) {
            if (currentStatus === 'active') {
                setError('You cannot move right now.');
            }
            return;
        }
        setPendingMove(true);
        setError(null);
        try {
            const local = applyLocalMove(uciMove, 'uci');
            if (local) {
                setOptimisticState({
                    fen: local.fen,
                    moves: local.moves,
                    legal_moves: local.legal_moves,
                });
                setLastMoveUci(local.uci);
            }
            const sanMove = local?.san || resolveMoveSan(uciMove);
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
    };

    useEffect(() => {
        if (!premove || !isUserPlayer || !isUserTurn || pendingMove || isPreviewing || currentStatus !== 'active') return;
        const uci = `${premove.from}${premove.to}${premove.promotion || ''}`;
        if (effectiveLegalMovesUci.includes(uci)) {
            setPremove(null);
            submitMoveFromUci(uci);
            return;
        }
        setPremove(null);
        setPremoveNotice('Premove canceled.');
    }, [currentStatus, effectiveLegalMovesUci, isPreviewing, isUserPlayer, isUserTurn, pendingMove, premove, submitMoveFromUci]);

    const handlePromotionSelect = async (promotion) => {
        if (!pendingPromotion) return;
        const { from, to, mode } = pendingPromotion;
        setPendingPromotion(null);
        if (mode === 'premove') {
            setPremove({ from, to, promotion });
            setPremoveNotice('Premove set.');
            return;
        }
        await submitMoveFromUci(`${from}${to}${promotion}`);
    };

    const handleSquareClick = async (squareCoord) => {
        if (pendingPromotion) return;
        if (premove) {
            setPremove(null);
            setPremoveNotice('Premove canceled.');
            return;
        }
        if (!canInteract) {
            if (!isUserTurn && isUserPlayer && currentStatus === 'active' && !isPreviewing) {
                const piece = squareMap[squareCoord];
                if (!selectedSquare) {
                    if (piece && isOwnPiece(piece)) {
                        setSelectedSquare(squareCoord);
                        setLegalTargets(resolvePremoveTargets(squareCoord));
                    }
                    return;
                }
                if (selectedSquare === squareCoord) {
                    setSelectedSquare(null);
                    setLegalTargets([]);
                    return;
                }
                if (selectedSquare && selectedSquare !== squareCoord) {
                    queuePremove(selectedSquare, squareCoord);
                    return;
                }
                if (piece && isOwnPiece(piece)) {
                    setSelectedSquare(squareCoord);
                    setLegalTargets(resolvePremoveTargets(squareCoord));
                }
            }
            return;
        }
        const piece = squareMap[squareCoord];
        if (!selectedSquare) {
            if (piece && isOwnPiece(piece)) {
                setSelectedSquare(squareCoord);
                setLegalTargets(resolveTargets(squareCoord));
            }
            return;
        }
        if (selectedSquare === squareCoord) {
            setSelectedSquare(null);
            setLegalTargets([]);
            return;
        }
        if (legalTargets.includes(squareCoord)) {
            setSelectedSquare(null);
            setLegalTargets([]);
            const promotionOptions = getPromotionOptions(selectedSquare, squareCoord);
            if (promotionOptions.length && !autoQueenEnabled) {
                const piece = squareMap[selectedSquare];
                const isWhitePiece = piece === piece?.toUpperCase();
                setPendingPromotion({
                    from: selectedSquare,
                    to: squareCoord,
                    options: promotionOptions,
                    color: isWhitePiece ? 'w' : 'b',
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
            setLegalTargets(resolveTargets(squareCoord));
        }
    };

    const updateDragPosition = useCallback((x, y) => {
        dragPosRef.current = { x, y };
        if (dragRafRef.current) return;
        dragRafRef.current = requestAnimationFrame(() => {
            setDragPosition(dragPosRef.current);
            dragRafRef.current = null;
        });
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
            setPremoveNotice('Premove canceled.');
            return;
        }
        if (!canInteract) {
            if (isUserTurn || !isUserPlayer || currentStatus !== 'active' || isPreviewing) return;
        }
        const piece = squareMap[squareCoord];
        if (!piece || !isOwnPiece(piece)) return;
        event.preventDefault();
        const rect = boardRef.current?.getBoundingClientRect();
        if (!rect) return;
        dragPointerRef.current = event.pointerId;
        dragMovedRef.current = false;
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        dragStartRef.current = { x, y };
        setDragFrom(squareCoord);
        setDragPiece(piece);
        updateDragPosition(x, y);
        setSelectedSquare(squareCoord);
        if (canInteract) {
            setLegalTargets(resolveTargets(squareCoord));
        } else {
            setLegalTargets(resolvePremoveTargets(squareCoord));
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
            }
            const fromSquare = dragFrom;
            const targetSquare = moved ? resolveCoordFromPoint(event.clientX, event.clientY) : null;
            setDragFrom(null);
            setDragPiece(null);
            setDragPosition(null);
            setSelectedSquare(null);
            setLegalTargets([]);
            dragPointerRef.current = null;
            dragStartRef.current = null;
            dragMovedRef.current = false;
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
                            });
                            return;
                        }
                        const uciMove = resolveMoveUci(fromSquare, targetSquare);
                        if (uciMove) {
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
        window.addEventListener('pointermove', handleMove);
        window.addEventListener('pointerup', handleUp);
        return () => {
            window.removeEventListener('pointermove', handleMove);
            window.removeEventListener('pointerup', handleUp);
        };
    }, [dragFrom, resolveCoordFromPoint, resolveTargets, resolveMoveUci, submitMoveFromUci, updateDragPosition]);

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
        if (!isMobileLayout) return;
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

    const handleProfileNavigate = useCallback((player) => {
        if (!player?.username) return;
        navigate(`/profile/${player.username}`);
    }, [navigate]);

    return (
        <Layout showHeader={false} showBottomNav={false}>
            <div
                ref={pageRef}
                className={`flex-1 flex flex-col min-h-[100dvh] md:h-[100dvh] ${
                    drawerOpen ? 'overflow-hidden' : 'overflow-y-auto'
                } md:overflow-hidden bg-background-light dark:bg-background-dark relative`}
            >
                {!game ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-sm text-slate-500 gap-3">
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

                        <div className="flex-1 flex flex-col lg:flex-row gap-4 px-0 sm:px-4 pb-4 min-h-0 overflow-hidden relative">
                            <aside
                                className={`lg:w-72 w-[min(88vw,320px)] lg:static fixed inset-y-0 left-0 z-50 bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-gray-800 rounded-2xl p-3 flex flex-col min-h-0 overflow-y-auto no-scrollbar shadow-2xl lg:shadow-none transform transition-transform duration-300 ease-out ${
                                    leftDrawerOpen ? 'translate-x-0' : '-translate-x-full'
                                } lg:translate-x-0`}
                            >
                                <div className="flex items-center mb-2">
                                    <button
                                        className="text-slate-900 dark:text-white hover:text-primary transition-colors flex items-center justify-center p-2 rounded-full bg-white/80 dark:bg-slate-900/80 backdrop-blur border border-slate-200 dark:border-slate-700"
                                        type="button"
                                        onClick={() => navigate(-1)}
                                    >
                                        <span className="material-symbols-outlined text-[22px]">arrow_back</span>
                                    </button>
                                </div>
                                <div className="flex items-center justify-between mb-2">
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
                                                                className={`pl-2 text-left font-mono font-medium rounded ${isWhiteActive ? 'text-primary' : 'text-slate-900 dark:text-white'}`}
                                                                onClick={() => clampPreviewIndex(whiteIndex)}
                                                            >
                                                                {pair.white || ''}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className={`pl-2 text-left font-mono font-medium rounded ${isBlackActive ? 'text-primary' : 'text-slate-900 dark:text-white'}`}
                                                                onClick={() => clampPreviewIndex(blackIndex)}
                                                            >
                                                                {pair.black || ''}
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

                            <main className="flex-1 flex flex-col relative min-h-0 overflow-hidden">
                                <div ref={topBarRef} className="px-2 py-2 flex items-center justify-between shrink-0">
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
                                        <div className={`${topClockActive ? 'bg-primary border border-blue-400 text-white shadow-[0_0_15px_rgba(19,91,236,0.4)]' : 'bg-white/80 dark:bg-slate-700/80 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100'} rounded-lg px-3 py-1.5 min-w-[80px] text-center`}>
                                            <span className={`text-xl font-bold font-mono ${topClockActive ? 'text-white' : 'text-gray-800 dark:text-gray-100'}`}>
                                                {formatClock(topClockDisplay)}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex-none md:flex-1 flex items-start justify-center px-0 sm:px-2 pt-1 pb-1 sm:pt-2 sm:pb-3 gap-2 sm:gap-3 md:gap-6 min-h-0">
                                    {showEvalBar ? (
                                        <div className={`hidden sm:flex h-[70%] md:h-[80%] w-3 md:w-4 bg-gray-800 rounded-full overflow-hidden flex ${evalBarFlip ? 'flex-col-reverse' : 'flex-col'} border border-gray-700 shrink-0 relative shadow-inner`}>
                                            <div className="bg-white w-full shadow-[0_0_10px_rgba(255,255,255,0.3)]" style={{ height: `${evalSplit.white}%` }}></div>
                                        </div>
                                    ) : null}
                                    <div
                                        ref={boardRef}
                                        className="aspect-square w-[min(100vw,520px)] sm:w-[min(90vw,560px)] md:w-[min(72vh,720px)] max-w-[100vw] md:max-w-[720px] max-h-[100vw] sm:max-h-[90vw] md:max-h-[72vh] relative shadow-2xl rounded-sm overflow-hidden border-4 border-surface-dark shrink-0 select-none touch-pan-y"
                                        style={isMobileLayout && mobileBoardSize ? { width: mobileBoardSize, height: mobileBoardSize } : undefined}
                                        onContextMenu={(event) => {
                                            if (!premove) return;
                                            event.preventDefault();
                                            setPremove(null);
                                            setPremoveNotice('Premove canceled.');
                                        }}
                                    >
                                    <div className="grid grid-cols-8 grid-rows-8 w-full h-full">
                                        {Array.from({ length: 8 }).flatMap((_, displayRow) => (
                                            Array.from({ length: 8 }).map((_, displayCol) => {
                                                const actualRow = isUserWhite ? displayRow : 7 - displayRow;
                                                const actualCol = isUserWhite ? displayCol : 7 - displayCol;
                                                const square = board?.[actualRow]?.[actualCol] || null;
                                                const coord = `${FILES[actualCol]}${8 - actualRow}`;
                                                const isDark = (actualRow + actualCol) % 2 === 1;
                                                const isSelected = showMoveHints && selectedSquare === coord;
                                                const isTarget = showMoveHints && legalTargets.includes(coord);
                                                const isCaptureTarget = isTarget && Boolean(squareMap[coord]);
                                                const isLastMove = lastMoveSquares
                                                    && (lastMoveSquares.from === coord || lastMoveSquares.to === coord);
                                                const isCheckSquare = checkSquare === coord;
                                                const isPremoveSquare = premove
                                                    && (premove.from === coord || premove.to === coord);
                                                const canDrag = Boolean(square)
                                                    && isOwnPiece(square)
                                                    && (canInteract
                                                        || (isUserPlayer
                                                            && !isUserTurn
                                                            && currentStatus === 'active'
                                                            && !isPreviewing));
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
                                                        onClick={() => {
                                                            if (suppressClickRef.current) {
                                                                suppressClickRef.current = false;
                                                                return;
                                                            }
                                                            handleSquareClick(coord);
                                                        }}
                                                    >
                                                        {isLastMove ? (
                                                            <span className="absolute inset-0 bg-yellow-500/40" />
                                                        ) : null}
                                                        {isPremoveSquare ? (
                                                            <span className="absolute inset-0 bg-blue-400/30" />
                                                        ) : null}
                                                        {isCheckSquare ? (
                                                            <span className="absolute inset-0 bg-red-600/40" />
                                                        ) : null}
                                                        {isSelected ? (
                                                            <span className="absolute inset-0 bg-blue-400/25" />
                                                        ) : null}
                                                        {isTarget ? (
                                                            <span
                                                                className={`absolute inset-0 ${
                                                                    isCaptureTarget ? 'bg-emerald-700/45' : 'bg-emerald-600/35'
                                                                }`}
                                                            />
                                                        ) : null}
                                                        {square ? (
                                                            <div
                                                                onPointerDown={(event) => {
                                                                    if (canDrag) {
                                                                        handlePiecePointerDown(event, coord);
                                                                    }
                                                                }}
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
                                    {dragFrom && dragPiece && dragPosition ? (
                                        <div
                                            style={{
                                                position: 'absolute',
                                                left: dragPosition.x - pieceSize / 2,
                                                top: dragPosition.y - pieceSize / 2,
                                                width: pieceSize,
                                                height: pieceSize,
                                                pointerEvents: 'none',
                                                zIndex: 50,
                                            }}
                                        >
                                            <ChessPiece piece={dragPiece} size={pieceSize} pieceSet={pieceSet} />
                                        </div>
                                    ) : null}
                                    </div>
                                </div>

                                <div ref={bottomBarRef} className="px-2 py-2 flex items-center justify-between shrink-0">
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
                                                className={`w-12 h-12 rounded-full border-2 border-primary ring-2 ring-primary/20 ${bottomAvatar ? 'bg-cover bg-center' : 'bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-xs font-bold'}`}
                                                style={bottomAvatar ? { backgroundImage: `url('${bottomAvatar}')` } : undefined}
                                            >
                                                {!bottomAvatar ? bottomInitials : null}
                                            </div>
                                        </div>
                                        <div className="flex flex-col min-w-0">
                                            <div className="flex items-center gap-2">
                                                <p className="font-bold text-base truncate text-slate-900 dark:text-white">{bottomPlayer?.username || 'You'}</p>
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
                                        <div className={`${bottomClockActive ? 'bg-primary border border-blue-400 text-white shadow-[0_0_15px_rgba(19,91,236,0.4)]' : 'bg-white/80 dark:bg-slate-700/80 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100'} rounded-lg px-3 py-2 min-w-[90px] text-center`}>
                                            <span className={`text-2xl font-bold font-mono ${bottomClockActive ? 'text-white' : 'text-gray-800 dark:text-gray-100'}`}>
                                                {formatClock(bottomClockDisplay)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </main>

                            {currentStatus === 'active' ? (
                                <aside
                                    className={`lg:w-72 w-[min(88vw,320px)] lg:static fixed inset-y-0 right-0 z-50 bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-gray-800 rounded-2xl p-3 flex flex-col min-h-0 overflow-y-auto no-scrollbar shadow-2xl lg:shadow-none transform transition-transform duration-300 ease-out ${
                                        rightDrawerOpen ? 'translate-x-0' : 'translate-x-full'
                                    } lg:translate-x-0`}
                                >
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-sm font-semibold">
                                                {effectiveChatRoom === 'players' ? 'Players Chat' : 'Spectators Chat'}
                                            </h3>
                                        </div>
                                        <button
                                            className="flex items-center justify-center p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors text-slate-600 dark:text-slate-300"
                                            type="button"
                                            onClick={() => setShowSettings((prev) => !prev)}
                                        >
                                            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>settings</span>
                                        </button>
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
                                    {canPredict ? (
                                        <div className="mb-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/80 p-3 text-xs">
                                            <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">DigiQuiz Prediction</div>
                                            <div className="text-[11px] text-slate-500 mt-1">
                                                Pick the winner within the first 5 moves.
                                            </div>
                                            {!isAuthenticated ? (
                                                <button
                                                    type="button"
                                                    className="mt-2 px-3 py-2 rounded-lg bg-primary text-white text-xs font-semibold"
                                                    onClick={() => navigate('/login')}
                                                >
                                                    Sign in to predict
                                                </button>
                                            ) : predictionStatus === 'submitted' ? (
                                                <div className="mt-2 text-emerald-500 font-semibold">Prediction submitted.</div>
                                            ) : (
                                                <div className="grid grid-cols-3 gap-2 mt-2">
                                                    <button
                                                        type="button"
                                                        className="px-2 py-2 rounded-lg bg-slate-200 dark:bg-slate-700 text-xs font-semibold"
                                                        onClick={() => handlePrediction('white')}
                                                        disabled={predictionStatus === 'loading'}
                                                    >
                                                        White
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="px-2 py-2 rounded-lg bg-slate-200 dark:bg-slate-700 text-xs font-semibold"
                                                        onClick={() => handlePrediction('draw')}
                                                        disabled={predictionStatus === 'loading'}
                                                    >
                                                        Draw
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="px-2 py-2 rounded-lg bg-slate-200 dark:bg-slate-700 text-xs font-semibold"
                                                        onClick={() => handlePrediction('black')}
                                                        disabled={predictionStatus === 'loading'}
                                                    >
                                                        Black
                                                    </button>
                                                </div>
                                            )}
                                            {predictionError ? (
                                                <div className="mt-2 text-red-500">{predictionError}</div>
                                            ) : null}
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
                                    className={`lg:w-72 w-[min(88vw,320px)] lg:static fixed inset-y-0 right-0 z-50 bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-gray-800 rounded-2xl p-3 flex flex-col min-h-0 overflow-y-auto no-scrollbar shadow-2xl lg:shadow-none transform transition-transform duration-300 ease-out ${
                                        rightDrawerOpen ? 'translate-x-0' : 'translate-x-full'
                                    } lg:translate-x-0`}
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <h3 className="text-sm font-semibold">Challenge Pending</h3>
                                        <button
                                            className="flex items-center justify-center p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors text-slate-600 dark:text-slate-300"
                                            type="button"
                                            onClick={() => setShowSettings((prev) => !prev)}
                                        >
                                            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>settings</span>
                                        </button>
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
                                    className={`lg:w-72 w-[min(88vw,320px)] lg:static fixed inset-y-0 right-0 z-50 bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-gray-800 rounded-2xl p-3 flex flex-col min-h-0 overflow-y-auto no-scrollbar shadow-2xl lg:shadow-none transform transition-transform duration-300 ease-out ${
                                        rightDrawerOpen ? 'translate-x-0' : 'translate-x-full'
                                    } lg:translate-x-0`}
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <h3 className="text-sm font-semibold">Game Summary</h3>
                                        <button
                                            className="flex items-center justify-center p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors text-slate-600 dark:text-slate-300"
                                            type="button"
                                            onClick={() => setShowSettings((prev) => !prev)}
                                        >
                                            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>settings</span>
                                        </button>
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
                                                    <div className="text-xs font-semibold text-slate-500">Powered by DigiChess</div>
                                                    {analysisGraphBars.length ? (
                                                        <div className="relative h-28 rounded-lg border-2 border-amber-400/80 bg-slate-700/60 overflow-hidden">
                                                            <div className="absolute inset-x-0 top-0 h-px bg-amber-400/80" />
                                                            <div className="absolute inset-x-0 bottom-0 h-px bg-amber-400/80" />
                                                            <div className="absolute inset-x-0 top-1/2 h-px bg-slate-400/40" />
                                                            {analysisGraphBars.map((bar, index) => (
                                                                <div
                                                                    key={`eval-bar-${index}`}
                                                                    className={`absolute ${bar.isWhite ? 'bg-slate-100/90' : 'bg-slate-950/90'}`}
                                                                    style={{
                                                                        left: `${bar.left}%`,
                                                                        width: `${bar.width}%`,
                                                                        height: `${bar.height}%`,
                                                                        top: bar.isWhite ? `${50 - bar.height}%` : '50%',
                                                                        minWidth: '1px',
                                                                    }}
                                                                />
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <div className="text-xs text-slate-500">No evaluation data yet.</div>
                                                    )}
                                                    <div className="text-xs font-semibold text-slate-500">Game Phases</div>
                                                    <div className="h-2 w-full rounded-full overflow-hidden bg-slate-200 dark:bg-slate-700 flex">
                                                        <div className="bg-emerald-400" style={{ width: `${phasePercents.opening}%` }} />
                                                        <div className="bg-amber-400" style={{ width: `${phasePercents.middlegame}%` }} />
                                                        <div className="bg-purple-400" style={{ width: `${phasePercents.endgame}%` }} />
                                                    </div>
                                                    <div className="flex justify-between text-[11px] text-slate-500">
                                                        <span>Opening {phaseCounts.opening}</span>
                                                        <span>Middlegame {phaseCounts.middlegame}</span>
                                                        <span>Endgame {phaseCounts.endgame}</span>
                                                    </div>
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
