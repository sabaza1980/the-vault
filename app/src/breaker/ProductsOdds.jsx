// ProductsOdds — breaker-facing product reference (BK-1).
// Pick a sport → a set → see box configurations, guarantees, hit odds, and a pricing snapshot
// framed for planning/pricing a rip (not chasing a player). Feeds the Price Calculator (BK-2).
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { loadSetDetail, revenueTarget } from '../lib/breakerData.js';

const ACCENT = '#ff6b35';

const money = (n) => (n == null ? '—' : `$${Math.round(n).toLocaleString()}`);
const titleize = (s) => String(s).replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()).trim();

// ── small UI atoms ────────────────────────────────────────────────────────────
function Chip({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      flexShrink: 0, background: active ? 'rgba(255,107,53,0.12)' : 'var(--gbg)',
      border: `1px solid ${active ? 'rgba(255,107,53,0.4)' : 'var(--gb)'}`,
      color: active ? ACCENT : 'var(--gc)', borderRadius: 999, padding: '6px 13px',
      cursor: 'pointer', fontSize: 12, fontWeight: 700, letterSpacing: 0.3, whiteSpace: 'nowrap',
    }}>{children}</button>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 800, color: 'var(--tg)', letterSpacing: 0.8,
      textTransform: 'uppercase', margin: '18px 0 8px',
    }}>{children}</div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div style={{ flex: 1, minWidth: 82 }}>
      <div style={{ fontSize: 10, color: 'var(--tg)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>{label}</div>
      <div style={{
        fontSize: 16, fontWeight: 800, color: accent ? ACCENT : 'var(--t)', marginTop: 2,
        fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 0.3,
      }}>{value}</div>
    </div>
  );
}

// ── configuration card (box structure + guarantees) ───────────────────────────
function ConfigCard({ cfg }) {
  const boxLine = [
    cfg.cardsPerPack && `${cfg.cardsPerPack} cards/pack`,
    cfg.packsPerBox && `${cfg.packsPerBox} packs/box`,
    cfg.boxesPerCase && `${cfg.boxesPerCase} boxes/case`,
  ].filter(Boolean).join(' · ');

  return (
    <div style={{
      background: 'var(--card)', border: `1px solid ${cfg.breakRelevant ? 'rgba(255,107,53,0.25)' : 'var(--b)'}`,
      borderRadius: 12, padding: '12px 14px', marginBottom: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--t)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 0.4 }}>{titleize(cfg.name)}</span>
        {!cfg.breakRelevant && (
          <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--tg)', background: 'var(--gbg)', border: '1px solid var(--gb)', borderRadius: 999, padding: '2px 7px', textTransform: 'uppercase', letterSpacing: 0.5 }}>Retail</span>
        )}
        {cfg.cardsPerCase && (
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--tg)' }}>{cfg.cardsPerCase.toLocaleString()} cards/case</span>
        )}
      </div>
      {boxLine && <div style={{ fontSize: 11.5, color: 'var(--tg)', marginBottom: 8 }}>{boxLine}</div>}
      {Object.keys(cfg.guarantees).length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {Object.entries(cfg.guarantees).map(([k, v]) => (
            <span key={k} style={{ fontSize: 10.5, color: 'var(--ts)', background: 'var(--gbg)', border: '1px solid var(--gb)', borderRadius: 8, padding: '3px 8px' }}>
              <b style={{ color: 'var(--t)' }}>{v}</b> {titleize(k)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── pricing snapshot per break-relevant config ────────────────────────────────
function PricingCard({ p, setMeta, onPrice }) {
  const rev = p.revenueTarget ?? revenueTarget(p.caseCost, p.marginTarget);
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--b)', borderRadius: 12, padding: '12px 14px', marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--t)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 0.4 }}>
          {p.configName === 'Case' ? 'Case economics' : titleize(p.configName)}
        </span>
        {p.priceUnconfirmed && (
          <span style={{ fontSize: 9.5, fontWeight: 700, color: '#e0a800', background: 'rgba(224,168,0,0.12)', border: '1px solid rgba(224,168,0,0.35)', borderRadius: 999, padding: '2px 7px', textTransform: 'uppercase', letterSpacing: 0.4 }}>Cost unconfirmed</span>
        )}
      </div>

      {p.priceUnconfirmed ? (
        <div style={{ fontSize: 11.5, color: 'var(--tg)', lineHeight: 1.5, marginBottom: 10 }}>
          Case cost not confirmed{p.estimatedCaseRange ? ` (est. ${p.estimatedCaseRange})` : ''}. Enter what you actually paid in the calculator to get a revenue target and spot prices.
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 10 }}>
          <Stat label="Case cost" value={money(p.caseCost)} />
          <Stat label={`Target (+${Math.round((p.marginTarget || 0.15) * 100)}%)`} value={money(rev)} accent />
          {p.autosPerCase != null && <Stat label="Autos/case" value={p.autosPerCase} />}
          {p.pyt?.avgSpotPrice != null && <Stat label="PYT avg spot" value={money(p.pyt.avgSpotPrice)} />}
          {p.random?.spotPrice != null && <Stat label="Random spot" value={money(p.random.spotPrice)} />}
        </div>
      )}

      <button onClick={() => onPrice(setMeta, p.configName)} style={{
        background: 'rgba(255,107,53,0.12)', border: '1px solid rgba(255,107,53,0.35)', color: ACCENT,
        borderRadius: 10, padding: '8px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 700,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>🧮 Price this in the calculator →</button>
    </div>
  );
}

// ── main ──────────────────────────────────────────────────────────────────────
export default function ProductsOdds({ sets, loadingSets, setsError, selectedSetId, onSelectSet, onPriceConfig }) {
  const [sport, setSport] = useState('All');
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState(null);

  const sports = useMemo(() => {
    const s = new Set((sets || []).map(x => x.sport).filter(Boolean));
    return ['All', ...[...s].sort()];
  }, [sets]);

  const visibleSets = useMemo(() => {
    return (sets || []).filter(s => sport === 'All' || s.sport === sport);
  }, [sets, sport]);

  const selectedMeta = useMemo(() => (sets || []).find(s => s.id === selectedSetId) || null, [sets, selectedSetId]);

  // Load kept in a callback (not inline in the effect) to avoid synchronous setState in an
  // effect body — matches the codebase pattern (see BreakTracker.fetchChecklist). A request id
  // guards against stale async responses when the selected set changes quickly.
  const reqId = useRef(0);
  const loadDetail = useCallback((meta) => {
    const id = ++reqId.current;
    if (!meta) { setDetail(null); return; }
    setLoadingDetail(true); setDetailError(null); setDetail(null);
    loadSetDetail(meta)
      .then(d => { if (id === reqId.current) setDetail(d); })
      .catch(e => { if (id === reqId.current) setDetailError(e.message || 'Failed to load'); })
      .finally(() => { if (id === reqId.current) setLoadingDetail(false); });
  }, []);

  useEffect(() => { loadDetail(selectedMeta); }, [selectedMeta, loadDetail]);

  if (loadingSets) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--tg)', fontSize: 13 }}>Loading products…</div>;
  }
  if (setsError) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--tg)', fontSize: 13 }}>Couldn’t load products: {setsError}</div>;
  }

  return (
    <div style={{ padding: '12px 14px 40px' }}>
      {/* Sport filter */}
      {sports.length > 2 && (
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8, marginBottom: 4 }}>
          {sports.map(s => <Chip key={s} active={s === sport} onClick={() => setSport(s)}>{s}</Chip>)}
        </div>
      )}

      {/* Set picker */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8 }}>
        {visibleSets.map(s => (
          <Chip key={s.id} active={s.id === selectedSetId} onClick={() => onSelectSet(s.id)}>{s.name}</Chip>
        ))}
        {visibleSets.length === 0 && <span style={{ fontSize: 12, color: 'var(--tg)', padding: '6px 0' }}>No products for {sport}.</span>}
      </div>

      {/* Detail */}
      {!selectedSetId && (
        <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--tg)', fontSize: 13 }}>
          Pick a product above to see its box breakdown, odds, and pricing.
        </div>
      )}

      {selectedSetId && loadingDetail && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--tg)', fontSize: 13 }}>Loading odds…</div>
      )}

      {selectedSetId && detailError && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--tg)', fontSize: 13 }}>Couldn’t load odds: {detailError}</div>
      )}

      {detail && !loadingDetail && (
        <div style={{ marginTop: 6 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--t)', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 0.6 }}>{detail.name}</div>
          <div style={{ fontSize: 11.5, color: 'var(--tg)', marginTop: 1 }}>
            {[detail.brand, detail.year, detail.sport].filter(Boolean).join(' · ')}
            {detail.totalCards ? ` · ${detail.totalCards.toLocaleString()} cards` : ''}
            {detail.totalVariants ? ` · ${detail.totalVariants.toLocaleString()} variants` : ''}
          </div>

          {!detail.hasOdds && (
            <div style={{ marginTop: 16, padding: 16, background: 'var(--card)', border: '1px solid var(--b)', borderRadius: 12, fontSize: 12.5, color: 'var(--tg)' }}>
              Odds haven’t been published for this product yet.
            </div>
          )}

          {detail.pricing.configs.length > 0 && (
            <>
              <SectionLabel>Break pricing snapshot</SectionLabel>
              {detail.pricing.configs.map(p => (
                <PricingCard key={p.configName} p={p} setMeta={selectedMeta} onPrice={onPriceConfig} />
              ))}
            </>
          )}

          {detail.configurations.length > 0 && (
            <>
              <SectionLabel>Box configurations</SectionLabel>
              {detail.configurations.map(cfg => <ConfigCard key={cfg.name} cfg={cfg} />)}
            </>
          )}

          {detail.topPlayers.length > 0 && (
            <>
              <SectionLabel>Top players</SectionLabel>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {detail.topPlayers.map(p => (
                  <span key={p} style={{ fontSize: 11.5, color: 'var(--ts)', background: 'var(--gbg)', border: '1px solid var(--gb)', borderRadius: 999, padding: '4px 11px' }}>{p}</span>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
