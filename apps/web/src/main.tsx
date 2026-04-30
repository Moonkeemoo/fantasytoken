import { QueryClientProvider } from '@tanstack/react-query';
import { TonConnectUIProvider } from '@tonconnect/ui-react';
import WebApp from '@twa-dev/sdk';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import { App } from './App.js';
import './index.css';
import { ErrorBoundary } from './lib/error-boundary.js';
import { queryClient } from './lib/query-client.js';

// Tell Telegram we're alive as early as possible so the splash dismisses cleanly.
WebApp.ready();
WebApp.expand();

// TG fullscreen mode (drag-up) puts our app under TG's own Close/⋮/drag-handle
// chrome. TG 8+ exposes `contentSafeAreaInset` and a CSS variable
// `--tg-content-safe-area-inset-top`, but iOS clients <11 don't always set
// it. We measure ourselves: the difference between window.innerHeight (full
// viewport) and WebApp.viewportHeight (height TG actually grants us minus
// the bottom keyboard) is roughly the top chrome inset. Combined with a
// generous fixed minimum it reliably clears the buttons even on stale TGs.
type TgWithSafeArea = typeof WebApp & {
  contentSafeAreaInset?: { top?: number };
  viewportHeight?: number;
  viewportStableHeight?: number;
  isExpanded?: boolean;
  onEvent?: (ev: string, cb: () => void) => void;
};
const tg = WebApp as TgWithSafeArea;

function syncSafeArea(): void {
  const sdkValue = tg.contentSafeAreaInset?.top ?? 0;
  // Heuristic: TG fullscreen mode lands its Close/⋮/drag-handle chrome ON
  // TOP of our content. env(safe-area-inset-top) covers the device notch
  // (~44–54px) but NOT the TG chrome above. We force a 56px floor whenever
  // we're expanded, which clears even the worst case (drag-handle + ⋮ on
  // notched iPhones reported ducking the header at lower floors).
  const expandedFloor = tg.isExpanded ? 56 : 0;
  const px = Math.max(sdkValue, expandedFloor);
  document.documentElement.style.setProperty('--tg-content-safe-area-inset-top', `${px}px`);
}

syncSafeArea();
tg.onEvent?.('contentSafeAreaChanged', syncSafeArea);
tg.onEvent?.('viewportChanged', syncSafeArea);
tg.onEvent?.('safeAreaChanged', syncSafeArea);
tg.onEvent?.('fullscreenChanged', syncSafeArea);

// Lock viewport zoom. iOS Safari (which TG Mini Apps run on) ignores
// `user-scalable=no`, so we also block the gesture events explicitly.
window.addEventListener('gesturestart', (e) => e.preventDefault());
window.addEventListener('dblclick', (e) => e.preventDefault());

// Default to same-origin manifest so we don't have to set an env var per
// environment (Vercel preview / production / local). Override via
// VITE_TONCONNECT_MANIFEST_URL only if hosting the manifest elsewhere.
const manifestUrl =
  import.meta.env.VITE_TONCONNECT_MANIFEST_URL ??
  `${window.location.origin}/tonconnect-manifest.json`;

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <TonConnectUIProvider manifestUrl={manifestUrl}>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <App />
            <Analytics />
          </BrowserRouter>
        </QueryClientProvider>
      </TonConnectUIProvider>
    </ErrorBoundary>
  </StrictMode>,
);
