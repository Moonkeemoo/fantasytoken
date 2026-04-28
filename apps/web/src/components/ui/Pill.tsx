import type { ButtonHTMLAttributes, ReactNode } from 'react';

export interface PillProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  children: ReactNode;
}

export function Pill({ active = false, className, children, ...rest }: PillProps) {
  const variant = active ? 'bg-ink text-paper' : 'bg-paper text-ink';
  return (
    <button
      {...rest}
      className={`inline-flex items-center gap-1 rounded-full border-[1.5px] border-ink px-[10px] py-1 text-[11px] font-semibold ${variant} ${className ?? ''}`}
    >
      {children}
    </button>
  );
}
