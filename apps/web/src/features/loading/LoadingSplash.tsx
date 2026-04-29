export interface LoadingSplashProps {
  caption?: string;
}

/**
 * Full-screen loading splash. Uses the canonical Fantasy Token mark from
 * /brand/mark.svg per the brand kit; falls back to no-image if asset missing.
 * Used as the entry-point screen and as a fallback whenever core auth state is loading.
 */
export function LoadingSplash({ caption = 'checking session…' }: LoadingSplashProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-paper px-6 text-ink">
      <img src="/brand/mark.svg" alt="Fantasy Token" width={140} height={140} className="mb-7" />
      <h1 className="text-[24px] font-extrabold leading-tight">Fantasy Token</h1>
      <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
        pick coins · win prizes
      </p>
      <div className="mt-8 h-[6px] w-[180px] overflow-hidden rounded-[3px] border-[1.5px] border-ink bg-paper-dim">
        <div className="ft-progress h-full bg-ink" />
      </div>
      <p className="mt-3 font-mono text-[11px] text-muted">{caption}</p>
      <style>{`
        @keyframes ft-progress {
          0%   { transform: translateX(-100%); }
          50%  { transform: translateX(0%); }
          100% { transform: translateX(100%); }
        }
        .ft-progress {
          animation: ft-progress 1.4s ease-in-out infinite;
          width: 60%;
        }
      `}</style>
    </div>
  );
}
