import { useState } from 'react';

export interface AvatarProps {
  name: string;
  url?: string | null;
  size?: number;
  /** True if this represents a bot — visual cue (dashed border). */
  bot?: boolean;
}

export function Avatar({ name, url, size = 22, bot = false }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const px = `${size}px`;
  const initial = name.trim().slice(0, 1).toUpperCase() || '?';

  if (url && !failed) {
    return (
      <img
        src={url}
        alt={name}
        loading="lazy"
        onError={() => setFailed(true)}
        style={{ width: px, height: px }}
        className={`rounded-full border-[1.5px] bg-paper object-cover ${
          bot ? 'border-dashed border-ink/60' : 'border-ink'
        }`}
      />
    );
  }

  return (
    <div
      style={{ width: px, height: px, fontSize: size <= 22 ? '10px' : '12px' }}
      className={`flex items-center justify-center rounded-full border-[1.5px] bg-paper font-bold uppercase ${
        bot ? 'border-dashed border-ink/60 text-muted' : 'border-ink'
      }`}
    >
      {initial}
    </div>
  );
}
