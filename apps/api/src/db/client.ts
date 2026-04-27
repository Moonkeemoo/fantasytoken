import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { Config } from '../config.js';
import * as schema from './schema/index.js';

export type Database = ReturnType<typeof createDatabase>;

export function createDatabase(config: Config) {
  const client = postgres(config.DATABASE_URL, {
    max: 10,
    idle_timeout: 20,
  });
  return drizzle(client, { schema });
}
