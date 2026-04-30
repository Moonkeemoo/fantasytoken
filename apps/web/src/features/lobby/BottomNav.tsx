import { useLocation, useNavigate } from 'react-router-dom';

interface NavItem {
  path: string;
  label: string;
  /** Pathname patterns that should highlight this tab. */
  match: (pathname: string) => boolean;
}

const ITEMS: NavItem[] = [
  {
    path: '/lobby',
    label: 'Play',
    // Lobby + every in-contest pre-game screen routes back to Play conceptually.
    match: (p) =>
      p.startsWith('/lobby') ||
      p === '/' ||
      /^\/contests\/[^/]+\/(build|locked|browse|result)/.test(p),
  },
  {
    path: '/live',
    label: 'Live',
    match: (p) => p === '/live' || /^\/contests\/[^/]+\/live$/.test(p),
  },
  {
    path: '/rankings',
    label: 'Rankings',
    match: (p) => p.startsWith('/rankings'),
  },
  {
    path: '/me',
    label: 'Me',
    match: (p) => p.startsWith('/me'),
  },
];

/**
 * Routes where the bottom nav has no place: full-bleed onboarding, welcome,
 * dev stories. Everything else gets the persistent tab bar so the player can
 * jump out of any contest screen without finding a back-button labyrinth.
 */
const HIDE_ON_PREFIXES = ['/welcome', '/tutorial', '/dev/'];
const HIDE_EXACT = ['/', '/status'];

export function shouldShowBottomNav(pathname: string): boolean {
  if (HIDE_EXACT.includes(pathname)) return false;
  return !HIDE_ON_PREFIXES.some((p) => pathname.startsWith(p));
}

export function BottomNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  if (!shouldShowBottomNav(pathname)) return null;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-ink bg-paper shadow-[0_-4px_12px_-8px_rgba(0,0,0,0.18)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      aria-label="Primary"
    >
      {ITEMS.map((it) => {
        const active = it.match(pathname);
        return (
          <button
            key={it.path}
            type="button"
            onClick={() => navigate(it.path)}
            // py-4 + min-h-[56px] hits Apple's 44px+ recommendation for tap
            // targets — the previous py-3 was ~38px and people kept missing.
            className={`flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 px-2 py-4 font-mono text-[10px] font-bold uppercase tracking-[0.08em] transition-colors ${
              active ? 'text-ink' : 'text-muted active:bg-paper-dim'
            }`}
            aria-current={active ? 'page' : undefined}
          >
            <span>{it.label}</span>
            {active && <span className="h-0.5 w-6 rounded-full bg-ink" />}
          </button>
        );
      })}
    </nav>
  );
}

/** Pixel offset feature components should reserve at the bottom of their
 * scroll/sticky areas so the nav doesn't cover sticky CTAs. */
export const BOTTOM_NAV_OFFSET_PX = 56;
