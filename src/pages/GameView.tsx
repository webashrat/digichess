import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { GameSummary, GameResult } from '../api/types';
import { Chess } from 'chess.js';
import IdentityStrip from '../components/IdentityStrip';
import { fetchAccountDetail } from '../api/users';
import {
  predictResult,
  fetchClock,
  spectateGame,
  fetchGameDetail,
  offerDraw,
  respondDraw,
  resignGame,
  abortGame,
  finishGame,
  rematch,
  rematchAccept,
  rematchReject,
  acceptChallenge,
  rejectChallenge,
  makeMove,
  claimDraw,
  fetchAnalysis,
  fetchPlayerStatus,
  requestFullAnalysis,
  checkAnalysisStatus
} from '../api/games';
import { fetchMe, pingPresence } from '../api/account';
import { makeWsUrl } from '../utils/ws';
import { playCapture, playMove, playTick, isSoundEnabled } from '../utils/sound';
import { ChessBoard } from '../components/ChessBoard';
import { MaterialDiff } from '../components/MaterialDiff';
import { EvaluationGraph } from '../components/EvaluationGraph';
import api from '../api/client';

function formatTime(seconds?: number, showTenths?: boolean): string {
  if (seconds === undefined || seconds === null) return '0:00';
  if (seconds < 0) return '0:00';
  
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  
  // Show tenths when time is low (< 10 seconds)
  if (showTenths && seconds < 10 && seconds >= 0) {
    const tenths = Math.floor((seconds - totalSeconds) * 10);
    if (mins > 0) {
      return `${mins}:${secs.toString().padStart(2, '0')}.${tenths}`;
    }
    return `${secs}.${tenths}`;
  }
  
  if (mins > 0) {
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
  return `${secs}s`;
}

export default function GameView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [game, setGame] = useState<GameSummary | null>(null);
  const [clock, setClock] = useState<{ white_time_left?: number; black_time_left?: number; turn?: string; lastUpdate?: number }>({});
  const clockTimesRef = useRef<{ white: number; black: number; lastUpdate: number; activeColor?: 'white' | 'black' } | null>(null);
  const [prediction, setPrediction] = useState<'white' | 'black' | 'draw' | ''>('');
  const [predMsg, setPredMsg] = useState('');
  const [predErr, setPredErr] = useState('');
  const [actionMsg, setActionMsg] = useState('');
  const [actionErr, setActionErr] = useState('');
  const [me, setMe] = useState<{ id: number; username?: string } | null>(null);
  const userWsRef = useRef<WebSocket | null>(null); // WebSocket for user-specific notifications
  const [moveErr, setMoveErr] = useState('');
  const [analysis, setAnalysis] = useState<any>(null);
  const [fullAnalysis, setFullAnalysis] = useState<any>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const clockIntervalRef = useRef<number | null>(null);
  const clockTickTimeoutRef = useRef<number | null>(null);
  const lastTickSecondRef = useRef<number | null>(null);
  const lastCountdownSecondRef = useRef<number | null>(null);
  const serverTimeOffsetRef = useRef(0);
  const lastFenRef = useRef<string | null>(null);
  const lastFinishReasonRef = useRef<string | null>(null);
  const lastToastGameIdRef = useRef<number | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [boardTheme, setBoardTheme] = useState(() => {
    if (typeof localStorage === 'undefined') return 0;
    const stored = Number(localStorage.getItem('boardTheme'));
    return Number.isFinite(stored) ? stored : 0;
  });
  const [pieceSet, setPieceSet] = useState(() => {
    if (typeof localStorage === 'undefined') return 'cburnett';
    return localStorage.getItem('pieceSet') || 'cburnett';
  });
  const [boardOrientation, setBoardOrientation] = useState<'white' | 'black'>('white');
  const [orientationMode, setOrientationMode] = useState<'auto' | 'manual'>('auto');

  // Keep board settings in sync with global settings (applies to past/existing games too)
  useEffect(() => {
    const applySettings = () => {
      if (typeof localStorage === 'undefined') return;
      const storedTheme = Number(localStorage.getItem('boardTheme'));
      const nextTheme = Number.isFinite(storedTheme) ? storedTheme : 0;
      const nextSet = localStorage.getItem('pieceSet') || 'cburnett';
      setBoardTheme(nextTheme);
      setPieceSet(nextSet);
    };

    applySettings();
    const handleSettingsChange = () => applySettings();
    window.addEventListener('board-settings-change', handleSettingsChange as EventListener);
    window.addEventListener('storage', handleSettingsChange as EventListener);
    return () => {
      window.removeEventListener('board-settings-change', handleSettingsChange as EventListener);
      window.removeEventListener('storage', handleSettingsChange as EventListener);
    };
  }, []);
  const [moveInProgress, setMoveInProgress] = useState(false);
  const [resignConfirm, setResignConfirm] = useState(false);
  const [drawConfirm, setDrawConfirm] = useState(false);
  const [whiteRating, setWhiteRating] = useState<number | null>(null);
  const [blackRating, setBlackRating] = useState<number | null>(null);
  const [initialWhiteRating, setInitialWhiteRating] = useState<number | null>(null);
  const [initialBlackRating, setInitialBlackRating] = useState<number | null>(null);
  const refreshInProgressRef = useRef(false);
  const lastRefreshTimeRef = useRef<number>(0);
  const [playerStatus, setPlayerStatus] = useState<{
    white_in_active_game?: boolean;
    black_in_active_game?: boolean;
    rematch_requested_by?: number | null;
  } | null>(null);
  const [firstMoveCountdown, setFirstMoveCountdown] = useState<{ remaining: number; color: 'white' | 'black' } | null>(null);
  const [chatMessages, setChatMessages] = useState<Array<{ user: string; message: string; timestamp: number }>>([]);
  const [chatInput, setChatInput] = useState('');
  const [gameResultPopup, setGameResultPopup] = useState<{ type: 'win' | 'loss' | 'draw'; reason: string } | null>(null);
  const [currentMoveIndex, setCurrentMoveIndex] = useState<number | null>(null); // For move navigation
  const [rematchNow, setRematchNow] = useState<number>(() => Date.now());
  const previousMoveCountRef = useRef<number>(0);
  const lastMovesRef = useRef<string>('');
  const botFallbackRef = useRef<{ moves: string; timeoutId: number } | null>(null);

  const countPiecesInFen = (fen?: string) => {
    const board = (fen || '').split(' ')[0] || '';
    let count = 0;
    for (const ch of board) {
      if (/[prnbqkPRNBQK]/.test(ch)) count += 1;
    }
    return count;
  };

  const playMoveSound = (san?: string, nextFen?: string) => {
    if (!isSoundEnabled()) return;
    if (san && san.includes('x')) {
      playCapture();
      return;
    }
    if (nextFen && lastFenRef.current) {
      const prevCount = countPiecesInFen(lastFenRef.current);
      const nextCount = countPiecesInFen(nextFen);
      if (nextCount < prevCount) {
        playCapture();
        return;
      }
    }
    playMove();
  };

  // Reset orientation mode when switching games or users
  useEffect(() => {
    if (!game?.id) return;
    setOrientationMode('auto');
    setBoardOrientation('white');
  }, [game?.id, me?.id]);

  // Reset move navigation to last move when new moves are added
  useEffect(() => {
    const currentMoveCount = game?.moves ? game.moves.split(/\s+/).filter(Boolean).length : 0;
    if (currentMoveCount > previousMoveCountRef.current && previousMoveCountRef.current > 0) {
      // New move added - reset to showing last move
      setCurrentMoveIndex(null);
    }
    previousMoveCountRef.current = currentMoveCount;
    if (game?.moves !== undefined) {
      lastMovesRef.current = game.moves;
    }
  }, [game?.moves]);
  const chatMessagesEndRef = useRef<HTMLDivElement>(null);

  const moveCount = useMemo(() => (game?.moves ? game.moves.split(/\s+/).filter(Boolean).length : 0), [game]);
  const movesList = useMemo(() => (game?.moves ? game.moves.split(/\s+/).filter(Boolean) : []), [game?.moves]);
  const isViewingLive = currentMoveIndex === null;
  const movePreview = useMemo(() => {
    const fallbackFen = game?.current_fen || 'start';
    if (!movesList.length) {
      return { fen: fallbackFen, lastUci: undefined, index: null };
    }

    const targetIndex =
      currentMoveIndex === null
        ? movesList.length - 1
        : Math.max(0, Math.min(currentMoveIndex, movesList.length - 1));

    const chess = new Chess();
    let lastUci: string | undefined;
    for (let i = 0; i <= targetIndex; i += 1) {
      const move = chess.move(movesList[i], { strict: false });
      if (!move) break;
      lastUci = `${move.from}${move.to}${move.promotion || ''}`;
    }

    const fen = currentMoveIndex === null ? fallbackFen : chess.fen();
    return { fen, lastUci, index: targetIndex };
  }, [currentMoveIndex, game?.current_fen, movesList]);
  const isPlayer = useMemo(() => {
    if (!me || !game) return false;
    return game.white?.id === me.id || game.black?.id === me.id;
  }, [me, game]);

  const myColor = useMemo(() => {
    if (!me || !game) return null;
    if (game.white?.id === me.id) return 'white';
    if (game.black?.id === me.id) return 'black';
    return null;
  }, [me, game]);

  const isBotOpponent = useMemo(() => {
    if (!game || !me) return false;
    const whiteIsBot = !!game.white?.is_bot;
    const blackIsBot = !!game.black?.is_bot;
    if (game.white?.id === me.id) return blackIsBot;
    if (game.black?.id === me.id) return whiteIsBot;
    return whiteIsBot || blackIsBot;
  }, [game?.white?.id, game?.black?.id, game?.white?.is_bot, game?.black?.is_bot, me?.id]);

  // Calculate rating changes (only show when game is finished and rated)
  const whiteRatingChange = useMemo(() => {
    if (game?.status !== 'finished' || !game?.rated) return undefined;
    if (initialWhiteRating === null || whiteRating === null) return undefined;
    return whiteRating - initialWhiteRating;
  }, [game?.status, game?.rated, initialWhiteRating, whiteRating]);

  const blackRatingChange = useMemo(() => {
    if (game?.status !== 'finished' || !game?.rated) return undefined;
    if (initialBlackRating === null || blackRating === null) return undefined;
    return blackRating - initialBlackRating;
  }, [game?.status, game?.rated, initialBlackRating, blackRating]);

  const isMyTurn = useMemo(() => {
    if (!game || !myColor || game.status !== 'active') return false;
    // Get turn from FEN (more reliable than clock.turn)
    const fenTurn = game.current_fen?.split(' ')[1];
    const turnFromFen = fenTurn === 'w' ? 'white' : 'black';
    // Also check clock.turn as fallback
    const turn = turnFromFen || clock.turn || 'white';
    const turnChar = turn === 'white' ? 'w' : 'b';
    const myColorChar = myColor[0];
    const result = turnChar === myColorChar;
    return result;
  }, [game?.current_fen, game?.status, myColor, clock.turn]);

  // Play low-latency tick sound when my remaining time is <= 10 seconds
  useEffect(() => {
    if (!game || game.status !== 'active') {
      lastTickSecondRef.current = null;
      return;
    }
    if (!isPlayer || !myColor || !isMyTurn) {
      lastTickSecondRef.current = null;
      return;
    }
    if (!clockTimesRef.current || clockTimesRef.current.activeColor !== myColor) {
      return;
    }
    const myTimeLeft = myColor === 'white' ? clock.white_time_left : clock.black_time_left;
    if (myTimeLeft === undefined || myTimeLeft === null) return;
    const secondsLeft = Math.ceil(myTimeLeft);
    if (secondsLeft <= 10 && secondsLeft > 0) {
      if (lastTickSecondRef.current !== secondsLeft) {
        lastTickSecondRef.current = secondsLeft;
        if (isSoundEnabled()) {
          playTick();
        }
      }
    } else {
      lastTickSecondRef.current = null;
    }
  }, [
    game?.status,
    isPlayer,
    isMyTurn,
    myColor,
    clock.white_time_left,
    clock.black_time_left,
    clock.turn
  ]);

  // Update board orientation based on player color
  // Players: auto-orient to their color during active/pending games
  // Spectators: default to white, can flip anytime
  // Finished games: everyone can flip
  useEffect(() => {
    if (!game || !me) return;
    if (orientationMode === 'manual') return;
    
    // Check if user is a player (either white or black)
    const userIsWhite = game.white?.id === me.id;
    const userIsBlack = game.black?.id === me.id;
    const userIsPlayer = userIsWhite || userIsBlack;
    
    // Only auto-set orientation for players during active/pending games
    if (userIsPlayer && (game.status === 'active' || game.status === 'pending')) {
      // Set orientation based on which color the user is playing
      const playerColor = userIsWhite ? 'white' : 'black';
      setBoardOrientation(playerColor);
    }
    // For finished games or spectators, don't auto-set (allow manual control)
  }, [game?.white?.id, game?.black?.id, game?.status, game?.id, me?.id, orientationMode]);

  // Fetch user ratings based on game mode
  useEffect(() => {
    const fetchRatings = async () => {
      if (!game) return;
      
      const mode = game.mode;
      const ratingFieldMap: { [key: string]: string } = {
        'bullet': 'rating_bullet',
        'blitz': 'rating_blitz',
        'rapid': 'rating_rapid',
        'classical': 'rating_classical'
      };
      
      const ratingField = ratingFieldMap[mode] || 'rating_blitz';
      
      // Fetch white player rating
      if (game.white?.username) {
        try {
          const userData = await fetchAccountDetail(game.white.username);
          const rating = userData[ratingField as keyof typeof userData] as number | undefined;
          console.log('White rating fetched:', { username: game.white.username, mode, ratingField, rating, userData });
          const ratingValue = rating !== undefined && rating !== null ? rating : null;
          setWhiteRating(ratingValue);
          // Store initial rating if game is active and we don't have it yet, or if it's a new game
          if (game.status === 'active' && (initialWhiteRating === null || game.id !== Number(id))) {
            setInitialWhiteRating(ratingValue);
          }
        } catch (err) {
          console.error('Failed to fetch white rating:', err);
          setWhiteRating(null);
        }
      } else {
        setWhiteRating(null);
      }
      
      // Fetch black player rating
      if (game.black?.username) {
        try {
          const userData = await fetchAccountDetail(game.black.username);
          const rating = userData[ratingField as keyof typeof userData] as number | undefined;
          console.log('Black rating fetched:', { username: game.black.username, mode, ratingField, rating, userData });
          const ratingValue = rating !== undefined && rating !== null ? rating : null;
          setBlackRating(ratingValue);
          // Store initial rating if game is active and we don't have it yet, or if it's a new game
          if (game.status === 'active' && (initialBlackRating === null || game.id !== Number(id))) {
            setInitialBlackRating(ratingValue);
          }
        } catch (err) {
          console.error('Failed to fetch black rating:', err);
          setBlackRating(null);
        }
      } else {
        setBlackRating(null);
      }
    };
    
    fetchRatings();
    
    // If game just finished, refresh ratings after a short delay to allow backend to update
    if (game?.status === 'finished') {
      const timeout = setTimeout(() => {
        fetchRatings();
      }, 2000); // Wait 2 seconds for rating update to complete
      return () => clearTimeout(timeout);
    }
    
    // Reset initial ratings when starting a new game
    if (game?.status === 'active' && game?.id) {
      // Reset initial ratings if this is a new game (different game ID)
      // This will be set when ratings are fetched above
    }
  }, [game?.id, game?.mode, game?.white?.username, game?.black?.username, game?.status]);

  // Fetch player status for rematch (when game is finished)
  useEffect(() => {
    if (!id || !game || game.status !== 'finished' || !isPlayer) return;
    
    const loadStatus = () => {
      fetchPlayerStatus(id)
        .then((status) => {
          setPlayerStatus(status);
        })
        .catch(() => {});
    };
    
    loadStatus();
    const interval = setInterval(loadStatus, 2000); // Poll every 2 seconds
    return () => clearInterval(interval);
  }, [id, game?.status, isPlayer]);

  // Rematch expiry timer (updates every 5s while finished)
  useEffect(() => {
    if (!game || game.status !== 'finished') return;
    const interval = setInterval(() => setRematchNow(Date.now()), 5000);
    return () => clearInterval(interval);
  }, [game?.status, game?.finished_at]);
  
  // Reset initial ratings when game ID changes (new game)
  useEffect(() => {
    if (id) {
      setInitialWhiteRating(null);
      setInitialBlackRating(null);
    }
  }, [id]);

  useEffect(() => {
    if (game?.current_fen && !lastFenRef.current) {
      lastFenRef.current = game.current_fen;
    }
  }, [game?.current_fen]);

  useEffect(() => {
    return () => {
      if (botFallbackRef.current?.timeoutId) {
        clearTimeout(botFallbackRef.current.timeoutId);
      }
      botFallbackRef.current = null;
    };
  }, []);

  useEffect(() => {
    lastFinishReasonRef.current = null;
    lastToastGameIdRef.current = null;
  }, [game?.id]);

  useEffect(() => {
    if (!game || game.status === 'active') return;
    if (moveErr) {
      setMoveErr('');
    }
  }, [game?.status, moveErr]);

  const getServerNow = useCallback(() => Date.now() + serverTimeOffsetRef.current, []);

  // First-move countdown (white then black)
  useEffect(() => {
    if (!game || !isPlayer || !myColor) {
      setFirstMoveCountdown(null);
      return;
    }

    let deadlineMs: number | null = null;
    let color: 'white' | 'black' | null = null;

    if (moveCount === 0 && myColor === 'white' && game.status === 'active' && game.started_at) {
      deadlineMs = new Date(game.started_at).getTime() + 20000;
      color = 'white';
    } else if (moveCount === 1 && myColor === 'black' && game.status === 'active' && game.started_at) {
      deadlineMs = new Date(game.started_at).getTime() + 20000;
      color = 'black';
    }

    if (!deadlineMs || !color) {
      setFirstMoveCountdown(null);
      return;
    }

    const update = () => {
      const remaining = Math.max(0, Math.ceil((deadlineMs! - getServerNow()) / 1000));
      setFirstMoveCountdown({ remaining, color: color! });
    };

    update();
    const interval = window.setInterval(update, 250);
    return () => clearInterval(interval);
  }, [game?.status, game?.created_at, game?.started_at, moveCount, myColor, isPlayer, getServerNow]);

  useEffect(() => {
    if (!firstMoveCountdown) {
      lastCountdownSecondRef.current = null;
      return;
    }
    if (!isSoundEnabled()) return;
    const seconds = firstMoveCountdown.remaining;
    if (seconds <= 0) return;
    if (lastCountdownSecondRef.current !== seconds) {
      lastCountdownSecondRef.current = seconds;
      playTick();
    }
  }, [firstMoveCountdown]);

  useEffect(() => {
    if (!game || !me || !isPlayer) return;
    if (game.status !== 'finished') return;
    if (lastToastGameIdRef.current === game.id) return;

    const isWhite = game.white?.id === me.id;
    const isBlack = game.black?.id === me.id;
    const result = game.result || '*';
    const reason = (lastFinishReasonRef.current || '').toString();

    let type: 'success' | 'error' | 'info' = 'info';
    let label = 'Game ended';

    if (result === '1/2-1/2') {
      type = 'info';
      label = 'Draw';
    } else if (result === '1-0' && isWhite) {
      type = 'success';
      label = 'You won';
    } else if (result === '0-1' && isBlack) {
      type = 'success';
      label = 'You won';
    } else if (result === '1-0' && isBlack) {
      type = 'error';
      label = 'You lost';
    } else if (result === '0-1' && isWhite) {
      type = 'error';
      label = 'You lost';
    }

    const reasonMap: Record<string, string> = {
      checkmate: 'by checkmate',
      timeout: 'by timeout',
      resign: 'by resignation',
      resignation: 'by resignation',
      stalemate: 'by stalemate',
      draw_accepted: 'by agreement',
      threefold_repetition: 'by repetition',
      fifty_moves: 'by 50-move rule',
      insufficient_material: 'by insufficient material',
      first_move_timeout: 'by first-move timeout'
    };
    const suffix = reasonMap[reason] ? ` ${reasonMap[reason]}` : '';

    window.dispatchEvent(new CustomEvent('show-toast', {
      detail: { message: `${label}${suffix}`, type }
    }));

    lastToastGameIdRef.current = game.id;
  }, [game?.status, game?.id, game?.result, isPlayer, me?.id, game?.white?.id, game?.black?.id]);

  useEffect(() => {
    if (!gameResultPopup) return;
    const timer = window.setTimeout(() => setGameResultPopup(null), 3000);
    return () => window.clearTimeout(timer);
  }, [gameResultPopup]);

  // Clock update - Lichess-style smart scheduling with setTimeout
  useEffect(() => {
    if (game?.status !== 'active' || !clock.turn) {
      if (clockTickTimeoutRef.current) {
        clearTimeout(clockTickTimeoutRef.current);
        clockTickTimeoutRef.current = null;
      }
      // Don't clear clockTimesRef - keep it for when game becomes active again
      // clockTimesRef.current = null;
      return;
    }

    // Don't start the clock until both players have made their first move
    if (moveCount < 2) {
      if (clockTickTimeoutRef.current) {
        clearTimeout(clockTickTimeoutRef.current);
        clockTickTimeoutRef.current = null;
      }
      clockTimesRef.current = null;
      return;
    }

    // Initialize or update clock times from server data
    if (clock.white_time_left !== undefined && clock.black_time_left !== undefined) {
      const now = performance.now();
      
      if (!clockTimesRef.current) {
        // First initialization
        clockTimesRef.current = {
          white: clock.white_time_left * 1000, // Convert to milliseconds
          black: clock.black_time_left * 1000,
          lastUpdate: now,
          activeColor: clock.turn as 'white' | 'black'
        };
      } else {
        // Update with server values (server is source of truth)
        // Sync with server to prevent drift
        clockTimesRef.current.white = clock.white_time_left * 1000;
        clockTimesRef.current.black = clock.black_time_left * 1000;
        clockTimesRef.current.lastUpdate = now;
        clockTimesRef.current.activeColor = clock.turn as 'white' | 'black';
      }
    }

    const showTenths = (millis: number): boolean => {
      return millis < 10000; // Show tenths when < 10 seconds
    };

    const scheduleTick = (time: number, extraDelay: number = 0) => {
      if (clockTickTimeoutRef.current) {
        clearTimeout(clockTickTimeoutRef.current);
      }
      // Lichess-style smart scheduling: schedule next update when display will actually change
      // time % (showTenths ? 100 : 500) ensures we update exactly when the display needs to change
      const interval = showTenths(time) ? 100 : 500;
      const delay = (time % interval) + 1 + extraDelay;
      clockTickTimeoutRef.current = window.setTimeout(tick, delay);
    };

    const tick = () => {
      clockTickTimeoutRef.current = null;
      
      if (!clockTimesRef.current || !clockTimesRef.current.activeColor) return;
      
      const now = performance.now();
      const elapsed = now - clockTimesRef.current.lastUpdate;
      const activeColor = clockTimesRef.current.activeColor;
      
      // Calculate remaining time for active color
      const remaining = Math.max(0, clockTimesRef.current[activeColor] - elapsed);
      
      // Check for timeout - if time reaches 0, refresh game state
      if (remaining <= 0 && game?.status === 'active') {
        // Timeout occurred - refresh game to get final result from server
        fetchGameDetail(id!).then(setGame).catch(() => {});
        return;
      }
      
      // Update display state - preserve existing values if new ones aren't available
      // For active player: use calculated remaining time
      // For inactive player: use stored time from server (doesn't change during opponent's turn)
      setClock(prev => {
        // Always ensure we have valid values - never return undefined
        const whiteTime = activeColor === 'white' 
          ? remaining / 1000 
          : (clockTimesRef.current?.white ?? prev?.white_time_left ?? 0) / 1000;
        const blackTime = activeColor === 'black' 
          ? remaining / 1000 
          : (clockTimesRef.current?.black ?? prev?.black_time_left ?? 0) / 1000;
        
        // Always return valid values - never undefined
        return {
          white_time_left: Math.max(0, whiteTime),
          black_time_left: Math.max(0, blackTime),
          turn: clockTimesRef.current?.activeColor || prev?.turn || clock?.turn || 'white',
          lastUpdate: prev?.lastUpdate || performance.now()
        };
      });
      
      // Schedule next tick intelligently - only when display will change
      if (remaining > 0) {
        scheduleTick(remaining, 0);
      }
    };

    // Start ticking immediately
    if (clockTimesRef.current && clockTimesRef.current.activeColor) {
      const initialTime = clockTimesRef.current[clockTimesRef.current.activeColor];
      scheduleTick(initialTime, 0);
    }

    return () => {
      if (clockTickTimeoutRef.current) {
        clearTimeout(clockTickTimeoutRef.current);
        clockTickTimeoutRef.current = null;
      }
    };
  }, [game?.status, clock.turn, clock.white_time_left, clock.black_time_left, moveCount]);

  // Prevent body scroll when game view is active
  useEffect(() => {
    document.body.classList.add('game-view');
    return () => {
      document.body.classList.remove('game-view');
    };
  }, []);
  
  // Setup presence ping when user is authenticated
  useEffect(() => {
    if (!localStorage.getItem('token')) return;
    
    // Ping immediately
    pingPresence().catch(() => {});
    
    // Ping every 60 seconds to keep user online
    const pingInterval = setInterval(() => {
      pingPresence().catch(() => {});
    }, 60000);
    
    return () => clearInterval(pingInterval);
  }, []);

  useEffect(() => {
    if (!id) return;
    const refreshGame = (silent = false) => {
      // Prevent multiple simultaneous refreshes
      if (refreshInProgressRef.current && silent) {
        return Promise.resolve(null);
      }
      
      // Throttle silent refreshes - don't refresh more than once per 500ms
      const now = Date.now();
      if (silent && (now - lastRefreshTimeRef.current < 500)) {
        return Promise.resolve(null);
      }
      
      refreshInProgressRef.current = true;
      lastRefreshTimeRef.current = now;
      
      return spectateGame(id)
        .then((data) => {
          if (!silent) setLoadErr('');
          setGame(data);
          refreshInProgressRef.current = false;
          return data;
        })
        .catch(() => {
          return fetchGameDetail(id)
            .then((data) => {
              if (!silent) setLoadErr('');
              setGame(data);
              // If game is active and we don't have clock data yet, fetch it immediately
              if (data.status === 'active' && (!clock.white_time_left && !clock.black_time_left)) {
                fetchClock(id)
                  .then((c) => {
                    if (c.white_time_left !== undefined && c.black_time_left !== undefined) {
                      setClock({
                        white_time_left: c.white_time_left,
                        black_time_left: c.black_time_left,
                        turn: c.turn || 'white',
                      });
                    }
                  })
                  .catch(() => {}); // Ignore errors, will retry in updateClock
              }
              refreshInProgressRef.current = false;
              return data;
            })
            .catch((err) => {
              refreshInProgressRef.current = false;
              // Only set error if not silent (initial load)
              if (!silent) {
                setLoadErr(err.response?.data?.detail || 'Unable to load game (login required?)');
              }
              return null;
            });
        });
    };
    // Reset all game-related state when game ID changes
    setGame(null);
    setClock({});
    setMoveErr('');
    setActionErr('');
    setActionMsg('');
    setAnalysis(null);
    setFullAnalysis(null);
    setAnalyzing(false);
    setGameResultPopup(null);
    setCurrentMoveIndex(null);
    setPlayerStatus(null);
    clockTimesRef.current = null;
    previousMoveCountRef.current = 0;
    
    refreshGame();
    
    let clockInterval: number | null = null;
    const updateClock = () => {
      // Only fetch clock for active games
      const currentGame = game; // Capture current game state
      if (currentGame?.status === 'active') {
    fetchClock(id)
          .then((c) => {
            // Only update clock if we get valid data, preserve existing values otherwise
            if (c.white_time_left !== undefined && c.black_time_left !== undefined && 
                c.white_time_left >= 0 && c.black_time_left >= 0) {
              const now = performance.now();
              // Update clockTimesRef with server values (server is source of truth)
              if (!clockTimesRef.current) {
                clockTimesRef.current = {
                  white: c.white_time_left * 1000,
                  black: c.black_time_left * 1000,
                  lastUpdate: now,
                  activeColor: (c.turn || 'white') as 'white' | 'black'
                };
              } else {
                // Sync with server - update both times, server has the correct values
                clockTimesRef.current.white = c.white_time_left * 1000;
                clockTimesRef.current.black = c.black_time_left * 1000;
                clockTimesRef.current.lastUpdate = now;
                clockTimesRef.current.activeColor = (c.turn || clockTimesRef.current.activeColor) as 'white' | 'black';
              }
              setClock({
                white_time_left: c.white_time_left,
                black_time_left: c.black_time_left,
                turn: c.turn || 'white',
                lastUpdate: now
              });
            }
          })
          .catch((err) => {
            // Clock endpoint returns 404 for non-active games or games without clock data
            // This is expected, so we silently ignore 404 errors
            if (err.response?.status !== 404) {
              console.debug('Clock fetch error:', err);
            }
            // If we get 404, stop polling
            if (err.response?.status === 404 && clockInterval) {
              clearInterval(clockInterval);
              clockInterval = null;
            }
          });
      } else if (clockInterval) {
        // Game is not active, stop polling
        clearInterval(clockInterval);
        clockInterval = null;
      }
    };
    
    // Initial clock fetch - wait a bit for game to load
    const initialClockFetch = setTimeout(() => {
      if (game?.status === 'active') {
        updateClock();
      }
    }, 100);
    
    // Update clock every 2 seconds (only for active games, 404s are handled gracefully)
    // This syncs with server, but the display updates more frequently via the tick function
    clockInterval = window.setInterval(updateClock, 2000);

    fetchMe()
      .then((u) => {
        setMe({ id: u.id, username: u.username });
        // Connect to user-specific WebSocket for rematch notifications
        if (u?.id) {
          try {
            const token = localStorage.getItem('token');
            const wsUrl = token
              ? makeWsUrl(`/ws/user/${u.id}/?token=${encodeURIComponent(token)}`)
              : makeWsUrl(`/ws/user/${u.id}/`);
            const userWs = new WebSocket(wsUrl);
            userWsRef.current = userWs;
            userWs.onmessage = (event) => {
              try {
                const data = JSON.parse(event.data);
                const payload = data?.payload || data;
                if (payload.type === 'rematch_accepted') {
                  // Redirect to new game when rematch is accepted
                  const newGameId = payload.game_id || payload.game?.id;
                  if (newGameId) {
                    navigate(`/games/${newGameId}`, { replace: true });
                    setTimeout(() => {
                      window.location.reload();
                    }, 100);
                  }
                }
              } catch (e) {
                console.error('User WebSocket message parse error:', e);
              }
            };
            userWs.onclose = () => {
              userWsRef.current = null;
            };
          } catch (err) {
            console.error('Failed to connect user WebSocket:', err);
          }
        }
      })
      .catch(() => {});

    // WebSocket live updates with automatic reconnection (exponential backoff like Lichess)
    let reconnectAttempts = 0;
    let reconnectTimeout: number | null = null;
    const maxReconnectDelay = 30000; // Max 30 seconds
    const initialReconnectDelay = 1000; // Start with 1 second
    
    const connectWebSocket = () => {
      try {
        // Get token from localStorage for authentication
        const token = localStorage.getItem('token');
        const wsUrl = token 
          ? makeWsUrl(`/ws/game/${id}/?token=${encodeURIComponent(token)}`)
          : makeWsUrl(`/ws/game/${id}/`);
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        
        ws.onopen = () => {
          console.log('[GameView] Game WebSocket connected for game', id);
          reconnectAttempts = 0; // Reset on successful connection
          if (reconnectTimeout) {
            clearTimeout(reconnectTimeout);
            reconnectTimeout = null;
          }
        };
        
        ws.onerror = (error) => {
          console.error('[GameView] Game WebSocket error:', error);
        };
        
        ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Handle gameFull message (initial sync or reconnection) - like Lichess
          if (data.type === 'gameFull' || (data.type === 'sync' && data.game)) {
            console.log('[GameView] Received gameFull sync message');
            const gameData = data.game || data;
            if (gameData) {
              // Full state sync - update everything to prevent disappearing pieces
              setGame((prevGame) => {
                if (!prevGame) return gameData;
                // Merge with existing state to preserve UI state
                return {
                  ...prevGame,
                  ...gameData,
                  // Preserve any UI-specific state
                  legal_moves: gameData.legal_moves || gameData.game_state?.legal_moves?.san || prevGame.legal_moves,
                };
              });
              
              // Sync clock if available
              if (gameData.white_time_left !== undefined || gameData.black_time_left !== undefined) {
                setClock({
                  white_time_left: gameData.white_time_left,
                  black_time_left: gameData.black_time_left,
                  turn: gameData.current_fen?.split(' ')[1] === 'w' ? 'white' : 'black',
                  lastUpdate: performance.now()
                });
                
                // Update clock refs
                clockTimesRef.current = {
                  white: (gameData.white_time_left || 0) * 1000,
                  black: (gameData.black_time_left || 0) * 1000,
                  activeColor: gameData.current_fen?.split(' ')[1] === 'w' ? 'white' : 'black',
                  lastUpdate: performance.now()
                };
              }
            }
            return;
          }
          
          // Handle event messages - can be direct payload or wrapped
          const payload = data?.payload || data;
          const t = payload.type;
          
          // Handle gameState message (like Lichess) - full state update
          if (t === 'gameState' || t === 'move') {
            if (payload.server_time) {
              serverTimeOffsetRef.current = payload.server_time * 1000 - Date.now();
            }
            // Immediately update game state from WebSocket payload for faster UI update
            if (payload.fen && payload.moves) {
              const newTurn = payload.fen?.split(' ')[1] || 'w';
              const turnColor = newTurn === 'w' ? 'white' : 'black';
              
              // Determine if it's user's turn using current game state
              const isUserTurn = (() => {
                if (!me || !game) return false;
                const isWhite = game.white?.id === me.id;
                const isBlack = game.black?.id === me.id;
                return (turnColor === 'white' && isWhite) || (turnColor === 'black' && isBlack);
              })();
              
              // Update game state immediately - include legal moves if provided in payload (like Lichess)
              // Preserve all existing state to prevent flickering/disappearing pieces
              setGame((prevGame) => {
                if (!prevGame) return prevGame;
                if (
                  prevGame.current_fen === payload.fen &&
                  prevGame.moves === payload.moves &&
                  (payload.status ? prevGame.status === payload.status : true) &&
                  (payload.result ? prevGame.result === payload.result : true)
                ) {
                  return prevGame;
                }
                const updated = {
                  ...prevGame,
                  current_fen: payload.fen,
                  moves: payload.moves,
                  status: payload.status || prevGame.status,
                  result: payload.result || prevGame.result,
                  started_at: payload.started_at || prevGame.started_at,
                  created_at: payload.created_at || prevGame.created_at,
                  first_move_deadline: payload.first_move_deadline ?? prevGame.first_move_deadline,
                  first_move_color: payload.first_move_color ?? prevGame.first_move_color,
                  move_count: payload.move_count ?? prevGame.move_count,
                  // Preserve all other game state to prevent UI flicker
                };
                
                // If legal moves are included in WebSocket payload (backend optimization), use them immediately
                if (payload.legal_moves && Array.isArray(payload.legal_moves)) {
                  updated.legal_moves = payload.legal_moves;
                } else if (payload.game_state?.legal_moves?.san && Array.isArray(payload.game_state.legal_moves.san)) {
                  // Use legal moves from game_state if available
                  updated.legal_moves = payload.game_state.legal_moves.san;
                } else if (prevGame.legal_moves) {
                  // Preserve existing legal moves if not in payload
                  updated.legal_moves = prevGame.legal_moves;
                }
                
                return updated;
              });

              if (lastFenRef.current && lastFenRef.current !== payload.fen) {
                playMoveSound(payload.san, payload.fen);
              }
              lastFenRef.current = payload.fen;
              
              // Update clock immediately from payload - preserve existing values if new ones aren't available
              setClock((prevClock) => {
                const newClock = {
                  white_time_left: payload.white_time_left !== undefined 
                    ? payload.white_time_left 
                    : (prevClock?.white_time_left ?? 0),
                  black_time_left: payload.black_time_left !== undefined 
                    ? payload.black_time_left 
                    : (prevClock?.black_time_left ?? 0),
                  turn: turnColor,
                  lastUpdate: performance.now()
                };
                
                // Update clockTimesRef for smooth ticking
                if (clockTimesRef.current) {
                  clockTimesRef.current.white = newClock.white_time_left * 1000;
                  clockTimesRef.current.black = newClock.black_time_left * 1000;
                  clockTimesRef.current.activeColor = turnColor;
                  clockTimesRef.current.lastUpdate = newClock.lastUpdate;
                } else {
                  // Initialize if not exists
                  clockTimesRef.current = {
                    white: newClock.white_time_left * 1000,
                    black: newClock.black_time_left * 1000,
                    activeColor: turnColor,
                    lastUpdate: newClock.lastUpdate
                  };
                }
                
                return newClock;
              });
              
              // If legal moves weren't in payload and it's user's turn, fetch them immediately
              if (isUserTurn && game?.status === 'active' && !payload.legal_moves) {
                // Fetch legal moves immediately for instant interactivity
                fetchAnalysis(id!)
                  .then((res) => {
                    const legalMoves = res.analysis?.legal_moves || res.legal_moves || [];
                    setGame((currentGame) => {
                      if (!currentGame || currentGame.status !== 'active') return currentGame;
                      // Only update if FEN matches (avoid race conditions)
                      if (currentGame.current_fen === payload.fen) {
                        return {
                          ...currentGame,
                          legal_moves: legalMoves,
                        };
                      }
                      return currentGame;
                    });
                  })
                  .catch((err) => {
                    console.error('[GameView] Failed to fetch legal moves:', err);
                  });
              }
            }
            
            // Update clock without triggering browser indicators
            updateClock();
          } else if (t === 'draw_response') {
            // Handle draw response - refresh game to get updated draw_offer_by state
            fetchGameDetail(id!)
              .then((updatedGame) => {
                setGame(updatedGame);
                const decision = payload.decision;
                if (decision === 'decline') {
                  setActionMsg('Draw offer declined');
                } else if (decision === 'accept') {
                  // Draw accepted - game will finish, handled by game_finished event
                }
              })
              .catch(() => {});
            updateClock();
          } else if (['draw_offer', 'resign', 'claim_draw', 'rematch_offer'].includes(t)) {
            refreshGame(true); // Silent refresh for background updates
            updateClock();
          } else if (t === 'game_finished') {
            // Handle game finished event
            // Refresh game immediately to get updated status
            fetchGameDetail(id!)
              .then((updatedGame) => {
                setGame(updatedGame);
                // Show win/loss popup for all finish types (checkmate, timeout, resignation, draw)
                if (me && updatedGame && isPlayer) {
                  const isWhite = updatedGame.white?.id === me.id;
                  const isBlack = updatedGame.black?.id === me.id;
                  const result = payload.result || updatedGame.result;
                  const reason = payload.reason || 'unknown';
                  lastFinishReasonRef.current = reason?.toString?.() ?? String(reason);
                  
                  // Show popup for draws
                  if (result === '1/2-1/2') {
                    setGameResultPopup({ type: 'draw', reason });
                  } else {
                    // Determine if user won or lost
                    if (result === '1-0' && isWhite) {
                      // User (white) won
                      setGameResultPopup({ type: 'win', reason });
                    } else if (result === '0-1' && isBlack) {
                      // User (black) won
                      setGameResultPopup({ type: 'win', reason });
                    } else if (result === '1-0' && isBlack) {
                      // User (black) lost
                      setGameResultPopup({ type: 'loss', reason });
                    } else if (result === '0-1' && isWhite) {
                      // User (white) lost
                      setGameResultPopup({ type: 'loss', reason });
                    }
                  }
                }

                // Toast feedback (win/lose/draw with reason)
                if (me && updatedGame && isPlayer) {
                  const isWhite = updatedGame.white?.id === me.id;
                  const isBlack = updatedGame.black?.id === me.id;
                  const result = payload.result || updatedGame.result;
                  const reason = (payload.reason || 'unknown').toString();

                  let type: 'success' | 'error' | 'info' = 'info';
                  let label = 'Game ended';

                  if (result === '1/2-1/2') {
                    type = 'info';
                    label = 'Draw';
                  } else if (result === '1-0' && isWhite) {
                    type = 'success';
                    label = 'You won';
                  } else if (result === '0-1' && isBlack) {
                    type = 'success';
                    label = 'You won';
                  } else if (result === '1-0' && isBlack) {
                    type = 'error';
                    label = 'You lost';
                  } else if (result === '0-1' && isWhite) {
                    type = 'error';
                    label = 'You lost';
                  }

                  const reasonMap: Record<string, string> = {
                    checkmate: 'by checkmate',
                    timeout: 'by timeout',
                    resign: 'by resignation',
                    stalemate: 'by stalemate',
                    threefold_repetition: 'by repetition',
                    fifty_moves: 'by 50-move rule',
                    insufficient_material: 'by insufficient material',
                    first_move_timeout: 'by first-move timeout'
                  };
                  const suffix = reasonMap[reason] ? ` ${reasonMap[reason]}` : '';

                  window.dispatchEvent(new CustomEvent('show-toast', {
                    detail: { message: `${label}${suffix}`, type }
                  }));
                }
              })
              .catch(() => {});
            
            updateClock();
            
            // Refresh ratings after game finishes (for rated games, wait a bit for backend to update)
            if (game?.rated) {
              // Store initial ratings if we don't have them yet (game just finished)
              if (initialWhiteRating === null && whiteRating !== null) {
                setInitialWhiteRating(whiteRating);
              }
              if (initialBlackRating === null && blackRating !== null) {
                setInitialBlackRating(blackRating);
              }
              
              setTimeout(() => {
                // Re-fetch ratings
                const mode = game.mode;
                const ratingFieldMap: { [key: string]: string } = {
                  'bullet': 'rating_bullet',
                  'blitz': 'rating_blitz',
                  'rapid': 'rating_rapid',
                  'classical': 'rating_classical'
                };
                const ratingField = ratingFieldMap[mode] || 'rating_blitz';
                
                if (game.white?.username) {
                  fetchAccountDetail(game.white.username)
                    .then((userData) => {
                      const rating = userData[ratingField as keyof typeof userData] as number | undefined;
                      const newRating = rating !== undefined && rating !== null ? rating : null;
                      setWhiteRating(newRating);
                      // Update initial rating if we still don't have it (fallback)
                      if (initialWhiteRating === null && newRating !== null) {
                        setInitialWhiteRating(newRating);
                      }
                    })
                    .catch(() => {});
                }
                if (game.black?.username) {
                  fetchAccountDetail(game.black.username)
                    .then((userData) => {
                      const rating = userData[ratingField as keyof typeof userData] as number | undefined;
                      const newRating = rating !== undefined && rating !== null ? rating : null;
                      setBlackRating(newRating);
                      // Update initial rating if we still don't have it (fallback)
                      if (initialBlackRating === null && newRating !== null) {
                        setInitialBlackRating(newRating);
                      }
                    })
                    .catch(() => {});
                }
              }, 3000); // Wait 3 seconds for rating update to complete
            }
          } else if (t === 'clock') {
            // Handle clock update directly from WebSocket (like Lichess)
            if (payload.white_time_left !== undefined && payload.black_time_left !== undefined) {
              const now = performance.now();
              const turn = payload.turn || clock.turn || 'white';
              if (!clockTimesRef.current) {
                clockTimesRef.current = {
                  white: payload.white_time_left * 1000,
                  black: payload.black_time_left * 1000,
                  lastUpdate: now,
                  activeColor: turn as 'white' | 'black'
                };
              } else {
                // Sync with server clock data - server is source of truth
                clockTimesRef.current.white = payload.white_time_left * 1000;
                clockTimesRef.current.black = payload.black_time_left * 1000;
                clockTimesRef.current.activeColor = turn as 'white' | 'black';
                clockTimesRef.current.lastUpdate = now;
              }
              setClock({
                white_time_left: payload.white_time_left,
                black_time_left: payload.black_time_left,
                turn: turn
              });
            }
          } else if (t === 'chat') {
            // Handle chat messages
            console.log('[GameView] Received chat message:', payload);
            if (payload.user && payload.message) {
              setChatMessages(prev => {
                // Avoid duplicates by checking last message
                const lastMsg = prev[prev.length - 1];
                if (lastMsg && lastMsg.user === payload.user && lastMsg.message === payload.message) {
                  return prev;
                }
                return [...prev, {
                  user: payload.user,
                  message: payload.message,
                  timestamp: Date.now()
                }];
              });
              // Scroll to bottom when new message arrives
              setTimeout(() => {
                if (chatMessagesEndRef.current) {
                  chatMessagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
                }
              }, 100);
            }
          } else if (t === 'rematch_accepted') {
            // Handle rematch accepted - redirect both users to new game
            const newGameId = payload.game_id || payload.game?.id;
            if (newGameId && newGameId !== id) {
              // Navigate to new game and reload to ensure clean state
              navigate(`/games/${newGameId}`, { replace: true });
              setTimeout(() => {
                window.location.reload();
              }, 100);
            }
          }
        } catch (e) {
          // ignore parse errors
          console.error('WebSocket message parse error:', e);
        }
      };
        
        ws.onclose = (event) => {
          console.log('[GameView] Game WebSocket closed', event.code, event.reason);
          wsRef.current = null;
          
          // Only reconnect if it wasn't a clean close or intentional disconnect
          if (event.code !== 1000 && event.code !== 1001) {
            // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (max)
            const delay = Math.min(
              initialReconnectDelay * Math.pow(2, reconnectAttempts),
              maxReconnectDelay
            );
            reconnectAttempts++;
            
            console.log(`[GameView] Reconnecting WebSocket in ${delay}ms (attempt ${reconnectAttempts})`);
            reconnectTimeout = window.setTimeout(() => {
              connectWebSocket();
            }, delay);
          }
        };
      } catch (err) {
        console.error('[GameView] Failed to create WebSocket:', err);
        // Retry after delay
        const delay = Math.min(
          initialReconnectDelay * Math.pow(2, reconnectAttempts),
          maxReconnectDelay
        );
        reconnectAttempts++;
        reconnectTimeout = window.setTimeout(() => {
          connectWebSocket();
        }, delay);
      }
    };
    
    // Initial connection
    connectWebSocket();
    
    // Cleanup function
    return () => {
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounting'); // Clean close
      }
    };

    return () => {
      wsRef.current?.close();
      userWsRef.current?.close();
      if (clockInterval) {
        clearInterval(clockInterval);
      }
      clearTimeout(initialClockFetch);
    };
  }, [id]);

  useEffect(() => {
    if (!id || !game) return;
    // Spectators can view live analysis; players only after game not active.
    const isPlayerFlag = isPlayer;
    const allow = !isPlayerFlag || (game.status !== 'active' && game.status !== 'pending');
    if (!allow) return;
    fetchAnalysis(id)
      .then((res) => setAnalysis(res.analysis || res))
      .catch(() => {});
  }, [id, game, isPlayer]);

  // Note: Win/loss popup is triggered by WebSocket game_finished event with reason='timeout'
  // This ensures it only shows for time finishes, not resignations or other finishes

  const submitPrediction = () => {
    if (!id || !prediction) return;
    setPredErr('');
    setPredMsg('');
    predictResult(id, prediction)
      .then((res) => {
        setPredMsg(res?.message || 'Prediction submitted');
        setPrediction('');
      })
      .catch((err) => setPredErr(err.response?.data?.detail || 'Prediction failed'));
  };

  const handleSendChat = (message: string) => {
    if (!me || !message.trim() || !wsRef.current) {
      console.log('Cannot send chat:', { me: !!me, message: message.trim(), ws: !!wsRef.current });
      return;
    }
    
    // Check WebSocket state
    if (wsRef.current.readyState !== WebSocket.OPEN) {
      console.error('WebSocket is not open. State:', wsRef.current.readyState);
      return;
    }
    
    // Send chat message via WebSocket
    try {
      const chatData = {
        type: 'chat',
        message: message.trim()
      };
      console.log('Sending chat message:', chatData);
      wsRef.current.send(JSON.stringify(chatData));
    } catch (error) {
      console.error('Failed to send chat message:', error);
    }
  };

  // Auto-scroll chat to bottom when new messages arrive
  useEffect(() => {
    chatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const canPredict = moveCount <= 10 && game?.status === 'active' && !isPlayer;

  const doAction = (fn: () => Promise<any>, successMsg: string, redirect?: boolean) => {
    setActionErr('');
    setActionMsg('');
    fn()
      .then((res) => {
        setActionMsg(successMsg);
        window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: successMsg, type: 'success' } }));
        if (res?.data) setGame(res.data);
        else if (res?.result) setGame(res);
        if (redirect && id) {
          // Refresh the page to show updated game state
          setTimeout(() => {
            window.location.reload();
          }, 500);
        }
      })
      .catch((err) => {
        const msg = err.response?.data?.detail || 'Action failed';
        setActionErr(msg);
        window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: msg, type: 'error' } }));
      });
  };

  const handleAcceptChallenge = () => {
    if (!id) return;
    acceptChallenge(id)
      .then((data) => {
        console.log('[GameView] Challenge accepted, game data:', data);
        // Update game state immediately
        if (data) {
          setGame(data);
        }
        // Refresh game data to ensure we have the latest status
        setTimeout(() => {
          fetchGameDetail(id!)
            .then((updatedGame) => {
              console.log('[GameView] Refreshed game after accept:', updatedGame);
              setGame(updatedGame);
              // If game is now active, fetch clock
              if (updatedGame.status === 'active') {
                fetchClock(id!)
                  .then((c) => {
                    if (c.white_time_left !== undefined && c.black_time_left !== undefined) {
                      setClock({
                        white_time_left: c.white_time_left,
                        black_time_left: c.black_time_left,
                        turn: c.turn || 'white',
                      });
                    }
                  })
                  .catch(() => {});
              }
            })
            .catch(() => {});
        }, 200);
      })
      .catch((err) => {
        const errorMsg = err.response?.data?.detail || err.message || 'Failed to accept challenge';
        setMoveErr(errorMsg);
        console.error('[GameView] Accept challenge error:', errorMsg);
      });
  };

  const submitMoveUci = useCallback((uci: string) => {
    if (!id || !uci || moveInProgress) return;
    
    // Triple-check it's the player's turn before submitting
    if (!isPlayer || game?.status !== 'active' || !isMyTurn) {
      setMoveErr('Not your turn');
      return;
    }
    
    // Verify turn from FEN string as final check
    if (game?.current_fen) {
      const fenParts = game.current_fen.split(' ');
      const turnFromFen = fenParts[1]; // 'w' or 'b'
      const expectedTurn = myColor === 'white' ? 'w' : 'b';
      if (turnFromFen !== expectedTurn) {
        setMoveErr('Not your turn (board state mismatch)');
        console.warn('Turn mismatch:', { turnFromFen, expectedTurn, myColor, uci });
        return;
      }
    }
    
    setMoveInProgress(true);
    setMoveErr('');
    
    // Step 1: Local optimistic move for instant UI feedback
    let optimisticSan: string | null = null;
    try {
      const from = uci.slice(0, 2);
      const to = uci.slice(2, 4);
      const promotion = uci.length > 4 ? uci[4].toLowerCase() : undefined;
      const chess = new Chess(game?.current_fen || 'start');
      const move = chess.move({ from: from as any, to: to as any, promotion: promotion as any }, { strict: false });
      if (!move) {
        setMoveInProgress(false);
        setMoveErr('Invalid move');
        return;
      }

      optimisticSan = move.san;
      const nextFen = chess.fen();
      const nextMoves = game?.moves ? `${game.moves} ${move.san}` : move.san;
      const nextLegalMoves = chess.moves();

      setGame((prevGame) => {
        if (!prevGame) return prevGame;
        return {
          ...prevGame,
          current_fen: nextFen,
          moves: nextMoves,
          legal_moves: nextLegalMoves
        };
      });
      playMoveSound(move.san, nextFen);
      lastFenRef.current = nextFen;
    } catch (err) {
      setMoveInProgress(false);
      setMoveErr('Invalid move');
      return;
    }

    // Step 2: Confirm with server
    makeMove(id, optimisticSan!)
      .then((res) => {
        // Server confirmed move - update with server response
        setGame(res);
        setMoveInProgress(false);
        // Only fetch clock if game is still active
        if (res.status === 'active') {
          fetchClock(id).then(setClock).catch(() => {});
        }
        // If playing a bot, poll once for bot response only if WS didn't update
        if (res.status === 'active' && isBotOpponent) {
          const scheduledMoves = res.moves || '';
          if (botFallbackRef.current?.timeoutId) {
            clearTimeout(botFallbackRef.current.timeoutId);
          }
          const timeoutId = window.setTimeout(() => {
            if (lastMovesRef.current === scheduledMoves) {
              fetchGameDetail(id)
                .then((updated) => {
                  setGame(updated);
                  if (updated.status === 'active') {
                    fetchClock(id).then(setClock).catch(() => {});
                  }
                })
                .catch(() => {});
            }
            botFallbackRef.current = null;
          }, 500);
          botFallbackRef.current = { moves: scheduledMoves, timeoutId };
        }
      })
      .catch((err) => {
        setMoveInProgress(false);
        const errorMsg = err.response?.data?.detail || err.message || 'Move failed';
        setMoveErr(errorMsg);
        console.error('Move error:', errorMsg);
        // If move fails, refresh game state to sync
        if (id) {
          fetchGameDetail(id).then(setGame).catch(() => {});
        }
      });
  }, [id, moveInProgress, isPlayer, game?.status, isMyTurn, game?.current_fen, myColor, isBotOpponent]);

  const handleBoardMove = useCallback((uci: string) => submitMoveUci(uci), [submitMoveUci]);

  if (loadErr && !game) {
  return (
      <div className="layout">
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ color: 'var(--danger)', fontSize: 18, marginBottom: 12 }}>{loadErr}</div>
          <button className="btn btn-info" onClick={() => navigate('/games')} style={{ fontSize: 14, padding: '10px 20px' }}>← Back to Games</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      height: '100vh', 
      width: '100vw',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      background: 'radial-gradient(120% 140% at 20% 10%, #101b34 0%, #0a0f1c 45%, #05070f 100%)',
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0
    }}
    className="game-shell">
      <div style={{ 
        maxWidth: 1900,
        width: '100%',
        margin: '0 auto',
        padding: '12px',
        height: '100%',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box'
      }}>
        {/* Header removed to maximize board height */}
        {/* Main game area - Lichess style layout: Left sidebar | Board | Right sidebar */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'minmax(240px, 18vw) minmax(0, 1fr) minmax(280px, 20vw)',
          gap: 16,
          flex: '1 1 0',
          overflow: 'hidden',
          minHeight: 0
        }}>
        
        {/* Left Sidebar: Game Info + Chat */}
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          gap: 14,
          minHeight: 0,
          overflow: 'hidden',
          height: '100%'
        }}>
          {/* Game Info */}
          <div className="card" style={{ flex: '0 0 auto', padding: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <button
                className="btn btn-ghost"
                onClick={() => navigate('/')}
                style={{
                  padding: '6px 10px',
                  fontSize: 12,
                  fontWeight: 700,
                  borderRadius: 999,
                  border: '1px solid rgba(148, 163, 184, 0.2)',
                  background: 'rgba(15, 23, 42, 0.6)'
                }}
              >
                ← Back
              </button>
              {game && (
                <span style={{
                  padding: '4px 8px',
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 600,
                  background: game.status === 'active'
                    ? 'rgba(76, 175, 80, 0.15)'
                    : 'rgba(148, 163, 184, 0.12)',
                  border: game.status === 'active'
                    ? '1px solid rgba(76, 175, 80, 0.4)'
                    : '1px solid rgba(148, 163, 184, 0.25)',
                  color: game.status === 'active' ? '#4caf50' : 'var(--muted)',
                  textTransform: 'capitalize'
                }}>
                  {game.status}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16 }}>⚡</span>
              <div style={{ flex: 1, fontSize: 13, lineHeight: 1.4 }}>
                {game ? (
                  <>
                    <div style={{ fontWeight: 700 }}>{game.time_control}</div>
                    <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                      {game.rated ? 'Rated' : 'Casual'} • {game.time_control.toUpperCase()}
                    </div>
                    {game.status === 'active' && <div style={{ color: 'var(--muted)', fontSize: 11 }}>live now</div>}
                    {game.status === 'finished' && game.result && (() => {
                      let resultText = '';
                      let resultColor = 'var(--muted)';
                      
                      if (game.result === '1-0') {
                        resultText = 'White Won';
                        resultColor = '#2ce6c2';
                      } else if (game.result === '0-1') {
                        resultText = 'Black Won';
                        resultColor = '#2ce6c2';
                      } else if (game.result === '1/2-1/2') {
                        resultText = 'Draw';
                        resultColor = '#ff9800';
                      }
                      
                      return resultText ? (
                        <div style={{ color: resultColor, fontSize: 13, fontWeight: 700, marginTop: 6 }}>
                          {resultText}
                        </div>
                      ) : null;
                    })()}
                  </>
                ) : (
                  <div style={{ color: 'var(--muted)', fontSize: 12 }}>Loading…</div>
                )}
              </div>
            </div>
            {/* Draw offer status removed - now shown in action buttons section */}
          </div>

          {/* Chat Section */}
          <div className="card" style={{ flex: '1 1 auto', padding: '12px', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h4 style={{ marginTop: 0, marginBottom: 0, fontSize: 13, fontWeight: 700 }}>Chat room</h4>
              {me && <span style={{ fontSize: 11, color: 'var(--accent)' }}>●</span>}
            </div>
            <div 
              style={{ 
                flex: '1 1 auto', 
                overflowY: 'auto', 
                minHeight: 0, 
                marginBottom: 10, 
                fontSize: 12, 
                color: 'var(--text)',
                display: 'flex',
                flexDirection: 'column',
                gap: 6
              }}
            >
              {!me ? (
                <div style={{ padding: '4px 0', color: 'var(--muted)' }}>Sign in to chat</div>
              ) : chatMessages.length === 0 ? (
                <div style={{ padding: '4px 0', color: 'var(--muted)', fontSize: 11 }}>No messages yet</div>
              ) : (
                <>
                  {chatMessages.map((msg, idx) => (
                    <div key={idx} style={{ padding: '2px 0', lineHeight: 1.4 }}>
                      <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{msg.user}:</span>{' '}
                      <span>{msg.message}</span>
                    </div>
                  ))}
                  <div ref={chatMessagesEndRef} />
                </>
              )}
            </div>
            {me && (
              <>
                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && chatInput.trim()) {
                        handleSendChat(chatInput.trim());
                        setChatInput('');
                      }
                    }}
                    placeholder="Type a message..."
                    style={{
                      flex: 1,
                      padding: '8px 10px',
                      fontSize: 12,
                      background: '#0b1220',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      color: 'var(--text)'
                    }}
                    maxLength={140}
                  />
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      if (chatInput.trim()) {
                        handleSendChat(chatInput.trim());
                        setChatInput('');
                      }
                    }}
                    style={{ padding: '8px 12px', fontSize: 12 }}
                    disabled={!chatInput.trim()}
                  >
                    Send
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {['HI', 'GL', 'HF', 'U2'].map((preset) => (
                    <button
                      key={preset}
                      className="btn btn-ghost"
                      style={{ padding: '6px 10px', fontSize: 11 }}
                      onClick={() => handleSendChat(preset)}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Center: Board and players - Maximize board space */}
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          gap: 8,
          minHeight: 0,
          overflow: 'hidden',
          height: '100%',
          flex: '1 1 auto'
        }}>
          {/* Player info bars - Fixed height, arranged based on board orientation */}
          {game && (
            <>
              {/* Top player info bar - shows the color that's on top of the board */}
              {boardOrientation === 'white' ? (
                // White orientation: black pieces on top, so black player info at top
                <div
                  className="card"
                  style={{
                    padding: '6px 8px',
                    background: clock.turn === 'black' && game.status === 'active' 
                      ? 'rgba(44, 230, 194, 0.1)' 
                      : undefined,
                    border: clock.turn === 'black' && game.status === 'active' 
                      ? '2px solid var(--accent)' 
                      : undefined,
                    flex: '0 0 auto',
                    height: '44px',
                    display: 'flex',
                    alignItems: 'center',
                    position: 'relative'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', zIndex: 1 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <IdentityStrip 
                        user={game.black} 
                        mode={game.mode} 
                        rating={blackRating ?? undefined}
                        ratingChange={blackRatingChange}
                        isActive={game.status === 'active'}
                        isMyTurn={clock.turn === 'black' && game.status === 'active' && myColor === 'black'}
                      />
                    </div>
                    <div
                      style={{
                        fontSize: 22,
                        fontWeight: 700,
                        color: clock.turn === 'black' && game.status === 'active' ? 'var(--accent)' : 'var(--text)',
                        minWidth: 75,
                        textAlign: 'right',
                        flexShrink: 0,
                        fontFamily: 'monospace',
                        letterSpacing: '0.5px',
                      }}
                    >
                      {formatTime(clock?.black_time_left ?? 0, (clock?.black_time_left ?? 0) < 10)}
                    </div>
                  </div>
                  <div style={{ position: 'absolute', bottom: 2, left: '50%', transform: 'translateX(-50%)', zIndex: 0 }}>
                    <MaterialDiff fen={game.current_fen} color="black" position="top" />
                  </div>
                </div>
              ) : (
                // Black orientation: white pieces on top, so white player info at top
                <div
                  className="card"
                  style={{
                    padding: '6px 8px',
                    background: clock.turn === 'white' && game.status === 'active' 
                      ? 'rgba(44, 230, 194, 0.1)' 
                      : undefined,
                    border: clock.turn === 'white' && game.status === 'active' 
                      ? '2px solid var(--accent)' 
                      : undefined,
                    flex: '0 0 auto',
                    height: '44px',
                    display: 'flex',
                    alignItems: 'center',
                    position: 'relative'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', zIndex: 1 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <IdentityStrip 
                        user={game.white} 
                        mode={game.mode} 
                        rating={whiteRating ?? undefined}
                        ratingChange={whiteRatingChange}
                        isActive={game.status === 'active'}
                        isMyTurn={clock.turn === 'white' && game.status === 'active' && myColor === 'white'}
                      />
                    </div>
                    <div
                      style={{
                        fontSize: 22,
                        fontWeight: 700,
                        color: clock.turn === 'white' && game.status === 'active' ? 'var(--accent)' : 'var(--text)',
                        minWidth: 75,
                        textAlign: 'right',
                        flexShrink: 0,
                        fontFamily: 'monospace',
                        letterSpacing: '0.5px',
                      }}
                    >
                      {formatTime(clock?.white_time_left ?? 0, (clock?.white_time_left ?? 0) < 10)}
                    </div>
                  </div>
                  <div style={{ position: 'absolute', bottom: 2, left: '50%', transform: 'translateX(-50%)', zIndex: 0 }}>
                    <MaterialDiff fen={game.current_fen} color="white" position="top" />
                  </div>
                </div>
              )}

              {/* Board - Takes maximum remaining space */}
              <div style={{ 
                padding: 0,
                display: 'flex', 
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                flex: '1 1 auto',
                minHeight: 0,
                minWidth: 0,
                overflow: 'visible',
                position: 'relative',
                background: 'linear-gradient(135deg, rgba(20, 28, 46, 0.9) 0%, rgba(26, 34, 54, 0.95) 50%, rgba(20, 28, 46, 0.9) 100%)',
                borderRadius: 16,
                border: '1px solid rgba(148, 163, 184, 0.18)',
                boxShadow: '0 20px 45px rgba(0, 0, 0, 0.4), inset 0 1px 12px rgba(0, 0, 0, 0.35)'
              }}>
                {game.status === 'pending' && (
                  <div style={{ position: 'absolute', zIndex: 10, background: 'rgba(0,0,0,0.8)', padding: 20, borderRadius: 12 }}>
                    <div style={{ color: 'var(--muted)', marginBottom: 12, textAlign: 'center' }}>
                      Waiting for opponent to accept the challenge…
                    </div>
                    {isPlayer && game.white?.id === me?.id && (
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                        <button className="btn btn-danger" type="button" onClick={() => doAction(() => rejectChallenge(id!), 'Challenge cancelled')}>
                          Cancel
                        </button>
                      </div>
                    )}
            </div>
          )}
          <ChessBoard
            key={`board-${game?.id}`}
            fen={movePreview.fen}
            lastMove={movePreview.lastUci}
            onMove={
              isViewingLive && isPlayer && game?.status === 'active' && isMyTurn && !moveInProgress && game?.legal_moves && game.legal_moves.length > 0
                ? handleBoardMove
                : undefined
            }
                  legalMoves={isViewingLive ? game?.legal_moves : []}
                  orientation={boardOrientation}
                  theme={boardTheme}
                  onThemeChange={setBoardTheme}
                  pieceSet={pieceSet}
                  onPieceSetChange={setPieceSet}
                  showControls={false}
                />
                {moveErr && game?.status === 'active' && (
                  <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 6, textAlign: 'center', position: 'absolute', bottom: 8, left: 0, right: 0 }}>
                    {moveErr}
        </div>
                )}
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={() => {
                    setOrientationMode('manual');
                    setBoardOrientation(prev => (prev === 'white' ? 'black' : 'white'));
                  }}
                  title="Flip board"
                  aria-label="Flip board"
                  style={{
                    position: 'absolute',
                    top: 10,
                    right: 10,
                    width: 34,
                    height: 34,
                    borderRadius: '50%',
                    display: 'grid',
                    placeItems: 'center',
                    padding: 0,
                    fontSize: 15,
                    background: 'rgba(8, 12, 24, 0.75)',
                    border: '1px solid rgba(148, 163, 184, 0.35)',
                    color: 'var(--text)',
                    zIndex: 12
                  }}
                >
                  ↻
                </button>
                {firstMoveCountdown && (
                  <div
                    style={{
                      position: 'absolute',
                      left: '50%',
                      top: '50%',
                      transform: 'translate(-50%, -50%)',
                      minWidth: 240,
                      maxWidth: 360,
                      padding: '10px 14px',
                      borderRadius: 12,
                      textAlign: 'center',
                      fontSize: 12,
                      fontWeight: 600,
                      color: 'rgba(10, 18, 12, 0.9)',
                      letterSpacing: '0.1px',
                      background: firstMoveCountdown.remaining <= 10
                        ? 'linear-gradient(90deg, rgba(255, 210, 210, 0.45), rgba(255, 120, 120, 0.65))'
                        : 'linear-gradient(90deg, rgba(175, 245, 205, 0.45), rgba(110, 205, 150, 0.65))',
                      border: firstMoveCountdown.remaining <= 10
                        ? '1px solid rgba(255, 140, 140, 0.35)'
                        : '1px solid rgba(140, 255, 200, 0.35)',
                      boxShadow: '0 10px 20px rgba(0,0,0,0.25)',
                      zIndex: 15
                    }}
                  >
                    {firstMoveCountdown.remaining}s to play the first move
                  </div>
                )}
                
              </div>

              {/* Bottom player info bar - shows the color that's on bottom of the board */}
              {boardOrientation === 'white' ? (
                // White orientation: white pieces on bottom, so white player info at bottom
                <div
                  className="card"
                  style={{
                    padding: '8px 10px',
                    background: clock.turn === 'white' && game.status === 'active' 
                      ? 'rgba(44, 230, 194, 0.1)' 
                      : undefined,
                    border: clock.turn === 'white' && game.status === 'active' 
                      ? '2px solid var(--accent)' 
                      : undefined,
                    flex: '0 0 auto',
                    height: '52px',
                    display: 'flex',
                    alignItems: 'center',
                    position: 'relative'
                  }}
                >
                  <div style={{ position: 'absolute', top: 2, left: '50%', transform: 'translateX(-50%)', zIndex: 0 }}>
                    <MaterialDiff fen={game.current_fen} color="white" position="bottom" />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', zIndex: 1 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <IdentityStrip 
                        user={game.white} 
                        mode={game.mode} 
                        rating={whiteRating ?? undefined}
                        ratingChange={whiteRatingChange}
                        isActive={game.status === 'active'}
                        isMyTurn={clock.turn === 'white' && game.status === 'active' && myColor === 'white'}
                      />
                    </div>
                    <div
                      style={{
                        fontSize: 22,
                        fontWeight: 700,
                        color: clock.turn === 'white' && game.status === 'active' ? 'var(--accent)' : 'var(--text)',
                        minWidth: 75,
                        textAlign: 'right',
                        flexShrink: 0,
                        fontFamily: 'monospace',
                        letterSpacing: '0.5px',
                      }}
                    >
                      {formatTime(clock?.white_time_left ?? 0, (clock?.white_time_left ?? 0) < 10)}
                    </div>
                  </div>
                </div>
              ) : (
                // Black orientation: black pieces on bottom, so black player info at bottom
                <div
                  className="card"
                  style={{
                    padding: '8px 10px',
                    background: clock.turn === 'black' && game.status === 'active' 
                      ? 'rgba(44, 230, 194, 0.1)' 
                      : undefined,
                    border: clock.turn === 'black' && game.status === 'active' 
                      ? '2px solid var(--accent)' 
                      : undefined,
                    flex: '0 0 auto',
                    height: '52px',
                    display: 'flex',
                    alignItems: 'center',
                    position: 'relative'
                  }}
                >
                  <div style={{ position: 'absolute', top: 2, left: '50%', transform: 'translateX(-50%)', zIndex: 0 }}>
                    <MaterialDiff fen={game.current_fen} color="black" position="bottom" />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', zIndex: 1 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <IdentityStrip 
                        user={game.black} 
                        mode={game.mode} 
                        rating={blackRating ?? undefined}
                        ratingChange={blackRatingChange}
                        isActive={game.status === 'active'}
                        isMyTurn={clock.turn === 'black' && game.status === 'active' && myColor === 'black'}
                      />
                    </div>
                    <div
                      style={{
                        fontSize: 22,
                        fontWeight: 700,
                        color: clock.turn === 'black' && game.status === 'active' ? 'var(--accent)' : 'var(--text)',
                        minWidth: 75,
                        textAlign: 'right',
                        flexShrink: 0,
                        fontFamily: 'monospace',
                        letterSpacing: '0.5px',
                      }}
                    >
                      {formatTime(clock?.black_time_left ?? 0, (clock?.black_time_left ?? 0) < 10)}
                    </div>
                  </div>
          </div>
        )}
            </>
            )}
              </div>

        {/* Right Sidebar: Moves + Actions + Analysis */}
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          gap: 14,
          overflow: 'hidden',
          minHeight: 0,
          height: '100%'
        }}>
          {/* Move History with Controls - Lichess Style */}
          <div className="card" style={{ flex: '1 1 50%', padding: '12px', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexShrink: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Moves</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button 
                  className="btn btn-ghost" 
                  style={{ 
                    padding: '6px 10px', 
                    fontSize: 12,
                    background: currentMoveIndex === 0 ? 'rgba(255, 152, 0, 0.3)' : undefined,
                    color: currentMoveIndex === 0 ? '#ff9800' : undefined
                  }} 
                  title="First move"
                  onClick={() => setCurrentMoveIndex(0)}
                >
                  ⏮
                </button>
                <button 
                  className="btn btn-ghost" 
                  style={{ 
                    padding: '6px 10px', 
                    fontSize: 12,
                    background: currentMoveIndex !== null && currentMoveIndex > 0 ? 'rgba(255, 152, 0, 0.3)' : undefined,
                    color: currentMoveIndex !== null && currentMoveIndex > 0 ? '#ff9800' : undefined
                  }} 
                  title="Previous move"
                  onClick={() => {
                    const moves = game?.moves ? game.moves.split(/\s+/).filter(Boolean) : [];
                    if (currentMoveIndex === null) setCurrentMoveIndex(moves.length - 1);
                    else if (currentMoveIndex > 0) setCurrentMoveIndex(currentMoveIndex - 1);
                  }}
                >
                  ⏪
                </button>
                <button 
                  className="btn btn-ghost" 
                  style={{ 
                    padding: '6px 10px', 
                    fontSize: 12,
                    background: currentMoveIndex !== null && currentMoveIndex < (game?.moves ? game.moves.split(/\s+/).filter(Boolean).length - 1 : 0) ? 'rgba(255, 152, 0, 0.3)' : undefined,
                    color: currentMoveIndex !== null && currentMoveIndex < (game?.moves ? game.moves.split(/\s+/).filter(Boolean).length - 1 : 0) ? '#ff9800' : undefined
                  }} 
                  title="Next move"
                  onClick={() => {
                    const moves = game?.moves ? game.moves.split(/\s+/).filter(Boolean) : [];
                    if (currentMoveIndex === null) return;
                    if (currentMoveIndex < moves.length - 1) {
                      setCurrentMoveIndex(currentMoveIndex + 1);
                    } else {
                      setCurrentMoveIndex(null);
                    }
                  }}
                >
                  ⏩
                </button>
                <button 
                  className="btn btn-ghost" 
                  style={{ 
                    padding: '6px 10px', 
                    fontSize: 12,
                    background: currentMoveIndex === (game?.moves ? game.moves.split(/\s+/).filter(Boolean).length - 1 : -1) ? 'rgba(255, 152, 0, 0.3)' : undefined,
                    color: currentMoveIndex === (game?.moves ? game.moves.split(/\s+/).filter(Boolean).length - 1 : -1) ? '#ff9800' : undefined
                  }} 
                  title="Last move"
                  onClick={() => {
                    setCurrentMoveIndex(null);
                  }}
                >
                  ⏭
                </button>
                <button className="btn btn-ghost" style={{ padding: '6px 10px', fontSize: 12 }} title="Move list">☰</button>
              </div>
            </div>
            <div 
              className="moves-scrollable"
              style={{ 
                fontSize: 13, 
                lineHeight: 1.7, 
                height: '100%',
                flex: '1 1 auto',
                overflowY: 'auto',
                overflowX: 'hidden',
                fontFamily: 'system-ui, -apple-system, sans-serif',
                color: 'var(--text)',
                padding: '4px 6px',
                margin: '0 -6px',
                scrollbarWidth: 'thin',
                scrollbarColor: 'rgba(44, 230, 194, 0.3) transparent'
              }}
            >
              {game?.moves && game.moves.trim() ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {(game.moves || '').split(/\s+/).filter(Boolean).reduce((acc: Array<{ moveNum: number; white: string; black?: string }>, mv, idx) => {
                    const moveNum = Math.floor(idx / 2) + 1;
                    const isWhite = idx % 2 === 0;
                    if (isWhite) {
                      acc.push({ moveNum, white: mv });
                    } else {
                      acc[acc.length - 1].black = mv;
                    }
                    return acc;
                  }, []).map((movePair, pairIdx) => {
                    const movesList = (game.moves || '').split(/\s+/).filter(Boolean);
                    const whiteIdx = pairIdx * 2;
                    const blackIdx = pairIdx * 2 + 1;
                    const isCurrentWhite = currentMoveIndex === whiteIdx || (currentMoveIndex === null && whiteIdx === movesList.length - 1);
                    const isCurrentBlack = currentMoveIndex === blackIdx || (currentMoveIndex === null && blackIdx === movesList.length - 1);
                    const isLastMove = currentMoveIndex === null && pairIdx === Math.floor((movesList.length - 1) / 2);
                    
                    return (
                      <div 
                        key={pairIdx}
                        style={{ 
                          display: 'flex',
                          padding: '1px 3px',
                          borderRadius: 2,
                          background: (isCurrentWhite || isCurrentBlack || isLastMove) ? 'rgba(76, 175, 80, 0.25)' : undefined,
                          cursor: 'pointer',
                          transition: 'background 0.15s'
                        }}
                        onClick={() => {
                          if (movePair.black) {
                            setCurrentMoveIndex(blackIdx);
                          } else {
                            setCurrentMoveIndex(whiteIdx);
                          }
                        }}
                        onMouseEnter={(e) => {
                          if (!isCurrentWhite && !isCurrentBlack && !isLastMove) {
                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isCurrentWhite && !isCurrentBlack && !isLastMove) {
                            e.currentTarget.style.background = '';
                          }
                        }}
                      >
                        <span style={{ 
                          minWidth: '26px',
                          color: isCurrentWhite ? '#4caf50' : 'var(--muted)',
                          fontWeight: isCurrentWhite ? 600 : 400,
                          fontSize: 12
                        }}>
                          {movePair.moveNum}.
                        </span>
                        <span style={{ 
                          minWidth: '52px',
                          color: isCurrentWhite ? '#4caf50' : 'var(--text)',
                          fontWeight: isCurrentWhite ? 600 : 400,
                          fontSize: 12
                        }}>
                          {movePair.white}
                        </span>
                        {movePair.black && (
                          <span style={{ 
                            minWidth: '52px',
                            color: isCurrentBlack ? '#4caf50' : 'var(--text)',
                            fontWeight: isCurrentBlack ? 600 : 400,
                            fontSize: 12
                          }}>
                            {movePair.black}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ color: 'var(--muted)', fontSize: 12, textAlign: 'center', padding: '14px 0' }}>
                  No moves yet
          </div>
        )}
      </div>
          </div>

          {/* Action Buttons - Draw and Resign */}
          {isPlayer && game?.status === 'active' && !gameResultPopup && (
            <div className="card" style={{ flex: '0 0 auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {resignConfirm ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
                  <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', fontWeight: 500 }}>Confirm resignation?</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-danger" type="button" onClick={() => { setResignConfirm(false); doAction(() => resignGame(id!), 'Resigned'); }} style={{ padding: '10px 16px', fontSize: 13, flex: 1, fontWeight: 600 }}>
                      Yes
                    </button>
                    <button className="btn btn-info" type="button" onClick={() => setResignConfirm(false)} style={{ padding: '10px 16px', fontSize: 13, flex: 1, fontWeight: 600 }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : drawConfirm ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
                  <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', fontWeight: 500 }}>Offer draw?</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-warning" type="button" onClick={() => { 
                      setDrawConfirm(false); 
                      offerDraw(id!)
                        .then(() => {
                          setActionMsg('Draw offer sent');
                          // Update game state to reflect draw offer without replacing entire game
                          if (game && me) {
                            setGame({ ...game, draw_offer_by: me.id });
                          }
                          // Refresh game to get updated state from server
                          fetchGameDetail(id!)
                            .then((data) => {
                              setGame(data);
                            })
                            .catch(() => {
                              // Fallback: just update draw_offer_by locally
                              if (game && me) {
                                setGame({ ...game, draw_offer_by: me.id });
                              }
                            });
                        })
                        .catch((err) => setActionErr(err.response?.data?.detail || 'Failed to send draw offer'));
                    }} style={{ padding: '10px 16px', fontSize: 13, flex: 1, fontWeight: 600 }}>
                      Yes
                    </button>
                    <button className="btn btn-info" type="button" onClick={() => setDrawConfirm(false)} style={{ padding: '10px 16px', fontSize: 13, flex: 1, fontWeight: 600 }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : game.draw_offer_by && game.draw_offer_by === me?.id ? (
                // User sent draw offer - show "Draw offer sent" message
                <div style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: 8, 
                  width: '100%',
                  padding: '12px',
                  background: 'rgba(255, 152, 0, 0.1)',
                  border: '1px solid rgba(255, 152, 0, 0.3)',
                  borderRadius: 8,
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: 13, color: '#ff9800', fontWeight: 600 }}>
                    ✓ Draw offer sent
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                    Waiting for opponent's response...
                  </div>
                  <button className="btn btn-info" type="button" onClick={() => setResignConfirm(true)} style={{ padding: '10px 16px', fontSize: 13, fontWeight: 600 }} title="Resign">
                    🏳 Resign
                  </button>
                </div>
              ) : game.draw_offer_by && game.draw_offer_by !== me?.id ? (
                // User received draw offer - show Accept/Reject buttons
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
                  <div style={{ 
                    fontSize: 13, 
                    color: '#ff9800', 
                    fontWeight: 600, 
                    textAlign: 'center',
                    padding: '8px',
                    background: 'rgba(255, 152, 0, 0.1)',
                    border: '1px solid rgba(255, 152, 0, 0.3)',
                    borderRadius: 6
                  }}>
                    Draw offer received
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button 
                      className="btn btn-success" 
                      type="button" 
                      onClick={() => {
                        respondDraw(id!, 'accept')
                          .then((res) => {
                            setActionMsg('Draw accepted');
                            if (res) setGame(res);
                            // Game will end in draw, WebSocket will handle the game_finished event
                          })
                          .catch((err) => setActionErr(err.response?.data?.detail || 'Failed to accept draw'));
                      }} 
                      style={{ padding: '10px 16px', fontSize: 13, flex: 1, fontWeight: 600 }} 
                      title="Accept draw"
                    >
                      ✓ Accept Draw
                    </button>
                    <button 
                      className="btn btn-danger" 
                      type="button" 
                      onClick={() => {
                        respondDraw(id!, 'decline')
                          .then((res) => {
                            setActionMsg('Draw declined');
                            if (res) setGame(res);
                            // After decline, draw_offer_by should be cleared, showing normal buttons
                          })
                          .catch((err) => setActionErr(err.response?.data?.detail || 'Failed to decline draw'));
                      }} 
                      style={{ padding: '10px 16px', fontSize: 13, flex: 1, fontWeight: 600 }} 
                      title="Decline draw"
                    >
                      ✗ Decline
                    </button>
                  </div>
                </div>
              ) : (
                // Normal state - show Draw and Resign/Abort buttons
                (() => {
                  // Count moves (each move is space-separated)
                  const moveCount = game?.moves ? game.moves.trim().split(/\s+/).filter(m => m.length > 0).length : 0;
                  const canAbort = moveCount <= 2;
                  
                  return (
                    <div style={{ display: 'flex', gap: 8 }}>
                      {!canAbort && (
                        <button className="btn btn-warning" type="button" onClick={() => setDrawConfirm(true)} style={{ padding: '10px 16px', fontSize: 13, flex: 1, fontWeight: 600 }} title="Offer draw">
                          ½ Draw
                        </button>
                      )}
                      <button 
                        className="btn btn-danger" 
                        type="button" 
                        onClick={() => {
                          if (canAbort) {
                            doAction(() => abortGame(id!), 'Game aborted');
                          } else {
                            setResignConfirm(true);
                          }
                        }} 
                        style={{ padding: '10px 16px', fontSize: 13, flex: canAbort ? 1 : 1, fontWeight: 600 }} 
                        title={canAbort ? "Abort game" : "Resign"}
                      >
                        {canAbort ? '⛔ Abort' : '🏳 Resign'}
                      </button>
                    </div>
                  );
                })()
            )}
            </div>
          )}

          {/* Prediction (for spectators) */}
          {!isPlayer && game?.status === 'active' && (
            <div className="card" style={{ flex: '0 0 auto', padding: '8px' }}>
              <h4 style={{ marginTop: 0, marginBottom: 6, fontSize: 11, fontWeight: 600 }}>Predict</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {(['white', 'black', 'draw'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    className="btn btn-ghost"
                    style={{
                      borderColor: prediction === p ? 'var(--accent)' : 'var(--border)',
                      background: prediction === p ? 'rgba(44, 230, 194, 0.1)' : 'transparent',
                      padding: '4px 8px',
                      fontSize: 9
                    }}
                    onClick={() => setPrediction(p)}
                    disabled={!canPredict}
                  >
                    {p === 'white' ? 'White' : p === 'black' ? 'Black' : 'Draw'}
                  </button>
                ))}
                <button
                  className="btn btn-purple"
                  type="button"
                  onClick={submitPrediction}
                  disabled={!canPredict || !prediction}
                  style={{ padding: '4px 8px', fontSize: 9 }}
                >
                  Submit
              </button>
                {predMsg && <div style={{ color: 'var(--accent)', fontSize: 9 }}>{predMsg}</div>}
                {predErr && <div style={{ color: 'var(--danger)', fontSize: 9 }}>{predErr}</div>}
            </div>
                  </div>
                )}

          {/* Finished Game Actions */}
          {game?.status === 'finished' && isPlayer && (
            <div className="card" style={{ flex: '0 0 auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
              {/* Rematch button */}
              {(() => {
                      const rematchRequestedBy = playerStatus?.rematch_requested_by ?? (game as any).rematch_requested_by;
                      const iRequested = rematchRequestedBy === me?.id;
                      const opponentRequested = rematchRequestedBy && rematchRequestedBy !== me?.id;
                      const whiteActive = playerStatus?.white_in_active_game ?? false;
                      const blackActive = playerStatus?.black_in_active_game ?? false;
                      const isWhite = myColor === 'white';
                      const iAmActive = (isWhite && whiteActive) || (!isWhite && blackActive);
                      const opponentActive = (isWhite && blackActive) || (!isWhite && whiteActive);
                      const canRematch = !iAmActive && !opponentActive;
                      const finishedAtMs = game?.finished_at ? new Date(game.finished_at).getTime() : 0;
                      const ttlMs = (iAmActive || opponentActive) ? 60_000 : 300_000;
                      const expired = finishedAtMs ? (rematchNow - finishedAtMs) > ttlMs : false;

                      if (expired) {
                        return null;
                      }
                      
                      if (iRequested) {
                        return (
                          <button 
                            className="btn btn-ghost" 
                            type="button" 
                            disabled
                            style={{ 
                              padding: '10px 16px', 
                              fontSize: 13,
                              fontWeight: 600,
                              opacity: 0.6,
                              cursor: 'not-allowed',
                              width: '100%'
                            }}
                          >
                            Rematch Requested
                      </button>
                        );
                      } else if (opponentRequested) {
                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', fontWeight: 500 }}>
                              Rematch Requested
            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button 
                                className="btn btn-success" 
                                type="button" 
                                onClick={() => {
                                  rematchAccept(id!)
                                    .then((newGame) => {
                                      // Backend returns the new game object with id
                                      const newGameId = newGame?.id || newGame?.game_id;
                                      if (newGameId) {
                                        // Navigate to the new game - use navigate instead of window.location for better React Router handling
                                        navigate(`/games/${newGameId}`, { replace: true });
                                        // Force a page reload to ensure clean state
                                        setTimeout(() => {
                                          window.location.reload();
                                        }, 100);
                                      } else {
                                        // Fallback: refresh current page and check for new game via WebSocket
                                        doAction(() => Promise.resolve(newGame), 'Rematch accepted');
                                        setTimeout(() => {
                                          fetchGameDetail(id!).then(setGame).catch(() => {});
                                        }, 500);
                                      }
                                    })
                                    .catch((err) => {
                                      setActionErr(err.response?.data?.detail || 'Failed to accept rematch');
                                    });
                                }}
                                disabled={!canRematch}
                                style={{ 
                                  padding: '10px 16px', 
                                  fontSize: 13,
                                  fontWeight: 600,
                                  flex: 1,
                                  opacity: canRematch ? 1 : 0.5,
                                  cursor: canRematch ? 'pointer' : 'not-allowed'
                                }}
                              >
                      Accept
                      </button>
                              <button 
                                className="btn btn-danger" 
                                type="button" 
                                onClick={() => doAction(() => rematchReject(id!), 'Rematch rejected')}
                                style={{ padding: '10px 16px', fontSize: 13, fontWeight: 600, flex: 1 }}
                              >
                                Decline
                      </button>
                    </div>
                          </div>
                        );
                      } else {
                        return (
                          <button 
                            className="btn btn-purple" 
                            type="button" 
                            onClick={() => {
                              doAction(() => rematch(id!), 'Rematch requested');
                              setTimeout(() => {
                                fetchPlayerStatus(id!).then(setPlayerStatus).catch(() => {});
                              }, 500);
                            }}
                            disabled={!canRematch}
                            style={{ 
                              padding: '10px 16px', 
                              fontSize: 13,
                              fontWeight: 600,
                              width: '100%',
                              opacity: canRematch ? 1 : 0.5,
                              cursor: canRematch ? 'pointer' : 'not-allowed'
                            }}
                          >
                      Rematch
                      </button>
                        );
                      }
                    })()}
                    
              {/* New Game button */}
              <button 
                className="btn btn-ghost" 
                type="button" 
                onClick={() => navigate('/')}
                style={{ padding: '10px 16px', fontSize: 13, fontWeight: 600, width: '100%' }}
              >
                New Game
                      </button>
              
              {/* Create Challenge button */}
              <button 
                className="btn btn-ghost" 
                type="button" 
                onClick={() => navigate('/games/create')}
                style={{ padding: '10px 16px', fontSize: 13, fontWeight: 600, width: '100%' }}
              >
                Create Challenge
                      </button>
                    </div>
          )}

          {/* Analysis - Lichess Style */}
          {(analysis || game?.status === 'finished') && (
            <div className="card" style={{ flex: '1 1 auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0, overflow: 'hidden' }}>
              {game?.status === 'finished' && !fullAnalysis && !analyzing && (
                <button
                  className="btn btn-info"
                  type="button"
                  onClick={() => {
                    setAnalyzing(true);
                    requestFullAnalysis(id!)
                      .then((data: any) => {
                        setFullAnalysis(data);
                        setAnalyzing(false);
                      })
                      .catch((err: any) => {
                        setActionErr(err.response?.data?.detail || 'Failed to analyze game');
                        setAnalyzing(false);
                      });
                  }}
                  style={{ 
                    padding: '10px 16px', 
                    fontSize: 13,
                    fontWeight: 600,
                    width: '100%'
                  }}
                >
                  📊 Stockfish Analysis
                    </button>
              )}
              {analyzing && (
                <div style={{ fontSize: 12, color: 'var(--accent)', textAlign: 'center', padding: '8px' }}>Analyzing...</div>
              )}
              
              {fullAnalysis ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: '1 1 auto', minHeight: 0, overflow: 'hidden', height: '100%' }}>
                  <div style={{ color: 'var(--muted)', fontSize: 11, flexShrink: 0 }}>
                    Source: {fullAnalysis.source === 'stockfish' ? 'Stockfish' : 'Lichess'} • 
                    Moves analyzed: {fullAnalysis.analysis?.summary?.analyzed_moves || fullAnalysis.analysis?.moves?.length || 0}
                  </div>
                  {fullAnalysis.analysis?.moves && fullAnalysis.analysis.moves.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: '1 1 auto', minHeight: 0, overflow: 'hidden' }}>
                      {/* Evaluation Graph */}
                      <div style={{ 
                        background: 'rgba(0, 0, 0, 0.2)',
                        borderRadius: 6,
                        padding: '8px',
                        border: '1px solid var(--border)',
                        flexShrink: 0
                      }}>
                        <EvaluationGraph 
                          moves={fullAnalysis.analysis.moves} 
                          height={120}
                        />
                      </div>
                      
                      {/* Move-by-move analysis - Always visible scrollable bar */}
                      <div style={{ 
                        display: 'flex', 
                        flexDirection: 'column', 
                        flex: '1 1 auto',
                        minHeight: 0,
                        overflow: 'hidden',
                        borderTop: '1px solid var(--border)',
                        paddingTop: 6
                      }}>
                        <div style={{ 
                          fontSize: 10, 
                          color: 'var(--muted)', 
                          marginBottom: 4,
                          fontWeight: 600,
                          flexShrink: 0
                        }}>
                          Move-by-Move Analysis ({fullAnalysis.analysis.moves.length} moves)
                        </div>
                        <div 
                          className="analysis-scrollable"
                          style={{ 
                            flex: '1 1 auto',
                            minHeight: 0,
                            overflowY: 'auto',
                            overflowX: 'hidden',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 1,
                            paddingRight: 4,
                            scrollbarWidth: 'thin',
                            scrollbarColor: 'rgba(44, 230, 194, 0.3) transparent'
                          }}
                        >
                          {fullAnalysis.analysis.moves.map((move: any, idx: number) => {
                            // Format evaluation
                            let evalDisplay = '';
                            let evalColor = 'var(--text)';
                            
                            if (move.mate !== null && move.mate !== undefined) {
                              evalDisplay = `M${Math.abs(move.mate)}`;
                              evalColor = move.mate > 0 ? '#4caf50' : '#ef5350';
                            } else if (move.eval !== null && move.eval !== undefined) {
                              evalDisplay = `${move.eval > 0 ? '+' : ''}${move.eval.toFixed(1)}`;
                              evalColor = move.eval > 0 ? '#4caf50' : move.eval < 0 ? '#ef5350' : 'var(--muted)';
                            }
                            
                            return (
                              <div 
                                key={idx} 
                                style={{ 
                                  display: 'flex', 
                                  justifyContent: 'space-between', 
                                  alignItems: 'center',
                                  padding: '3px 6px',
                                  fontSize: 10,
                                  fontFamily: 'system-ui, -apple-system, sans-serif',
                                  borderRadius: 3,
                                  background: idx % 2 === 0 ? 'rgba(255, 255, 255, 0.02)' : 'transparent',
                                  transition: 'background 0.15s'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = 'rgba(44, 230, 194, 0.1)';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = idx % 2 === 0 ? 'rgba(255, 255, 255, 0.02)' : 'transparent';
                                }}
                              >
                                <span style={{ color: 'var(--text)', fontFamily: 'monospace' }}>
                                  {move.move_number}. {move.move}
                                </span>
                                {evalDisplay && (
                                  <span style={{ 
                                    color: evalColor,
                                    fontWeight: 600,
                                    fontFamily: 'monospace',
                                    fontSize: 9,
                                    padding: '2px 6px',
                                    borderRadius: 3,
                                    background: evalColor === '#4caf50' ? 'rgba(76, 175, 80, 0.15)' : evalColor === '#ef5350' ? 'rgba(239, 83, 80, 0.15)' : 'rgba(128, 128, 128, 0.15)'
                                  }}>
                                    {evalDisplay}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
              </div>
            )}
                </div>
              ) : null}
            </div>
          )}
          
      </div>
        </div>
      </div>
      
      {/* Game result toast (centered on board) */}
      {gameResultPopup && (
        <div
          style={{
            position: 'fixed',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 20000,
            pointerEvents: 'none',
            animation: 'scaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
          }}
        >
          <div
            style={{
              background: gameResultPopup.type === 'win'
                ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.95), rgba(16, 185, 129, 0.95))'
                : gameResultPopup.type === 'draw'
                ? 'linear-gradient(135deg, rgba(250, 204, 21, 0.95), rgba(245, 158, 11, 0.95))'
                : 'linear-gradient(135deg, rgba(239, 68, 68, 0.95), rgba(220, 38, 38, 0.95))',
              padding: '14px 22px',
              borderRadius: 16,
              textAlign: 'center',
              boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
              border: `2px solid ${gameResultPopup.type === 'win' ? 'rgba(34, 197, 94, 1)' : gameResultPopup.type === 'draw' ? 'rgba(250, 204, 21, 1)' : 'rgba(239, 68, 68, 1)'}`,
              minWidth: 220,
              maxWidth: 420
            }}
          >
            <div style={{ fontSize: 28, marginBottom: 6, lineHeight: 1 }}>
              {gameResultPopup.type === 'win' ? '🏆😄' : gameResultPopup.type === 'draw' ? '🤝😅' : '😵‍💫💥'}
            </div>
            <div
              style={{
                fontSize: 18,
                fontWeight: 800,
                color: '#0b0b0b',
                textShadow: '0 1px 1px rgba(255,255,255,0.3)',
                marginBottom: 4,
                letterSpacing: '0.5px'
              }}
            >
              {gameResultPopup.type === 'win' ? 'You won!' : gameResultPopup.type === 'draw' ? 'Draw!' : 'You lost!'}
            </div>
            {gameResultPopup.reason && (
              <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.75)' }}>
                {gameResultPopup.type === 'win' && gameResultPopup.reason === 'timeout' && 'Opponent ran out of time'}
                {gameResultPopup.type === 'loss' && gameResultPopup.reason === 'timeout' && 'Time ran out'}
                {gameResultPopup.type === 'win' && gameResultPopup.reason === 'checkmate' && 'Checkmate'}
                {gameResultPopup.type === 'loss' && gameResultPopup.reason === 'checkmate' && 'Checkmated'}
                {gameResultPopup.type === 'win' && (gameResultPopup.reason === 'resignation' || gameResultPopup.reason === 'resign') && 'Opponent resigned'}
                {gameResultPopup.type === 'loss' && (gameResultPopup.reason === 'resignation' || gameResultPopup.reason === 'resign') && 'Resigned'}
                {gameResultPopup.type === 'draw' && 'Game drawn'}
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes scaleIn {
          from {
            transform: scale(0.5);
            opacity: 0;
          }
          to {
            transform: scale(1);
            opacity: 1;
          }
        }
        .moves-scrollable::-webkit-scrollbar,
        .analysis-scrollable::-webkit-scrollbar {
          width: 6px;
        }
        .moves-scrollable::-webkit-scrollbar-track,
        .analysis-scrollable::-webkit-scrollbar-track {
          background: transparent;
        }
        .moves-scrollable::-webkit-scrollbar-thumb,
        .analysis-scrollable::-webkit-scrollbar-thumb {
          background: rgba(44, 230, 194, 0.3);
          border-radius: 3px;
        }
        .moves-scrollable::-webkit-scrollbar-thumb:hover,
        .analysis-scrollable::-webkit-scrollbar-thumb:hover {
          background: rgba(44, 230, 194, 0.5);
        }
      `}</style>
    </div>
  );
}
