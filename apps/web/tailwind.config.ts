import type { Config } from 'tailwindcss';

/**
 * Tailwind colors mapped to Telegram theme variables.
 * https://core.telegram.org/bots/webapps#themeparams
 *
 * Always prefer `bg-tg-*` / `text-tg-*` over hardcoded colors so the app
 * automatically respects the user's TG theme (light / dark / custom).
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'tg-bg': 'var(--tg-theme-bg-color, #ffffff)',
        'tg-bg-secondary': 'var(--tg-theme-secondary-bg-color, #f4f4f5)',
        'tg-text': 'var(--tg-theme-text-color, #000000)',
        'tg-hint': 'var(--tg-theme-hint-color, #707579)',
        'tg-link': 'var(--tg-theme-link-color, #2481cc)',
        'tg-button': 'var(--tg-theme-button-color, #2481cc)',
        'tg-button-text': 'var(--tg-theme-button-text-color, #ffffff)',
        'tg-secondary-bg': 'var(--tg-theme-secondary-bg-color, #f0f0f0)',
        'tg-error': 'var(--tg-theme-destructive-text-color, #cc2929)',
      },
    },
  },
  plugins: [],
} satisfies Config;
