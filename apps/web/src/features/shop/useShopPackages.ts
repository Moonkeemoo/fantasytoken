import { useQuery } from '@tanstack/react-query';
import { CoinPackagesResponse } from '@fantasytoken/shared';
import { apiFetch } from '../../lib/api-client.js';

/**
 * Coin packages catalogue — server-controlled so prices/bonuses can be
 * tuned without a client deploy.
 */
export function useShopPackages() {
  return useQuery({
    queryKey: ['shop', 'packages'],
    queryFn: () => apiFetch('/shop/packages', CoinPackagesResponse),
    staleTime: 5 * 60_000,
  });
}
