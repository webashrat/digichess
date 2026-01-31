export type BoardTheme = {
  name: string;
  light: string;
  dark: string;
  lightPiece: string;
  darkPiece: string;
};

export type PieceSet = {
  name: string;
  value: string;
};

export const PIECE_SETS: PieceSet[] = [
  { name: 'Custom (SVG)', value: 'custom' },
  { name: 'Cburnett', value: 'cburnett' },
  { name: 'Merida', value: 'merida' },
  { name: 'Alpha', value: 'alpha' },
  { name: 'Mono', value: 'mono' },
  { name: 'Firi', value: 'firi' },
  { name: 'Pirouetti', value: 'pirouetti' },
  { name: 'Chessnut', value: 'chessnut' },
  { name: 'Chess7', value: 'chess7' },
  { name: 'Reilly', value: 'reillycraig' },
  { name: 'Companion', value: 'companion' },
  { name: 'Spatial', value: 'spatial' },
  { name: 'California', value: 'california' },
  { name: 'Pixel', value: 'pixel' },
  { name: 'Letter', value: 'letter' },
  { name: 'Cases', value: 'cases' },
  { name: 'Clay', value: 'clay' },
  { name: 'Horsey', value: 'horsey' },
  { name: 'Shapes', value: 'shapes' },
  { name: 'Cardinal', value: 'cardinal' },
  { name: 'Gioco', value: 'gioco' },
  { name: 'Staunty', value: 'staunty' },
  { name: 'Governor', value: 'governor' },
  { name: 'Dubrovny', value: 'dubrovny' },
  { name: 'Icpieces', value: 'icpieces' },
  { name: 'Riohacha', value: 'riohacha' },
  { name: 'Kosal', value: 'kosal' },
  { name: 'Libra', value: 'libra' },
  { name: 'Maestro', value: 'maestro' },
  { name: 'Caliente', value: 'caliente' }
];

export const BOARD_THEMES: BoardTheme[] = [
  {
    name: 'Classic',
    light: '#f0d9b5',
    dark: '#b58863',
    lightPiece: '#0b1020',
    darkPiece: '#f4f6ff'
  },
  {
    name: 'Blue',
    light: '#dee3e6',
    dark: '#8ca2ad',
    lightPiece: '#0b1020',
    darkPiece: '#f4f6ff'
  },
  {
    name: 'Green',
    light: '#f0f0f0',
    dark: '#86a666',
    lightPiece: '#0b1020',
    darkPiece: '#f4f6ff'
  },
  {
    name: 'Marble',
    light: '#eeeed2',
    dark: '#769656',
    lightPiece: '#0b1020',
    darkPiece: '#f4f6ff'
  },
  {
    name: 'Wood',
    light: '#d18b47',
    dark: '#aa6c39',
    lightPiece: '#f4f6ff',
    darkPiece: '#0b1020'
  },
  {
    name: 'Dark',
    light: '#3a3a3a',
    dark: '#1a1a1a',
    lightPiece: '#f4f6ff',
    darkPiece: '#f4f6ff'
  },
  {
    name: 'Lichess',
    light: '#edeed1',
    dark: '#779952',
    lightPiece: '#0b1020',
    darkPiece: '#f4f6ff'
  },
  {
    name: 'Brown',
    light: '#f0d9b5',
    dark: '#b58863',
    lightPiece: '#0b1020',
    darkPiece: '#f4f6ff'
  },
  {
    name: 'Leather',
    light: '#d18b47',
    dark: '#8b4513',
    lightPiece: '#f4f6ff',
    darkPiece: '#0b1020'
  },
  {
    name: 'Metal',
    light: '#c9c9c9',
    dark: '#808080',
    lightPiece: '#0b1020',
    darkPiece: '#0b1020'
  }
];
