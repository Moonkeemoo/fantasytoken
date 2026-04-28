export interface BarProps {
  /** Value from 0 to 1. Clamped. */
  value: number;
}

export function Bar({ value }: BarProps) {
  const clamped = Math.max(0, Math.min(1, value));
  return (
    <div className="h-[6px] w-full overflow-hidden rounded-full border border-ink bg-paper-dim">
      <div className="h-full bg-ink" style={{ width: `${clamped * 100}%` }} />
    </div>
  );
}
