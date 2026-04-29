import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button.js';
import { Label } from '../../components/ui/Label.js';
import { formatCents } from '../../lib/format.js';
import { getApiBaseUrl } from '../../lib/api-client.js';
import { telegram } from '../../lib/telegram.js';
import { Headline } from './Headline.js';
import { Breakdown } from './Breakdown.js';
import { LineupRecap } from './LineupRecap.js';
import { useResult } from './useResult.js';

export function Result() {
  const { id } = useParams<{ id: string }>();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const entryId = search.get('entry') ?? undefined;
  const result = useResult(id, entryId);

  if (!id) return <div className="p-6 text-hl-red">missing contest id</div>;
  if (result.isLoading) return <div className="p-6 text-muted">loading…</div>;
  if (result.isError || !result.data) {
    return <div className="p-6 text-hl-red">result not ready (contest may still be active)</div>;
  }

  const data = result.data;
  const onShare = () => {
    const apiBase = getApiBaseUrl();
    if (!apiBase) {
      telegram.showAlert('Share unavailable: API base URL not configured.');
      return;
    }
    // Public share URL — TG fetches OG meta from this and renders the card image preview.
    const shareUrl = `${apiBase}/share/${data.entryId}`;
    const rankPart = data.finalRank !== null ? `#${data.finalRank} of ${data.totalEntries}` : '';
    let text: string;
    if (data.outcome === 'won') {
      text = `🏆 ${rankPart} in ${data.contestName} — won ${formatCents(data.prizeCents)} on Fantasy Token. Pick 5 crypto tokens, win cash. Beat me 👇`;
    } else if (data.outcome === 'cancelled') {
      text = `Played ${data.contestName} on Fantasy Token. Pick 5 crypto tokens, beat the room 👇`;
    } else {
      text = `Played ${data.contestName}${rankPart ? ` — ${rankPart}` : ''} on Fantasy Token. Think you can beat me? Pick 5 crypto tokens 👇`;
    }
    telegram.shareToChat(shareUrl, text);
    telegram.hapticImpact('medium');
  };

  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <div className="flex items-center justify-between border-b-[1.5px] border-ink px-3 py-2">
        <button onClick={() => navigate('/lobby')} className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full border-[1.5px] border-ink bg-paper text-[14px] leading-none">
            ×
          </span>
          <div className="text-left">
            <div className="text-[12px] font-bold leading-tight">{data.contestName}</div>
            <Label>final</Label>
          </div>
        </button>
      </div>
      <Headline result={data} onShare={onShare} />
      <Breakdown result={data} />
      <LineupRecap rows={data.lineupFinal} />
      <div className="sticky bottom-0 mt-auto flex gap-[6px] border-t-[1.5px] border-ink bg-paper px-3 py-[10px]">
        <Button variant="ghost" className="flex-1" onClick={() => navigate('/lobby')}>
          Lobby
        </Button>
        <Button variant="primary" className="flex-[2]" onClick={() => navigate('/lobby')}>
          Play again →
        </Button>
      </div>
    </div>
  );
}
