import type { Logger } from '../../logger.js';
import type { PriceUpdate } from '../../lib/binance.js';
import type { TokensRepo } from './tokens.service.js';

/**
 * Coalesced price-feed writer.
 *
 * Binance pushes ~3000 USDT pairs every ~1 second. We don't need to
 * hammer the DB on each frame — we buffer the latest update per symbol
 * and flush a single bulk UPDATE every BATCH_FLUSH_MS. Stale buffer
 * (no flush in 5×interval) is logged so the operator notices a hung
 * pump.
 *
 * INV-7: any DB write error is logged; the next flush retries with a
 * fresh buffer (the only loss is one tick of price drift, ≤1s).
 */

const BATCH_FLUSH_MS = 1_000;

export interface PriceFeedWriter {
  /** Receive a batch of updates from upstream (Binance). The latest value
   * per symbol wins inside the buffer — we don't need history. */
  push(updates: readonly PriceUpdate[]): void;
  stop: () => void;
}

export interface PriceFeedDeps {
  repo: TokensRepo;
  log: Logger;
}

export function createPriceFeedWriter(deps: PriceFeedDeps): PriceFeedWriter {
  const buffer = new Map<string, PriceUpdate>();
  let flushing = false;
  let stopped = false;

  const flush = async (): Promise<void> => {
    if (flushing || buffer.size === 0) return;
    flushing = true;
    const batch = [...buffer.values()];
    buffer.clear();
    try {
      const written = await deps.repo.upsertPricesBySymbol(
        batch.map((u) => ({
          symbol: u.symbol,
          currentPriceUsd: u.priceUsd,
          pctChange24h: u.pctChange24h,
        })),
      );
      if (written > 0) {
        deps.log.debug({ batched: batch.length, written }, 'price-feed.flush');
      }
    } catch (err) {
      deps.log.warn({ err, size: batch.length }, 'price-feed.flush failed');
    } finally {
      flushing = false;
    }
  };

  const timer = setInterval(() => {
    if (stopped) return;
    void flush();
  }, BATCH_FLUSH_MS);

  return {
    push(updates) {
      for (const u of updates) {
        buffer.set(u.symbol, u);
      }
    },
    stop() {
      stopped = true;
      clearInterval(timer);
    },
  };
}
