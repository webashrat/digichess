import { memo, useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Chess } from 'chess.js';
import { ChessPiece } from './ChessPieces';
import { BOARD_THEMES, PIECE_SETS } from '../utils/boardPresets';

type Square = { piece: string | null; color: 'light' | 'dark'; coord: string; pieceType?: string };

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
  
  // Global mouse move handler for drag tracking
  useEffect(() => {
    if (!draggedPiece || !wasDragged) return;
    
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (draggedPiece && boardRef.current) {
        const rect = boardRef.current.getBoundingClientRect();
        // Constrain to board bounds to prevent shadow appearing outside
        const boardX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
        const boardY = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
        setDragOffset({
          x: boardX,
          y: boardY
        });
      }
    };
    
    window.addEventListener('mousemove', handleGlobalMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
    };
  }, [draggedPiece, wasDragged]);
  
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
  
  // Detect check
  const isInCheck = useMemo(() => {
    if (!chessRef.current) return false;
    return chessRef.current.inCheck();
  }, [fen]);
  
  const kingSquare = useMemo(() => {
    if (!chessRef.current || !isInCheck) return null;
    const turn = chessRef.current.turn();
    const board = chessRef.current.board();
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
  }, [fen, isInCheck]);

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

  const handleSquareClick = useCallback((coord: string, pieceType: string | null) => {
    if (!onMove) return;

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
        setPromotionPending({ from: selected, to: coord, isWhite: square.pieceType === square.pieceType.toUpperCase() });
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
    setDraggedPiece({ coord, piece, pieceType });
    setSelected(coord);

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


  const handleDrop = useCallback((e: React.DragEvent | React.TouchEvent, targetCoord: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!draggedPiece || !onMove) {
      // Clear dragged piece state
      setDraggedPiece(null);
      setSelected(null);
      setWasDragged(false);
      return;
    }

    if (targetCoord === draggedPiece.coord) {
      // Clear dragged piece state
      setDraggedPiece(null);
      setSelected(null);
      setWasDragged(false);
      return;
    }

      // Validate move with chess.js before submitting
      const moveStr = `${draggedPiece.coord}${targetCoord}`;

      // Double-check chess.js board is initialized and in sync
      if (!chessRef.current) {
        // Clear dragged piece state
        setDraggedPiece(null);
        setSelected(null);
        setWasDragged(false);
        return;
      }
      
      // Verify it's the correct turn
      const currentTurn = chessRef.current.turn();
      const square = squares.find(s => s.coord === draggedPiece.coord);
      if (!square || !square.pieceType) {
        setDraggedPiece(null);
        setSelected(null);
        setWasDragged(false);
        return;
      }
      const isWhitePiece = square.pieceType === square.pieceType.toUpperCase();
      
      // Strict turn validation
      if ((currentTurn === 'w' && !isWhitePiece) || (currentTurn === 'b' && isWhitePiece)) {
        // Wrong turn, don't submit
        console.warn('Move rejected: wrong turn', { currentTurn, isWhitePiece, from: draggedPiece.coord, to: targetCoord });
        setDraggedPiece(null);
        setSelected(null);
        setWasDragged(false);
        return;
      }

      const { isLegal, promotionNeeded } = getMoveMeta(draggedPiece.coord, targetCoord);
      if (!isLegal) {
        console.warn('Move rejected: invalid move', { from: draggedPiece.coord, to: targetCoord });
        setDraggedPiece(null);
        setSelected(null);
        setWasDragged(false);
        return;
      }

      const square = squares.find(s => s.coord === draggedPiece.coord);
      
      // Handle promotion
      let finalMove = moveStr;
      if (promotionNeeded && square?.pieceType) {
        setDraggedPiece(null);
        setSelected(null);
        setWasDragged(false);
        setPromotionPending({ from: draggedPiece.coord, to: targetCoord, isWhite: square.pieceType === square.pieceType.toUpperCase() });
        return;
      }
      
      // Call onMove callback
      try {
      onMove(finalMove);
    } catch (err) {
      console.error('Move failed:', err);
    }

    setDraggedPiece(null);
    setSelected(null);
    setWasDragged(false);
  }, [draggedPiece, onMove, squares, orientation, boardRef]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
  }, []);

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
          {promotionPending && (
            <div
              onClick={() => setPromotionPending(null)}
              style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(8, 10, 16, 0.6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 20
              }}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  display: 'flex',
                  gap: 12,
                  padding: 14,
                  borderRadius: 12,
                  background: 'rgba(12, 18, 28, 0.95)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  boxShadow: '0 12px 28px rgba(0,0,0,0.45)',
                }}
              >
                {(['q', 'r', 'b', 'n'] as const).map((piece) => {
                  const pieceChar = promotionPending.isWhite ? piece.toUpperCase() : piece;
                  return (
                    <button
                      key={piece}
                      onClick={() => {
                        const move = `${promotionPending.from}${promotionPending.to}${pieceChar}`;
                        pendingMoveRef.current = { from: promotionPending.from, to: promotionPending.to };
                        setPromotionPending(null);
                        try {
                          onMove?.(move);
                        } catch (err) {
                          console.error('Promotion move failed:', err);
                        }
                      }}
                      style={{
                        width: ghostPieceSize,
                        height: ghostPieceSize,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 10,
                        border: '1px solid rgba(255,255,255,0.12)',
                        background: 'rgba(255,255,255,0.04)',
                        cursor: 'pointer',
                      }}
                      aria-label={`Promote to ${piece}`}
                    >
                      <ChessPiece piece={pieceChar} size={Math.max(32, Math.floor(ghostPieceSize * 0.9))} set={pieceSet} />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        {displaySquares.map((sq: Square, idx: number) => {
          const isSelected = selected === sq.coord;
          const isValidMove = validMoves.includes(sq.coord);
          const isLastMoveFrom = last && last.startsWith(sq.coord);
          const isLastMoveTo = last && last.endsWith(sq.coord);
          const isDragging = draggedPiece?.coord === sq.coord;

          return (
            <div
              key={sq.coord}
              draggable={!!sq.piece && !!onMove && !isDragging}
              onDragStart={(e) => {
                if (sq.piece && sq.pieceType) {
                  handleDragStart(e, sq.coord, sq.piece, sq.pieceType);
                }
              }}
              onDrag={(e) => {
                // Update drag offset during mouse drag
                if (draggedPiece && boardRef.current) {
                  const rect = boardRef.current.getBoundingClientRect();
                  setDragOffset({
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top
                  });
                }
              }}
              onDragEnd={(e) => {
                // Clear drag state immediately
                setDraggedPiece(null);
                setSelected(null);
                setWasDragged(false);
                setDragOffset(null);
              }}
              onDragOver={handleDragOver}
              onDrop={(e) => {
                handleDrop(e, sq.coord);
                // Clear drag state after drop
                setDraggedPiece(null);
                setDragOffset(null);
                setWasDragged(false);
              }}
              onTouchStart={(e) => sq.piece && sq.pieceType && handleDragStart(e, sq.coord, sq.piece, sq.pieceType)}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              className="chess-square"
              data-interactive={onMove ? 'true' : 'false'}
          style={{
                background: isValidMove
                  ? sq.color === 'dark'
                    ? 'rgba(44, 230, 194, 0.5)'
                    : 'rgba(44, 230, 194, 0.4)'
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
                    : isLastMoveFrom || isLastMoveTo
                ? '2px solid #f0ad4e'
                : 'none',
                outlineOffset: '-2px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
                cursor: onMove && sq.piece ? 'grab' : onMove ? 'pointer' : 'default',
                transition: 'background 200ms cubic-bezier(0.4, 0, 0.2, 1), outline 200ms cubic-bezier(0.4, 0, 0.2, 1), transform 150ms cubic-bezier(0.4, 0, 0.2, 1)',
                position: 'relative',
                opacity: isDragging ? 0.4 : 1,
                aspectRatio: '1 / 1',
                minWidth: 0,
                minHeight: 0,
                boxSizing: 'border-box',
                transform: isSelected ? 'scale(0.97)' : 'scale(1)',
                willChange: isSelected || isValidMove ? 'transform, background' : 'auto'
              }}
              onClick={(e) => {
                // Don't trigger click if we just completed a drag
                if (wasDragged) {
                  setWasDragged(false);
                  return;
                }
                e.preventDefault();
                e.stopPropagation();
                handleSquareClick(sq.coord, sq.pieceType ?? null);
              }}
            >
              {sq.piece && sq.pieceType && (
                <div
                  style={{
                    transition: 'transform 150ms cubic-bezier(0.4, 0, 0.2, 1)',
                    transform: 'scale(1)',
                    cursor: onMove ? 'grab' : 'default'
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
                      ? 'rgba(44, 230, 194, 0.85)' 
                      : 'rgba(44, 230, 194, 0.75)',
                    pointerEvents: 'none',
                    boxShadow: '0 3px 6px rgba(0,0,0,0.25), inset 0 1px 2px rgba(255,255,255,0.2)',
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
                    outline: '4px solid rgba(44, 230, 194, 0.95)',
                    outlineOffset: '-4px',
                    pointerEvents: 'none',
                    boxShadow: '0 3px 8px rgba(0,0,0,0.3), inset 0 1px 2px rgba(255,255,255,0.15)',
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
