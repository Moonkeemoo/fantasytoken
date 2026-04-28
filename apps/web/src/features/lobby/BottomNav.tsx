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
    <div className="sticky bottom-0 flex border-t border-tg-text/10 bg-tg-bg">
      {ITEMS.map((it) => (
        <button
          key={it.path}
          onClick={() => navigate(it.path)}
          className={`flex-1 py-3 text-xs font-bold uppercase ${
            pathname.startsWith(it.path) ? 'text-tg-button' : 'text-tg-hint'
          }`}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
