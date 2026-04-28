import type { HTMLAttributes, ReactNode } from 'react';

export interface LabelProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
}

export function Label({ className, children, ...rest }: LabelProps) {
  return (
    <span
      {...rest}
      className={`font-mono text-[9px] uppercase tracking-[0.08em] text-muted ${className ?? ''}`}
    >
      {children}
    </span>
  );
}
