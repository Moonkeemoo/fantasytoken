import type { ReactNode, HTMLAttributes } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function Card({ children, className, ...rest }: CardProps) {
  return (
    <div
      {...rest}
      className={`rounded border border-tg-text/10 bg-tg-bg-secondary p-3 ${className ?? ''}`}
    >
      {children}
    </div>
  );
}
