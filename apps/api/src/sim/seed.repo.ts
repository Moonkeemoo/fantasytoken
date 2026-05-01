import { sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import type { SeedRepo } from './seed.service.js';

/**
 * TZ-005 §1 — Postgres-backed seed repo.
 *
 * `synthetic_telegram_id_seq` (created in 0021) hands out monotone positive
 * integers; we negate them so the resulting telegram_id can never collide
 * with a real (always positive) Telegram user. tutorial_done_at is stamped
 * inline so synthetics skip the onboarding redirect on the frontend.
 */
export function createSeedRepo(db: Database): SeedRepo {
  return {
    async createSynthetic({ personaKind, syntheticSeed, handle, firstName }) {
      const rows = await db.execute<{ id: string; telegram_id: string }>(sql`
        INSERT INTO users (
          telegram_id,
          username,
          first_name,
          is_synthetic,
          persona_kind,
          synthetic_seed,
          tutorial_done_at
        ) VALUES (
          -nextval('synthetic_telegram_id_seq'),
          ${handle},
          ${firstName},
          true,
          ${personaKind},
          ${syntheticSeed},
          NOW()
        )
        RETURNING id, telegram_id::text AS telegram_id
      `);
      const r = (rows as unknown as Array<{ id: string; telegram_id: string }>)[0];
      if (!r) throw new Error('seed.createSynthetic: insert returned no row');
      return { id: r.id, telegramId: Number(r.telegram_id) };
    },
  };
}
