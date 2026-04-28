import { loadConfig } from './config.js';
import { createDatabase } from './db/client.js';
import { createLogger } from './logger.js';
import { createServer } from './server.js';

async function main() {
  const config = loadConfig();
  const logger = createLogger(config);
  const db = createDatabase(config);

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
