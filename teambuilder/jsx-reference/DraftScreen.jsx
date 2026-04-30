// Fantasy Token — Draft (Team Builder) screen

function DraftScreen({ mode, tier, lineup: initialLineup, contest }) {
  const { tokens, recents, presets, tokenBySym, dollarsFor, fmtMoney, fmtMoneyExact, sparkPath } =
    window.FT_DATA;
  const [lineup, setLineup] = React.useState(initialLineup);
  const [sheetToken, setSheetToken] = React.useState(null);
  // Re-sync when the tweak panel changes the seed lineup
  React.useEffect(() => {
    setLineup(initialLineup);
  }, [initialLineup]);

  const handleConfirm = ({ sym, alloc, remove }) => {
    setLineup((prev) => {
      const without = prev.filter((p) => p.sym !== sym);
      if (remove) return without;
      if (without.length >= 5) return prev;
      return [...without, { sym, alloc }];
    });
    setSheetToken(null);
  };

  const totalAlloc = lineup.reduce((s, p) => s + p.alloc, 0);
  const usedDollars = dollarsFor(totalAlloc, tier);
  const valid = lineup.length === 5 && totalAlloc === 100;
  const sortedTokens = [...tokens].sort((a, b) =>
    mode === 'bear' ? a.d24 - b.d24 : b.d24 - a.d24,
  );

  return (
    <>
      <TopHeader contestName={contest.name} mode={mode} tier={tier} endLabel={contest.endLabel} />
      <StatusRow countdown="47:12" players="347" prize="1.2K" />

      <div className="lineup-wrap">
        <div className="lineup-label">
          <span className="title">
            Your lineup<span className="budget">budget {fmtMoney(tier)}</span>
          </span>
          <span className={`alloc ${valid ? 'valid' : ''}`}>
            {lineup.length}/5 · {fmtMoney(usedDollars)} · {totalAlloc}%
          </span>
        </div>
        <div className="slots">
          {[0, 1, 2, 3, 4].map((i) => {
            const p = lineup[i];
            if (!p) {
              return (
                <div key={i} className="slot">
                  +
                </div>
              );
            }
            const t = tokenBySym(p.sym);
            const positive = mode === 'bull' ? t.d24 > 0 : t.d24 < 0;
            return (
              <div
                key={i}
                className={`slot filled ${positive ? 'contest-positive' : 'contest-negative'}`}
                onClick={() => setSheetToken(t)}
              >
                <div className="icon">{t.icon}</div>
                <div className="sym">{t.sym}</div>
                <div className="amt">{fmtMoney(dollarsFor(p.alloc, tier))}</div>
                <div className="pct">{p.alloc}%</div>
              </div>
            );
          })}
        </div>
        <div className={`alloc-bar ${valid ? 'full' : ''}`}>
          <span style={{ width: Math.min(totalAlloc, 100) + '%' }} />
        </div>
      </div>

      <div className="content">
        <div className="search-box">
          <span>🔍</span>
          <span>Search ticker or paste contract…</span>
        </div>
        <div className="tokens-section">
          <div className="tokens-header">
            <span className="title">Browse tokens</span>
            <div className="filter">
              <span>1H</span>
              <span className="active">24H</span>
              <span>7D</span>
            </div>
          </div>
          {sortedTokens.slice(0, 6).map((t) => {
            const inTeam = lineup.some((p) => p.sym === t.sym);
            const positive = mode === 'bull' ? t.d24 > 0 : t.d24 < 0;
            const tag = positive
              ? { cls: 'good', text: mode === 'bull' ? '✓ rising' : '✓ falling' }
              : { cls: 'bad', text: mode === 'bull' ? '✗ falling' : '✗ rising' };
            const sparkColor = t.d24 >= 0 ? '#1f8a3e' : '#c0392b';
            return (
              <div
                key={t.sym}
                className={`token-row ${inTeam ? 'in-team' : ''}`}
                onClick={() => setSheetToken(t)}
              >
                <div className="token-icon">{t.icon}</div>
                <div className="token-meta">
                  <div className="top">
                    {t.sym}
                    <span className={`contest-tag ${tag.cls}`}>{tag.text}</span>
                  </div>
                  <div className="name">
                    {t.name}
                    {t.pickedBy >= 30 && (
                      <span className="picked-flame">· 🔥 {t.pickedBy}% picked</span>
                    )}
                    {t.pickedBy >= 15 && t.pickedBy < 30 && (
                      <span className="picked-soft">· {t.pickedBy}% picked</span>
                    )}
                  </div>
                </div>
                <svg className="spark" viewBox="0 0 50 24" fill="none">
                  <path
                    d={sparkPath(t.sym, t.d24 >= 0)}
                    stroke={sparkColor}
                    strokeWidth="1.4"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                </svg>
                <div className="token-perf">
                  <span className={`big ${t.d24 >= 0 ? 'up' : 'dn'}`}>
                    {t.d24 >= 0 ? '+' : ''}
                    {t.d24.toFixed(1)}%
                  </span>
                  <span className="lbl">24h</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="dock">
        <div className="recents-label">Start from</div>
        <div className="recents">
          {recents.map((r, i) => (
            <div key={'r' + i} className="recent-card">
              <div className="head">
                <span className="label">{r.label}</span>
                <span className={`pnl ${r.up ? 'up' : 'dn'}`}>{r.pnl}</span>
              </div>
              <div className="icons">
                {r.picks.map((sym) => (
                  <div key={sym} className="mini-icon">
                    {tokenBySym(sym)?.icon}
                  </div>
                ))}
              </div>
              <div className="sub">{r.sub}</div>
            </div>
          ))}
          {presets.map((p, i) => (
            <div key={'p' + i} className="recent-card preset">
              <div className="head">
                <span className="label">
                  {p.emoji} {p.label}
                </span>
                <span className="pnl muted">preset</span>
              </div>
              <div className="icons">
                {p.picks.map((sym) => (
                  <div key={sym} className="mini-icon">
                    {tokenBySym(sym)?.icon}
                  </div>
                ))}
              </div>
              <div className="sub">{p.desc}</div>
            </div>
          ))}
        </div>
        <div className={`go-btn ${valid ? (mode === 'bear' ? 'ready bear-ready' : 'ready') : ''}`}>
          {valid ? (
            <>
              GO {mode.toUpperCase()} <span className="fee">· 50 ⭐ entry</span>
            </>
          ) : lineup.length < 5 ? (
            `PICK ${5 - lineup.length} MORE`
          ) : totalAlloc < 100 ? (
            `ALLOCATE ${100 - totalAlloc}% MORE`
          ) : (
            `OVER BUDGET BY ${totalAlloc - 100}%`
          )}
        </div>
      </div>

      <AllocSheet
        open={!!sheetToken}
        token={sheetToken}
        mode={mode}
        tier={tier}
        lineup={lineup}
        onClose={() => setSheetToken(null)}
        onConfirm={handleConfirm}
      />
    </>
  );
}

Object.assign(window, { DraftScreen });
