import type { ButtonHTMLAttributes, ReactNode } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost';
  size?: 'sm' | 'md';
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...rest
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center rounded-[3px] border-[1.5px] border-ink font-mono font-bold uppercase tracking-[0.04em] transition-opacity disabled:opacity-50 disabled:cursor-not-allowed';
  const sizeCls = size === 'sm' ? 'px-2 py-[3px] text-[10px]' : 'px-[10px] py-[6px] text-[11px]';
  const variantCls = variant === 'primary' ? 'bg-ink text-paper' : 'bg-paper text-ink';
  return (
    <button {...rest} className={`${base} ${sizeCls} ${variantCls} ${className ?? ''}`}>
      {children}
    </button>
  );
}
