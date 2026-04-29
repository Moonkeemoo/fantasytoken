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
    // URLSearchParams encodes spaces as '+' which TG renders literally in the caption.
    // Use percent-encoded form (RFC 3986) so spaces stay spaces in the chat preview.
    const u = encodeURIComponent(url);
    const t = encodeURIComponent(text);
    WebApp.openTelegramLink(`https://t.me/share/url?url=${u}&text=${t}`);
  },
};
