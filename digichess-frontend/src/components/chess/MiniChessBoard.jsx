import React, { useMemo } from 'react';
import ChessPiece from './ChessPiece';
import { BOARD_THEMES } from '../../utils/boardPresets';

const parseFen = (fen) => {
    const normalized = !fen || fen === 'start'
        ? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
        : fen;
    const rows = (normalized || '').split(' ')[0] || '8/8/8/8/8/8/8/8';
    const ranks = rows.split('/');
    const board = [];
    for (let r = 0; r < 8; r += 1) {
        const rank = ranks[r] || '';
        let file = 0;
        for (const ch of rank) {
            if (Number.isInteger(Number(ch))) {
                const empty = parseInt(ch, 10);
                for (let i = 0; i < empty; i += 1) {
                    const isDark = (r + file) % 2 === 1;
                    const coord = String.fromCharCode(97 + file) + (8 - r);
                    board.push({ piece: null, color: isDark ? 'dark' : 'light', coord });
                    file += 1;
                }
            } else {
                const isDark = (r + file) % 2 === 1;
                const coord = String.fromCharCode(97 + file) + (8 - r);
                board.push({ piece: ch, color: isDark ? 'dark' : 'light', coord, pieceType: ch });
                file += 1;
            }
        }
        while (file < 8) {
            const isDark = (r + file) % 2 === 1;
            const coord = String.fromCharCode(97 + file) + (8 - r);
            board.push({ piece: null, color: isDark ? 'dark' : 'light', coord });
            file += 1;
        }
    }
    return board;
};

export default function MiniChessBoard({ fen, size = 120, orientation = 'white', themeIndex, pieceSet }) {
    const resolvedThemeIndex = useMemo(() => {
        if (typeof themeIndex === 'number') return themeIndex;
        if (typeof localStorage === 'undefined') return 6;
        const stored = Number(localStorage.getItem('boardTheme'));
        return Number.isFinite(stored) ? stored : 6;
    }, [themeIndex]);
    const resolvedPieceSet = useMemo(() => {
        if (pieceSet) return pieceSet;
        if (typeof localStorage === 'undefined') return 'cburnett';
        return localStorage.getItem('pieceSet') || 'cburnett';
    }, [pieceSet]);
    const squares = useMemo(() => parseFen(fen), [fen]);
    const displaySquares = useMemo(
        () => (orientation === 'black' ? [...squares].reverse() : squares),
        [squares, orientation]
    );
    const squareSize = size / 8;
    const pieceSize = Math.max(10, Math.floor(squareSize * 0.82));
    const currentTheme = BOARD_THEMES[resolvedThemeIndex] || BOARD_THEMES[6] || BOARD_THEMES[0];

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
                background: 'rgba(8, 12, 20, 0.7)',
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
                        justifyContent: 'center',
                    }}
                >
                    {sq.pieceType ? (
                        <ChessPiece
                            piece={sq.pieceType}
                            size={pieceSize}
                            pieceSet={resolvedPieceSet}
                        />
                    ) : null}
                </div>
            ))}
        </div>
    );
}
