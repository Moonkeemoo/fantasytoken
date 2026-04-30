// Fantasy Token — Allocation bottom sheet
// Trigger: tap on a Browse-tokens row. ~60% height. $ input + % slider + token info.

const { useState: useStateAlloc, useEffect: useEffectAlloc } = React;

function AllocSheet({ open, mode, tier, lineup, token, onClose, onConfirm }) {
  const { fmtMoney, fmtMoneyExact, dollarsFor, sparkPath } = window.FT_DATA;

  // Total alloc currently used by *other* picks (so we know remaining headroom).
  const otherAlloc = lineup.filter((p) => p.sym !== token?.sym).reduce((s, p) => s + p.alloc, 0);
  const existing = lineup.find((p) => p.sym === token?.sym);
  const remaining = 100 - otherAlloc; // hard cap for this token
  const slotsLeft = 5 - lineup.filter((p) => p.sym !== token?.sym).length; // includes this slot

  // Local sheet state
  const [pct, setPct] = useStateAlloc(existing?.alloc ?? 0);

  // Reset when sheet (re)opens for a new token
  useEffectAlloc(() => {
    if (!open) return;
    if (existing) setPct(existing.alloc);
    else if (otherAlloc === 0)
      setPct(20); // first pick → suggest 20
    else if (remaining >= 20)
      setPct(20); // sane default
    else setPct(remaining); // can't afford 20, max it
  }, [open, token?.sym]);

  if (!open || !token) return null;

  const cappedPct = Math.min(pct, remaining);
  const dollars = dollarsFor(cappedPct, tier);
  const isEdit = !!existing;
  const willExceedSlots = !isEdit && slotsLeft <= 0;
  const positive = mode === 'bull' ? token.d24 > 0 : token.d24 < 0;
  const sparkColor = token.d24 >= 0 ? '#1f8a3e' : '#c0392b';

  // Quick-pick chips honour the cap.
  const chips = [10, 25, 50].filter((v) => v <= remaining);

  const onDollarInput = (e) => {
    const raw = e.target.value.replace(/[^0-9.]/g, '');
    const num = parseFloat(raw) || 0;
    const newPct = Math.min(remaining, Math.max(0, Math.round((num / tier) * 100)));
    setPct(newPct);
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />

        <div className="sheet-token">
          <div className="sheet-token-icon">{token.icon}</div>
          <div className="sheet-token-meta">
            <div className="sym-row">
              <b>{token.sym}</b>
              <span className="name">· {token.name}</span>
            </div>
            <div className="price-row">
              <span className="price">{token.price ?? '—'}</span>
              <span className={`d24 ${token.d24 >= 0 ? 'up' : 'dn'}`}>
                {token.d24 >= 0 ? '+' : ''}
                {token.d24.toFixed(1)}% 24h
              </span>
              {token.pickedBy >= 15 && <span className="picked">· {token.pickedBy}% picked</span>}
            </div>
          </div>
          <svg className="sheet-spark" viewBox="0 0 50 24" fill="none">
            <path
              d={sparkPath(token.sym, token.d24 >= 0)}
              stroke={sparkColor}
              strokeWidth="1.6"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </svg>
        </div>

        <div className={`contest-fit ${positive ? 'good' : 'bad'}`}>
          {positive
            ? mode === 'bull'
              ? '✓ Rising — fits your bull contest'
              : '✓ Falling — fits your bear contest'
            : mode === 'bull'
              ? '✗ Falling — fights your bull contest'
              : '✗ Rising — fights your bear contest'}
        </div>

        <div className="alloc-form">
          <label className="alloc-form-label">Allocate</label>
          <div className="alloc-form-row">
            <div className="dollar-input">
              <span>$</span>
              <input
                type="text"
                inputMode="decimal"
                value={dollars.toLocaleString('en-US')}
                onChange={onDollarInput}
              />
            </div>
            <div className="alloc-pct">
              <div className="big">{cappedPct}%</div>
              <div className="of">of {fmtMoney(tier)}</div>
            </div>
          </div>

          <div className="chips-row">
            {chips.map((v) => (
              <button
                key={v}
                className={`chip-btn ${cappedPct === v ? 'on' : ''}`}
                onClick={() => setPct(v)}
              >
                {v}%
              </button>
            ))}
            <button
              className={`chip-btn ${cappedPct === remaining && remaining > 0 ? 'on' : ''}`}
              onClick={() => setPct(remaining)}
            >
              max ({remaining}%)
            </button>
          </div>

          <div className="slider-wrap">
            <input
              type="range"
              min="0"
              max={remaining}
              step="1"
              value={cappedPct}
              onChange={(e) => setPct(parseInt(e.target.value, 10))}
            />
            <div className="slider-rail">
              <span className="fill" style={{ width: (cappedPct / 100) * 100 + '%' }} />
              <span className="cap-mark" style={{ left: (remaining / 100) * 100 + '%' }} />
            </div>
            <div className="slider-meta">
              <span>0</span>
              <span>cap {remaining}%</span>
              <span>100</span>
            </div>
          </div>

          <div className="budget-line">
            <span>After this pick</span>
            <b>
              {fmtMoneyExact(dollarsFor(otherAlloc + cappedPct, tier))} of {fmtMoney(tier)}
            </b>
          </div>
        </div>

        <div className="sheet-actions">
          {isEdit && (
            <button
              className="btn-remove"
              onClick={() => onConfirm({ remove: true, sym: token.sym })}
            >
              Remove
            </button>
          )}
          <button className="btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            className={`btn-confirm ${mode === 'bear' ? 'bear' : ''}`}
            disabled={willExceedSlots || cappedPct === 0}
            onClick={() => onConfirm({ sym: token.sym, alloc: cappedPct })}
          >
            {willExceedSlots
              ? 'Lineup full'
              : isEdit
                ? `Update · ${fmtMoneyExact(dollars)}`
                : `Add · ${fmtMoneyExact(dollars)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { AllocSheet });
