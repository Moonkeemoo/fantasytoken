export interface BarProps {
  /** Value from 0 to 1. Clamped. */
  value: number;
}

export function Bar({ value }: BarProps) {
  const clamped = Math.max(0, Math.min(1, value));
  return (
    <div className="h-1 w-full overflow-hidden rounded bg-tg-text/10">
      <div className="h-full bg-tg-button" style={{ width: `${clamped * 100}%` }} />
    </div>
  );
}
