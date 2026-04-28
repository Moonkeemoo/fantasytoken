import type { Config } from 'tailwindcss';

/**
 * Tailwind colors mapped to Telegram theme variables.
 * https://core.telegram.org/bots/webapps#themeparams
 *
 * Always prefer `bg-tg-*` / `text-tg-*` over hardcoded colors so the app
 * automatically respects the user's TG theme (light / dark / custom).
 *
 * Paper aesthetic tokens (S5 wireframe skin) are the primary palette for
 * new components. tg-* tokens remain as fallback for existing code.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Telegram theme tokens — preserved as fallback for existing components
        'tg-bg': 'var(--tg-theme-bg-color, #ffffff)',
        'tg-bg-secondary': 'var(--tg-theme-secondary-bg-color, #f4f4f5)',
        'tg-text': 'var(--tg-theme-text-color, #000000)',
        'tg-hint': 'var(--tg-theme-hint-color, #707579)',
        'tg-link': 'var(--tg-theme-link-color, #2481cc)',
        'tg-button': 'var(--tg-theme-button-color, #2481cc)',
        'tg-button-text': 'var(--tg-theme-button-text-color, #ffffff)',
        'tg-secondary-bg': 'var(--tg-theme-secondary-bg-color, #f0f0f0)',
        'tg-error': 'var(--tg-theme-destructive-text-color, #cc2929)',

        // Paper aesthetic — primary palette (wireframes 1:1, S5)
        paper: '#f6f1e8',
        'paper-dim': '#eee5d2',
        ink: '#1a1814',
        'ink-soft': '#4a4540',
        muted: '#8a8478',
        rule: '#d0c5b0',
        'rule-soft': '#e3d9c4',
        accent: '#d4441c',
        note: '#fef08a',
        'code-bg': '#f0e6d0',
        'hl-blue': '#2563eb',
        'hl-green': '#16a34a',
        'hl-red': '#dc2626',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;
