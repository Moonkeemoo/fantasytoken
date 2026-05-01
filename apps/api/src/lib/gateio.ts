import WebSocket from 'ws';
import type { Logger } from '../logger.js';
import type { PriceUpdate } from './binance.js';

/**
 * Gate.io V4 public spot tickers WebSocket — tertiary live feed.
 *
 * Bybit (~459 USDT pairs) + OKX (~296) cover only ~50% of our top-500
 * catalog because the long tail (memecoins, gaming tokens, niche L1s)
 * lives primarily on Gate.io and similar broad-listing exchanges.
 * Gate.io lists 2000+ USDT pairs and fills most of that gap.
 *
 * Differences from OKX:
 *   - URL: `wss://api.gateio.ws/ws/v4/`.
 *   - Pair format: `BASE_USDT` with UNDERSCORE (e.g. `BTC_USDT`).
 *   - Subscribe: `{time, channel, event:"subscribe", payload:[pair, …]}`.
 *     `time` is unix-seconds; we put `Math.floor(Date.now()/1000)`.
 *     Each subscribe message can carry multiple pairs in payload (no
 *     known hard cap, but we batch 100/100ms for politeness).
 *   - Heartbeat: not required (server keeps connection alive). We still
 *     send a `server.ping` channel sub so closed sockets surface fast.
 *   - Frame: `{channel:"spot.tickers", event:"update", result:{currency_pair, last, change_percentage, ...}}`.
 *
 * Reconnect: identical exponential backoff, capped at 30s.
 * Same `PriceUpdate` shape pushed to the writer — no router changes.
 */

const STREAM_URL = 'wss://api.gateio.ws/ws/v4/';
const RECONNECT_INITIAL_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const SUBSCRIBE_BATCH = 100;
const SUBSCRIBE_DELAY_MS = 100;

export interface GateioFeedHandle {
  stop: () => void;
  getCoveredSymbols: () => ReadonlySet<string>;
}

export interface GateioFeedOptions {
  log: Logger;
  symbols: readonly string[];
  onUpdate: (updates: readonly PriceUpdate[]) => void;
}

interface GateioTickerResult {
  currency_pair?: string;
  last?: string;
  change_percentage?: string;
}

interface GateioFrame {
  time?: number;
  channel?: string;
  event?: string;
  error?: { code?: number; message?: string };
  result?: GateioTickerResult | { status?: string };
}

export function startGateioFeed(opts: GateioFeedOptions): GateioFeedHandle {
  let ws: WebSocket | null = null;
  let stopped = false;
  let backoff = RECONNECT_INITIAL_MS;
  const coveredSymbols: Set<string> = new Set();

  const pairFor = (sym: string): string => `${sym.toUpperCase()}_USDT`;

  const sendSubscribes = (sock: WebSocket): void => {
    const pairs = opts.symbols.map(pairFor);
    if (pairs.length === 0) return;
    let i = 0;
    const sendNext = (): void => {
      if (sock.readyState !== WebSocket.OPEN || i >= pairs.length) return;
      const slice = pairs.slice(i, i + SUBSCRIBE_BATCH);
      i += SUBSCRIBE_BATCH;
      try {
        sock.send(
          JSON.stringify({
            time: Math.floor(Date.now() / 1000),
            channel: 'spot.tickers',
            event: 'subscribe',
            payload: slice,
          }),
        );
      } catch (err) {
        opts.log.warn({ err }, 'gateio.ws.subscribe send failed');
      }
      if (i < pairs.length) setTimeout(sendNext, SUBSCRIBE_DELAY_MS);
    };
    sendNext();
  };

  const handleFrame = (raw: string): void => {
    let frame: GateioFrame;
    try {
      frame = JSON.parse(raw) as GateioFrame;
    } catch {
      return;
    }
    if (frame.error) {
      // Per-pair "INVALID_PARAM_VALUE" arrives once per unsupported pair on
      // subscribe. Logged at warn so an unexpected flood is visible, but
      // not at error since long-tail listings drift.
      opts.log.warn({ code: frame.error.code, msg: frame.error.message }, 'gateio.ws.error');
      return;
    }
    if (frame.event === 'subscribe' || frame.event === 'unsubscribe') return;
    if (frame.channel !== 'spot.tickers') return;
    const r = frame.result as GateioTickerResult | undefined;
    if (!r || typeof r.currency_pair !== 'string' || !r.currency_pair.endsWith('_USDT')) return;
    const symbol = r.currency_pair.slice(0, -5);
    if (symbol.length === 0) return;
    const price = r.last !== undefined ? Number.parseFloat(r.last) : NaN;
    if (!Number.isFinite(price) || price <= 0) return;
    const pctRaw = r.change_percentage !== undefined ? Number.parseFloat(r.change_percentage) : NaN;
    // Gate.io's `change_percentage` is already in percent (e.g. "5.0" for 5%).
    const pct = Number.isFinite(pctRaw) ? pctRaw : null;
    coveredSymbols.add(symbol);
    opts.onUpdate([{ symbol, priceUsd: price, pctChange24h: pct }]);
  };

  const connect = (): void => {
    if (stopped) return;
    ws = new WebSocket(STREAM_URL);

    ws.on('open', () => {
      backoff = RECONNECT_INITIAL_MS;
      opts.log.info({ symbolCount: opts.symbols.length }, 'gateio.ws.open');
      if (ws) sendSubscribes(ws);
    });

    ws.on('message', (data) => handleFrame(data.toString()));

    ws.on('error', (err) => {
      opts.log.warn({ err: err.message }, 'gateio.ws.error');
    });

    ws.on('close', (code) => {
      if (stopped) return;
      opts.log.warn({ code, backoffMs: backoff }, 'gateio.ws.closed reconnecting');
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
