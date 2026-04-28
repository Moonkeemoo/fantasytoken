import { useLocation, useNavigate } from 'react-router-dom';

const ITEMS = [
  { path: '/lobby', label: 'Play' },
  { path: '/live', label: 'Live' },
  { path: '/wallet', label: 'Wallet' },
  { path: '/me', label: 'Me' },
];

export function BottomNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return (
    <div className="sticky bottom-0 flex border-t-[1.5px] border-ink bg-paper">
      {ITEMS.map((it) => {
        const active = pathname.startsWith(it.path);
        return (
          <button
            key={it.path}
            onClick={() => navigate(it.path)}
            className={`flex-1 py-3 font-mono text-[10px] font-bold uppercase tracking-[0.08em] ${
              active ? 'text-ink' : 'text-muted'
            }`}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
