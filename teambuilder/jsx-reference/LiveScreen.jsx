// Fantasy Token — LIVE contest screen
// Split hero: rank (left) + $ PnL (right) — both equal weight per spec answer

function LiveScreen({ mode, tier, lineup, contest, rankProfile = 'top' }) {
  const { tokenBySym, dollarsFor, fmtMoney, fmtMoneyExact, fmtPnL } = window.FT_DATA;

  // Synthesize live performance per token. Deterministic from sym + rankProfile.
  const livePerf = (sym) => {
    const t = tokenBySym(sym);
    if (!t) return 0;
    let bias = 0;
    if (rankProfile === 'top') bias = 4;
    else if (rankProfile === 'mid') bias = 0;
    else if (rankProfile === 'bottom') bias = -4;
    return t.d24 * 0.6 + bias;
  };

  // Compute per-token pnl with mode awareness (bear inverts what counts as helping)
  const rows = lineup.map((p) => {
    const t = tokenBySym(p.sym);
    const dollars = dollarsFor(p.alloc, tier);
    const rawPct = livePerf(p.sym);
    const scorePct = mode === 'bear' ? -rawPct : rawPct;
    const pnl = (dollars * scorePct) / 100;
    const helping = scorePct >= 0;
    return { ...p, t, dollars, rawPct, scorePct, pnl, helping };
  });
  const totalPnL = rows.reduce((s, r) => s + r.pnl, 0);
  const totalPct = (totalPnL / tier) * 100;

  // Rank: top = #5–15, mid = #160–200, bottom = #300+
  const totalEntries = 347;
  let myRank = 23;
  if (rankProfile === 'top') myRank = 8;
  if (rankProfile === 'mid') myRank = 178;
  if (rankProfile === 'bottom') myRank = 312;

  const rankDelta = rankProfile === 'top' ? 12 : rankProfile === 'mid' ? -3 : -28;

  // Top performer
  const sorted = [...rows].sort((a, b) => b.pnl - a.pnl);
  const winner = sorted[0];
  const winnerHelping = winner.pnl > 0;

  // Prize estimate (mock — top 30% pays)
  const prizeEst = totalPnL > 0 ? Math.max(20, Math.round(totalPnL * 0.05)) : 0;

  // Leaderboard
  const board = [
    { rank: 1, user: '@whaleboy', pnl: 24.7, top: true },
    { rank: 2, user: '@cryptoking', pnl: 19.2, top: true },
    { rank: 3, user: '@nyx', pnl: 16.8, top: true },
    null, // divider
    { rank: myRank - 1, user: '@neonbat', pnl: totalPct + 0.8 },
    { rank: myRank, user: 'You', pnl: totalPct, me: true },
    { rank: myRank + 1, user: '@hodler420', pnl: totalPct - 0.6 },
    { rank: myRank + 2, user: '@tetra', pnl: totalPct - 1.4 },
  ];

  // Moment banner
  let moment = null;
  if (myRank <= 10)
    moment = { kind: 'green', icon: '🏆', text: 'You broke into top 10! Keep the lead.' };
  else if (rankDelta >= 10)
    moment = { kind: 'gold', icon: '🚀', text: `Climbing fast — ${rankDelta} ranks in an hour` };

  return (
    <>
      <TopHeader
        contestName={contest.name}
        mode={mode}
        tier={tier}
        endLabel={contest.endLabel}
        hideBack
      />

      <div className="live-view">
        <div className="live-banner">
          <span className="live-dot" />
          <b>LIVE</b>
          <span className="ends">
            Ends in <b>14:23:08</b>
          </span>
        </div>

        {moment && (
          <div className={`moment-banner ${moment.kind === 'gold' ? 'gold' : ''}`}>
            <span className="ico">{moment.icon}</span>
            <span>{moment.text}</span>
          </div>
        )}

        {/* Split hero — rank + PnL equal weight */}
        <div className="hero-split">
          <div className="hero-card rank">
            <div className="label">Your rank</div>
            <div className="big-number">#{myRank}</div>
            <div className="of">of {totalEntries}</div>
            <div className={`delta ${rankDelta > 0 ? '' : rankDelta < 0 ? 'dn' : 'flat'}`}>
              {rankDelta > 0
                ? `↑ +${rankDelta} / 1h`
                : rankDelta < 0
                  ? `↓ ${rankDelta} / 1h`
                  : '— flat'}
            </div>
          </div>
          <div className="hero-card pnl">
            <div className="label">Your portfolio</div>
            <div className={`big-number ${totalPnL >= 0 ? 'up' : 'dn'}`}>{fmtPnL(totalPnL)}</div>
            <div className={`pnl-pct ${totalPct >= 0 ? 'up' : 'dn'}`}>
              {totalPct >= 0 ? '+' : ''}
              {totalPct.toFixed(2)}%
            </div>
            {prizeEst > 0 && (
              <div className="prize-est">
                prize est. <b>{fmtMoneyExact(prizeEst)}</b>
              </div>
            )}
          </div>
        </div>

        <div className="live-section">
          <div className="head">
            <span className="title">Your team</span>
            <span className={`top-pick ${winnerHelping ? '' : 'muted'}`}>
              {winnerHelping
                ? `⭐ ${winner.sym} carrying · ${fmtPnL(winner.pnl)}`
                : `Tough opener · ${fmtPnL(winner.pnl)} top`}
            </span>
          </div>
          {rows.map((r) => (
            <div key={r.sym} className={`live-token ${r.helping ? 'helping' : 'hurting'}`}>
              <div className="ico">{r.t.icon}</div>
              <div className="meta">
                <div className="sym">
                  {r.sym}
                  {r === winner && winnerHelping && <span className="star">TOP</span>}
                </div>
                <div className="alloc-line">
                  {fmtMoneyExact(r.dollars)} · {r.alloc}%
                </div>
              </div>
              <div className={`pnl-cell ${r.helping ? 'helping' : 'hurting'}`}>
                <span className="big">{fmtPnL(r.pnl)}</span>
                <span className="pct">
                  {r.scorePct >= 0 ? '+' : ''}
                  {r.scorePct.toFixed(2)}%
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="live-section">
          <div className="head">
            <span className="title">Around you</span>
            <span className="view-all">tap for full board →</span>
          </div>
          <div className="leaderboard">
            {board.map((b, i) => {
              if (b === null)
                return (
                  <div key={'d' + i} className="leaderboard-row divider">
                    ↕ skip · ranks 4–{myRank - 2}
                  </div>
                );
              return (
                <div key={'b' + i} className={`leaderboard-row ${b.me ? 'me' : ''}`}>
                  <span className="rank-num">#{b.rank}</span>
                  <span className="user-name">{b.user}</span>
                  <span className={`pnl ${b.pnl >= 0 ? 'up' : 'dn'}`}>
                    {b.pnl >= 0 ? '+' : ''}
                    {b.pnl.toFixed(2)}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

Object.assign(window, { LiveScreen });
