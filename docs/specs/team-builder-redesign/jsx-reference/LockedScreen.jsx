// Fantasy Token — Locked / Waiting Room screen

function LockedScreen({ mode, tier, lineup, contest }) {
  const { tokenBySym, dollarsFor, fmtMoney, fmtMoneyExact } = window.FT_DATA;
  const maxAlloc = Math.max(...lineup.map((p) => p.alloc), 80);

  return (
    <>
      <TopHeader
        contestName={contest.name}
        mode={mode}
        tier={tier}
        endLabel={contest.endLabel}
        hideBack
      />

      <div className="locked-view">
        <div className="locked-banner">
          <div className={`stamp ${mode === 'bear' ? 'bear' : ''}`}>
            <span className="dot" />
            <span>You're locked in</span>
          </div>
        </div>

        <div className="countdown-block">
          <div className="label">Kickoff in</div>
          <div className="timer">
            47<span className="colon">:</span>12
          </div>
          <div className="end-label">
            {contest.name} · 24h · {contest.endLabel}
          </div>
        </div>

        <div className="room-fill">
          <div className="room-fill-row">
            <div>
              <div className="count">347</div>
              <div className="count-label">players in</div>
            </div>
            <div>
              <div className="pool">$1.2K</div>
              <div className="pool-label">prize pool</div>
            </div>
          </div>
          <div className="activity">
            <span className="dot" />
            <span>@neonbat just locked in</span>
            <span className="ago">12s ago</span>
          </div>
        </div>

        <div className="locked-lineup">
          <div className="locked-lineup-label">
            <span className="title">Your team</span>
            <span className="commit">5 picks · {fmtMoney(tier)} committed</span>
          </div>
          {lineup.map((p) => {
            const t = tokenBySym(p.sym);
            return (
              <div key={p.sym} className="locked-token-row">
                <div className="ico">{t.icon}</div>
                <div className="meta">
                  <div className="sym">{t.sym}</div>
                  <div className="amt">
                    {fmtMoneyExact(dollarsFor(p.alloc, tier))} · {p.alloc}%
                  </div>
                </div>
                <div className="alloc-vis">
                  <span style={{ width: (p.alloc / maxAlloc) * 100 + '%' }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="locked-actions">
        <button>📤 Share lineup</button>
        <button className="primary">Browse others →</button>
      </div>
    </>
  );
}

Object.assign(window, { LockedScreen });
