import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchClock, fetchGameEvents, getGame, spectateGame } from '../api';
import { tokenStorage } from '../api/client';

const resolveWsBase = () => {
    const explicit = import.meta.env.VITE_WS_BASE_URL;
    if (explicit) return explicit.replace(/\/$/, '');
    const apiBase = import.meta.env.VITE_API_BASE_URL;
    if (apiBase && apiBase.startsWith('http')) {
        const wsBase = apiBase.replace(/^http/, 'ws').replace(/\/api\/?$/, '');
        return wsBase.replace(/\/$/, '');
    }
    if (typeof window !== 'undefined') {
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        if (isLocalhost) {
            const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
            return `${protocol}://${window.location.hostname}:8000`;
        }
    }
    return null;
};

const buildWsUrl = (path, token) => {
    const base = resolveWsBase();
    if (base) {
        return `${base}${path}${token ? `?token=${token}` : ''}`;
    }
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${protocol}://${window.location.host}${path}${token ? `?token=${token}` : ''}`;
};

const deriveTurnFromFen = (fen) => {
    if (!fen) return null;
    const parts = fen.split(' ');
    if (parts.length < 2) return null;
    if (parts[1] === 'w') return 'white';
    if (parts[1] === 'b') return 'black';
    return null;
};

export default function useGameSync({ gameId, spectate = false, token }) {
    const [connected, setConnected] = useState(false);
    const [game, setGame] = useState(null);
    const [state, setState] = useState(null);
    const [chat, setChat] = useState([]);
    const [lastSeq, setLastSeq] = useState(0);
    const [error, setError] = useState(null);

    const wsRef = useRef(null);
    const lastSeqRef = useRef(0);
    const reconnectRef = useRef(null);
    const pollingRef = useRef(null);
    const syncRef = useRef(null);
    const eventsUnsupportedRef = useRef(false);
    const recentChatsRef = useRef([]);

    const updateSeq = (seq) => {
        if (!seq) return false;
        if (seq <= lastSeqRef.current) return false;
        lastSeqRef.current = seq;
        setLastSeq(seq);
        return true;
    };

    const mergeState = (payload) => {
        setState((prev) => {
            const nextLegalMoves = payload.legal_moves
                ?? payload.game_state?.legal_moves?.san
                ?? prev?.legal_moves;
            const nextLegalMovesUci = payload.legal_moves_uci
                ?? payload.game_state?.legal_moves?.uci
                ?? prev?.legal_moves_uci;
            const nextDrawOffer = payload.draw_offer_by ?? prev?.draw_offer_by;
            const nextFen = payload.fen ?? prev?.fen;
            const nextMoves = payload.moves ?? prev?.moves;
            const nextStatus = payload.status ?? prev?.status;
            const nextResult = payload.result ?? prev?.result;
            const nextDeadline = payload.first_move_deadline ?? prev?.first_move_deadline;
            const nextColor = payload.first_move_color ?? prev?.first_move_color;
            const nextWhite = payload.white_time_left ?? prev?.white_time_left;
            const nextBlack = payload.black_time_left ?? prev?.black_time_left;
            const nextTurn = payload.turn ?? deriveTurnFromFen(payload.fen) ?? prev?.turn;
            const nextLastMove = payload.last_move_at ?? prev?.last_move_at;
            const nextServerTime = payload.server_time ?? prev?.server_time;
            if (
                prev
                && nextFen === prev.fen
                && nextMoves === prev.moves
                && nextStatus === prev.status
                && nextResult === prev.result
                && nextDeadline === prev.first_move_deadline
                && nextColor === prev.first_move_color
                && nextDrawOffer === prev.draw_offer_by
                && nextWhite === prev.white_time_left
                && nextBlack === prev.black_time_left
                && nextTurn === prev.turn
                && nextLastMove === prev.last_move_at
                && nextServerTime === prev.server_time
            ) {
                return prev;
            }
            return {
                ...prev,
                ...payload,
                fen: nextFen,
                moves: nextMoves,
                legal_moves: nextLegalMoves,
                legal_moves_uci: nextLegalMovesUci,
                draw_offer_by: nextDrawOffer,
                white_time_left: nextWhite,
                black_time_left: nextBlack,
                turn: nextTurn,
                last_move_at: nextLastMove,
                server_time: nextServerTime,
            };
        });
        if (payload?.game) {
            setGame((prev) => ({
                ...prev,
                ...payload.game,
                legal_moves: payload.game?.legal_moves ?? payload.game?.game_state?.legal_moves?.san ?? prev?.legal_moves,
                legal_moves_uci: payload.game?.legal_moves_uci ?? payload.game?.game_state?.legal_moves?.uci ?? prev?.legal_moves_uci,
                draw_offer_by: payload.game?.draw_offer_by ?? prev?.draw_offer_by,
            }));
            return;
        }
        if (payload?.fen || payload?.moves || payload?.white_time_left != null) {
            setGame((prev) => ({
                ...prev,
                current_fen: payload.fen ?? prev?.current_fen,
                moves: payload.moves ?? prev?.moves,
                white_time_left: payload.white_time_left ?? prev?.white_time_left,
                black_time_left: payload.black_time_left ?? prev?.black_time_left,
                status: payload.status ?? prev?.status,
                result: payload.result ?? prev?.result,
                move_count: payload.move_count ?? prev?.move_count,
                first_move_deadline: payload.first_move_deadline ?? prev?.first_move_deadline,
                first_move_color: payload.first_move_color ?? prev?.first_move_color,
                legal_moves_uci: payload.legal_moves_uci ?? payload.game_state?.legal_moves?.uci ?? prev?.legal_moves_uci,
                draw_offer_by: payload.draw_offer_by ?? prev?.draw_offer_by,
                started_at: payload.started_at ?? prev?.started_at,
                created_at: payload.created_at ?? prev?.created_at,
            }));
        }
    };

    const handleEvent = useCallback((payload) => {
        if (!payload) return;
        if (payload.type === 'gameFull') {
            setGame(payload.game);
            setState((prev) => ({
                ...prev,
                ...payload.game,
                fen: payload.game?.current_fen,
                moves: payload.game?.moves,
                legal_moves: payload.game?.legal_moves ?? payload.game?.game_state?.legal_moves?.san,
                game_state: payload.game?.game_state,
            }));
            updateSeq(payload.seq || payload.game?.state?.seq);
            return;
        }
        if (payload.type === 'chat') {
            const room = payload.room || 'players';
            const message = (payload.message || '').trim();
            if (!message) return;
            const userKey = payload.user_id ?? payload.user ?? 'anon';
            const key = `${userKey}|${room}|${message}`;
            const now = Date.now();
            recentChatsRef.current = recentChatsRef.current.filter((entry) => now - entry.at < 2000);
            if (recentChatsRef.current.some((entry) => entry.key === key)) {
                return;
            }
            recentChatsRef.current.push({ key, at: now });
            setChat((prev) => [...prev, { ...payload, room, message, received_at: now }]);
            return;
        }
        if (payload.type === 'draw_offer') {
            setState((prev) => ({ ...prev, draw_offer_by: payload.by }));
            setGame((prev) => ({ ...prev, draw_offer_by: payload.by }));
            return;
        }
        if (payload.type === 'draw_response') {
            setState((prev) => ({ ...prev, draw_offer_by: null }));
            setGame((prev) => ({ ...prev, draw_offer_by: null }));
            return;
        }
        if (payload.type === 'clock') {
            mergeState({
                white_time_left: payload.white_time_left,
                black_time_left: payload.black_time_left,
                turn: payload.turn,
                server_time: payload.server_time ?? Math.floor(Date.now() / 1000),
            });
            return;
        }
        if (payload.type === 'game_finished') {
            if (payload.seq) {
                if (payload.seq > lastSeqRef.current + 1 && syncRef.current) {
                    syncRef.current();
                }
                if (!updateSeq(payload.seq)) return;
            }
            if (payload.game) setGame(payload.game);
            mergeState(payload);
            return;
        }
        if (payload.type === 'gameState') {
            if (payload.seq) {
                if (payload.seq > lastSeqRef.current + 1 && syncRef.current) {
                    syncRef.current();
                }
                if (!updateSeq(payload.seq)) return;
            }
            mergeState(payload);
            return;
        }
        if (payload.seq) {
            if (payload.seq > lastSeqRef.current + 1 && syncRef.current) {
                syncRef.current();
            }
            if (!updateSeq(payload.seq)) {
                return;
            }
        }
        mergeState(payload);
    }, []);

    const refreshSnapshot = useCallback(async () => {
        if (!gameId) return;
        const data = spectate ? await spectateGame(gameId) : await getGame(gameId);
        setGame(data);
        setState((prev) => ({
            ...prev,
            ...data,
            fen: data.current_fen,
            moves: data.moves,
            legal_moves: data.legal_moves,
            legal_moves_uci: data.legal_moves_uci,
        }));
    }, [gameId, spectate]);

    const syncEvents = useCallback(async (force = false) => {
        if (!gameId) return;
        try {
            if (force || eventsUnsupportedRef.current) {
                await refreshSnapshot();
                setError(null);
                return;
            }
            const data = await fetchGameEvents(gameId, lastSeqRef.current || undefined);
            (data.events || []).forEach((event) => {
                handleEvent(event);
            });
            if (data.last_seq) {
                updateSeq(data.last_seq);
            }
            setError(null);
        } catch (err) {
            if (err?.status === 404) {
                eventsUnsupportedRef.current = true;
            }
            try {
                await refreshSnapshot();
                setError(null);
            } catch (refreshErr) {
                setError('Live sync is unavailable.');
            }
        }
    }, [gameId, handleEvent, refreshSnapshot]);

    useEffect(() => {
        syncRef.current = syncEvents;
    }, [syncEvents]);

    useEffect(() => {
        if (!gameId) return;
        const loadGame = async () => {
            try {
                const data = spectate ? await spectateGame(gameId) : await getGame(gameId);
                setGame(data);
                setState((prev) => ({
                    ...prev,
                    ...data,
                    fen: data.current_fen,
                    moves: data.moves,
                    legal_moves: data.legal_moves,
                    legal_moves_uci: data.legal_moves_uci,
                }));
            } catch (err) {
                setError(err.message || 'Failed to load game.');
            }
        };
        loadGame();
    }, [gameId, spectate]);

    useEffect(() => {
        if (!gameId) return;
        const authToken = token || tokenStorage.get();
        const wsPath = spectate ? `/ws/spectate/${gameId}/` : `/ws/game/${gameId}/`;

        const connect = () => {
            const ws = new WebSocket(buildWsUrl(wsPath, authToken));
            wsRef.current = ws;

            ws.onopen = () => {
                setConnected(true);
                setError(null);
            };
            ws.onmessage = (event) => {
                try {
                    const payload = JSON.parse(event.data);
                    handleEvent(payload);
                } catch (err) {
                    // ignore malformed payloads
                }
            };
            ws.onclose = () => {
                setConnected(false);
                if (!reconnectRef.current) {
                    reconnectRef.current = setTimeout(() => {
                        reconnectRef.current = null;
                        connect();
                    }, 2000);
                }
            };
            ws.onerror = () => {
                setConnected(false);
            };
        };

        connect();

        return () => {
            if (wsRef.current) wsRef.current.close();
            if (reconnectRef.current) clearTimeout(reconnectRef.current);
        };
    }, [gameId, spectate, token, handleEvent]);

    useEffect(() => {
        if (connected) {
            if (pollingRef.current) {
                clearInterval(pollingRef.current);
                pollingRef.current = null;
            }
            return;
        }
        pollingRef.current = setInterval(() => {
            syncEvents();
        }, 3000);
        return () => {
            if (pollingRef.current) clearInterval(pollingRef.current);
        };
    }, [connected, syncEvents]);

    useEffect(() => {
        if (!gameId || game?.status !== 'active') return;
        const clockInterval = setInterval(async () => {
            try {
                const clock = await fetchClock(gameId);
                mergeState({
                    white_time_left: clock.white_time_left,
                    black_time_left: clock.black_time_left,
                    last_move_at: clock.last_move_at,
                    turn: clock.turn,
                    server_time: clock.server_time ?? Math.floor(Date.now() / 1000),
                });
            } catch (err) {
                // ignore clock failures
            }
        }, 1000);
        return () => clearInterval(clockInterval);
    }, [gameId, game?.status]);

    const sendChat = (message, room = 'players') => {
        if (!wsRef.current || wsRef.current.readyState !== 1) return;
        const payload = { type: 'chat', message };
        if (room && room !== 'players') {
            payload.room = room;
        }
        wsRef.current.send(JSON.stringify(payload));
    };

    return {
        connected,
        game,
        state,
        chat,
        lastSeq,
        error,
        sendChat,
        syncEvents,
    };
}
