// Fantasy Token — Team Builder Redesign — main app

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/ {
  view: 'all',
  mode: 'bull',
  tier: 100000,
  lineupState: 'full',
  rankProfile: 'top',
}; /*EDITMODE-END*/

const CONTEST = {
  name: 'Sprint #284',
  endLabel: '24h · ends Sat 10:00',
};

// Lineup variants for tweak
const LINEUP_VARIANTS = {
  full: window.FT_DATA.sampleLineup,
  partial: [
    { sym: 'PEPE', alloc: 25 },
    { sym: 'SOL', alloc: 20 },
    { sym: 'MOG', alloc: 15 },
  ],
  empty: [],
};

function TweaksUI({ tweaks, setTweak }) {
  return (
    <TweaksPanel title="Tweaks" subtitle="Team builder redesign · 4 states">
      <TweakSection title="View">
        <TweakRadio
          value={tweaks.view}
          onChange={(v) => setTweak('view', v)}
          options={[
            { value: 'all', label: 'All 4' },
            { value: 'draft', label: 'Draft' },
            { value: 'locked', label: 'Locked' },
            { value: 'live', label: 'Live' },
            { value: 'browse', label: 'Browse' },
          ]}
        />
      </TweakSection>

      <TweakSection title="Contest mode">
        <TweakRadio
          value={tweaks.mode}
          onChange={(v) => setTweak('mode', v)}
          options={[
            { value: 'bull', label: 'Bull' },
            { value: 'bear', label: 'Bear' },
          ]}
        />
      </TweakSection>

      <TweakSection title="Tier (virtual budget)">
        <TweakRadio
          value={String(tweaks.tier)}
          onChange={(v) => setTweak('tier', Number(v))}
          options={[
            { value: '1000', label: '$1K' },
            { value: '10000', label: '$10K' },
            { value: '100000', label: '$100K' },
            { value: '1000000', label: '$1M' },
          ]}
        />
      </TweakSection>

      <TweakSection title="Lineup state (Draft / Locked)">
        <TweakRadio
          value={tweaks.lineupState}
          onChange={(v) => setTweak('lineupState', v)}
          options={[
            { value: 'empty', label: 'Empty' },
            { value: 'partial', label: 'Partial' },
            { value: 'full', label: 'Full' },
          ]}
        />
      </TweakSection>

      <TweakSection title="Rank profile (Live)">
        <TweakRadio
          value={tweaks.rankProfile}
          onChange={(v) => setTweak('rankProfile', v)}
          options={[
            { value: 'top', label: 'Top-10' },
            { value: 'mid', label: 'Middle' },
            { value: 'bottom', label: 'Bottom' },
          ]}
        />
      </TweakSection>
    </TweaksPanel>
  );
}

function App() {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const lineup = LINEUP_VARIANTS[tweaks.lineupState] || LINEUP_VARIANTS.full;
  // Locked & Live demand a full lineup; Browse independent of lineup.
  const fullLineup = lineup.length === 5 ? lineup : LINEUP_VARIANTS.full;

  const phones = [
    {
      id: 'draft',
      label: '01 · Draft',
      sublabel: 'collect lineup',
      el: <DraftScreen mode={tweaks.mode} tier={tweaks.tier} lineup={lineup} contest={CONTEST} />,
    },
    {
      id: 'locked',
      label: '02 · Locked',
      sublabel: 'waiting room',
      el: (
        <LockedScreen mode={tweaks.mode} tier={tweaks.tier} lineup={fullLineup} contest={CONTEST} />
      ),
    },
    {
      id: 'live',
      label: '03 · Live',
      sublabel: 'during contest',
      el: (
        <LiveScreen
          mode={tweaks.mode}
          tier={tweaks.tier}
          lineup={fullLineup}
          contest={CONTEST}
          rankProfile={tweaks.rankProfile}
        />
      ),
    },
    {
      id: 'browse',
      label: '04 · Browse Others',
      sublabel: 'pre-kickoff',
      el: <BrowseScreen mode={tweaks.mode} tier={tweaks.tier} contest={CONTEST} />,
    },
  ];

  const visible = tweaks.view === 'all' ? phones : phones.filter((p) => p.id === tweaks.view);

  return (
    <>
      <div className="stage">
        <div className="stage-head">
          <div>
            <div className="meta">Fantasy Token · Team Builder · Redesign v1</div>
            <h1>Build → Lock → Live → Browse</h1>
          </div>
          <div className="blurb">
            Чотири стани одного контесту. $-first allocations, contest-aware coloring, split
            rank/PnL hero. Стан, режим, tier і позицію в рейтингу — у Tweaks справа.
          </div>
        </div>

        <div className="row-of-phones" data-screen-label={`view-${tweaks.view}`}>
          {visible.map((p) => (
            <div key={p.id} data-screen-label={p.label}>
              <PhoneShell label={p.label} sublabel={p.sublabel}>
                {p.el}
              </PhoneShell>
            </div>
          ))}
        </div>
      </div>

      <TweaksUI tweaks={tweaks} setTweak={setTweak} />
    </>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
