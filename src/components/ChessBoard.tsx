import { memo, useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Chess } from 'chess.js';
import { ChessPiece } from './ChessPieces';
import { BOARD_THEMES, PIECE_SETS } from '../utils/boardPresets';

type Square = { piece: string | null; color: 'light' | 'dark'; coord: string; pieceType?: string };

const PROMOTION_PIECES = ['q', 'r', 'b', 'n'] as const;
const LAST_MOVE_HIGHLIGHT = {
  light: 'rgba(140, 220, 160, 0.45)',
  dark: 'rgba(120, 200, 140, 0.5)'
};
const MOVE_SUGGESTION = {
  light: 'rgba(120, 220, 185, 0.25)',
  dark: 'rgba(120, 220, 185, 0.32)',
  dotLight: 'rgba(120, 220, 185, 0.55)',
  dotDark: 'rgba(120, 220, 185, 0.65)',
  ring: 'rgba(120, 220, 185, 0.7)'
};

function parseFen(fen?: string): Square[] {
  const normalized =
    !fen || fen === 'start'
      ? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
      : fen;
  const board: Square[] = [];
  const rows = (normalized || '').split(' ')[0] || '8/8/8/8/8/8/8/8';
  const ranks = rows.split('/');
  for (let r = 0; r < 8; r++) {
    const rank = ranks[r] || '';
    let file = 0;
    for (const ch of rank) {
      if (Number.isInteger(Number(ch))) {
        const empty = parseInt(ch, 10);
        for (let i = 0; i < empty; i++) {
          const isDark = (r + file) % 2 === 1;
          const coord = String.fromCharCode(97 + file) + (8 - r);
          board.push({ piece: null, color: isDark ? 'dark' : 'light', coord });
          file++;
        }
      } else {
        const isDark = (r + file) % 2 === 1;
        const coord = String.fromCharCode(97 + file) + (8 - r);
        board.push({ 
          piece: ch, // Store the FEN character for piece type
          color: isDark ? 'dark' : 'light', 
          coord,
          pieceType: ch
        });
        file++;
      }
    }
    while (file < 8) {
      const isDark = (r + file) % 2 === 1;
      const coord = String.fromCharCode(97 + file) + (8 - r);
      board.push({ piece: null, color: isDark ? 'dark' : 'light', coord });
      file++;
    }
  }
  return board;
}

export const ChessBoard = memo(function ChessBoard({
  fen,
  lastMove,
  onMove,
  legalMoves,
  orientation = 'white',
  theme = 0,
  onThemeChange,
  pieceSet = 'cburnett',
  onPieceSetChange,
  showControls = true
}: {
  fen?: string;
  lastMove?: string;
  onMove?: (move: string) => void;
  legalMoves?: string[];
  orientation?: 'white' | 'black';
  theme?: number;
  onThemeChange?: (theme: number) => void;
  pieceSet?: string;
  onPieceSetChange?: (pieceSet: string) => void;
  showControls?: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [draggedPiece, setDraggedPiece] = useState<{ coord: string; piece: string; pieceType: string } | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  const [validMoves, setValidMoves] = useState<string[]>([]);
  const [wasDragged, setWasDragged] = useState(false);
  const [boardSize, setBoardSize] = useState<number>(500);
  const [promotionPending, setPromotionPending] = useState<{
    from: string;
    to: string;
    isWhite: boolean;
  } | null>(null);
  const [promotionPreview, setPromotionPreview] = useState<{
    from: string;
    to: string;
    isWhite: boolean;
  } | null>(null);
  const [promotionHover, setPromotionHover] = useState<string | null>(null);
  const squareSize = useMemo(() => Math.max(32, Math.floor(boardSize / 8)), [boardSize]);
  const pieceSize = useMemo(() => Math.max(28, Math.floor(squareSize * 0.9)), [squareSize]);
  const ghostPieceSize = useMemo(() => Math.max(36, Math.floor(squareSize * 0.98)), [squareSize]);
  const boardRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const chessRef = useRef<Chess | null>(null);
  
  // Calculate board size based on container - Lichess style: use maximum available space
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const container = containerRef.current;
        // Use full container space, accounting for minimal padding
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight - ((showControls && (onThemeChange || onPieceSetChange)) ? 22 : 0);
        // Use the smaller dimension to maintain square aspect ratio, but allow much larger sizes
        const size = Math.min(containerWidth, containerHeight);
        // Min 300px, but allow up to 1000px or more based on viewport
        // On large screens, board can be 800-1000px easily
        const maxSize = Math.min(1600, Math.max(containerWidth, containerHeight));
        setBoardSize(Math.max(420, Math.min(size, maxSize)));
      }
    };
    
    updateSize();
    const resizeObserver = new ResizeObserver(updateSize);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    
    window.addEventListener('resize', updateSize);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, [onThemeChange, onPieceSetChange, showControls]);

  // Initialize chess.js for move validation - reset selection when FEN changes
  // Use a ref to track the previous FEN to detect when a move completes
  const previousFenRef = useRef<string | undefined>(fen);
  const clearDraggedPieceTimeoutRef = useRef<number | null>(null);
  const pendingMoveRef = useRef<{ from: string; to: string } | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; coord: string; piece: string; pieceType: string } | null>(null);
  const activeDragRef = useRef<{ coord: string; piece: string; pieceType: string } | null>(null);
  const wasDraggedRef = useRef(false);
  const dropHandledRef = useRef(false);
  
  useEffect(() => {
    if (!promotionPreview) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!promotionPreview) return;
      const key = e.key.toLowerCase();
      if (!PROMOTION_PIECES.includes(key as any)) return;
      e.preventDefault();
      const pieceChar = promotionPreview.isWhite ? key.toUpperCase() : key;
      const move = `${promotionPreview.from}${promotionPreview.to}${pieceChar}`;
      pendingMoveRef.current = { from: promotionPreview.from, to: promotionPreview.to };
      setPromotionPreview(null);
      setPromotionHover(null);
      try {
        onMove?.(move);
      } catch (err) {
        console.error('Promotion move failed:', err);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [promotionPreview, onMove]);

  useEffect(() => {
    if (!draggedPiece) {
      activeDragRef.current = null;
    }
  }, [draggedPiece]);
  
  useEffect(() => {
    try {
      const normalizedFen = !fen || fen === 'start' 
        ? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
        : fen;
      
      // Check if FEN actually changed (new move made)
      const fenChanged = previousFenRef.current !== normalizedFen;
      previousFenRef.current = normalizedFen;
      
      chessRef.current = new Chess(normalizedFen);
      
      // Only clear selection and valid moves if FEN changed (new move made)
      if (fenChanged) {
        // If we had a pending move (drag or click), delay clearing to prevent flicker
        if (pendingMoveRef.current) {
          // Clear any existing timeout
          if (clearDraggedPieceTimeoutRef.current) {
            clearTimeout(clearDraggedPieceTimeoutRef.current);
          }
          // Delay clearing draggedPiece and selection to allow the new board state to render first
          // Reduced delay to prevent pieces from disappearing
          clearDraggedPieceTimeoutRef.current = window.setTimeout(() => {
            // Only clear if FEN actually changed (move completed)
            if (previousFenRef.current === normalizedFen) {
              if (draggedPiece) {
                setDraggedPiece(null);
                setWasDragged(false);
              }
              setSelected(null);
              setValidMoves([]);
            }
            pendingMoveRef.current = null;
            clearDraggedPieceTimeoutRef.current = null;
          }, 50); // Further reduced delay for smoother transitions
        } else {
          // No pending move, clear immediately but smoothly
          setSelected(null);
          setValidMoves([]);
        }
      }
    } catch {
      chessRef.current = new Chess();
      const normalizedFen = !fen || fen === 'start' 
        ? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
        : fen;
      const fenChanged = previousFenRef.current !== normalizedFen;
      previousFenRef.current = normalizedFen;
      
      if (fenChanged) {
        if (pendingMoveRef.current && draggedPiece) {
          if (clearDraggedPieceTimeoutRef.current) {
            clearTimeout(clearDraggedPieceTimeoutRef.current);
          }
          clearDraggedPieceTimeoutRef.current = window.setTimeout(() => {
            setDraggedPiece(null);
            setWasDragged(false);
            setSelected(null);
            setValidMoves([]);
            pendingMoveRef.current = null;
            clearDraggedPieceTimeoutRef.current = null;
          }, 350);
        } else {
          setSelected(null);
          setValidMoves([]);
        }
      }
    }
    
    return () => {
      if (clearDraggedPieceTimeoutRef.current) {
        clearTimeout(clearDraggedPieceTimeoutRef.current);
      }
    };
  }, [fen]);

  // Update valid moves when selection changes
  useEffect(() => {
    if (!selected || !chessRef.current || !onMove) {
      setValidMoves([]);
      return;
    }

    // Get valid moves from chess.js
    const moves = chessRef.current.moves({ square: selected as any, verbose: true });
    const validSquares: string[] = moves.map(m => m.to);
    let combinedMoves: string[] = [...validSquares];

    // Also check legalMoves prop (from server)
    if (legalMoves && legalMoves.length > 0) {
      const fromLegal = legalMoves.filter(m => m.startsWith(selected));
      const toSquares = fromLegal.map(m => m.slice(2, 4));
      combinedMoves = [...new Set([...combinedMoves, ...toSquares])];
    }
    
    setValidMoves(combinedMoves);
  }, [selected, legalMoves, onMove]);

  // Memoize squares to prevent unnecessary re-renders
  const squares = useMemo(() => {
    return parseFen(fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  }, [fen]);
  const last = lastMove ? lastMove.toLowerCase() : '';
  const currentTheme = BOARD_THEMES[theme] || BOARD_THEMES[0];
  
  // Detect check using current FEN to avoid stale state
  const checkBoard = useMemo(() => {
    try {
      return new Chess(fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    } catch {
      return null;
    }
  }, [fen]);

  const isInCheck = useMemo(() => {
    if (!checkBoard) return false;
    return checkBoard.inCheck();
  }, [checkBoard]);
  
  const kingSquare = useMemo(() => {
    if (!checkBoard || !isInCheck) return null;
    const turn = checkBoard.turn();
    const board = checkBoard.board();
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        const piece = board[i][j];
        if (piece && piece.type === 'k' && piece.color === turn) {
          const file = String.fromCharCode(97 + j);
          const rank = 8 - i;
          return file + rank;
        }
      }
    }
    return null;
  }, [checkBoard, isInCheck]);

  const getMoveMeta = useCallback(
    (from: string, to: string) => {
      if (!chessRef.current) return { isLegal: false, promotionNeeded: false };
      const moves = chessRef.current.moves({ square: from as any, verbose: true }) as any[];
      const targets = moves.filter((m) => m.to === to);
      if (targets.length === 0) {
        return { isLegal: false, promotionNeeded: false };
      }
      const promotionNeeded = targets.some((m) => Boolean(m.promotion) || (m.flags && m.flags.includes('p')));
      return { isLegal: true, promotionNeeded };
    },
    []
  );

  // Get square coordinates based on orientation
  const getSquareCoords = (idx: number) => {
    const row = Math.floor(idx / 8);
    const col = idx % 8;
    if (orientation === 'black') {
      return { row: 7 - row, col: 7 - col };
    }
    return { row, col };
  };

  const getCoordFromIndex = (idx: number) => {
    const { row, col } = getSquareCoords(idx);
    return String.fromCharCode(97 + col) + (8 - row);
  };

  const getDisplayCoordsFromCoord = useCallback(
    (coord: string) => {
      const file = coord.charCodeAt(0) - 97;
      const rank = Number(coord[1]);
      const baseRow = 8 - rank;
      const baseCol = file;
      if (orientation === 'black') {
        return { row: 7 - baseRow, col: 7 - baseCol };
      }
      return { row: baseRow, col: baseCol };
    },
    [orientation]
  );

  const promotionOptions = useMemo(() => {
    const source = promotionPending || promotionPreview;
    if (!source) return [];
    const base = getDisplayCoordsFromCoord(source.to);
    const isSideBottom =
      (source.isWhite && orientation === 'white') ||
      (!source.isWhite && orientation === 'black');
    const direction = isSideBottom ? 1 : -1;

    const file = source.to[0];
    return PROMOTION_PIECES.map((piece, idx) => {
      const row = base.row + idx * direction;
      const col = base.col;
      if (row < 0 || row > 7 || col < 0 || col > 7) return null;
      const isDark = (row + col) % 2 === 1;
      return {
        file,
        piece,
        pieceChar: source.isWhite ? piece.toUpperCase() : piece,
        row,
        col,
        background: isDark ? currentTheme.dark : currentTheme.light
      };
    }).filter(Boolean) as Array<{
      piece: (typeof PROMOTION_PIECES)[number];
      pieceChar: string;
      row: number;
      col: number;
      background: string;
    }>;
  }, [promotionPending, getDisplayCoordsFromCoord, orientation, currentTheme]);

  const handleSquareClick = useCallback((coord: string, pieceType: string | null) => {
    if (!onMove) return;
    if (promotionPending) return;
    if (promotionPreview) return;

    if (!selected) {
      // Select piece if it's the player's turn
      if (pieceType) {
        const isWhitePiece = pieceType === pieceType.toUpperCase();
        const turn = chessRef.current?.turn();
        if ((turn === 'w' && isWhitePiece) || (turn === 'b' && !isWhitePiece)) {
      setSelected(coord);
        }
      }
    } else {
      if (coord === selected) {
        // Deselect if clicking the same square
        setSelected(null);
        return;
      }
      
      // If clicking on another piece of the same color, select that instead
      if (pieceType) {
        const isWhitePiece = pieceType === pieceType.toUpperCase();
        const turn = chessRef.current?.turn();
        if ((turn === 'w' && isWhitePiece) || (turn === 'b' && !isWhitePiece)) {
          setSelected(coord);
          return;
        }
      }
      
      // Validate move with chess.js before submitting
      const moveStr = `${selected}${coord}`;

      // Double-check chess.js board is initialized and in sync
      if (!chessRef.current) {
        setSelected(null);
        return;
      }

      // Verify it's the correct turn
      const currentTurn = chessRef.current.turn();
      const square = squares.find(s => s.coord === selected);
      if (!square || !square.pieceType) {
        setSelected(null);
        return;
      }
      const isWhitePiece = square.pieceType === square.pieceType.toUpperCase();
      
      // Strict turn validation
      if ((currentTurn === 'w' && !isWhitePiece) || (currentTurn === 'b' && isWhitePiece)) {
        // Wrong turn, don't submit
        console.warn('Move rejected: wrong turn', { currentTurn, isWhitePiece, selected, coord });
        setSelected(null);
        return;
      }

      const { isLegal, promotionNeeded } = getMoveMeta(selected, coord);
      if (!isLegal) {
        console.warn('Move rejected: invalid move', { selected, coord });
        setSelected(null);
        return;
      }
      
      // Check if promotion is needed (pawn to last rank)
      let finalMove = moveStr;
      if (promotionNeeded && square?.pieceType) {
        setPromotionPreview({ from: selected, to: coord, isWhite: square.pieceType === square.pieceType.toUpperCase() });
        return;
      }
      
      // Call onMove callback
      // Store the move so we know to clear selection when FEN updates
      pendingMoveRef.current = { from: selected, to: coord };
      
      try {
        onMove(finalMove);
        // Don't clear selected/validMoves immediately - let FEN update handle it
        // The FEN update useEffect will handle clearing them after a delay
      } catch (err) {
        console.error('Move failed:', err);
        // Only clear on error
        pendingMoveRef.current = null;
        setSelected(null);
        setValidMoves([]);
      }
      
      // Don't clear selected here - let FEN update handle it
      // Keep draggedPiece visible until FEN updates
    }
  }, [onMove, selected, squares]);

  const handleDragStart = useCallback((e: React.DragEvent | React.TouchEvent, coord: string, piece: string, pieceType: string) => {
    if (!onMove) return;
    
    const square = squares.find(s => s.coord === coord);
    if (!square || !square.piece) return;

    const isWhitePiece = pieceType === pieceType.toUpperCase();
    const turn = chessRef.current?.turn();
    if ((turn === 'w' && !isWhitePiece) || (turn === 'b' && isWhitePiece)) {
      return; // Not player's piece
    }

    setWasDragged(true);
    activeDragRef.current = { coord, piece, pieceType };
    setDraggedPiece({ coord, piece, pieceType });
    setSelected(coord);

    wasDraggedRef.current = true;
    if ('touches' in e) {
      e.preventDefault();
      const touch = e.touches[0];
      const rect = boardRef.current?.getBoundingClientRect();
      if (rect) {
        setDragOffset({
          x: touch.clientX - rect.left,
          y: touch.clientY - rect.top
        });
      }
    } else {
      // For mouse drag, set initial drag offset
      const rect = boardRef.current?.getBoundingClientRect();
      if (rect) {
        setDragOffset({
          x: (e as React.DragEvent).clientX - rect.left,
          y: (e as React.DragEvent).clientY - rect.top
        });
      }
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', '');
      // Hide the default drag image
      const img = new Image();
      img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
      e.dataTransfer.setDragImage(img, 0, 0);
    }
  }, [onMove, squares]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, coord: string, piece: string, pieceType: string) => {
      if (!onMove) return;
      if (promotionPending) return;
      if (promotionPreview) return;
      if (e.button !== 0) return;
      e.preventDefault();

      const square = squares.find(s => s.coord === coord);
      if (!square || !square.piece) return;

      const isWhitePiece = pieceType === pieceType.toUpperCase();
      const turn = chessRef.current?.turn();
      if ((turn === 'w' && !isWhitePiece) || (turn === 'b' && isWhitePiece)) {
        return; // Not player's piece
      }

      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        coord,
        piece,
        pieceType
      };
      dropHandledRef.current = false;
      activeDragRef.current = { coord, piece, pieceType };
      setDraggedPiece({ coord, piece, pieceType });
      setSelected(coord);
      setWasDragged(false);
      wasDraggedRef.current = false;

      if (boardRef.current) {
        const rect = boardRef.current.getBoundingClientRect();
        const boardX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
        const boardY = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
        setDragOffset({ x: boardX, y: boardY });
      }
    },
    [onMove, squares, promotionPending, promotionPreview]
  );


  const handleDrop = useCallback(
    (
      e: React.DragEvent | React.TouchEvent,
      targetCoord: string,
      overrideDrag?: { coord: string; piece: string; pieceType: string } | null
    ) => {
      e.preventDefault();
      e.stopPropagation();

      const activeDrag = overrideDrag || draggedPiece || activeDragRef.current;

      const clearDragState = () => {
        setDraggedPiece(null);
        setSelected(null);
        setWasDragged(false);
        setDragOffset(null);
        activeDragRef.current = null;
        wasDraggedRef.current = false;
      };

      if (!activeDrag || !onMove) {
        clearDragState();
        return;
      }
      if (promotionPending) return;
      if (promotionPreview) return;

      if (targetCoord === activeDrag.coord) {
        clearDragState();
        return;
      }

      const moveStr = `${activeDrag.coord}${targetCoord}`;

      if (!chessRef.current) {
        clearDragState();
        return;
      }

      const currentTurn = chessRef.current.turn();
      const square = squares.find(s => s.coord === activeDrag.coord);
      if (!square || !square.pieceType) {
        clearDragState();
        return;
      }
      const isWhitePiece = square.pieceType === square.pieceType.toUpperCase();

      if ((currentTurn === 'w' && !isWhitePiece) || (currentTurn === 'b' && isWhitePiece)) {
        console.warn('Move rejected: wrong turn', { currentTurn, isWhitePiece, from: activeDrag.coord, to: targetCoord });
        clearDragState();
        return;
      }

      const isPawn = square?.pieceType?.toLowerCase() === 'p';
      const targetRank = targetCoord[1];
      const promotionNeeded =
        isPawn && ((isWhitePiece && targetRank === '8') || (!isWhitePiece && targetRank === '1'));

      let finalMove = moveStr;
      if (promotionNeeded && square?.pieceType) {
        clearDragState();
        setPromotionPending({ from: activeDrag.coord, to: targetCoord, isWhite: square.pieceType === square.pieceType.toUpperCase() });
        return;
      }

      pendingMoveRef.current = { from: activeDrag.coord, to: targetCoord };

      try {
        onMove(finalMove);
      } catch (err) {
        console.error('Move failed:', err);
        pendingMoveRef.current = null;
      }

      clearDragState();
    },
    [draggedPiece, onMove, squares, promotionPending, promotionPreview]
  );

  // Global mouse handlers for drag tracking (pointer-based, no HTML5 drag)
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!boardRef.current || !draggedPiece) return;

      const rect = boardRef.current.getBoundingClientRect();
      const boardX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
      const boardY = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
      setDragOffset({ x: boardX, y: boardY });

      const start = dragStartRef.current;
      if (!wasDraggedRef.current && start) {
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        if (Math.hypot(dx, dy) >= 2) {
          wasDraggedRef.current = true;
          setWasDragged(true);
        }
      }
    };

    const handleGlobalMouseUp = (e: MouseEvent) => {
      const activeDrag = activeDragRef.current || draggedPiece || null;
      if (!activeDrag || !boardRef.current) {
        dragStartRef.current = null;
        setWasDragged(false);
        setDragOffset(null);
        wasDraggedRef.current = false;
        return;
      }

      const rect = boardRef.current.getBoundingClientRect();
      const within =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;

      if (!within) {
        setDraggedPiece(null);
        setSelected(null);
        setWasDragged(false);
        setDragOffset(null);
        activeDragRef.current = null;
        dragStartRef.current = null;
        wasDraggedRef.current = false;
        dropHandledRef.current = false;
      }
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [draggedPiece, wasDragged, orientation, handleDrop]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!draggedPiece || !boardRef.current) return;
    e.preventDefault();
    const touch = e.touches[0];
    const rect = boardRef.current.getBoundingClientRect();
    setDragOffset({
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top
    });
  }, [draggedPiece]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!draggedPiece || !boardRef.current) {
      setDraggedPiece(null);
      setDragOffset(null);
      setSelected(null);
      return;
    }
    
    e.preventDefault();
    e.stopPropagation();
    const touch = e.changedTouches[0];
    const rect = boardRef.current.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    
    // Calculate which square was touched
    const squareSize = rect.width / 8;
    let col = Math.floor(x / squareSize);
    let row = Math.floor(y / squareSize);
    
    // Clamp to valid range
    col = Math.max(0, Math.min(7, col));
    row = Math.max(0, Math.min(7, row));
    
    // Calculate target coordinate based on orientation
    let targetCoord: string;
    if (orientation === 'black') {
      // Board is reversed, so invert coordinates
      const file = 7 - col;
      const rank = 8 - row;
      targetCoord = String.fromCharCode(97 + file) + rank;
    } else {
      const file = col;
      const rank = 8 - row;
      targetCoord = String.fromCharCode(97 + file) + rank;
    }
    
    handleDrop(e, targetCoord);
  }, [draggedPiece, orientation, handleDrop]);

  // Create display squares based on orientation - reverse for black
  const displaySquares = useMemo(() => {
    if (orientation === 'black') {
      // Reverse the entire array to flip the board
      return [...squares].reverse();
    }
    return squares;
  }, [squares, orientation]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'stretch', width: '100%', height: '100%', minHeight: 0, justifyContent: 'center' }}>
      <style>{`
        .chess-square[data-interactive="true"]:hover .chess-piece {
          transform: scale(1.08);
        }
        .chess-square[data-interactive="true"]:hover .chess-hover {
          opacity: 1;
        }
      `}</style>
      {showControls && (onThemeChange || onPieceSetChange) && (
        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            justifyContent: 'center',
            marginBottom: 4,
            flexShrink: 0,
            alignItems: 'center',
            position: 'relative',
            zIndex: 5
          }}
        >
          {onThemeChange && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <label style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 500 }}>Board:</label>
              <select
                value={theme}
                onChange={(e) => onThemeChange(Number(e.target.value))}
                style={{
                  padding: '4px 8px',
                  fontSize: 11,
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                  color: 'var(--text)',
                  cursor: 'pointer',
                  minWidth: 100,
                  width: 'auto',
                  maxWidth: 180,
                  appearance: 'auto'
                }}
              >
                {BOARD_THEMES.map((t, idx) => (
                  <option key={idx} value={idx}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {onPieceSetChange && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <label style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 500 }}>Pieces:</label>
              <select
                value={pieceSet}
                onChange={(e) => onPieceSetChange(e.target.value)}
                style={{
                  padding: '4px 8px',
                  fontSize: 11,
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                  color: 'var(--text)',
                  cursor: 'pointer',
                  minWidth: 120,
                  width: 'auto',
                  maxWidth: 200,
                  appearance: 'auto'
                }}
              >
                {PIECE_SETS.map((ps) => (
                  <option key={ps.value} value={ps.value}>
                    {ps.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
      <div ref={containerRef} style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', padding: 0, position: 'relative' }}>
        <div
          ref={boardRef}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(8, 1fr)',
            gridTemplateRows: 'repeat(8, 1fr)',
            width: `${boardSize}px`,
            height: `${boardSize}px`,
            borderRadius: 8,
            overflow: 'hidden',
            border: '3px solid rgba(255, 255, 255, 0.1)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 0 0 1px rgba(255, 255, 255, 0.05)',
            position: 'relative',
            userSelect: 'none',
            boxSizing: 'border-box',
            background: 'rgba(0, 0, 0, 0.2)',
            flexShrink: 0
          }}
        >
          {(promotionPending || promotionPreview) && (
            <div
              onClick={() => {
                setPromotionPending(null);
                setPromotionPreview(null);
                setPromotionHover(null);
              }}
              onMouseMove={(e) => {
                if (!promotionPreview) return;
                const rect = boardRef.current?.getBoundingClientRect();
                if (!rect) return;
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
                  setPromotionHover(null);
                  return;
                }
                const col = Math.floor((x / rect.width) * 8);
                const row = Math.floor((y / rect.height) * 8);
                const hit = promotionOptions.find((opt) => opt.row === row && opt.col === col);
                setPromotionHover(hit ? hit.piece : null);
              }}
              onMouseLeave={() => setPromotionHover(null)}
              onMouseUp={(e) => {
                if (!promotionPreview) return;
                const rect = boardRef.current?.getBoundingClientRect();
                if (!rect) return;
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
                  setPromotionPreview(null);
                  setPromotionHover(null);
                  return;
                }
                const col = Math.floor((x / rect.width) * 8);
                const row = Math.floor((y / rect.height) * 8);
                const hit = promotionOptions.find((opt) => opt.row === row && opt.col === col);
                if (!hit) return;
                const pieceChar = promotionPreview.isWhite ? hit.piece.toUpperCase() : hit.piece;
                const move = `${promotionPreview.from}${promotionPreview.to}${pieceChar}`;
                pendingMoveRef.current = { from: promotionPreview.from, to: promotionPreview.to };
                setPromotionPreview(null);
                setPromotionHover(null);
                try {
                  onMove?.(move);
                } catch (err) {
                  console.error('Promotion move failed:', err);
                }
              }}
              style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(8, 10, 16, 0.35)',
                zIndex: 20
              }}
            >
              {promotionOptions.map((option) => (
                <button
                  key={option.piece}
                  onClick={(e) => {
                    e.stopPropagation();
                    const source = promotionPending || promotionPreview;
                    if (!source) return;
                    const move = `${source.from}${source.to}${option.pieceChar}`;
                    pendingMoveRef.current = { from: source.from, to: source.to };
                    setPromotionPending(null);
                    setPromotionPreview(null);
                    setPromotionHover(null);
                    try {
                      onMove?.(move);
                    } catch (err) {
                      console.error('Promotion move failed:', err);
                    }
                  }}
                  onMouseEnter={() => setPromotionHover(option.piece)}
                  onMouseLeave={() => setPromotionHover(null)}
                  onTouchStart={() => setPromotionHover(option.piece)}
                  style={{
                    position: 'absolute',
                    top: `${option.row * 12.5}%`,
                    left: `${option.col * 12.5}%`,
                    width: '12.5%',
                    height: '12.5%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: promotionHover === option.piece
                      ? '2px solid rgba(255,255,255,0.65)'
                      : '1px solid rgba(255,255,255,0.2)',
                    background: promotionHover === option.piece
                      ? 'rgba(255,255,255,0.12)'
                      : option.background,
                    cursor: 'pointer',
                    boxShadow: promotionHover === option.piece
                      ? 'inset 0 0 0 2px rgba(255,255,255,0.25), 0 10px 24px rgba(0,0,0,0.45)'
                      : 'inset 0 0 0 2px rgba(0,0,0,0.15), 0 6px 16px rgba(0,0,0,0.35)',
                    padding: 0,
                    transition: 'transform 120ms ease, box-shadow 120ms ease, border 120ms ease, background 120ms ease',
                    transform: promotionHover === option.piece ? 'scale(1.04)' : 'scale(1)'
                  }}
                  aria-label={`Promote to ${option.piece}`}
                >
                  <ChessPiece
                    piece={option.pieceChar}
                    size={Math.max(32, Math.floor(squareSize * (promotionHover === option.piece ? 0.98 : 0.9)))}
                    color={option.pieceChar === option.pieceChar.toUpperCase() ? 'white' : 'black'}
                    pieceSet={pieceSet}
                  />
                </button>
              ))}
              {(promotionPending || promotionPreview) && (
                <div
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: `${(promotionOptions[0]?.col ?? 0) * 12.5}%`,
                    width: '12.5%',
                    height: '100%',
                    background: 'linear-gradient(180deg, rgba(255,255,255,0.08), rgba(0,0,0,0.12))',
                    opacity: 0.45,
                    pointerEvents: 'none'
                  }}
                />
              )}
            </div>
          )}
        {displaySquares.map((sq: Square, idx: number) => {
          const isSelected = selected === sq.coord;
          const isValidMove = validMoves.includes(sq.coord);
          const isLastMoveFrom = last && last.startsWith(sq.coord);
          const isLastMoveTo = last && last.endsWith(sq.coord);
          const isDragging = wasDragged && draggedPiece?.coord === sq.coord;

          return (
            <div
              key={sq.coord}
              onMouseDown={(e) => {
                if (sq.piece && sq.pieceType) {
                  handleMouseDown(e, sq.coord, sq.piece, sq.pieceType);
                }
              }}
              onMouseUp={(e) => {
                const activeDrag = activeDragRef.current || draggedPiece;
                if (!activeDrag) return;
                if (promotionPending || promotionPreview) return;
                dropHandledRef.current = true;
                handleDrop(e as unknown as React.DragEvent, sq.coord, activeDrag);
              }}
              onTouchStart={(e) => sq.piece && sq.pieceType && handleDragStart(e, sq.coord, sq.piece, sq.pieceType)}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              className="chess-square"
              data-interactive={onMove ? 'true' : 'false'}
          style={{
                background: isValidMove
                  ? sq.color === 'dark'
                    ? MOVE_SUGGESTION.dark
                    : MOVE_SUGGESTION.light
                  : kingSquare === sq.coord && isInCheck
                  ? sq.color === 'dark'
                    ? 'rgba(255, 0, 0, 0.6)'
                    : 'rgba(255, 0, 0, 0.5)'
                  : sq.color === 'dark'
                  ? currentTheme.dark
                  : currentTheme.light,
            outline:
                  isSelected
                    ? '3px solid #1d8bff'
                    : kingSquare === sq.coord && isInCheck
                    ? '3px solid #ff0000'
                : 'none',
                outlineOffset: '-2px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
                cursor: onMove && sq.piece ? 'grab' : onMove ? 'pointer' : 'default',
                transition: 'background 200ms cubic-bezier(0.4, 0, 0.2, 1), outline 200ms cubic-bezier(0.4, 0, 0.2, 1), transform 150ms cubic-bezier(0.4, 0, 0.2, 1)',
                position: 'relative',
                opacity: 1,
                aspectRatio: '1 / 1',
                minWidth: 0,
                minHeight: 0,
                boxSizing: 'border-box',
                transform: isSelected ? 'scale(0.97)' : 'scale(1)',
                willChange: isSelected || isValidMove ? 'transform, background' : 'auto'
              }}
              onClick={(e) => {
                // Don't trigger click if we just completed a drag
                if (wasDraggedRef.current || wasDragged) {
                  wasDraggedRef.current = false;
                  setWasDragged(false);
                  return;
                }
                e.preventDefault();
                e.stopPropagation();
                handleSquareClick(sq.coord, sq.pieceType ?? null);
              }}
            >
              {(isLastMoveFrom || isLastMoveTo) && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: sq.color === 'dark' ? LAST_MOVE_HIGHLIGHT.dark : LAST_MOVE_HIGHLIGHT.light,
                    pointerEvents: 'none'
                  }}
                />
              )}
              {sq.piece && sq.pieceType && (
                <div
                  style={{
                    transition: 'transform 150ms cubic-bezier(0.4, 0, 0.2, 1)',
                    transform: 'scale(1)',
                    cursor: onMove ? (isDragging ? 'grabbing' : 'grab') : 'default',
                    opacity: isDragging ? 0 : 1,
                    pointerEvents: 'none'
                  }}
                  className="chess-piece"
                >
                  <ChessPiece 
                    piece={sq.pieceType} 
                    size={pieceSize}
                    color={sq.pieceType === sq.pieceType.toUpperCase() ? 'white' : 'black'}
                    pieceSet={pieceSet}
                  />
                </div>
              )}
              {isValidMove && !sq.piece && (
                <div
                  style={{
                    position: 'absolute',
                    width: '40%',
                    height: '40%',
                    borderRadius: '50%',
                    background: sq.color === 'dark' 
                      ? MOVE_SUGGESTION.dotDark
                      : MOVE_SUGGESTION.dotLight,
                    pointerEvents: 'none',
                    boxShadow: '0 3px 6px rgba(0,0,0,0.2), inset 0 1px 2px rgba(255,255,255,0.2)',
                    animation: 'fadeIn 150ms ease-out'
                  }}
                />
              )}
              {isValidMove && sq.piece && (
                <div
                  style={{
                    position: 'absolute',
                    inset: '6%',
                    borderRadius: '50%',
                    outline: `4px solid ${MOVE_SUGGESTION.ring}`,
                    outlineOffset: '-4px',
                    pointerEvents: 'none',
                    boxShadow: '0 3px 8px rgba(0,0,0,0.25), inset 0 1px 2px rgba(255,255,255,0.15)',
                    animation: 'fadeIn 150ms ease-out'
                  }}
                />
              )}
              {sq.piece && onMove && !isDragging && (
                <div
                  className="chess-hover"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: sq.color === 'dark'
                      ? 'rgba(255, 255, 255, 0.1)'
                      : 'rgba(0, 0, 0, 0.05)',
                    pointerEvents: 'none',
                    opacity: 0,
                    transition: 'opacity 150ms ease'
                  }}
                />
              )}
              {kingSquare === sq.coord && isInCheck && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(255,0,0,0.3) 0%, transparent 70%)',
                    pointerEvents: 'none',
                    animation: 'pulse 1s ease-in-out infinite'
                  }}
                />
              )}
              {/* File and rank labels - Lichess style */}
              {((orientation === 'white' && (idx % 8 === 0 || idx >= 56)) || 
                (orientation === 'black' && ((idx % 8 === 7) || idx < 8))) && (
                <span
                  style={{
                    position: 'absolute',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: sq.color === 'dark' ? currentTheme.light : currentTheme.dark,
                    opacity: 0.85,
                    textShadow: sq.color === 'dark' 
                      ? '0 1px 2px rgba(0,0,0,0.3)' 
                      : '0 1px 2px rgba(255,255,255,0.5)',
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                    letterSpacing: '0.5px',
                    ...(orientation === 'white' 
                      ? { ...(idx % 8 === 0 ? { left: 5, bottom: 3 } : {}), ...(idx >= 56 ? { right: 5, top: 3 } : {}) }
                      : { ...(idx % 8 === 7 ? { right: 5, top: 3 } : {}), ...(idx < 8 ? { left: 5, bottom: 3 } : {}) }
                    )
                  }}
                >
                  {orientation === 'white' 
                    ? (idx % 8 === 0 && String(8 - Math.floor(idx / 8))) || (idx >= 56 && String.fromCharCode(97 + (idx % 8)))
                    : (idx % 8 === 7 && String(Math.floor(idx / 8) + 1)) || (idx < 8 && String.fromCharCode(97 + (7 - (idx % 8))))
                  }
                </span>
              )}
            </div>
          );
        })}
        </div>
      </div>
      {/* Ghost piece during drag - Lichess style - Only show when actually dragging */}
              {draggedPiece && dragOffset && wasDragged && boardRef.current && (
        <div
          style={{
            position: 'fixed',
            left: `${Math.max(
              0,
              Math.min(
                window.innerWidth - ghostPieceSize,
                dragOffset.x + boardRef.current.getBoundingClientRect().left - ghostPieceSize / 2
              )
            )}px`,
            top: `${Math.max(
              0,
              Math.min(
                window.innerHeight - ghostPieceSize,
                dragOffset.y + boardRef.current.getBoundingClientRect().top - ghostPieceSize / 2
              )
            )}px`,
            pointerEvents: 'none',
            zIndex: 10000,
            filter: 'drop-shadow(0 6px 12px rgba(0,0,0,0.6)) drop-shadow(0 2px 4px rgba(0,0,0,0.4))',
            opacity: 0.95,
            transform: 'scale(1.1)',
            transition: 'none', // No transition during drag for smooth following
            willChange: 'transform, left, top'
          }}
        >
          <ChessPiece 
            piece={draggedPiece.pieceType} 
            size={ghostPieceSize}
            color={draggedPiece.pieceType === draggedPiece.pieceType.toUpperCase() ? 'white' : 'black'}
            pieceSet={pieceSet}
          />
        </div>
      )}
    </div>
  );
});
