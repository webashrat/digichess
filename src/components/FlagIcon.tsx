import { useState } from 'react';
import { flagFromCode } from '../utils/flags';

const flagUrlFromCode = (code?: string) => {
  if (!code || code.toUpperCase() === 'INTERNATIONAL') return null;
  const cc = code.trim().toLowerCase();
  if (cc.length !== 2) return null;
  return `https://flagcdn.com/24x18/${cc}.png`;
};

export default function FlagIcon({ code, size = 18 }: { code?: string; size?: number }) {
  const [imgError, setImgError] = useState(false);
  const url = flagUrlFromCode(code);
  const height = size;
  const width = Math.round((size * 4) / 3);

  if (!url || imgError) {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width,
          height,
          fontSize: size,
          lineHeight: 1
        }}
      >
        {flagFromCode(code)}
      </span>
    );
  }

  return (
    <img
      src={url}
      alt={code ? code.toUpperCase() : 'INTL'}
      width={width}
      height={height}
      loading="lazy"
      style={{
        display: 'block',
        borderRadius: 3,
        boxShadow: '0 0 0 1px rgba(0,0,0,0.15)'
      }}
      onError={() => setImgError(true)}
    />
  );
}
