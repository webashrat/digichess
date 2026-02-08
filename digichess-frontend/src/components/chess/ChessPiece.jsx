import { useEffect, useState } from 'react';

const pieceMap = {
    p: 'P',
    r: 'R',
    n: 'N',
    b: 'B',
    q: 'Q',
    k: 'K',
};

const materialMap = {
    p: 'chess_pawn',
    r: 'chess_rook',
    n: 'chess_knight',
    b: 'chess_bishop',
    q: 'chess_queen',
    k: 'chess_king',
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

    const fallbackIcon = materialMap[pieceType];
    return (
        <span
            className={`material-symbols-outlined ${className}`}
            style={{
                fontSize: size,
                color: isWhite ? '#ffffff' : '#111827',
                filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.25))',
            }}
        >
            {fallbackIcon}
        </span>
    );
}
