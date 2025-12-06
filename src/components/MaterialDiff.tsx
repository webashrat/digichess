import { useMemo } from 'react';
import { Chess } from 'chess.js';

interface MaterialDiff {
  white: { [key: string]: number };
  black: { [key: string]: number };
}

function getMaterialDiff(fen: string): MaterialDiff {
  const diff: MaterialDiff = {
    white: { king: 0, queen: 0, rook: 0, bishop: 0, knight: 0, pawn: 0 },
    black: { king: 0, queen: 0, rook: 0, bishop: 0, knight: 0, pawn: 0 },
  };

  if (!fen || typeof fen !== 'string') return diff;

  try {
    const chess = new Chess(fen);
    if (!chess || typeof chess.board !== 'function') return diff;
    
    const board = chess.board();
    if (!board || !Array.isArray(board)) return diff;
    
    // Count pieces on board
    const counts = {
      white: { king: 0, queen: 0, rook: 0, bishop: 0, knight: 0, pawn: 0 },
      black: { king: 0, queen: 0, rook: 0, bishop: 0, knight: 0, pawn: 0 },
    };

    board.forEach((row, rowIdx) => {
      if (!row || !Array.isArray(row)) return;
      try {
        row.forEach((square, colIdx) => {
          if (!square || typeof square !== 'object') return;
          try {
            const color = square?.color;
            const type = square?.type;
            if (color === 'white' || color === 'black') {
              if (type && typeof type === 'string' && counts[color] && counts[color][type] !== undefined) {
                counts[color][type]++;
              }
            }
          } catch (e) {
            // Silently skip invalid squares
            console.debug('Invalid square data:', e);
          }
        });
      } catch (e) {
        // Silently skip invalid rows
        console.debug('Invalid row data:', e);
      }
    });

    // Calculate differences from starting position
    const starting = {
      white: { king: 1, queen: 1, rook: 2, bishop: 2, knight: 2, pawn: 8 },
      black: { king: 1, queen: 1, rook: 2, bishop: 2, knight: 2, pawn: 8 },
    };

    (['king', 'queen', 'rook', 'bishop', 'knight', 'pawn'] as const).forEach(piece => {
      const whiteLost = starting.white[piece] - counts.white[piece];
      const blackLost = starting.black[piece] - counts.black[piece];
      
      if (whiteLost > 0) {
        diff.black[piece] = whiteLost;
      }
      if (blackLost > 0) {
        diff.white[piece] = blackLost;
      }
    });
  } catch (e) {
    // Silently handle errors - return empty diff to prevent UI crashes
    console.debug('Error calculating material diff:', e);
    return diff;
  }

  return diff;
}

const pieceSymbols: { [key: string]: string } = {
  king: '♔',
  queen: '♕',
  rook: '♖',
  bishop: '♗',
  knight: '♘',
  pawn: '♙',
};

export function MaterialDiff({ fen, color, position }: { fen?: string; color: 'white' | 'black'; position: 'top' | 'bottom' }) {
  const diff = useMemo(() => getMaterialDiff(fen || ''), [fen]);
  const material = diff[color];
  const hasMaterial = Object.values(material).some(count => count > 0);

  // Only show if there are captured pieces
  if (!hasMaterial) return null;

  return (
    <div style={{
      display: 'flex',
      gap: 3,
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 11,
      opacity: 0.6,
      flexWrap: 'wrap',
      lineHeight: 1.2,
      pointerEvents: 'none'
    }}>
      {(Object.keys(material) as Array<keyof typeof material>).map(piece => {
        const count = material[piece];
        if (count <= 0) return null;
        return (
          <span key={piece} style={{ 
            display: 'inline-flex',
            gap: 1,
            alignItems: 'center',
            fontSize: '12px'
          }}>
            {Array.from({ length: Math.min(count, 3) }).map((_, i) => (
              <span key={i} style={{ 
                color: color === 'white' ? '#fff' : '#000',
                lineHeight: 1
              }}>
                {pieceSymbols[piece]}
              </span>
            ))}
            {count > 3 && <span style={{ fontSize: '9px', marginLeft: 2 }}>+{count - 3}</span>}
          </span>
        );
      })}
    </div>
  );
}

