import type { Logger } from '../../logger.js';

/** A connected client. We only need send + close at the hub layer. */
export interface RealtimeClient {
  send(data: string): void;
  close(): void;
}

/** Wire-side payloads. Strongly-typed via discriminated union — adding new
 * event kinds is trivial without breaking existing handlers. */
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

export interface RealtimeHub {
  /** Register a new connection for `userId`. Returns an unregister fn the WS
   * route should invoke on close so we don't leak refs. */
  register(userId: string, client: RealtimeClient): () => void;
  /** Fan-out an event to all clients for `userId`. No-op if user is offline.
   * Send failures are logged and the offending client is dropped. */
  publish(userId: string, event: RealtimeEvent): void;
  /** Diagnostic — how many distinct users are currently connected. */
  size(): number;
  /** Close every connection (graceful shutdown hook). */
  closeAll(): void;
}

export function createRealtimeHub(log: Logger): RealtimeHub {
  // Single-process, single-replica deploy → in-memory is fine. Move to Redis
  // pub/sub once we scale to N>1 API replicas (commission produced on one node
  // would otherwise miss the user connected to another node).
  const byUser = new Map<string, Set<RealtimeClient>>();

  return {
    register(userId, client) {
      let set = byUser.get(userId);
      if (!set) {
        set = new Set();
        byUser.set(userId, set);
      }
      set.add(client);
      return () => {
        const s = byUser.get(userId);
        if (!s) return;
        s.delete(client);
        if (s.size === 0) byUser.delete(userId);
      };
    },
    publish(userId, event) {
      const set = byUser.get(userId);
      if (!set || set.size === 0) return;
      const data = JSON.stringify(event);
      for (const client of [...set]) {
        try {
          client.send(data);
        } catch (err) {
          // Likely a dead socket — drop and let the FE reconnect.
          log.warn({ err, userId, kind: event.kind }, 'realtime.publish drop client');
          set.delete(client);
          try {
            client.close();
          } catch {
            // already closed
          }
        }
      }
    },
    size() {
      return byUser.size;
    },
    closeAll() {
      for (const set of byUser.values()) {
        for (const client of set) {
          try {
            client.close();
          } catch {
            // best-effort
          }
        }
      }
      byUser.clear();
    },
  };
}
