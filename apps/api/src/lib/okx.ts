import WebSocket from 'ws';
import type { Logger } from '../logger.js';
import type { PriceUpdate } from './binance.js';

/**
 * OKX V5 public spot tickers WebSocket — secondary live feed.
 *
 * Layered alongside `startBybitFeed` so symbols Bybit doesn't list
 * (e.g. some long-tail meme coins) still get sub-second updates.
 * Both feeds push into the same coalescing writer; last write wins
 * per symbol (1s flush window means contention is rare).
 *
 * Differences from Bybit:
 *   - URL: `wss://ws.okx.com:8443/ws/v5/public`.
 *   - Subscribe: `{op:"subscribe", args:[{channel:"tickers", instId:"BTC-USDT"}, ...]}`.
 *     Instrument id uses HYPHEN: `BTC-USDT`, not `BTCUSDT`.
 *   - Heartbeat: send the LITERAL STRING `"ping"` (not JSON) every 25s;
 *     server replies with `"pong"`.
 *   - Data frame: `{arg: {channel:"tickers", instId:"..."}, data:[{instId, last, ...}]}`.
 *     OKX always sends the full ticker (no snapshot/delta split), so we
 *     don't need the lastKnown merge that Bybit needs.
 */

const STREAM_URL = 'wss://ws.okx.com:8443/ws/v5/public';
const RECONNECT_INITIAL_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const HEARTBEAT_MS = 25_000;
/** OKX subscribe arg max per request (docs say 480, we keep small for politeness). */
const SUBSCRIBE_BATCH = 50;
const SUBSCRIBE_DELAY_MS = 100;

export interface OkxFeedHandle {
  stop: () => void;
  getCoveredSymbols: () => ReadonlySet<string>;
}

export interface OkxFeedOptions {
  log: Logger;
  symbols: readonly string[];
  onUpdate: (updates: readonly PriceUpdate[]) => void;
}

interface OkxTickerData {
  instId?: string;
  last?: string;
  /** 24h percent change as decimal string (e.g. "0.05" for 5%). Some
   * OKX endpoints expose it as `chgPct`; we read both. */
  chgPct?: string;
  open24h?: string;
  high24h?: string;
  low24h?: string;
}

interface OkxFrame {
  event?: string;
  code?: string;
  msg?: string;
  arg?: { channel?: string; instId?: string };
  data?: OkxTickerData[];
}

export function startOkxFeed(opts: OkxFeedOptions): OkxFeedHandle {
  let ws: WebSocket | null = null;
  let stopped = false;
  let backoff = RECONNECT_INITIAL_MS;
  const coveredSymbols: Set<string> = new Set();
  let heartbeatTimer: NodeJS.Timeout | null = null;

  const subscribeArgsForSymbols = (
    syms: readonly string[],
  ): Array<{ channel: string; instId: string }> =>
    syms.map((s) => ({ channel: 'tickers', instId: `${s.toUpperCase()}-USDT` }));

  const sendSubscribes = (sock: WebSocket): void => {
    const all = subscribeArgsForSymbols(opts.symbols);
    if (all.length === 0) return;
    let i = 0;
    const sendNext = (): void => {
      if (sock.readyState !== WebSocket.OPEN || i >= all.length) return;
      const slice = all.slice(i, i + SUBSCRIBE_BATCH);
      i += SUBSCRIBE_BATCH;
      try {
        sock.send(JSON.stringify({ op: 'subscribe', args: slice }));
      } catch (err) {
        opts.log.warn({ err }, 'okx.ws.subscribe send failed');
      }
      if (i < all.length) setTimeout(sendNext, SUBSCRIBE_DELAY_MS);
    };
    sendNext();
  };

  const startHeartbeat = (sock: WebSocket): void => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
      if (sock.readyState !== WebSocket.OPEN) return;
      try {
        // OKX expects the literal string "ping" (not JSON-encoded).
        sock.send('ping');
      } catch {
        /* best-effort */
      }
    }, HEARTBEAT_MS);
  };

  const stopHeartbeat = (): void => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  };

  const handleFrame = (raw: string): void => {
    if (raw === 'pong' || raw === 'ping') return; // heartbeat reply
    let frame: OkxFrame;
    try {
      frame = JSON.parse(raw) as OkxFrame;
    } catch {
      return;
    }
    if (frame.event === 'error') {
      opts.log.warn({ code: frame.code, msg: frame.msg }, 'okx.ws.event.error');
      return;
    }
    if (frame.event === 'subscribe' || frame.event === 'unsubscribe') return;
    if (frame.arg?.channel !== 'tickers') return;
    const list = frame.data;
    if (!Array.isArray(list) || list.length === 0) return;
    const updates: PriceUpdate[] = [];
    for (const t of list) {
      if (typeof t.instId !== 'string' || !t.instId.endsWith('-USDT')) continue;
      const symbol = t.instId.slice(0, -5); // strip '-USDT'
      if (symbol.length === 0) continue;
      const price = t.last !== undefined ? Number.parseFloat(t.last) : NaN;
      if (!Number.isFinite(price) || price <= 0) continue;
      // Derive 24h pct from open/last when chgPct isn't provided.
      let pct: number | null = null;
      if (t.chgPct !== undefined) {
        const v = Number.parseFloat(t.chgPct);
        if (Number.isFinite(v)) pct = v * 100;
      }
      if (pct === null && t.open24h !== undefined) {
        const o = Number.parseFloat(t.open24h);
        if (Number.isFinite(o) && o > 0) pct = ((price - o) / o) * 100;
      }
      updates.push({ symbol, priceUsd: price, pctChange24h: pct });
      coveredSymbols.add(symbol);
    }
    if (updates.length > 0) opts.onUpdate(updates);
  };

  const connect = (): void => {
    if (stopped) return;
    ws = new WebSocket(STREAM_URL);

    ws.on('open', () => {
      backoff = RECONNECT_INITIAL_MS;
      opts.log.info({ symbolCount: opts.symbols.length }, 'okx.ws.open');
      if (ws) {
        sendSubscribes(ws);
        startHeartbeat(ws);
      }
    });

    ws.on('message', (data) => {
      const raw = data.toString();
      handleFrame(raw);
    });

    ws.on('error', (err) => {
      opts.log.warn({ err: err.message }, 'okx.ws.error');
    });

    ws.on('close', (code) => {
      stopHeartbeat();
      if (stopped) return;
      opts.log.warn({ code, backoffMs: backoff }, 'okx.ws.closed reconnecting');
      setTimeout(connect, backoff);
      backoff = Math.min(backoff * 2, RECONNECT_MAX_MS);
    });
  };

  connect();

  return {
    stop: () => {
      stopped = true;
      stopHeartbeat();
      if (ws) {
        try {
          ws.close();
        } catch {
          /* best-effort */
        }
      }
    },
    getCoveredSymbols: () => coveredSymbols,
  };
}
