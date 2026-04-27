import { QueryClientProvider } from '@tanstack/react-query';
import { TonConnectUIProvider } from '@tonconnect/ui-react';
import WebApp from '@twa-dev/sdk';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App.js';
import './index.css';
import { queryClient } from './lib/query-client.js';

// Tell Telegram we're alive as early as possible so the splash dismisses cleanly.
WebApp.ready();
WebApp.expand();

const manifestUrl = import.meta.env.VITE_TONCONNECT_MANIFEST_URL;

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <TonConnectUIProvider manifestUrl={manifestUrl}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </TonConnectUIProvider>
  </StrictMode>,
);
