// Fantasy Token — Header + Status row + Phone shell
const { useState } = React;

function PhoneShell({ children, label, sublabel }) {
  return (
    <div className="phone-col">
      <div className="phone-cap">
        <span className="dot" />
        <b>{label}</b>
        {sublabel && <span>· {sublabel}</span>}
      </div>
      <div className="phone">
        <div className="screen">
          <div className="notch" />
          {children}
          <div className="home-bar" />
        </div>
      </div>
    </div>
  );
}

function TopHeader({ contestName, mode, tier, endLabel, hideBack = false }) {
  const { fmtMoney } = window.FT_DATA;
  return (
    <header className="top">
      <div className="top-row">
        {hideBack ? <div className="placeholder" /> : <div className="back">‹</div>}
        <div className="contest-title">
          <div className="row1">
            <span>
              {contestName} · {mode === 'bull' ? 'Bull' : 'Bear'}
            </span>
            <span className="tier">{fmtMoney(tier)}</span>
          </div>
          <span className="meta">{endLabel}</span>
        </div>
        <div className="placeholder" />
      </div>
    </header>
  );
}

function StatusRow({ countdown, players, prize }) {
  return (
    <div className="status">
      <div className="pill">
        <span className="dot" />
        <span>{countdown}</span> to start
      </div>
      <div className="pill muted">
        <span>{players}</span> in
      </div>
      <div className="prize">$ {prize}</div>
    </div>
  );
}

Object.assign(window, { PhoneShell, TopHeader, StatusRow });
