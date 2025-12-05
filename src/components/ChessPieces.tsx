// SVG Chess Pieces - Solid Black and White with Lichess CDN support

import { useState } from 'react';

const pieceMap: { [key: string]: string } = {
  'p': 'P',
  'r': 'R',
  'n': 'N',
  'b': 'B',
  'q': 'Q',
  'k': 'K'
};

export const ChessPiece = ({ 
  piece, 
  size = 40,
  color,
  pieceSet = 'cburnett'
}: { 
  piece: string; 
  size?: number;
  color: 'white' | 'black';
  pieceSet?: string;
}) => {
  const isWhite = piece === piece.toUpperCase();
  const pieceColor = isWhite ? 'white' : 'black';
  const pieceType = piece.toLowerCase();
  const pieceCode = pieceColor === 'white' ? `w${pieceMap[pieceType]}` : `b${pieceMap[pieceType]}`;
  
  const fillColor = pieceColor === 'white' ? '#ffffff' : '#000000';
  const strokeColor = pieceColor === 'white' ? '#000000' : '#ffffff';
  const strokeWidth = pieceColor === 'white' ? 1.2 : 1.0;

  // If using custom SVG pieces (when pieceSet is 'custom'), use SVG components
  if (pieceSet === 'custom') {
    switch (pieceType) {
      case 'p':
        return <Pawn size={size} fill={fillColor} stroke={strokeColor} strokeWidth={strokeWidth} />;
      case 'r':
        return <Rook size={size} fill={fillColor} stroke={strokeColor} strokeWidth={strokeWidth} />;
      case 'n':
        return <Knight size={size} fill={fillColor} stroke={strokeColor} strokeWidth={strokeWidth} />;
      case 'b':
        return <Bishop size={size} fill={fillColor} stroke={strokeColor} strokeWidth={strokeWidth} />;
      case 'q':
        return <Queen size={size} fill={fillColor} stroke={strokeColor} strokeWidth={strokeWidth} />;
      case 'k':
        return <King size={size} fill={fillColor} stroke={strokeColor} strokeWidth={strokeWidth} isBlack={pieceColor === 'black'} />;
      default:
        return null;
    }
  }
  
  // Use Lichess CDN for piece sets
  const [imageError, setImageError] = useState(false);
  const [tryFormat, setTryFormat] = useState(0); // 0: webp, 1: svg
  
  const lichessUrls = [
    `https://lichess1.org/assets/piece/${pieceSet}/${pieceCode}.webp`,
    `https://lichess1.org/assets/piece/${pieceSet}/${pieceCode}.svg`
  ];
  
  // If using custom SVG pieces or image fails, use SVG components
  if (pieceSet === 'custom' || imageError) {
    switch (pieceType) {
      case 'p':
        return <Pawn size={size} fill={fillColor} stroke={strokeColor} strokeWidth={strokeWidth} />;
      case 'r':
        return <Rook size={size} fill={fillColor} stroke={strokeColor} strokeWidth={strokeWidth} />;
      case 'n':
        return <Knight size={size} fill={fillColor} stroke={strokeColor} strokeWidth={strokeWidth} />;
      case 'b':
        return <Bishop size={size} fill={fillColor} stroke={strokeColor} strokeWidth={strokeWidth} />;
      case 'q':
        return <Queen size={size} fill={fillColor} stroke={strokeColor} strokeWidth={strokeWidth} />;
      case 'k':
        return <King size={size} fill={fillColor} stroke={strokeColor} strokeWidth={strokeWidth} isBlack={pieceColor === 'black'} />;
      default:
        return null;
    }
  }
  
  // Use Lichess CDN piece images - try webp first, then svg, then fallback to custom SVG
  return (
    <img
      src={lichessUrls[tryFormat]}
      alt=""
      width={size}
      height={size}
      style={{
        display: 'block',
        margin: 'auto',
        filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.3))',
        objectFit: 'contain'
      }}
      onError={() => {
        // Try SVG if webp fails
        if (tryFormat === 0) {
          setTryFormat(1);
        } else {
          // Both formats failed, use SVG fallback
          setImageError(true);
        }
      }}
    />
  );
};

const Pawn = ({ size, fill, stroke, strokeWidth }: { size: number; fill: string; stroke: string; strokeWidth: number }) => (
  <svg width={size} height={size} viewBox="0 0 45 45" style={{ display: 'block', margin: 'auto', filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.3))' }}>
    <defs>
      <filter id="pieceShadow">
        <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodOpacity="0.3"/>
      </filter>
    </defs>
    <g fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" filter="url(#pieceShadow)">
      <path d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z" />
    </g>
  </svg>
);

const Rook = ({ size, fill, stroke, strokeWidth }: { size: number; fill: string; stroke: string; strokeWidth: number }) => (
  <svg width={size} height={size} viewBox="0 0 45 45" style={{ display: 'block', margin: 'auto', filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.3))' }}>
    <defs>
      <filter id="pieceShadow">
        <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodOpacity="0.3"/>
      </filter>
    </defs>
    <g fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" filter="url(#pieceShadow)">
      <path d="M9 39h27v-3H9v3zM12.5 32l1.5-2.5h17l1.5 2.5h-20zM12 36v-4h21v4H12z" />
      <path d="M14 29.5v-13h17v13H14z" />
      <path d="M14 16.5L11 14h23l-3 2.5H14zM11 14V9h4v2h5V9h5v2h5V9h4v5H11z" />
    </g>
  </svg>
);

const Knight = ({
  size,
  fill,
  stroke,
  strokeWidth,
}: {
  size: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 45 45"
    style={{ display: "block", margin: "auto", filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.3))' }}
  >
    <defs>
      <filter id="pieceShadow">
        <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodOpacity="0.3"/>
      </filter>
    </defs>
    <g
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      filter="url(#pieceShadow)"
    >
      {/* Base */}
      <ellipse cx="22.5" cy="38" rx="7" ry="2.5" />
      
      {/* Body */}
      <path d="M15.5 38 Q15.5 32 18 28 Q20.5 24 22.5 22 Q24.5 24 27 28 Q29.5 32 29.5 38 Z" />
      
      {/* Knight head - clean classic design */}
      <path
        d="M 18 28 
           Q 18 20 19.5 12 
           Q 21 5 24 4 
           Q 27 3 29.5 5 
           Q 31 7 31.5 9.5 
           Q 32 12 31.5 14.5 
           Q 31 17 29.5 18.5 
           Q 28 20 26 20 
           Q 24 20 22.5 18.5 
           Q 21 17 20.5 14.5 
           Q 20 12 20.5 9.5 
           Q 21 7 22.5 5 
           Q 24 3 27 3 
           Q 24 4 21 5 
           Q 19.5 12 18 20 
           L 18 28 Z"
      />
      
      {/* Mane */}
      <path d="M 18 28 Q 17 25 15.5 23" stroke={stroke} strokeWidth={strokeWidth} fill="none" />
      <path d="M 19 26 Q 18 23 16.5 21" stroke={stroke} strokeWidth={strokeWidth} fill="none" />
      
      {/* Ear */}
      <path d="M 29.5 5 Q 30.5 2.5 31.5 4 Q 31 5 29.5 5 Z" />
      <path d="M 29.5 5 L 30.5 3 L 29.5 5" stroke={stroke} strokeWidth={strokeWidth} fill="none" />
      
      {/* Snout */}
      <path d="M 31.5 14.5 Q 32.5 16.5 32.5 18.5 Q 32 17.5 31 16.5" stroke={stroke} strokeWidth={strokeWidth} fill="none" />
      
      {/* Eye */}
      <circle cx="29.5" cy="12" r="1.2" fill={stroke} />
    </g>
  </svg>
);
  

const Bishop = ({ size, fill, stroke, strokeWidth }: { size: number; fill: string; stroke: string; strokeWidth: number }) => (
  <svg width={size} height={size} viewBox="0 0 45 45" style={{ display: 'block', margin: 'auto', filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.3))' }}>
    <defs>
      <filter id="pieceShadow">
        <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodOpacity="0.3"/>
      </filter>
    </defs>
    <g fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" filter="url(#pieceShadow)">
      {/* Base */}
      <ellipse cx="22.5" cy="38" rx="6.5" ry="2.5" />
      {/* Body - smooth elegant curve */}
      <path d="M16 38 Q16 30 18 24 Q20 18 22.5 16 Q25 18 27 24 Q29 30 29 38 Z" />
      {/* Mitre base band */}
      <ellipse cx="22.5" cy="26" rx="6" ry="2" />
      {/* Mitre - realistic bishop's hat */}
      <path d="M16.5 26 Q16.5 20 19.5 8 Q22.5 3 25.5 8 Q28.5 20 28.5 26 L16.5 26 Z" />
      {/* Mitre cross - vertical */}
      <line x1="22.5" y1="6" x2="22.5" y2="25" stroke={stroke} strokeWidth={strokeWidth * 3.5} strokeLinecap="round" />
      {/* Mitre cross - horizontal */}
      <line x1="18" y1="15.5" x2="27" y2="15.5" stroke={stroke} strokeWidth={strokeWidth * 3.5} strokeLinecap="round" />
      {/* Top sphere */}
      <circle cx="22.5" cy="3" r="2.5" />
    </g>
  </svg>
);

const Queen = ({ size, fill, stroke, strokeWidth }: { size: number; fill: string; stroke: string; strokeWidth: number }) => (
  <svg width={size} height={size} viewBox="0 0 45 45" style={{ display: 'block', margin: 'auto', filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.3))' }}>
    <defs>
      <filter id="pieceShadow">
        <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodOpacity="0.3"/>
      </filter>
    </defs>
    <g fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" filter="url(#pieceShadow)">
      {/* Base */}
      <ellipse cx="22.5" cy="38" rx="8.5" ry="2.5" />
      {/* Body - elegant curved shape */}
      <path d="M14 38 Q14 30 16 24 Q18 18 22.5 16 Q27 18 29 24 Q31 30 31 38 Z" />
      {/* Crown base band */}
      <ellipse cx="22.5" cy="26" rx="8" ry="2" />
      {/* Crown left spike */}
      <path d="M13 26 L9 10 L13 26" />
      <circle cx="9" cy="8" r="2.5" />
      {/* Crown left-center spike */}
      <path d="M17 26 L17 12 L17 26" />
      <circle cx="17" cy="10" r="2.5" />
      {/* Crown center spike - tallest and most prominent */}
      <path d="M22.5 26 L22.5 6 L22.5 26" />
      <circle cx="22.5" cy="4" r="3.5" />
      {/* Crown right-center spike */}
      <path d="M28 26 L28 12 L28 26" />
      <circle cx="28" cy="10" r="2.5" />
      {/* Crown right spike */}
      <path d="M32 26 L36 10 L32 26" />
      <circle cx="36" cy="8" r="2.5" />
      {/* Crown connecting lines - elegant */}
      <path d="M13 26 Q13 20 9 10" />
      <path d="M17 26 Q17 18 17 12" />
      <path d="M22.5 26 Q22.5 16 22.5 8" />
      <path d="M28 26 Q28 18 28 12" />
      <path d="M32 26 Q32 20 36 10" />
    </g>
  </svg>
);

const King = ({ size, fill, stroke, strokeWidth, isBlack }: { size: number; fill: string; stroke: string; strokeWidth: number; isBlack?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 45 45" style={{ display: 'block', margin: 'auto', filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.3))' }}>
    <defs>
      <filter id="pieceShadow">
        <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodOpacity="0.3"/>
      </filter>
    </defs>
    <g fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" filter="url(#pieceShadow)">
      <path d="M22.5 11.63V6M20 8h5" strokeLinejoin="miter" />
      <path d="M22.5 25s4.5-7.5 3-10.5c0 0-1-1.5-3-1.5s-3 1.5-3 1.5c-1.5 3 3 10.5 3 10.5" />
      <path d="M12.5 37c5.5 3.5 14.5 3.5 20 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-2.5-7.5-12-10.5-16-4-3 6 6 10.5 6 10.5v7" />
      <path d="M12.5 30c5.5-3 14.5-3 20 0M12.5 33.5c5.5-3 14.5-3 20 0M12.5 37c5.5-3 14.5-3 20 0" />
      {/* Cross on top - only for black king */}
      {isBlack && (
        <>
          <line x1="22.5" y1="6" x2="22.5" y2="12" stroke="#000000" strokeWidth={strokeWidth * 3} strokeLinecap="round" />
          <line x1="18" y1="9" x2="27" y2="9" stroke="#000000" strokeWidth={strokeWidth * 3} strokeLinecap="round" />
        </>
      )}
    </g>
  </svg>
);

