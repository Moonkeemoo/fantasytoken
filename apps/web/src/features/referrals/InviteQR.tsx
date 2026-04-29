import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { buildInviteUrl } from '../../lib/referral.js';

/**
 * QR rendering for the user's invite link — REFERRAL_SYSTEM.md §6.1 (3rd CTA
 * "Show QR"). Uses qrcode lib to render a data:image PNG; lib is small (~30kb)
 * so we don't bother with dynamic import. Component is collapsed by default
 * and only mounts after the user taps "Show QR" — bundle pulls qrcode lazily
 * via the ReferralsSection toggle (see useState gate there).
 */
export function InviteQR({ telegramId, sizePx = 220 }: { telegramId: number; sizePx?: number }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(buildInviteUrl(telegramId), {
      width: sizePx,
      margin: 1,
      // Paper aesthetic — match the bg-paper-dim panel it sits inside.
      color: { dark: '#1a1814', light: '#f6f1e8' },
      errorCorrectionLevel: 'M',
    })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [telegramId, sizePx]);

  if (err) return <div className="text-[11px] text-hl-red">QR error: {err}</div>;
  if (!dataUrl) return <div className="text-[11px] text-muted">generating…</div>;

  return (
    <div className="flex flex-col items-center gap-2 rounded-[6px] border-[1.5px] border-ink bg-paper-dim p-3">
      <img src={dataUrl} alt="invite QR" width={sizePx} height={sizePx} />
      <p className="text-center text-[10px] text-muted">scan to open the invite</p>
    </div>
  );
}
