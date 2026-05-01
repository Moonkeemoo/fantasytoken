import WebSocket from 'ws';
import type { Logger } from '../logger.js';

/**
 * Binance public spot ticker stream — `!ticker@arr`.
 *
 * Pushes an array of every USDT/BUSD/etc ticker every ~1 second. We keep
 * USDT-quoted only (closest proxy to USD price for our purposes; Tether
 * occasionally drifts ±0.5% but that's well below contest scoring noise),
 * strip the quote suffix to get the base symbol, and push integrated
 * updates upstream.
 *
 * No auth, no rate limit (client-side). Only constraint: a single WS
 * connection is per-IP-fair-share, so we run exactly one process-wide.
 *
 * Reconnect strategy: on close, exponential backoff capped at 30s.
 * INV-7: errors are logged via the injected logger; the loop never
 * throws upstream.
 */

const STREAM_URL = 'wss://stream.binance.com:9443/ws/!ticker@arr';
const RECONNECT_INITIAL_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

export interface PriceUpdate {
  /** Base symbol (e.g. 'BTC' from 'BTCUSDT'). */
  symbol: string;
  /** Last trade price in USDT (≈ USD). */
  priceUsd: number;
  /** 24h percent change (Binance `P` field). */
  pctChange24h: number | null;
}

export interface BinanceFeedHandle {
  stop: () => void;
  /** Snapshot of symbols seen in the last successful message. Empty until
   * the first frame lands. Used by the price-feed router to know which
   * symbols Binance is covering live (so CoinGecko sync skips them). */
  getCoveredSymbols: () => ReadonlySet<string>;
}

export interface BinanceFeedOptions {
  log: Logger;
  /** Called on every successful frame with the parsed updates. The router
   * batches these into a single DB upsert per second. */
  onUpdate: (updates: readonly PriceUpdate[]) => void;
}

interface RawTicker {
  /** Pair symbol e.g. "BTCUSDT". */
  s: string;
  /** Last close price as string. */
  c: string;
  /** Price change percent over 24h, as string. */
  P: string;
}

export function startBinanceFeed(opts: BinanceFeedOptions): BinanceFeedHandle {
  let ws: WebSocket | null = null;
  let stopped = false;
  let backoff = RECONNECT_INITIAL_MS;
  let coveredSymbols: Set<string> = new Set();

  const connect = (): void => {
    if (stopped) return;
    ws = new WebSocket(STREAM_URL);

    ws.on('open', () => {
      backoff = RECONNECT_INITIAL_MS;
      opts.log.info('binance.ws.open');
    });

    ws.on('message', (data) => {
      try {
        const arr = JSON.parse(data.toString()) as RawTicker[];
        if (!Array.isArray(arr)) return;
        const updates: PriceUpdate[] = [];
        const covered = new Set<string>();
        for (const t of arr) {
          if (typeof t.s !== 'string' || !t.s.endsWith('USDT')) continue;
          const symbol = t.s.slice(0, -4); // strip USDT
          if (symbol.length === 0) continue;
          const price = Number.parseFloat(t.c);
          if (!Number.isFinite(price) || price <= 0) continue;
          const pct = Number.parseFloat(t.P);
          updates.push({
            symbol,
            priceUsd: price,
            pctChange24h: Number.isFinite(pct) ? pct : null,
          });
          covered.add(symbol);
        }
        if (updates.length > 0) {
          coveredSymbols = covered;
          opts.onUpdate(updates);
        }
      } catch (err) {
        // INV-7: log + keep listening.
        opts.log.warn({ err }, 'binance.ws.parse failed');
      }
    });

    ws.on('error', (err) => {
      opts.log.warn({ err: err.message }, 'binance.ws.error');
    });

    ws.on('close', (code) => {
      if (stopped) return;
      opts.log.warn({ code, backoffMs: backoff }, 'binance.ws.closed reconnecting');
      setTimeout(connect, backoff);
      backoff = Math.min(backoff * 2, RECONNECT_MAX_MS);
    });
  };

  connect();

  return {
    stop: () => {
      stopped = true;
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
