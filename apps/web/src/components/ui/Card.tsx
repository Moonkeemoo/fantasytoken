import type { ReactNode, HTMLAttributes } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  variant?: 'paper' | 'dim';
  shadow?: boolean;
}

export function Card({
  children,
  className,
  variant = 'paper',
  shadow = false,
  ...rest
}: CardProps) {
  const bg = variant === 'dim' ? 'bg-paper-dim' : 'bg-paper';
  const shadowCls = shadow ? 'shadow-[2px_2px_0_#1a1814]' : '';
  return (
    <div
      {...rest}
      className={`relative rounded-[4px] border-[1.5px] border-ink ${bg} px-[10px] py-2 ${shadowCls} ${className ?? ''}`}
    >
      {children}
    </div>
  );
}
