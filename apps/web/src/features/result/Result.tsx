import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button.js';
import { formatCents } from '../../lib/format.js';
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

  if (!id) return <div className="p-6 text-tg-error">missing contest id</div>;
  if (result.isLoading) return <div className="p-6 text-tg-hint">loading…</div>;
  if (result.isError || !result.data) {
    return <div className="p-6 text-tg-error">result not ready (contest may still be active)</div>;
  }

  const data = result.data;
  const onShare = () => {
    const text = `I won ${formatCents(data.prizeCents)} in ${data.contestName} 🚀`;
    telegram.shareToChat(window.location.origin, text);
  };

  return (
    <div className="flex min-h-screen flex-col bg-tg-bg text-tg-text">
      <div className="flex items-center justify-between border-b border-tg-text/10 p-3">
        <button onClick={() => navigate('/lobby')} className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full border border-tg-text/20">
            ×
          </span>
          <div className="text-left">
            <div className="text-sm font-bold">{data.contestName}</div>
            <div className="text-xs text-tg-hint">final</div>
          </div>
        </button>
      </div>
      <Headline result={data} onShare={onShare} />
      <Breakdown result={data} />
      <LineupRecap rows={data.lineupFinal} />
      <div className="sticky bottom-0 mt-auto flex gap-2 border-t border-tg-text/10 bg-tg-bg p-3">
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
