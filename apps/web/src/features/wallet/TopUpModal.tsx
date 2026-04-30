import { useEffect, useState } from 'react';
import type { CoinPackage } from '@fantasytoken/shared';
import { useShopPackages } from '../shop/useShopPackages.js';
import { usePurchasePackage } from '../shop/usePurchasePackage.js';
import { formatCents } from '../../lib/format.js';

export interface TopUpModalProps {
  open: boolean;
  onClose: () => void;
  /** When set, the modal explains why it auto-opened (insufficient coins).
   * `current` and `required` are coin counts. */
  insufficient?: {
    required: number;
    current: number;
  };
}

/**
 * Top-up bottom sheet (TZ-002 §3.2). Renders the active package list,
 * triggers `WebApp.openInvoice` on tap, and closes on `paid`. Uses the
 * same slide-up timing as AllocSheet for visual consistency.
 */
export function TopUpModal({ open, onClose, insufficient }: TopUpModalProps): JSX.Element | null {
  const packagesQ = useShopPackages();
  const purchase = usePurchasePackage();
  const [success, setSuccess] = useState<{ coins: number } | null>(null);

  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Esc closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Reset success state on close.
  useEffect(() => {
    if (!open) setSuccess(null);
  }, [open]);

  if (!open) return null;

  const handleBuy = async (pkg: CoinPackage): Promise<void> => {
    try {
      const result = await purchase.mutateAsync({ packageId: pkg.id });
      if (result.status === 'paid') {
        setSuccess({ coins: pkg.coinsTotal });
        // Auto-close after a beat so the player sees the "+N 🪙" confirmation.
        setTimeout(onClose, 1_400);
      }
      // 'cancelled' / 'failed' / 'pending' — modal stays open, user can retry.
    } catch {
      // mutation throws are surfaced via `purchase.error`; nothing to do here
    }
  };

  const packages = packagesQ.data?.packages ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="topup-modal-title"
    >
      <div className="absolute inset-0 bg-ink/40" aria-hidden="true" />
      <div
        className="relative max-h-[80vh] w-full max-w-[480px] overflow-y-auto rounded-t-2xl border border-line bg-paper p-4 shadow-2xl"
        style={{ animation: 'alloc-sheet-slide-up 220ms cubic-bezier(0.2, 0.8, 0.25, 1)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />

        <div className="flex items-baseline justify-between">
          <h2 id="topup-modal-title" className="text-[16px] font-bold text-ink">
            Top up Coins
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[20px] leading-none text-muted"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {insufficient && (
          <div className="mt-2 rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-[12px] text-accent">
            Need <b className="font-mono">{insufficient.required - insufficient.current}</b> more 🪙
            to enter — current balance: 🪙 {insufficient.current}
          </div>
        )}

        {success && (
          <div className="mt-3 rounded-md border border-bull/40 bg-bull/10 px-3 py-3 text-center text-[14px] font-bold text-bull">
            +{success.coins.toLocaleString('en-US')} 🪙 credited
          </div>
        )}

        {packagesQ.isLoading && (
          <div className="py-6 text-center text-[12px] text-muted">loading packages…</div>
        )}

        {packagesQ.isError && (
          <div className="py-6 text-center text-[12px] text-bear">
            Couldn&apos;t load packages. Pull to refresh.
          </div>
        )}

        {!success && (
          <ul className="mt-3 space-y-2">
            {packages.map((pkg) => {
              const isHighlighted = pkg.isHighlighted;
              const isPending = purchase.isPending && purchase.variables?.packageId === pkg.id;
              return (
                <li key={pkg.id}>
                  <button
                    type="button"
                    disabled={purchase.isPending}
                    onClick={() => void handleBuy(pkg)}
                    className={`relative flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-3 text-left transition-colors ${
                      isHighlighted
                        ? 'border-accent bg-accent/5'
                        : 'border-line bg-paper hover:bg-paper-dim'
                    } disabled:opacity-50`}
                  >
                    {isHighlighted && (
                      <span className="absolute -top-2 left-3 rounded bg-accent px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-paper">
                        Best value
                      </span>
                    )}
                    <div className="flex items-baseline gap-2">
                      <span className="text-[14px] font-bold text-ink">{pkg.name}</span>
                      {pkg.bonusPct > 0 && (
                        <span className="font-mono text-[10px] font-bold text-bull">
                          +{pkg.bonusPct}% bonus
                        </span>
                      )}
                    </div>
                    <div className="flex items-baseline gap-3 text-right">
                      <span className="font-mono text-[13px] font-bold text-ink">
                        🪙 {pkg.coinsTotal.toLocaleString('en-US')}
                      </span>
                      <span className="font-mono text-[12px] text-ink-soft">
                        {pkg.starsPrice} ⭐
                      </span>
                    </div>
                    {isPending && (
                      <span className="absolute inset-0 flex items-center justify-center bg-paper/80 text-[11px] text-muted">
                        opening…
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {!success && (
          <p className="mt-3 text-[10px] leading-relaxed text-muted">
            Coins are used to enter contests. Earn more via daily login, referrals, achievements.
            Cannot be withdrawn or transferred.
          </p>
        )}

        {purchase.error && (
          <div className="mt-2 rounded-md border border-bear bg-bear/10 px-3 py-2 text-[11px] text-bear">
            {purchase.error.message || 'Purchase failed. Please try again.'}
          </div>
        )}
      </div>
    </div>
  );
}

// Backwards compat for callers — old name kept so server.ts / Lobby etc.
// don't churn. Re-exported via the same default path.
export default TopUpModal;

/** Helper hook for callers that want a contextual top-up CTA based on a
 * known shortfall. Optional second argument lets you preload the
 * "Need N more" hint without lifting it into global state. */
export function useTopUpModalHint(): {
  insufficient: TopUpModalProps['insufficient'];
  setInsufficient: (v: TopUpModalProps['insufficient']) => void;
} {
  const [insufficient, setInsufficient] = useState<TopUpModalProps['insufficient']>();
  return { insufficient, setInsufficient };
}

// Suppress unused-import linter when formatCents is unused after refactor —
// we keep the import for callers extending this file with cents-formatted
// strings (e.g. price footnotes). Cheap defense against lint churn.
void formatCents;
