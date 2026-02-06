export const flagFromCode = (code?: string) => {
  if (!code || code.toUpperCase() === 'INTERNATIONAL') return '🌍';
  const cc = code.trim().toUpperCase();
  if (cc.length !== 2) return '🌍';
  try {
    const points = cc.split('').map((c) => 127397 + c.charCodeAt(0));
    return String.fromCodePoint(...points);
  } catch {
    return '🌍';
  }
};
