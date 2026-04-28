import WebApp from '@twa-dev/sdk';

/**
 * Thin wrapper around @twa-dev/sdk so feature code doesn't import the SDK directly.
 * Centralizing here lets us mock in tests and swap implementations.
 */
export const telegram = {
  user: () => WebApp.initDataUnsafe.user,
  startParam: () => WebApp.initDataUnsafe.start_param,
  showAlert: (msg: string) => WebApp.showAlert(msg),
  hapticImpact: (style: 'light' | 'medium' | 'heavy' = 'light') =>
    WebApp.HapticFeedback.impactOccurred(style),
  shareToChat: (url: string, text: string) => {
    const params = new URLSearchParams({ url, text });
    WebApp.openTelegramLink(`https://t.me/share/url?${params.toString()}`);
  },
};
