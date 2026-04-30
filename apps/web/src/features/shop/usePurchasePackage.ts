import { useMutation, useQueryClient } from '@tanstack/react-query';
import WebApp from '@twa-dev/sdk';
import { InvoiceCreateResponse } from '@fantasytoken/shared';
import { apiFetch } from '../../lib/api-client.js';

export type PurchaseStatus = 'paid' | 'cancelled' | 'failed' | 'pending';

export interface PurchaseResult {
  status: PurchaseStatus;
  packageId: string;
}

/**
 * Two-step purchase mutation:
 *   1. POST /shop/invoice — server creates a TG invoice link with our payload.
 *   2. WebApp.openInvoice(link) — TG draws its native payment sheet; the
 *      callback fires with `paid` / `cancelled` / `failed` / `pending`.
 *
 * On `paid` we invalidate the user query so the BalanceWidget refetches
 * the new coin balance. The callback resolves the mutation promise so the
 * modal can branch on the status (close / stay open).
 */
export function usePurchasePackage() {
  const qc = useQueryClient();
  return useMutation<PurchaseResult, Error, { packageId: string }>({
    mutationFn: async ({ packageId }) => {
      const { invoiceLink } = await apiFetch('/shop/invoice', InvoiceCreateResponse, {
        method: 'POST',
        body: JSON.stringify({ packageId }),
      });
      return new Promise<PurchaseResult>((resolve) => {
        WebApp.openInvoice(invoiceLink, (status) => {
          resolve({ status: status as PurchaseStatus, packageId });
          // Side-effect on success: ensure all balance views refetch.
          // Side-effects in the mutation function (rather than onSuccess)
          // because the callback fires asynchronously after the mutation's
          // immediate "I dispatched the openInvoice" step.
          if (status === 'paid') {
            void qc.invalidateQueries({ queryKey: ['me'] });
            void qc.invalidateQueries({ queryKey: ['profile'] });
          }
        });
      });
    },
  });
}
