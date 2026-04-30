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
 *
 * ADR-0003: bull/bear/gold added for $-first team-builder redesign.
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
        'paper-deep': '#e0d7c5',
        ink: '#1a1814',
        'ink-soft': '#4a4540',
        muted: '#8a8478',
        rule: '#d0c5b0',
        'rule-soft': '#e3d9c4',
        // `line` is the TZ-001 token name; alias of `rule` for JSX porting parity.
        line: '#d0c5b0',
        accent: '#d4441c',
        note: '#fef08a',
        'code-bg': '#f0e6d0',
        'hl-blue': '#2563eb',
        'hl-green': '#16a34a',
        'hl-red': '#dc2626',

        // ADR-0003: $-first semantic colors for team-builder redesign.
        bull: '#1f8a3e',
        bear: '#c0392b',
        gold: '#b8842c',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        // ADR-0003 / TZ-001 type scales for redesign screens.
        countdown: ['56px', { fontWeight: '700', lineHeight: '1', letterSpacing: '-0.03em' }],
        'big-number': ['32px', { fontWeight: '700', lineHeight: '1.05' }],
        'pnl-big': ['24px', { fontWeight: '700', lineHeight: '1.1' }],
        label: ['10px', { fontWeight: '700', letterSpacing: '0.08em', lineHeight: '1.2' }],
      },
      transitionTimingFunction: {
        sheet: 'cubic-bezier(0.2, 0.8, 0.25, 1)',
      },
      transitionDuration: {
        sheet: '220ms',
      },
    },
  },
  plugins: [],
} satisfies Config;
