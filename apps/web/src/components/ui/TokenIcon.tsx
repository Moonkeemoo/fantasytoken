import { useState } from 'react';

export interface TokenIconProps {
  symbol: string;
  imageUrl?: string | null;
  size?: number;
}

export function TokenIcon({ symbol, imageUrl, size = 22 }: TokenIconProps) {
  const [failed, setFailed] = useState(false);
  const px = `${size}px`;

  if (imageUrl && !failed) {
    return (
      <img
        src={imageUrl}
        alt={symbol}
        loading="lazy"
        onError={() => setFailed(true)}
        style={{ width: px, height: px }}
        className="rounded-full border-[1.5px] border-ink bg-paper object-cover"
      />
    );
  }

  // Letter fallback: how many characters fit depends on size. The
  // Spectator picks-strip renders icons at 12px — 4 chars overflowed
  // the circle and stretched the row layout. Tier the chars + font-size
  // by size so all callers (12 / 22 / 24 / 28 / 36) read sensibly.
  const chars = size <= 14 ? 1 : size <= 20 ? 2 : 4;
  const fontSize = size <= 14 ? '6px' : size <= 22 ? '8px' : '9px';
  return (
    <div
      style={{ width: px, height: px, fontSize, lineHeight: 1 }}
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full border-[1.5px] border-ink bg-paper font-mono font-bold"
    >
      {symbol.slice(0, chars)}
    </div>
  );
}
