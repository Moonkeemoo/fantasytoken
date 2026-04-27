import WebApp from '@twa-dev/sdk';
import { telegram } from '../../lib/telegram.js';

/**
 * Day 0 status screen. Verifies TG SDK loaded, initData arrived, theme vars
 * applied, and SDK actions (haptic, alert) work. Replace once we have real
 * features.
 */
export function StatusPage() {
  const user = telegram.user();
  const inTelegram = WebApp.platform !== 'unknown';

  return (
    <main className="bg-tg-bg text-tg-text min-h-dvh p-4">
      <h1 className="text-xl font-semibold">Fantasy Token League</h1>
      <p className="text-tg-hint mt-1 text-sm">Day 0 skeleton — verifying TG integration.</p>

      <section className="mt-6">
        <h2 className="text-tg-hint text-xs font-semibold uppercase tracking-wider">Telegram</h2>
        <ul className="mt-2 space-y-1 text-sm">
          <li>{inTelegram ? '✓' : '✗'} Running inside Telegram</li>
          <li>
            Platform: <code className="text-tg-link">{WebApp.platform}</code>
          </li>
          <li>
            Version: <code className="text-tg-link">{WebApp.version}</code>
          </li>
          <li>
            User:{' '}
            <code className="text-tg-link">
              {user ? `${user.first_name} (${user.id})` : 'unavailable'}
            </code>
          </li>
          <li>initData present: {WebApp.initData ? '✓' : '✗ (not running in TG)'}</li>
        </ul>
      </section>

      <section className="mt-6">
        <h2 className="text-tg-hint text-xs font-semibold uppercase tracking-wider">Theme</h2>
        <p className="mt-2 text-sm">
          Color scheme: <code className="text-tg-link">{WebApp.colorScheme}</code>
        </p>
        <button
          type="button"
          className="bg-tg-button text-tg-button-text mt-3 rounded-lg px-4 py-2 text-sm font-medium"
          onClick={() => {
            telegram.hapticImpact('medium');
            telegram.showAlert('SDK works.');
          }}
        >
          Tap to test SDK
        </button>
      </section>
    </main>
  );
}
