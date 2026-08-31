// BreakersHub — dedicated toolkit for people RUNNING breaks (sellers), separate from the
// consumer Break Tracker / Saved Breaks (buyer tools, which live elsewhere and are untouched).
//
// Full-screen overlay (same pattern as BreakTracker: fixed inset-0). Owns an internal sub-tab bar:
//   Products & Odds · Hit Log · Price Calculator · Bulk Listing
//
// BK-0 ships the shell with stubbed tabs. Tools are dropped in per the plan (BK-1…BK-4):
//   see /the-vault/BREAKERS_SECTION_PLAN.md
import { useState, useEffect } from 'react';
import { fetchSets } from './lib/breakerData.js';
import ProductsOdds from './breaker/ProductsOdds.jsx';
import BreakPriceCalculator from './breaker/BreakPriceCalculator.jsx';
import BreakerHitLog from './breaker/BreakerHitLog.jsx';

const ACCENT = '#ff6b35';

const TABS = [
  { id: 'products', label: 'Products & Odds', icon: '📋' },
  { id: 'hits',     label: 'Hit Log',        icon: '🔥' },
  { id: 'pricing',  label: 'Price Calculator', icon: '🧮' },
  { id: 'listing',  label: 'Bulk Listing',   icon: '📤' },
];

// ── Placeholder shown for tabs whose tool isn't built yet ─────────────────────
function ComingSoon({ icon, title, blurb }) {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 10, padding: '40px 24px', textAlign: 'center',
      color: 'var(--tg)',
    }}>
      <div style={{ fontSize: 34, opacity: 0.85 }}>{icon}</div>
      <div style={{
        fontSize: 16, fontWeight: 800, color: 'var(--t)',
        fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 0.4, textTransform: 'uppercase',
      }}>{title}</div>
      <div style={{ fontSize: 12.5, maxWidth: 340, lineHeight: 1.5 }}>{blurb}</div>
      <div style={{
        marginTop: 6, fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase',
        color: ACCENT, background: 'rgba(255,107,53,0.10)', border: '1px solid rgba(255,107,53,0.28)',
        borderRadius: 999, padding: '4px 12px',
      }}>Coming next</div>
    </div>
  );
}

function BulkListingLanding({ onGoToTab }) {
  return (
    <div style={{ padding: '18px 16px 40px', maxWidth: 520 }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--t)', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 0.8, textTransform: 'uppercase' }}>Bulk Listing</div>
      <div style={{ fontSize: 12.5, color: 'var(--tg)', lineHeight: 1.55, margin: '6px 0 16px' }}>
        Export your break spots or singles to a platform-ready CSV — one upload, no manual entry.
      </div>

      <div style={{ background: 'var(--card)', border: '1px solid rgba(255,107,53,0.25)', borderRadius: 12, padding: '14px', marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--t)', marginBottom: 4 }}>🎬 From a break</div>
        <div style={{ fontSize: 11.5, color: 'var(--tg)', lineHeight: 1.5, marginBottom: 10 }}>
          Price a break in the calculator, then hit “Export to CSV” to turn every spot into a Whatnot, eBay, or generic listing sheet.
        </div>
        <button onClick={() => onGoToTab('pricing')} style={{
          background: 'rgba(255,107,53,0.12)', border: '1px solid rgba(255,107,53,0.35)', color: '#ff6b35',
          borderRadius: 10, padding: '8px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 700,
        }}>Open Price Calculator →</button>
      </div>

      <div style={{ background: 'var(--card)', border: '1px solid var(--b)', borderRadius: 12, padding: '14px' }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--t)', marginBottom: 4 }}>🃏 From your collection (singles)</div>
        <div style={{ fontSize: 11.5, color: 'var(--tg)', lineHeight: 1.5 }}>
          Select cards in Collections and export them to the same platform templates. Coming next.
        </div>
      </div>

      <div style={{ fontSize: 11, color: 'var(--tg)', marginTop: 14, lineHeight: 1.5 }}>
        Templates: <b style={{ color: 'var(--ts)' }}>Whatnot</b> (official bulk-import columns), <b style={{ color: 'var(--ts)' }}>eBay</b> (File Exchange / Seller Hub), and a <b style={{ color: 'var(--ts)' }}>generic</b> sheet (also for Fanatics, which has no public self-serve CSV).
      </div>
    </div>
  );
}

function TabContent({ tab, sets, loadingSets, setsError, selectedSetId, onSelectSet, onPriceConfig, calcContext, onGoToTab }) {
  switch (tab) {
    case 'products':
      return (
        <ProductsOdds
          sets={sets}
          loadingSets={loadingSets}
          setsError={setsError}
          selectedSetId={selectedSetId}
          onSelectSet={onSelectSet}
          onPriceConfig={onPriceConfig}
        />
      );
    case 'pricing':
      return <BreakPriceCalculator sets={sets} calcContext={calcContext} />;
    case 'hits':
      return <BreakerHitLog sets={sets} />;
    case 'listing':
      return <BulkListingLanding onGoToTab={onGoToTab} />;
    default:
      return null;
  }
}

export default function BreakersHub({ onClose }) {
  const [tab, setTab] = useState('products');

  // Shared across tabs: the product catalog + the currently selected set.
  const [sets, setSets] = useState([]);
  const [loadingSets, setLoadingSets] = useState(true);
  const [setsError, setSetsError] = useState(null);
  const [selectedSetId, setSelectedSetId] = useState(null);
  // Set + config the user chose to price — handed to the calculator tab (BK-2).
  const [calcContext, setCalcContext] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingSets(true); setSetsError(null);
    fetchSets()
      .then(s => { if (!cancelled) setSets(s); })
      .catch(e => { if (!cancelled) setSetsError(e.message || 'Failed to load'); })
      .finally(() => { if (!cancelled) setLoadingSets(false); });
    return () => { cancelled = true; };
  }, []);

  const handlePriceConfig = (setMeta, configName) => {
    setSelectedSetId(setMeta.id);
    setCalcContext({ setId: setMeta.id, configName });
    setTab('pricing');
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 700,
      background: 'var(--bg)', display: 'flex', flexDirection: 'column',
      fontFamily: "'Inter', sans-serif", overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10,
        padding: '14px 16px', borderBottom: '1px solid var(--b)', background: 'var(--surface)',
      }}>
        <button
          onClick={onClose}
          aria-label="Close Breakers"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tg)', fontSize: 20, lineHeight: 1, padding: 4 }}
        >←</button>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: 18, fontWeight: 800, color: 'var(--t)',
            fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1, textTransform: 'uppercase',
          }}>Breakers</div>
          <div style={{ fontSize: 10.5, color: 'var(--tg)', marginTop: -1 }}>Tools for running breaks</div>
        </div>
      </div>

      {/* Sub-tab bar */}
      <div style={{
        flexShrink: 0, display: 'flex', gap: 4, padding: '8px 10px',
        borderBottom: '1px solid var(--b)', background: 'var(--surface)',
        overflowX: 'auto', WebkitOverflowScrolling: 'touch',
      }}>
        {TABS.map(t => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6,
                background: active ? 'rgba(255,107,53,0.12)' : 'var(--gbg)',
                border: `1px solid ${active ? 'rgba(255,107,53,0.4)' : 'var(--gb)'}`,
                color: active ? ACCENT : 'var(--gc)',
                borderRadius: 999, padding: '6px 14px', cursor: 'pointer',
                fontSize: 12, fontWeight: 700, letterSpacing: 0.3, whiteSpace: 'nowrap',
                transition: 'color 0.15s, background 0.15s, border-color 0.15s',
              }}
            >
              <span style={{ fontSize: 13 }}>{t.icon}</span>{t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        <TabContent
          tab={tab}
          sets={sets}
          loadingSets={loadingSets}
          setsError={setsError}
          selectedSetId={selectedSetId}
          onSelectSet={setSelectedSetId}
          onPriceConfig={handlePriceConfig}
          calcContext={calcContext}
          onGoToTab={setTab}
        />
      </div>
    </div>
  );
}
