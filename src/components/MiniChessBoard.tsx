import { useMemo } from 'react';
import { ChessPiece } from './ChessPieces';
import { BOARD_THEMES } from '../utils/boardPresets';

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
          piece: ch,
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

export default function MiniChessBoard({
  fen,
  size = 120,
  orientation = 'white',
  theme,
  pieceSet
}: {
  fen?: string;
  size?: number;
  orientation?: 'white' | 'black';
  theme?: number;
  pieceSet?: string;
}) {
  const resolvedTheme = useMemo(() => {
    if (typeof theme === 'number') return theme;
    if (typeof localStorage === 'undefined') return 6;
    const stored = Number(localStorage.getItem('boardTheme'));
    return Number.isFinite(stored) ? stored : 6;
  }, [theme]);
  const resolvedPieceSet = useMemo(() => {
    if (pieceSet) return pieceSet;
    if (typeof localStorage === 'undefined') return 'cburnett';
    return localStorage.getItem('pieceSet') || 'cburnett';
  }, [pieceSet]);
  const squares = useMemo(() => parseFen(fen), [fen]);
  const displaySquares = useMemo(() => {
    return orientation === 'black' ? [...squares].reverse() : squares;
  }, [squares, orientation]);
  const squareSize = size / 8;
  const pieceSize = Math.max(10, Math.floor(squareSize * 0.82));
  const currentTheme = BOARD_THEMES[resolvedTheme] || BOARD_THEMES[6] || BOARD_THEMES[0];

  return (
    <div
      style={{
        width: size,
        height: size,
        display: 'grid',
        gridTemplateColumns: 'repeat(8, 1fr)',
        gridTemplateRows: 'repeat(8, 1fr)',
        borderRadius: 6,
        overflow: 'hidden',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        background: 'rgba(8, 12, 20, 0.7)'
      }}
      aria-hidden="true"
    >
      {displaySquares.map((sq) => (
        <div
          key={sq.coord}
          style={{
            background: sq.color === 'dark' ? currentTheme.dark : currentTheme.light,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          {sq.pieceType && (
            <ChessPiece
              piece={sq.pieceType}
              size={pieceSize}
              color={sq.pieceType === sq.pieceType.toUpperCase() ? 'white' : 'black'}
              pieceSet={resolvedPieceSet}
            />
          )}
        </div>
      ))}
    </div>
  );
}
