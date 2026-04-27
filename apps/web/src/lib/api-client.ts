import WebApp from '@twa-dev/sdk';
import type { z, ZodTypeAny } from 'zod';

/**
 * Typed fetch wrapper.
 *
 * - Sends Telegram initData in `x-telegram-init-data` so backend can HMAC-validate (INV-1).
 * - Validates response via zod schema from `@fantasytoken/shared` — no `as Type` casts.
 * - Surfaces errors loudly (INV-7 spirit on the client).
 *
 * Env check is inside the call (not at module load) so the rest of the app
 * can render even if the env var is missing — e.g. a misconfigured preview
 * deploy still loads the static UI; only API calls fail with a clear message.
 */
export async function apiFetch<S extends ZodTypeAny>(
  path: string,
  schema: S,
  init?: RequestInit,
): Promise<z.infer<S>> {
  const baseUrl = import.meta.env.VITE_API_BASE_URL;
  if (!baseUrl) {
    throw new Error('VITE_API_BASE_URL is not set — backend calls disabled');
  }

  const res = await fetch(`${baseUrl}${path}`, {
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

export function getApiBaseUrl(): string | undefined {
  return import.meta.env.VITE_API_BASE_URL;
}
