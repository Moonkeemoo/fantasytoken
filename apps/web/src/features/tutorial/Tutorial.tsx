import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../../components/ui/Card.js';
import { Button } from '../../components/ui/Button.js';
import { TUTORIAL_DONE_KEY } from '../loading/Loading.js';

const STEPS = 3;

export function Tutorial() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);

  const finish = () => {
    if (typeof window !== 'undefined') window.localStorage.setItem(TUTORIAL_DONE_KEY, '1');
    navigate('/lobby', { replace: true });
  };

  const next = () => {
    if (step < STEPS - 1) setStep(step + 1);
    else finish();
  };

  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
          step {step + 1} of {STEPS}
        </span>
        <button
          onClick={finish}
          className="font-mono text-[11px] font-bold uppercase tracking-[0.06em] text-muted underline"
        >
          skip →
        </button>
      </div>

      <div className="flex flex-1 flex-col justify-center px-4 pb-2">
        {step === 0 && <PickLeague />}
        {step === 1 && <SplitBankroll />}
        {step === 2 && <WinPool />}
      </div>

      <div className="mt-2 px-4">
        {step === 0 && (
          <>
            <h2 className="text-[28px] font-extrabold leading-tight">pick a league</h2>
            <p className="mt-1 text-[12px] text-muted">free or paid · 5 min fill · 10 min play</p>
          </>
        )}
        {step === 1 && (
          <>
            <h2 className="text-[28px] font-extrabold leading-tight">split your bankroll</h2>
            <p className="mt-1 text-[12px] text-muted">$100 across 5 tokens · multiples of 5%</p>
          </>
        )}
        {step === 2 && (
          <>
            <h2 className="text-[28px] font-extrabold leading-tight">win the prize pool</h2>
            <p className="mt-1 text-[12px] text-muted">top 30% of real entries · payouts in $</p>
          </>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between px-4 pb-5">
        <Dots active={step} total={STEPS} />
        <Button variant="primary" size="md" onClick={next}>
          {step < STEPS - 1 ? 'next →' : 'claim $100 →'}
        </Button>
      </div>
    </div>
  );
}

function Dots({ active, total }: { active: number; total: number }) {
  return (
    <div className="flex items-center gap-[6px]">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`h-[6px] rounded-full transition-all ${
            i === active ? 'w-[18px] bg-ink' : 'w-[6px] bg-ink/30'
          }`}
        />
      ))}
    </div>
  );
}

// ─── Slide 1: pick a league ────────────────────────────────────────────────
function PickLeague() {
  const rows: Array<{ name: string; pool: string; tag: string; highlight?: boolean }> = [
    { name: 'Memecoin Madness', pool: 'pool · $500', tag: 'FREE', highlight: true },
    { name: 'Quick Match', pool: 'pool · $20', tag: '$1' },
    { name: 'Bear Trap', pool: 'pool · $1k', tag: 'BEAR' },
  ];
  return (
    <div className="flex flex-col gap-[10px]">
      {rows.map((r) => (
        <Card
          key={r.name}
          {...(r.highlight ? { shadow: true } : {})}
          className={`flex items-center justify-between !px-[14px] !py-[14px] ${
            r.highlight ? '!bg-accent' : ''
          }`}
        >
          <div>
            <div className="text-[14px] font-bold leading-tight">{r.name}</div>
            <div className="mt-[2px] font-mono text-[10px] text-muted">{r.pool}</div>
          </div>
          <span
            className={`rounded-[3px] border-[1.5px] border-ink px-[6px] py-[2px] font-mono text-[10px] font-bold ${
              r.highlight ? 'bg-paper' : ''
            }`}
          >
            {r.tag}
          </span>
        </Card>
      ))}
    </div>
  );
}

// ─── Slide 2: split bankroll ───────────────────────────────────────────────
function SplitBankroll() {
  const allocs = [
    { sym: 'PEPE', pct: 40, color: '#facc15' },
    { sym: 'WIF', pct: 25, color: '#fda4af' },
    { sym: 'BONK', pct: 20, color: '#86efac' },
    { sym: 'DOGE', pct: 15, color: '#f6f1e8' },
  ];
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="font-mono text-[11px] text-muted">$100 bankroll</div>
      <div
        className="flex w-full max-w-[320px] overflow-hidden rounded-[6px] border-[2px] border-ink"
        style={{ height: '52px' }}
      >
        {allocs.map((a) => (
          <div
            key={a.sym}
            className="flex items-center justify-center border-r-[2px] border-ink last:border-r-0 text-[11px] font-bold uppercase"
            style={{ width: `${a.pct}%`, background: a.color, color: '#1a1814' }}
          >
            {a.sym}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {allocs.map((a) => (
          <span
            key={a.sym}
            className="rounded-full border-[1.5px] border-ink bg-paper px-3 py-[3px] font-mono text-[11px]"
          >
            {a.sym} · {a.pct}%
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Slide 3: win the pool ─────────────────────────────────────────────────
function WinPool() {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="font-mono text-[11px] text-muted">top 3 take most of the pool</div>
      <div className="mt-2 flex items-end gap-3">
        <Podium rank={2} prize="$100" height={120} />
        <Podium rank={1} prize="$200" height={170} highlight crown />
        <Podium rank={3} prize="$60" height={90} />
      </div>
    </div>
  );
}

function Podium({
  rank,
  prize,
  height,
  highlight = false,
  crown = false,
}: {
  rank: number;
  prize: string;
  height: number;
  highlight?: boolean;
  crown?: boolean;
}) {
  return (
    <div className="flex flex-col items-center">
      <div className="font-mono text-[11px] font-bold">{prize}</div>
      <div className="mt-1 text-[20px] leading-none">{crown ? '🏆' : ' '}</div>
      <div
        className={`mt-1 flex w-[80px] items-center justify-center border-[2px] border-ink ${
          highlight ? 'bg-accent' : 'bg-paper'
        }`}
        style={{ height: `${height}px`, boxShadow: '4px 4px 0 #1a1814' }}
      >
        <span className="text-[36px] font-extrabold leading-none">{rank}</span>
      </div>
    </div>
  );
}
