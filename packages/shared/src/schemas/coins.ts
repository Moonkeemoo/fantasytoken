import { z } from 'zod';

/**
 * Coin economy wire shapes (TZ-002).
 *
 * `1 coin = $1` display unit. `1 Star = 10 coins` exchange rate. The previous
 * USD-cents currency layer has been wiped; existing column names like
 * `entry_fee_cents` now hold whole coins (a follow-up rename pass is on the
 * roadmap but not blocking v1).
 */

export const CoinPackage = z.object({
  id: z.string(),
  name: z.string(),
  starsPrice: z.number().int().positive(),
  coinsBase: z.number().int().positive(),
  /** 0..100 — applied at credit time as `round(coinsBase × (1 + bonusPct/100))`. */
  bonusPct: z.number().int().min(0).max(100),
  /** Total coins credited (base + bonus). Server-computed so the client
   * doesn't have to mirror the rounding rule. */
  coinsTotal: z.number().int().positive(),
  isHighlighted: z.boolean(),
  sortOrder: z.number().int(),
});
export type CoinPackage = z.infer<typeof CoinPackage>;

export const CoinPackagesResponse = z.object({
  packages: z.array(CoinPackage),
});
export type CoinPackagesResponse = z.infer<typeof CoinPackagesResponse>;

export const InvoiceCreateBody = z.object({
  packageId: z.string(),
});
export type InvoiceCreateBody = z.infer<typeof InvoiceCreateBody>;

export const InvoiceCreateResponse = z.object({
  /** TG-issued invoice link to feed into `WebApp.openInvoice(...)`. */
  invoiceLink: z.string(),
});
export type InvoiceCreateResponse = z.infer<typeof InvoiceCreateResponse>;

export const CoinsBalanceResponse = z.object({
  coins: z.number().int().nonnegative(),
});
export type CoinsBalanceResponse = z.infer<typeof CoinsBalanceResponse>;
