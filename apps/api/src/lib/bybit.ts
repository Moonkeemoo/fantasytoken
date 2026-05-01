import WebSocket from 'ws';
import type { Logger } from '../logger.js';
import type { PriceUpdate } from './binance.js';

/**
 * Bybit public spot tickers WebSocket — drop-in replacement for the
 * Binance feed when our hosting provider's IP is geo-blocked by
 * Binance (HTTP 451 from `stream.binance.com`).
 *
 * Differences from `!ticker@arr` on Binance:
 *   - No "all symbols" topic. We subscribe explicitly to each
 *     `tickers.{SYMBOL}USDT` topic. Bybit caps each subscribe message
 *     at ~10 args, so we batch 10 at a time.
 *   - Heartbeat required: `{op:"ping"}` every ~20s, otherwise the
 *     server closes the connection.
 *   - Per-tick frames are `{topic, type, data, ts}` where `type` is
 *     `'snapshot'` or `'delta'`. The `data` object carries `symbol`,
 *     `lastPrice`, `price24hPcnt` (decimal — multiply by 100 for %).
 *
 * Reconnect strategy: on close, exponential backoff capped at 30s.
 * Same shape (`PriceUpdate`) emitted upstream so the price-feed
 * router doesn't change.
 */

const STREAM_URL = 'wss://stream.bybit.com/v5/public/spot';
const RECONNECT_INITIAL_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const HEARTBEAT_MS = 15_000;
const SUBSCRIBE_BATCH = 10;
const SUBSCRIBE_DELAY_MS = 100;

export interface BybitFeedHandle {
  stop: () => void;
  getCoveredSymbols: () => ReadonlySet<string>;
}

export interface BybitFeedOptions {
  log: Logger;
  /** List of base symbols to subscribe to, e.g. ['BTC','ETH','SOL'].
   * We append USDT and send `tickers.<SYMBOL>USDT` subscribe args.
   * Symbols Bybit doesn't list are silently dropped (the server returns
   * a one-shot error message and we ignore the topic). Caller refreshes
   * this list periodically — see `setSymbols`. */
  symbols: readonly string[];
  onUpdate: (updates: readonly PriceUpdate[]) => void;
}

interface BybitTickerData {
  symbol?: string;
  lastPrice?: string;
  price24hPcnt?: string;
}

interface BybitFrame {
  topic?: string;
  type?: string;
  data?: BybitTickerData | BybitTickerData[];
  // op-frame fields
  op?: string;
  success?: boolean;
  ret_msg?: string;
}

export function startBybitFeed(opts: BybitFeedOptions): BybitFeedHandle {
  let ws: WebSocket | null = null;
  let stopped = false;
  let backoff = RECONNECT_INITIAL_MS;
  let coveredSymbols: Set<string> = new Set();
  let heartbeatTimer: NodeJS.Timeout | null = null;

  const subscribeArgsForSymbols = (syms: readonly string[]): string[] =>
    syms.map((s) => `tickers.${s.toUpperCase()}USDT`);

  const sendSubscribes = (sock: WebSocket): void => {
    const args = subscribeArgsForSymbols(opts.symbols);
    if (args.length === 0) return;
    // Stagger small batches so Bybit doesn't drop us for spam.
    let i = 0;
    const sendNext = (): void => {
      if (sock.readyState !== WebSocket.OPEN || i >= args.length) return;
      const slice = args.slice(i, i + SUBSCRIBE_BATCH);
      i += SUBSCRIBE_BATCH;
      try {
        sock.send(JSON.stringify({ op: 'subscribe', args: slice }));
      } catch (err) {
        opts.log.warn({ err }, 'bybit.ws.subscribe send failed');
      }
      if (i < args.length) setTimeout(sendNext, SUBSCRIBE_DELAY_MS);
    };
    sendNext();
  };

  const startHeartbeat = (sock: WebSocket): void => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
      if (sock.readyState !== WebSocket.OPEN) return;
      try {
        sock.send(JSON.stringify({ op: 'ping' }));
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

  // Per-symbol latest-known state, merged across snapshot + delta frames.
  // Bybit V5 spot tickers send `type: 'snapshot'` once on subscribe and
  // `type: 'delta'` on every change, with delta containing ONLY changed
  // fields. So a delta frame for a stable price has no `lastPrice` —
  // ignoring those would mean we never bump `last_updated_at` for quiet
  // markets, which breaks our "stale → ask CoinGecko" filter.
  // The merge below carries the snapshot price forward so every delta
  // frame produces an update (with the latest known price).
  const lastKnown = new Map<string, { priceUsd: number; pctChange24h: number | null }>();

  const handleFrame = (frame: BybitFrame): void => {
    if (frame.op === 'ping' || frame.op === 'pong') return; // heartbeat
    if (typeof frame.topic !== 'string' || !frame.topic.startsWith('tickers.')) return;
    const list: BybitTickerData[] = Array.isArray(frame.data)
      ? frame.data
      : frame.data
        ? [frame.data]
        : [];
    if (list.length === 0) return;
    const updates: PriceUpdate[] = [];
    for (const t of list) {
      if (typeof t.symbol !== 'string' || !t.symbol.endsWith('USDT')) continue;
      const symbol = t.symbol.slice(0, -4);
      if (symbol.length === 0) continue;

      const prev = lastKnown.get(symbol) ?? null;
      const priceFromFrame = t.lastPrice !== undefined ? Number.parseFloat(t.lastPrice) : NaN;
      // Bybit `price24hPcnt` is decimal (0.05 = 5%); our schema expects
      // percent-as-number (5 for 5%). Multiply by 100.
      const pctRaw = t.price24hPcnt !== undefined ? Number.parseFloat(t.price24hPcnt) : NaN;

      const priceUsd =
        Number.isFinite(priceFromFrame) && priceFromFrame > 0 ? priceFromFrame : prev?.priceUsd;
      const pctChange24h = Number.isFinite(pctRaw) ? pctRaw * 100 : (prev?.pctChange24h ?? null);

      // Skip only if we have NO known price for this symbol yet (delta
      // arrived before snapshot — rare but possible on slow links).
      if (priceUsd === undefined || !Number.isFinite(priceUsd) || priceUsd <= 0) continue;

      lastKnown.set(symbol, { priceUsd, pctChange24h });
      updates.push({ symbol, priceUsd, pctChange24h });
      coveredSymbols.add(symbol);
    }
    if (updates.length > 0) opts.onUpdate(updates);
  };

  const connect = (): void => {
    if (stopped) return;
    ws = new WebSocket(STREAM_URL);

    ws.on('open', () => {
      backoff = RECONNECT_INITIAL_MS;
      opts.log.info({ symbolCount: opts.symbols.length }, 'bybit.ws.open');
      if (ws) {
        sendSubscribes(ws);
        startHeartbeat(ws);
      }
    });

    let frameCount = 0;
    let tickerCount = 0;
    let lastLog = Date.now();
    ws.on('message', (data) => {
      try {
        const frame = JSON.parse(data.toString()) as BybitFrame;
        frameCount += 1;
        if (typeof frame.topic === 'string' && frame.topic.startsWith('tickers.')) {
          tickerCount += 1;
        }
        // Diagnostic: log subscribe responses (one-shot per topic) and a
        // periodic counter so we can see if the WS is silent vs flooding.
        if (frame.op === 'subscribe' && frame.success === false) {
          opts.log.warn({ ret_msg: frame.ret_msg, op: frame.op }, 'bybit.ws.subscribe rejected');
        }
        const now = Date.now();
        if (now - lastLog > 30_000) {
          opts.log.info({ frames: frameCount, tickers: tickerCount }, 'bybit.ws.heartbeat');
          frameCount = 0;
          tickerCount = 0;
          lastLog = now;
        }
        handleFrame(frame);
      } catch (err) {
        opts.log.warn({ err }, 'bybit.ws.parse failed');
      }
    });

    ws.on('error', (err) => {
      opts.log.warn({ err: err.message }, 'bybit.ws.error');
    });

    ws.on('close', (code) => {
      stopHeartbeat();
      if (stopped) return;
      opts.log.warn({ code, backoffMs: backoff }, 'bybit.ws.closed reconnecting');
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
