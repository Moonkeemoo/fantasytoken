import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { parseUserFromInitData, validateInitData } from '../../lib/telegram-auth.js';
import type { RealtimeHub } from './hub.js';
import type { UsersService } from '../users/users.service.js';

export interface RealtimeRoutesDeps {
  hub: RealtimeHub;
  users: UsersService;
}

const QuerySchema = z.object({
  /** initData payload — passed via query string because WebSockets can't
   * carry our usual `x-telegram-init-data` header at upgrade time. */
  initData: z.string().min(1),
});

/**
 * WebSocket endpoint backing the in-app commission toast (REFERRAL_SYSTEM.md
 * §6.4 — V2 push). Mounted at `/ws/me`. FE connects with the initData blob
 * as a query param; we validate it once at upgrade, resolve the user, then
 * register the socket on the hub. The hub fans out commission events from
 * referrals.payCommissions in near real-time.
 *
 * Heartbeat: server sends a `ping` event every 25s so reverse proxies don't
 * idle-close the connection (Railway / nginx defaults sit around 60s).
 */
export function makeRealtimeRoutes(deps: RealtimeRoutesDeps): FastifyPluginAsync {
  return async (app) => {
    app.get<{ Querystring: { initData: string } }>(
      '/me',
      { websocket: true },
      async (socket, req) => {
        const q = QuerySchema.safeParse(req.query);
        if (!q.success) {
          socket.close(1008, 'bad query');
          return;
        }
        if (!validateInitData(q.data.initData, app.deps.config.TELEGRAM_BOT_TOKEN)) {
          socket.close(1008, 'invalid initData');
          return;
        }
        const tg = parseUserFromInitData(q.data.initData);
        if (!tg) {
          socket.close(1008, 'invalid user');
          return;
        }
        const userId = await deps.users.findUserIdByTelegramId(tg.id);
        if (!userId) {
          socket.close(1008, 'user not found');
          return;
        }

        const unregister = deps.hub.register(userId, {
          send: (data) => socket.send(data),
          close: () => socket.close(),
        });

        // Ping every 25s so middleboxes don't kill the conn during quiet
        // stretches between commissions.
        const pingTimer = setInterval(() => {
          try {
            socket.send(JSON.stringify({ kind: 'ping' }));
          } catch {
            // socket likely already gone — handled in 'close'
          }
        }, 25_000);

        socket.on('close', () => {
          clearInterval(pingTimer);
          unregister();
        });
        socket.on('error', () => {
          clearInterval(pingTimer);
          unregister();
        });
      },
    );
  };
}
