import { useEffect, useRef, useState } from 'react';
import WebApp from '@twa-dev/sdk';

/** Mirror of api/src/modules/realtime/hub.ts RealtimeEvent. Keep in sync. */
export type RealtimeEvent =
  | {
      kind: 'commission';
      payoutCents: number;
      sourcePrizeCents: number;
      sourceFirstName: string | null;
      contestName: string | null;
      level: 1 | 2;
      currencyCode: string;
    }
  | {
      kind: 'referral_unlock';
      bonusType: 'REFEREE' | 'RECRUITER';
      amountCents: number;
      sourceFirstName: string | null;
    }
  | { kind: 'ping' };

export type ConnectionState = 'connecting' | 'open' | 'closed';

/**
 * Persistent WebSocket to /ws/me with auto-reconnect and exponential backoff.
 * Auth via initData on the connection URL — same trust model as REST routes
 * (validated server-side at upgrade).
 *
 * Returns the latest received event (consumers should compare via id/timestamp
 * to detect a "new" one) plus the connection state for UI hints.
 *
 * Polling stays in CommissionToast as a fallback so a flaky network or a
 * transparent proxy that drops WS doesn't silently break notifications.
 */
export function useRealtime(): { state: ConnectionState; lastEvent: RealtimeEvent | null } {
  const [state, setState] = useState<ConnectionState>('connecting');
  const [lastEvent, setLastEvent] = useState<RealtimeEvent | null>(null);
  // Reconnect bookkeeping — refs so the effect can stay stable.
  const wsRef = useRef<WebSocket | null>(null);
  const closedManually = useRef(false);
  const retryCount = useRef(0);

  useEffect(() => {
    closedManually.current = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    const baseUrl = import.meta.env.VITE_API_BASE_URL;
    if (!baseUrl) return;
    const wsUrl =
      baseUrl.replace(/^http/, 'ws').replace(/\/$/, '') +
      '/ws/me?initData=' +
      encodeURIComponent(WebApp.initData ?? '');

    function connect() {
      setState('connecting');
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.addEventListener('open', () => {
        setState('open');
        retryCount.current = 0;
      });
      ws.addEventListener('message', (ev) => {
        try {
          const parsed = JSON.parse(ev.data) as RealtimeEvent;
          // 'ping' is heartbeat noise — don't surface it.
          if (parsed.kind === 'ping') return;
          setLastEvent(parsed);
        } catch {
          // Bad payload — drop silently. Server should not be sending these.
        }
      });
      ws.addEventListener('close', () => {
        setState('closed');
        wsRef.current = null;
        if (closedManually.current) return;
        // Exponential backoff capped at 30s. Reset on successful 'open'.
        const delay = Math.min(30_000, 1_000 * 2 ** retryCount.current);
        retryCount.current += 1;
        reconnectTimer = setTimeout(connect, delay);
      });
      ws.addEventListener('error', () => {
        // The 'close' handler runs right after — let it own the retry.
      });
    }

    connect();

    return () => {
      closedManually.current = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          // best-effort
        }
      }
    };
  }, []);

  return { state, lastEvent };
}
