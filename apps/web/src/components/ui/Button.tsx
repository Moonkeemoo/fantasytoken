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
  const base = 'rounded font-semibold transition-opacity disabled:opacity-50';
  const sizeCls = size === 'sm' ? 'px-3 py-1 text-sm' : 'px-4 py-2 text-base';
  const variantCls =
    variant === 'primary'
      ? 'bg-tg-button text-tg-button-text'
      : 'bg-transparent text-tg-text border border-tg-text/20';
  return (
    <button {...rest} className={`${base} ${sizeCls} ${variantCls} ${className ?? ''}`}>
      {children}
    </button>
  );
}
