// Fantasy Token — Browse Others screen

function BrowseScreen({ mode, tier, contest }) {
  const { otherLineups, tokenBySym } = window.FT_DATA;

  return (
    <>
      <TopHeader
        contestName={contest.name}
        mode={mode}
        tier={tier}
        endLabel={contest.endLabel}
        hideBack
      />

      <div className="browse-view">
        <div className="browse-header">
          <div className="back">‹</div>
          <div className="title">
            Lineups in {contest.name.replace('Sprint ', '')}
            <span className="meta">347 players · kickoff 47:12</span>
          </div>
        </div>

        <div className="browse-filters">
          <span className="chip active">All</span>
          <span className="chip">Friends</span>
          <span className="chip">Just locked</span>
        </div>

        <div className="browse-note">Lineups only · stake size & PnL hidden until kickoff</div>

        <div className="browse-list">
          {otherLineups.slice(0, 8).map((l) => (
            <div key={l.user} className="browse-row">
              <div className="user">
                {l.user}
                <span className="ago">{l.ago}</span>
              </div>
              <div className="lineup-icons">
                {l.picks.map((sym, i) => (
                  <div key={i} className="mi">
                    {tokenBySym(sym)?.icon}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

Object.assign(window, { BrowseScreen });
