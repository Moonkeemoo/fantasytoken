import type { CoinPackage as CoinPackageWire } from '@fantasytoken/shared';
import type { Logger } from '../../logger.js';
import type { CurrencyService } from '../currency/currency.service.js';

interface CoinPackageRow {
  id: string;
  name: string;
  starsPrice: number;
  coinsBase: number;
  bonusPct: number;
  isHighlighted: boolean;
  sortOrder: number;
}

export interface ShopRepo {
  listActive(): Promise<CoinPackageRow[]>;
  findById(id: string): Promise<CoinPackageRow | null>;
  /** Idempotency lookup: returns the existing tx row if a duplicate webhook
   * already credited this `payment_charge_id`. Belt-and-suspenders alongside
   * the UNIQUE index — the index is the hard guarantee, this query lets us
   * surface a clean log line on retries. */
  findExistingPaymentTx(paymentChargeId: string): Promise<{ id: string } | null>;
  reconcileUser(userId: string): Promise<{ cached: bigint; computed: bigint } | null>;
}

export interface BotApi {
  createInvoiceLink(args: {
    title: string;
    description: string;
    payload: string;
    /** Empty string for Stars-based payments. */
    provider_token: string;
    /** `XTR` for Telegram Stars. */
    currency: string;
    prices: Array<{ label: string; amount: number }>;
  }): Promise<string>;
}

export interface CreateInvoiceArgs {
  packageId: string;
  /** Carried in invoice payload so the webhook handler can route credit back
   * to the right internal user without a separate TG-id lookup race. */
  internalUserId: string;
}

export interface CreditPaymentArgs {
  /** Raw payload string from `successful_payment.invoice_payload`. */
  invoicePayload: string;
  /** TG-issued unique id; UNIQUE in our ledger to defend against retries. */
  telegramPaymentChargeId: string;
  /** What TG actually charged (in Stars). Validated against package price. */
  totalAmount: number;
}

export interface PreCheckoutArgs {
  invoicePayload: string;
  totalAmount: number;
}

export interface ShopService {
  listPackages(): Promise<CoinPackageWire[]>;
  createInvoice(args: CreateInvoiceArgs): Promise<{ invoiceLink: string }>;
  /** Validate before TG accepts the charge. Bot has 10s; keep this fast. */
  validatePreCheckout(args: PreCheckoutArgs): Promise<{ ok: true } | { ok: false; reason: string }>;
  /** Atomic credit on successful_payment update. Idempotent on
   * `telegramPaymentChargeId`. */
  creditFromPayment(
    args: CreditPaymentArgs,
  ): Promise<{ alreadyCredited: boolean; coinsCredited: number }>;
}

export interface ShopServiceDeps {
  repo: ShopRepo;
  currency: CurrencyService;
  bot: BotApi;
  log: Logger;
}

interface InvoicePayload {
  packageId: string;
  userId: string;
}

function totalCoinsFor(pkg: { coinsBase: number; bonusPct: number }): number {
  return Math.round(pkg.coinsBase * (1 + pkg.bonusPct / 100));
}

function rowToWire(row: CoinPackageRow): CoinPackageWire {
  return {
    id: row.id,
    name: row.name,
    starsPrice: row.starsPrice,
    coinsBase: row.coinsBase,
    bonusPct: row.bonusPct,
    coinsTotal: totalCoinsFor(row),
    isHighlighted: row.isHighlighted,
    sortOrder: row.sortOrder,
  };
}

function parsePayload(s: string): InvoicePayload | null {
  try {
    const obj = JSON.parse(s) as unknown;
    if (
      obj &&
      typeof obj === 'object' &&
      'packageId' in obj &&
      'userId' in obj &&
      typeof (obj as Record<string, unknown>).packageId === 'string' &&
      typeof (obj as Record<string, unknown>).userId === 'string'
    ) {
      return obj as InvoicePayload;
    }
    return null;
  } catch {
    return null;
  }
}

export function createShopService(deps: ShopServiceDeps): ShopService {
  return {
    async listPackages() {
      const rows = await deps.repo.listActive();
      return rows.map(rowToWire);
    },

    async createInvoice({ packageId, internalUserId }) {
      const pkg = await deps.repo.findById(packageId);
      if (!pkg) throw new Error(`Unknown or inactive package: ${packageId}`);

      const coinsTotal = totalCoinsFor(pkg);
      const description =
        pkg.bonusPct > 0
          ? `${coinsTotal.toLocaleString('en-US')} coins (${pkg.bonusPct}% bonus)`
          : `${coinsTotal.toLocaleString('en-US')} coins`;

      const payload: InvoicePayload = { packageId: pkg.id, userId: internalUserId };

      const invoiceLink = await deps.bot.createInvoiceLink({
        title: pkg.name,
        description,
        payload: JSON.stringify(payload),
        provider_token: '',
        currency: 'XTR',
        prices: [{ label: pkg.name, amount: pkg.starsPrice }],
      });

      return { invoiceLink };
    },

    async validatePreCheckout({ invoicePayload, totalAmount }) {
      const payload = parsePayload(invoicePayload);
      if (!payload) return { ok: false, reason: 'Invalid payload' };
      const pkg = await deps.repo.findById(payload.packageId);
      if (!pkg) return { ok: false, reason: 'Package not found' };
      if (pkg.starsPrice !== totalAmount) return { ok: false, reason: 'Amount mismatch' };
      return { ok: true };
    },

    async creditFromPayment({ invoicePayload, telegramPaymentChargeId, totalAmount }) {
      const payload = parsePayload(invoicePayload);
      if (!payload) {
        deps.log.warn({ telegramPaymentChargeId }, 'shop.credit invalid payload');
        throw new Error('Invalid invoice payload');
      }

      const existing = await deps.repo.findExistingPaymentTx(telegramPaymentChargeId);
      if (existing) {
        deps.log.warn(
          { telegramPaymentChargeId, txId: existing.id },
          'shop.credit duplicate webhook (idempotency)',
        );
        return { alreadyCredited: true, coinsCredited: 0 };
      }

      const pkg = await deps.repo.findById(payload.packageId);
      if (!pkg) throw new Error(`Package gone after charge: ${payload.packageId}`);
      if (pkg.starsPrice !== totalAmount) {
        // We accept the credit anyway (charge already happened, can't refund
        // automatically), but log loudly. Manual reconciliation needed.
        deps.log.warn(
          {
            telegramPaymentChargeId,
            packageId: pkg.id,
            expected: pkg.starsPrice,
            actual: totalAmount,
          },
          'shop.credit amount mismatch — crediting based on package value',
        );
      }

      const coinsToCredit = totalCoinsFor(pkg);

      await deps.currency.transact({
        userId: payload.userId,
        deltaCents: BigInt(coinsToCredit),
        type: 'COINS_PURCHASE',
        refType: 'package',
        refId: pkg.id,
        paymentChargeId: telegramPaymentChargeId,
      });

      return { alreadyCredited: false, coinsCredited: coinsToCredit };
    },
  };
}
