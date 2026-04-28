import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    passWithNoTests: true,
    env: {
      DATABASE_URL:
        process.env.DATABASE_URL ??
        'postgres://fantasytoken:fantasytoken@localhost:5432/fantasytoken',
      TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN ?? 'test-token',
    },
  },
});
