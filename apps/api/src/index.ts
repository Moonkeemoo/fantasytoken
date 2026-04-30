import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { loadConfig } from './config.js';
import { createDatabase } from './db/client.js';
import { createLogger } from './logger.js';
import { createServer } from './server.js';

async function main() {
  const config = loadConfig();
  const logger = createLogger(config);
  const db = createDatabase(config);

  // Auto-migrate on boot. Idempotent: drizzle tracks applied migrations
  // via the `__drizzle_migrations` table, so a redeploy with no new
  // migrations is a no-op. Folder resolution works in both dev (tsx
  // running from src/) and prod (node from dist/) — the build script
  // copies src/db/migrations into dist/db/migrations.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const migrationsFolder = path.resolve(here, 'db/migrations');
  try {
    await migrate(db, { migrationsFolder });
    logger.info({ migrationsFolder }, 'migrations applied');
  } catch (err) {
    logger.fatal({ err, migrationsFolder }, 'migrations failed — aborting boot');
    process.exit(1);
  }

  const { app, stopCrons } = await createServer({ config, logger, db });

  try {
    await app.listen({ port: config.PORT, host: '0.0.0.0' });
    logger.info({ port: config.PORT, env: config.NODE_ENV }, 'API listening');
  } catch (err) {
    logger.fatal({ err }, 'Failed to start server');
    process.exit(1);
  }

  // Graceful shutdown — INV-7: never silent-die on signal.
  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => {
      logger.info({ sig }, 'Shutting down');
      stopCrons();
      app.close().then(
        () => process.exit(0),
        (err: unknown) => {
          logger.error({ err }, 'Error during shutdown');
          process.exit(1);
        },
      );
    });
  }
}

main().catch((err: unknown) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
