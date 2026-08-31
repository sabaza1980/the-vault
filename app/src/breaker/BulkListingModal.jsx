// BulkListingModal — platform CSV export (BK-3). Takes normalized listing `items` (from break spots
// via spotsToItems, or collection cards via cardsToItems) → pick a platform → preview → download CSV.
import { useState, useMemo } from 'react';
import { PLATFORMS, buildTable, toCSV } from '../lib/listingExport.js';

const ACCENT = '#ff6b35';

function downloadCSV(csv, filename) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function BulkListingModal({ items = [], sourceLabel = 'listing', onClose }) {
  const [platform, setPlatform] = useState('whatnot');
  const [done, setDone] = useState(false);

  const table = useMemo(() => buildTable(platform, items), [platform, items]);
  const plat = PLATFORMS.find(p => p.id === platform);
  const previewRows = table.rows.slice(0, 8);

  const handleDownload = () => {
    const csv = toCSV(platform, items);
    const date = new Date().toISOString().slice(0, 10);
    downloadCSV(csv, `vault-${platform}-${sourceLabel}-${date}.csv`.replace(/\s+/g, '-').toLowerCase());
    setDone(true);
    setTimeout(() => setDone(false), 2500);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 820, background: 'var(--bg)', display: 'flex', flexDirection: 'column', fontFamily: "'Inter', sans-serif" }}>
      {/* Header */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--b)', background: 'var(--surface)' }}>
        <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tg)', fontSize: 20, padding: 4 }}>←</button>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--t)', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 0.8, textTransform: 'uppercase' }}>Bulk Listing CSV</div>
          <div style={{ fontSize: 10.5, color: 'var(--tg)' }}>{items.length} item{items.length === 1 ? '' : 's'} · {sourceLabel}</div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px 40px' }}>
        {/* Platform picker */}
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--tg)', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 }}>Platform</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {PLATFORMS.map(p => (
            <button key={p.id} onClick={() => setPlatform(p.id)} style={{
              background: platform === p.id ? 'rgba(255,107,53,0.12)' : 'var(--gbg)',
              border: `1px solid ${platform === p.id ? 'rgba(255,107,53,0.4)' : 'var(--gb)'}`,
              color: platform === p.id ? ACCENT : 'var(--gc)', borderRadius: 999, padding: '6px 14px',
              cursor: 'pointer', fontSize: 12, fontWeight: 700, letterSpacing: 0.3,
            }}>{p.label}</button>
          ))}
        </div>
        {plat?.note && <div style={{ fontSize: 11.5, color: 'var(--tg)', lineHeight: 1.5, marginBottom: 14 }}>{plat.note}</div>}

        {/* Preview */}
        {items.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--tg)', fontSize: 13 }}>Nothing to export yet.</div>
        ) : (
          <>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--tg)', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 }}>
              Preview · showing {previewRows.length} of {table.rows.length}
            </div>
            <div style={{ border: '1px solid var(--b)', borderRadius: 10, overflow: 'auto', maxHeight: '46vh' }}>
              <table style={{ borderCollapse: 'collapse', fontSize: 11, whiteSpace: 'nowrap' }}>
                <thead>
                  <tr>
                    {table.headers.map(h => (
                      <th key={h} style={{ position: 'sticky', top: 0, background: 'var(--gbg)', color: 'var(--tg)', fontWeight: 800, textAlign: 'left', padding: '7px 10px', borderBottom: '1px solid var(--b)', textTransform: 'uppercase', fontSize: 9.5, letterSpacing: 0.4 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((r, i) => (
                    <tr key={i}>
                      {table.headers.map(h => (
                        <td key={h} style={{ padding: '6px 10px', borderBottom: '1px solid var(--b)', color: 'var(--ts)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>{String(r[h] ?? '')}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div style={{ flexShrink: 0, borderTop: '1px solid var(--b)', background: 'var(--surface)', padding: '12px 16px calc(env(safe-area-inset-bottom, 0px) + 12px)' }}>
        <button onClick={handleDownload} disabled={!items.length} style={{
          width: '100%', background: items.length ? `linear-gradient(135deg, ${ACCENT} 0%, #f7931e 100%)` : 'var(--gbg)',
          border: 'none', borderRadius: 12, padding: '13px', cursor: items.length ? 'pointer' : 'default',
          color: items.length ? '#fff' : 'var(--tg)', fontSize: 14, fontWeight: 800, letterSpacing: 0.4,
          fontFamily: "'Bebas Neue', sans-serif",
        }}>{done ? '✓ CSV downloaded' : `Download ${plat?.label} CSV`}</button>
      </div>
    </div>
  );
}
