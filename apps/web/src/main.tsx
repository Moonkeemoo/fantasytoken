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
// `--tg-content-safe-area-inset-top`, but support varies across clients —
// publish our own copy so Header.tsx max() always has a fresh value.
type TgWithSafeArea = typeof WebApp & {
  contentSafeAreaInset?: { top?: number };
  onEvent?: (ev: string, cb: () => void) => void;
};
const tg = WebApp as TgWithSafeArea;
function syncSafeArea(): void {
  const top = tg.contentSafeAreaInset?.top ?? 0;
  document.documentElement.style.setProperty('--tg-content-safe-area-inset-top', `${top}px`);
}
syncSafeArea();
tg.onEvent?.('contentSafeAreaChanged', syncSafeArea);
tg.onEvent?.('viewportChanged', syncSafeArea);

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
