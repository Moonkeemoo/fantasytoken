import { useEffect, useState } from 'react';
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
import { XpBreakdown } from './XpBreakdown.js';
import { RankUpOverlay } from './RankUpOverlay.js';
import { LoadingSplash } from '../loading/LoadingSplash.js';
import { useRank, useTeaser } from '../rank/useRank.js';

const RANK_LAST_SEEN_KEY = 'ft.rank.lastSeen';

export function Result() {
  const { id } = useParams<{ id: string }>();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const entryId = search.get('entry') ?? undefined;
  const result = useResult(id, entryId);
  const rank = useRank();
  const teaser = useTeaser();
  const [showRankUp, setShowRankUp] = useState(false);

  // Detect rank-up vs the last rank we showed the user.
  useEffect(() => {
    if (!rank.data || typeof window === 'undefined') return;
    const lastSeen = Number(window.localStorage.getItem(RANK_LAST_SEEN_KEY) ?? '0');
    if (rank.data.currentRank > lastSeen && lastSeen > 0) {
      setShowRankUp(true);
    }
    // Always update the high-water-mark so we don't re-trigger on remount.
    if (rank.data.currentRank > lastSeen) {
      window.localStorage.setItem(RANK_LAST_SEEN_KEY, String(rank.data.currentRank));
    }
  }, [rank.data]);

  if (!id) return <div className="p-6 text-hl-red">missing contest id</div>;
  if (result.isLoading) return <LoadingSplash />;
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
    <div
      className="flex min-h-screen flex-col bg-paper text-ink"
      style={{ paddingBottom: 'calc(56px + env(safe-area-inset-bottom, 0px))' }}
    >
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
      {data.xpAward && <XpBreakdown award={data.xpAward} rank={rank.data ?? null} />}
      <LineupRecap rows={data.lineupFinal} />
      {showRankUp && rank.data && (
        <RankUpOverlay
          rank={rank.data}
          unlock={teaser.data?.nextUnlock ?? null}
          onDismiss={() => setShowRankUp(false)}
        />
      )}
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
