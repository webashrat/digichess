import { useEffect, useState } from 'react';

const pieceMap = {
    p: 'P',
    r: 'R',
    n: 'N',
    b: 'B',
    q: 'Q',
    k: 'K',
};

const fallbackSymbols = {
    white: { p: '♙', r: '♖', n: '♘', b: '♗', q: '♕', k: '♔' },
    black: { p: '♟', r: '♜', n: '♞', b: '♝', q: '♛', k: '♚' },
};

const pieceCodes = ['wP', 'wR', 'wN', 'wB', 'wQ', 'wK', 'bP', 'bR', 'bN', 'bB', 'bQ', 'bK'];
const preloadedSets = new Set();

const preloadPieceSet = (pieceSet) => {
    if (!pieceSet || preloadedSets.has(pieceSet)) return;
    preloadedSets.add(pieceSet);
    pieceCodes.forEach((code) => {
        const url = `https://lichess1.org/assets/piece/${pieceSet}/${code}.svg`;
        const img = new Image();
        img.decoding = 'async';
        img.src = url;
    });
};

export default function ChessPiece({ piece, size = 40, pieceSet = 'cburnett', className = '' }) {
    const [imageError, setImageError] = useState(false);
    const isWhite = piece === piece?.toUpperCase();
    const pieceType = piece?.toLowerCase();
    const pieceCode = isWhite ? `w${pieceMap[pieceType]}` : `b${pieceMap[pieceType]}`;
    const lichessUrl = pieceType ? `https://lichess1.org/assets/piece/${pieceSet}/${pieceCode}.svg` : null;

    useEffect(() => {
        setImageError(false);
    }, [pieceSet]);

    useEffect(() => {
        preloadPieceSet(pieceSet);
    }, [pieceSet]);

    if (!pieceType) return null;

    if (!imageError && lichessUrl) {
        return (
            <img
                key={`${pieceSet}-${pieceCode}`}
                src={lichessUrl}
                alt=""
                width={size}
                height={size}
                className={className}
                style={{
                    display: 'block',
                    margin: 'auto',
                    filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.3))',
                    objectFit: 'contain',
                    userSelect: 'none',
                    WebkitUserDrag: 'none',
                }}
                draggable={false}
                crossOrigin="anonymous"
                loading="eager"
                decoding="async"
                onError={() => setImageError(true)}
            />
        );
    }

    const symbol = fallbackSymbols[isWhite ? 'white' : 'black'][pieceType] || '?';
    return (
        <span
            className={className}
            style={{
                fontSize: size * 0.9,
                color: isWhite ? '#ffffff' : '#111827',
                filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.25))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: size,
                height: size,
            }}
        >
            {symbol}
        </span>
    );
}
