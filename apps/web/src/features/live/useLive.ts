import { useQuery } from '@tanstack/react-query';
import { LiveResponse } from '@fantasytoken/shared';
import { apiFetch } from '../../lib/api-client.js';

export function useLive(contestId: string | undefined) {
  return useQuery({
    queryKey: ['contests', contestId, 'live'],
    queryFn: () => apiFetch(`/contests/${contestId!}/live`, LiveResponse),
    enabled: !!contestId,
    // Aligned with server.ts `tokens.sync.active` (15s): the backend refreshes
    // CoinGecko prices on this cadence, so a 15s frontend refetch is the
    // sharpest tick that still sees fresh data on every cycle. Tighter than
    // that is wasted bandwidth.
    refetchInterval: 15_000,
    // Telegram WebView often reports document.hidden=true / no focus events
    // when the user is technically looking at the screen; without this flag
    // TanStack Query pauses polling and prices appear "frozen" until the
    // user manually pull-to-refreshes (reproduced on iOS — see lobby thread
    // 2026-04-30). Forcing background polling keeps Live in sync.
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: 'always',
    staleTime: 7_500,
  });
}
