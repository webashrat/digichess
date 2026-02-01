import { useMemo } from 'react';
import { Chess } from 'chess.js';

interface MaterialDiff {
  white: { [key: string]: number };
  black: { [key: string]: number };
  advantage: { white: number; black: number };
}

function getMaterialDiff(fen: string): MaterialDiff {
  const diff: MaterialDiff = {
    white: { king: 0, queen: 0, rook: 0, bishop: 0, knight: 0, pawn: 0 },
    black: { king: 0, queen: 0, rook: 0, bishop: 0, knight: 0, pawn: 0 },
    advantage: { white: 0, black: 0 },
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

    const validPieceTypes = ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn'] as const;
    type PieceType = typeof validPieceTypes[number];

    board.forEach((row, rowIdx) => {
      if (!row || !Array.isArray(row)) return;
      try {
        row.forEach((square, colIdx) => {
          if (!square || typeof square !== 'object') return;
          try {
            const color = square?.color as 'white' | 'black' | undefined;
            const type = square?.type as string | undefined;
            if (color === 'white' || color === 'black') {
              if (type && validPieceTypes.includes(type as PieceType)) {
                const pieceType = type as PieceType;
                if (counts[color] && counts[color][pieceType] !== undefined) {
                  counts[color][pieceType]++;
                }
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

    const pieceValues: Record<PieceType, number> = {
      king: 0,
      queen: 9,
      rook: 5,
      bishop: 3,
      knight: 3,
      pawn: 1
    };

    (['queen', 'rook', 'bishop', 'knight', 'pawn'] as const).forEach(piece => {
      const whiteExtra = Math.max(0, counts.white[piece] - counts.black[piece]);
      const blackExtra = Math.max(0, counts.black[piece] - counts.white[piece]);
      if (whiteExtra > 0) diff.white[piece] = whiteExtra;
      if (blackExtra > 0) diff.black[piece] = blackExtra;
    });

    const whitePoints = (['queen', 'rook', 'bishop', 'knight', 'pawn'] as const)
      .reduce((sum, piece) => sum + (diff.white[piece] || 0) * pieceValues[piece], 0);
    const blackPoints = (['queen', 'rook', 'bishop', 'knight', 'pawn'] as const)
      .reduce((sum, piece) => sum + (diff.black[piece] || 0) * pieceValues[piece], 0);

    if (whitePoints > blackPoints) {
      diff.advantage.white = whitePoints - blackPoints;
    } else if (blackPoints > whitePoints) {
      diff.advantage.black = blackPoints - whitePoints;
    }
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
  const advantage = diff.advantage[color];

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
                color: color === 'white' ? '#f5f7ff' : '#e7d3a5',
                lineHeight: 1,
                textShadow: color === 'white'
                  ? '0 1px 2px rgba(0,0,0,0.35)'
                  : '0 1px 2px rgba(0,0,0,0.45)'
              }}>
                {pieceSymbols[piece]}
              </span>
            ))}
            {count > 3 && <span style={{ fontSize: '9px', marginLeft: 2 }}>+{count - 3}</span>}
          </span>
        );
      })}
      {advantage > 0 && (
        <span style={{ 
          fontSize: '11px',
          fontWeight: 700,
          marginLeft: 4,
          color: color === 'white' ? '#a6f4c5' : '#ffd26a',
          textShadow: '0 1px 2px rgba(0,0,0,0.45)'
        }}>
          +{advantage}
        </span>
      )}
    </div>
  );
}

