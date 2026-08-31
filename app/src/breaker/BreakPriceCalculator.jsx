// BreakPriceCalculator — live break pricing + negotiation tool (BK-2).
// Inputs: product, qty (boxes/cases), format (PYT/PYP/Random/Mix), sale method, ABSOLUTE $ margin.
// Outputs: per-spot List + Floor, a Sold-price input, and a live "Min to hit target" that recomputes
// remaining-spot leeway as spots sell. Random = flat (no weighting).
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { loadSetDetail } from '../lib/breakerData.js';
import { computeTargets, buildSpots, recompute, FORMATS } from '../lib/breakPricing.js';
import { spotsToItems } from '../lib/listingExport.js';
import BulkListingModal from './BulkListingModal.jsx';

const ACCENT = '#ff6b35';
const money = (n) => (n == null || Number.isNaN(n) ? '—' : `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n)).toLocaleString()}`);

// ── atoms ───────────────────────────────────────────────────────────────────
function Chip({ active, onClick, children, small }) {
  return (
    <button onClick={onClick} style={{
      flexShrink: 0, background: active ? 'rgba(255,107,53,0.12)' : 'var(--gbg)',
      border: `1px solid ${active ? 'rgba(255,107,53,0.4)' : 'var(--gb)'}`,
      color: active ? ACCENT : 'var(--gc)', borderRadius: 999, padding: small ? '4px 10px' : '6px 13px',
      cursor: 'pointer', fontSize: small ? 11 : 12, fontWeight: 700, letterSpacing: 0.3, whiteSpace: 'nowrap',
    }}>{children}</button>
  );
}
function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 10, color: 'var(--tg)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>{label}</span>
      {children}
    </div>
  );
}
const inputStyle = {
  background: 'var(--gbg)', border: '1px solid var(--gb)', borderRadius: 10, padding: '8px 10px',
  color: 'var(--t)', fontSize: 13, fontWeight: 600, width: '100%', boxSizing: 'border-box',
};
function HeaderStat({ label, value, accent, sub }) {
  return (
    <div style={{ minWidth: 92 }}>
      <div style={{ fontSize: 9.5, color: 'var(--tg)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: accent ? ACCENT : 'var(--t)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 0.3 }}>{value}</div>
      {sub && <div style={{ fontSize: 9.5, color: 'var(--tg)' }}>{sub}</div>}
    </div>
  );
}

// ── main ──────────────────────────────────────────────────────────────────────
export default function BreakPriceCalculator({ sets, calcContext }) {
  // Init from the "Price this" hand-off; the component remounts on each pricing-tab open so this
  // captures the latest context without a prop-sync effect.
  const [selectedSetId, setSelectedSetId] = useState(calcContext?.setId || null);
  const [configName, setConfigName] = useState(calcContext?.configName || null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);

  // inputs — empty string means "use the derived default"
  const [unit, setUnit] = useState('case');
  const [qty, setQty] = useState(1);
  const [format, setFormat] = useState('PYT');
  const [saleMethod, setSaleMethod] = useState('Auction');
  const [marginDollars, setMarginDollars] = useState('');
  const [caseCostInput, setCaseCostInput] = useState('');
  const [spotCount, setSpotCount] = useState(30);
  const [players, setPlayers] = useState(null); // null = use the set's default top players
  const [playerDraft, setPlayerDraft] = useState('');
  const [overrides, setOverrides] = useState({}); // { [spotId]: { sold, method } }
  const [showExport, setShowExport] = useState(false);

  const selectedMeta = useMemo(() => (sets || []).find(s => s.id === selectedSetId) || null, [sets, selectedSetId]);

  // Loader kept in a callback (setState lives here, not in the effect body) to match the codebase
  // pattern (see BreakTracker.fetchChecklist). A request id guards against stale async responses.
  const reqId = useRef(0);
  const loadDetail = useCallback((meta) => {
    const id = ++reqId.current;
    if (!meta) { setDetail(null); return; }
    setLoading(true); setDetail(null);
    loadSetDetail(meta)
      .then(d => { if (id === reqId.current) setDetail(d); })
      .catch(() => { if (id === reqId.current) setDetail(null); })
      .finally(() => { if (id === reqId.current) setLoading(false); });
  }, []);
  useEffect(() => { loadDetail(selectedMeta); }, [selectedMeta, loadDetail]);

  const pricingConfigs = useMemo(() => detail?.pricing?.configs || [], [detail]);
  const pricing = useMemo(
    () => pricingConfigs.find(c => c.configName === configName) || pricingConfigs[0] || null,
    [pricingConfigs, configName]
  );

  // Derived cost/target/players — no effects, so nothing to sync.
  const publishedCaseCost = pricing?.caseCost ?? null;
  const caseCost = caseCostInput !== '' ? Number(caseCostInput) : publishedCaseCost;
  const boxesPerCase = pricing?.boxesPerCase
    || detail?.configurations?.find(c => c.name === pricing?.configName)?.boxesPerCase
    || null;

  const base = computeTargets({ qty: Number(qty) || 0, unit, caseCost, boxesPerCase, marginDollars: 0 });
  const defaultMargin = base.totalCost != null ? Math.round(base.totalCost * (pricing?.marginTarget || 0.15)) : 0;
  const effMargin = marginDollars !== '' ? Number(marginDollars) : defaultMargin;
  const targets = {
    unitCost: base.unitCost,
    totalCost: base.totalCost,
    revenueTarget: base.totalCost != null ? base.totalCost + effMargin : null,
  };

  const defaultPlayers = useMemo(() => (detail?.topPlayers || []).slice(0, 12), [detail]);
  const effPlayers = players ?? defaultPlayers;

  const costUnconfirmed = caseCost == null || Number.isNaN(caseCost);
  const isMix = format === 'Mix' || saleMethod === 'Mix';

  // Spot board. Overrides are keyed by stable spot ids (team/player name, or spot-N), so they scope
  // themselves across format/qty changes without a reset effect.
  const baseSpots = useMemo(() => {
    if (targets.revenueTarget == null || !pricing) return [];
    if (format === 'Random') return buildSpots({ format, revenueTarget: targets.revenueTarget, totalCost: targets.totalCost, spotCount: Number(spotCount) || 30 });
    if (format === 'PYP') return buildSpots({ format, players: effPlayers, revenueTarget: targets.revenueTarget, totalCost: targets.totalCost });
    return buildSpots({ format: 'PYT', pricingConfig: pricing, revenueTarget: targets.revenueTarget, totalCost: targets.totalCost });
  }, [format, pricing, targets.revenueTarget, targets.totalCost, spotCount, effPlayers]);

  const defaultMethod = saleMethod === 'Buy Now' ? 'Buy Now' : 'Auction';
  const spots = useMemo(() => baseSpots.map(s => ({
    ...s,
    method: overrides[s.id]?.method || defaultMethod,
    sold: overrides[s.id]?.sold ?? null,
  })), [baseSpots, overrides, defaultMethod]);

  const live = useMemo(
    () => recompute(spots, { revenueTarget: targets.revenueTarget || 0, totalCost: targets.totalCost || 0 }),
    [spots, targets.revenueTarget, targets.totalCost]
  );

  const setSold = (id, val) => setOverrides(o => ({ ...o, [id]: { ...o[id], sold: val === '' ? null : Number(val) } }));
  const toggleMethod = (id, cur) => setOverrides(o => ({ ...o, [id]: { ...o[id], method: cur === 'Buy Now' ? 'Auction' : 'Buy Now' } }));
  const addPlayer = () => { const n = playerDraft.trim(); if (!n) return; setPlayers([...effPlayers, n]); setPlayerDraft(''); };
  const removePlayer = (i) => setPlayers(effPlayers.filter((_, j) => j !== i));

  // ── render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '12px 14px 48px' }}>
      {/* Product picker */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8 }}>
        {(sets || []).map(s => (
          <Chip key={s.id} active={s.id === selectedSetId} onClick={() => { setSelectedSetId(s.id); setConfigName(null); setCaseCostInput(''); setMarginDollars(''); setPlayers(null); setOverrides({}); }}>{s.name}</Chip>
        ))}
      </div>

      {!selectedSetId && <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--tg)', fontSize: 13 }}>Pick a product to price a break.</div>}
      {selectedSetId && loading && <div style={{ padding: 32, textAlign: 'center', color: 'var(--tg)', fontSize: 13 }}>Loading pricing…</div>}
      {selectedSetId && !loading && !pricingConfigs.length && (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--tg)', fontSize: 13 }}>No break-pricing data published for this product yet.</div>
      )}

      {pricing && !loading && (
        <>
          {/* config selector for multi-config sets */}
          {detail.pricing.multiConfig && pricingConfigs.length > 1 && (
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 10 }}>
              {pricingConfigs.map(c => (
                <Chip key={c.configName} small active={c.configName === pricing.configName} onClick={() => { setConfigName(c.configName); setCaseCostInput(''); setMarginDollars(''); }}>{c.configName}</Chip>
              ))}
            </div>
          )}

          {/* Inputs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 12 }}>
            <Field label="Quantity">
              <div style={{ display: 'flex', gap: 6 }}>
                <input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)} style={{ ...inputStyle, width: 64 }} />
                <div style={{ display: 'flex', gap: 4 }}>
                  <Chip small active={unit === 'case'} onClick={() => setUnit('case')}>Cases</Chip>
                  <Chip small active={unit === 'box'} onClick={() => setUnit('box')}>Boxes</Chip>
                </div>
              </div>
            </Field>
            <Field label={`Case cost ($)${costUnconfirmed ? ' — required' : ''}`}>
              <input type="number" value={caseCostInput} placeholder={publishedCaseCost != null ? String(publishedCaseCost) : 'Enter what you paid'} onChange={e => setCaseCostInput(e.target.value)}
                style={{ ...inputStyle, borderColor: costUnconfirmed ? 'rgba(224,168,0,0.5)' : 'var(--gb)' }} />
            </Field>
            <Field label="Target margin ($ profit)">
              <input type="number" value={marginDollars} placeholder={String(defaultMargin)} onChange={e => setMarginDollars(e.target.value)} style={inputStyle} />
            </Field>
            {format === 'Random' && (
              <Field label="Number of spots">
                <input type="number" min="1" value={spotCount} onChange={e => setSpotCount(e.target.value)} style={inputStyle} />
              </Field>
            )}
          </div>

          {/* Format + sale method */}
          <Field label="Format">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {FORMATS.map(f => <Chip key={f} active={format === f} onClick={() => setFormat(f)}>{f}</Chip>)}
            </div>
          </Field>
          {format !== 'Random' && (
            <Field label="Sale method">
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                {['Buy Now', 'Auction', 'Mix'].map(m => <Chip key={m} active={saleMethod === m} onClick={() => setSaleMethod(m)}>{m}</Chip>)}
              </div>
            </Field>
          )}

          {/* PYP player editor */}
          {format === 'PYP' && (
            <div style={{ marginBottom: 12 }}>
              <Field label="Players (spots)">
                <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  <input value={playerDraft} onChange={e => setPlayerDraft(e.target.value)} placeholder="Add a player…"
                    onKeyDown={e => { if (e.key === 'Enter') addPlayer(); }} style={inputStyle} />
                  <button onClick={addPlayer} style={{ ...inputStyle, width: 'auto', cursor: 'pointer', fontWeight: 700, color: ACCENT }}>Add</button>
                </div>
              </Field>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {effPlayers.map((p, i) => (
                  <span key={`${p}-${i}`} style={{ fontSize: 11, color: 'var(--ts)', background: 'var(--gbg)', border: '1px solid var(--gb)', borderRadius: 999, padding: '4px 8px 4px 11px', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {p}
                    <button onClick={() => removePlayer(i)} style={{ background: 'none', border: 'none', color: 'var(--tg)', cursor: 'pointer', fontSize: 13, lineHeight: 1 }}>×</button>
                  </span>
                ))}
                {effPlayers.length === 0 && <span style={{ fontSize: 11.5, color: 'var(--tg)' }}>Add the players you're offering as spots.</span>}
              </div>
            </div>
          )}

          {/* Live P&L header */}
          {targets.revenueTarget != null && !costUnconfirmed && (
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', padding: '12px 14px', marginBottom: 12, background: 'var(--card)', border: '1px solid rgba(255,107,53,0.25)', borderRadius: 12 }}>
              <HeaderStat label="Cost" value={money(targets.totalCost)} />
              <HeaderStat label="Revenue target" value={money(targets.revenueTarget)} accent />
              <HeaderStat label="Committed" value={money(live.committed)} sub={`${live.remainingSpots} spots left`} />
              <HeaderStat label="Remaining target" value={money(live.remainingTarget)} />
              {live.remainingAuctionSpots > 0 && <HeaderStat label="Avg / remaining" value={money(live.avgNeededPerRemaining)} />}
              <HeaderStat label="Proj. margin" value={money(live.projectedMarginAtList)} sub={`floor ${money(live.projectedMarginFloor)}`} />
            </div>
          )}

          {costUnconfirmed && (
            <div style={{ padding: 14, background: 'rgba(224,168,0,0.10)', border: '1px solid rgba(224,168,0,0.35)', borderRadius: 12, fontSize: 12.5, color: 'var(--ts)', marginBottom: 12 }}>
              Enter the case cost above to calculate spot prices and margin.
            </div>
          )}

          {/* Spot table */}
          {!costUnconfirmed && spots.length > 0 && (
            <div style={{ border: '1px solid var(--b)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: isMix ? '1fr 62px 62px 78px 70px' : '1fr 62px 62px 78px', background: 'var(--gbg)', padding: '8px 12px', fontSize: 9.5, fontWeight: 800, color: 'var(--tg)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                <span>{format === 'PYP' ? 'Player' : format === 'Random' ? 'Spot' : 'Team'}</span>
                <span style={{ textAlign: 'right' }}>List</span>
                <span style={{ textAlign: 'right' }}>Floor</span>
                <span style={{ textAlign: 'right' }}>Sold $</span>
                {isMix && <span style={{ textAlign: 'center' }}>Method</span>}
              </div>
              {spots.map((s, idx) => {
                const liveMin = live.liveMinById[s.id];
                const sold = s.sold != null;
                return (
                  <div key={s.id} style={{
                    display: 'grid', gridTemplateColumns: isMix ? '1fr 62px 62px 78px 70px' : '1fr 62px 62px 78px',
                    alignItems: 'center', padding: '7px 12px', fontSize: 12.5,
                    borderTop: '1px solid var(--b)', background: sold ? 'rgba(76,175,80,0.06)' : idx % 2 ? 'var(--card)' : 'transparent',
                  }}>
                    <span style={{ fontWeight: 700, color: 'var(--t)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.label}
                      {s.method === 'Buy Now' && <span style={{ fontSize: 9, color: ACCENT, marginLeft: 5, fontWeight: 700 }}>BIN</span>}
                    </span>
                    <span style={{ textAlign: 'right', color: 'var(--t)', fontWeight: 700 }}>{money(s.list)}</span>
                    <span style={{ textAlign: 'right', color: 'var(--tg)' }} title="Live min to still hit target">
                      {money(liveMin != null && !sold ? liveMin : s.floor)}
                    </span>
                    <input type="number" value={s.sold ?? ''} onChange={e => setSold(s.id, e.target.value)} placeholder="—"
                      style={{ background: 'var(--gbg)', border: '1px solid var(--gb)', borderRadius: 7, padding: '4px 6px', color: 'var(--t)', fontSize: 12, width: 70, textAlign: 'right', boxSizing: 'border-box', justifySelf: 'end' }} />
                    {isMix && (
                      <button onClick={() => toggleMethod(s.id, s.method)} style={{
                        justifySelf: 'center', fontSize: 9.5, fontWeight: 700, cursor: 'pointer', borderRadius: 999, padding: '3px 8px',
                        background: s.method === 'Buy Now' ? 'rgba(255,107,53,0.14)' : 'var(--gbg)',
                        border: `1px solid ${s.method === 'Buy Now' ? 'rgba(255,107,53,0.4)' : 'var(--gb)'}`,
                        color: s.method === 'Buy Now' ? ACCENT : 'var(--gc)',
                      }}>{s.method === 'Buy Now' ? 'BIN' : 'Auction'}</button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {format === 'Random' && !costUnconfirmed && (
            <div style={{ marginTop: 10, fontSize: 11.5, color: 'var(--tg)' }}>
              Random breaks are flat — every spot is {money(spots[0]?.list)}. Enter sold prices above to track your live margin.
            </div>
          )}

          {/* Export the priced spots straight to a platform CSV */}
          {!costUnconfirmed && spots.length > 0 && (
            <button onClick={() => setShowExport(true)} style={{
              marginTop: 14, width: '100%', background: 'var(--gbg)', border: '1px solid rgba(255,107,53,0.35)',
              color: ACCENT, borderRadius: 12, padding: '11px', cursor: 'pointer', fontSize: 13, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>📤 Export {spots.length} spots to Whatnot / eBay CSV →</button>
          )}
        </>
      )}

      {showExport && (
        <BulkListingModal
          items={spotsToItems(spots, { setName: detail?.name || '', sport: detail?.sport || '', format })}
          sourceLabel="break"
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  );
}
