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

  return (
    <div
      style={{ width: px, height: px, fontSize: size <= 22 ? '8px' : '9px' }}
      className="flex items-center justify-center rounded-full border-[1.5px] border-ink bg-paper font-mono font-bold"
    >
      {symbol.slice(0, 4)}
    </div>
  );
}
