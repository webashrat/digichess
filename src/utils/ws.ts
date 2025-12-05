const defaultWsBase = (import.meta.env.VITE_WS_BASE_URL as string) || 'ws://localhost:8000';

export function makeWsUrl(path: string) {
  if (path.startsWith('ws://') || path.startsWith('wss://')) return path;
  const base = defaultWsBase.replace(/\/+$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${cleanPath}`;
}
