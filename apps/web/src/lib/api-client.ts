import WebApp from '@twa-dev/sdk';
import type { z, ZodTypeAny } from 'zod';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
if (!API_BASE_URL) throw new Error('VITE_API_BASE_URL is required');

/**
 * Typed fetch wrapper.
 *
 * - Sends Telegram initData in `x-telegram-init-data` so backend can HMAC-validate (INV-1).
 * - Validates response via zod schema from `@fantasytoken/shared` — no `as Type` casts.
 * - Surfaces errors loudly (INV-7 spirit on the client).
 */
export async function apiFetch<S extends ZodTypeAny>(
  path: string,
  schema: S,
  init?: RequestInit,
): Promise<z.infer<S>> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-telegram-init-data': WebApp.initData,
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API ${res.status} ${path}: ${body}`);
  }

  const json: unknown = await res.json();
  return schema.parse(json);
}
