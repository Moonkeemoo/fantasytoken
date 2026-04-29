import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Button } from '../../components/ui/Button.js';
import { Label } from '../../components/ui/Label.js';
import { telegram } from '../../lib/telegram.js';
import { buildInviteUrl, openInviteShareSheet } from '../../lib/referral.js';

interface InviteCardModalProps {
  open: boolean;
  onClose: () => void;
  telegramId: number;
  refDisplayName: string;
}

/**
 * Custom in-app invite sheet — replaces the bare TG share dialog so the user
 * sees the offer + QR + their personal code before forwarding. Matches the
 * "V1 · postcard + QR" mockup: title "Bring a friend. Pocket the cut.",
 * code box (QR + REF-{NAME} + URL), three CTAs (Share via TG / Copy / Save).
 */
export function InviteCardModal({
  open,
  onClose,
  telegramId,
  refDisplayName,
}: InviteCardModalProps) {
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCopied(false);
    QRCode.toDataURL(buildInviteUrl(telegramId), {
      width: 180,
      margin: 1,
      color: { dark: '#1a1814', light: '#f6f1e8' },
    })
      .then(setQrUrl)
      .catch(() => setQrUrl(null));
  }, [open, telegramId]);

  if (!open) return null;

  const url = buildInviteUrl(telegramId);
  // Vanity code shown to the user ("REF-TARAS"); the actual deep-link still
  // carries the numeric telegram_id — the code is a UI affordance only.
  const vanityCode = `REF-${refDisplayName.toUpperCase()}`;

  const onShare = () => {
    telegram.hapticImpact('medium');
    openInviteShareSheet(telegramId);
  };
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      telegram.hapticNotification('success');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      telegram.hapticNotification('error');
    }
  };
  const onSave = () => {
    if (!qrUrl) return;
    // Smallest viable "save" — trigger a download of the QR PNG. The full
    // postcard composite (with copy + branding) would need html2canvas;
    // shipping the QR alone for now and we can promote later.
    const a = document.createElement('a');
    a.href = qrUrl;
    a.download = `fantasy-token-invite-${vanityCode.toLowerCase()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    telegram.hapticImpact('light');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/55 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Sheet — paper aesthetic on a tilted-stripe code-bg backdrop. */}
      <div
        className="mt-auto flex flex-col gap-4 rounded-t-[16px] border-t-2 border-ink bg-paper px-4 pb-6 pt-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <Label>your invite card</Label>
          <button
            onClick={onClose}
            className="font-mono text-[12px] uppercase tracking-[0.06em] text-muted"
            aria-label="close"
          >
            ✕
          </button>
        </div>

        <div className="rounded-[6px] border-[1.5px] border-ink bg-paper px-[14px] py-3">
          <div className="flex items-start justify-between">
            <h2 className="text-[22px] font-extrabold leading-[1.05]">
              Bring a friend.
              <br />
              Pocket the cut.
            </h2>
            <span className="rotate-[3deg] rounded-[2px] border-[1.5px] border-accent px-[6px] py-[2px] font-mono text-[9px] font-bold uppercase tracking-[0.06em] text-accent">
              5% forever
            </span>
          </div>
          <p className="mt-2 text-[12px] text-ink-soft">
            They join via your link, play one contest, you both get $25.
          </p>

          {/* Code box: QR + vanity code + URL */}
          <div className="mt-3 flex items-center gap-3 rounded-[4px] border border-rule bg-paper-dim px-[10px] py-[10px]">
            <div className="flex h-[80px] w-[80px] shrink-0 items-center justify-center rounded-[3px] border border-ink bg-paper">
              {qrUrl ? (
                <img src={qrUrl} alt="QR" className="h-full w-full" />
              ) : (
                <span className="font-mono text-[9px] text-muted">…</span>
              )}
            </div>
            <div className="flex-1 overflow-hidden">
              <Label>your code</Label>
              <div className="mt-[2px] truncate font-mono text-[18px] font-extrabold text-accent">
                {vanityCode}
              </div>
              <div className="mt-[2px] truncate font-mono text-[10px] text-muted">{url}</div>
            </div>
          </div>
        </div>

        <Button variant="primary" size="md" onClick={onShare}>
          📨 Share via Telegram
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="ghost" size="md" onClick={onCopy}>
            {copied ? '✓ Copied' : 'Copy link'}
          </Button>
          <Button variant="ghost" size="md" onClick={onSave}>
            Save card
          </Button>
        </div>
        <p className="text-center text-[10px] text-muted">scan or tap · works inside any TG chat</p>
      </div>
    </div>
  );
}
