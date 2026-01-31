export function setHashRoute(path: string) {
  if (!path) return;
  const normalized = path.startsWith('#') ? path.slice(1) : path;
  const withSlash = normalized.startsWith('/') ? normalized : `/${normalized}`;
  window.location.hash = `#${withSlash}`;
}
