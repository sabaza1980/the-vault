// BreakerHitLog — a breaker's log of notable pulls from the breaks THEY run (BK-5).
// Distinct from the consumer Break Tracker / Saved Breaks. Anonymous-first: stored in localStorage
// (Firestore sync can be layered on later, mirroring users/{uid}/breaks). Each hit can be shared as a
// branded social card (html2canvas → Web Share on mobile, PNG download on desktop) to promote streams.
import { useState, useRef, useCallback } from 'react';
import html2canvas from 'html2canvas';
import { FORMATS } from '../lib/breakPricing.js';

const ACCENT = '#ff6b35';
const LS_KEY = 'vault.breaker.hits';
const money = (n) => (n == null || n === '' || Number.isNaN(Number(n)) ? null : `$${Math.round(Number(n)).toLocaleString()}`);

function loadHits() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; }
}
function saveHits(hits) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(hits)); } catch { /* quota */ }
}

// Resize an uploaded image to a ~900px JPEG data URL (mirrors BreaksView.resizeImageFile).
function resizeImageFile(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 900;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
        else { width = Math.round(width * MAX / height); height = MAX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = reject;
    img.src = url;
  });
}

const inputStyle = {
  background: 'var(--gbg)', border: '1px solid var(--gb)', borderRadius: 10, padding: '9px 11px',
  color: 'var(--t)', fontSize: 13, width: '100%', boxSizing: 'border-box',
};

// ── Log-a-hit form ────────────────────────────────────────────────────────────
function HitForm({ sets, onAdd, onCancel }) {
  const [title, setTitle] = useState('');
  const [player, setPlayer] = useState('');
  const [setId, setSetId] = useState('');
  const [value, setValue] = useState('');
  const [format, setFormat] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [image, setImage] = useState(null);
  const [busy, setBusy] = useState(false);

  const pickImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try { setImage(await resizeImageFile(file)); } catch { /* ignore */ }
    setBusy(false);
  };

  const submit = () => {
    if (!title.trim()) return;
    const setName = sets?.find(s => s.id === setId)?.name || '';
    onAdd({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: title.trim(), player: player.trim(), setId, setName,
      value: value === '' ? null : Number(value), format, date, image,
      createdAt: new Date().toISOString(),
    });
  };

  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--b)', borderRadius: 14, padding: 14, marginBottom: 14 }}>
      <div style={{ display: 'grid', gap: 10 }}>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Card * (e.g. Cooper Flagg Chrome Refractor /499)" style={inputStyle} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <input value={player} onChange={e => setPlayer(e.target.value)} placeholder="Player" style={inputStyle} />
          <input type="number" value={value} onChange={e => setValue(e.target.value)} placeholder="Value ($)" style={inputStyle} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <select value={setId} onChange={e => setSetId(e.target.value)} style={inputStyle}>
            <option value="">Product…</option>
            {(sets || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select value={format} onChange={e => setFormat(e.target.value)} style={inputStyle}>
            <option value="">Break type…</option>
            {FORMATS.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center' }}>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
          <label style={{ ...inputStyle, width: 'auto', cursor: 'pointer', color: image ? ACCENT : 'var(--gc)', textAlign: 'center', fontWeight: 700 }}>
            {busy ? '…' : image ? '✓ Photo' : '＋ Photo'}
            <input type="file" accept="image/*" onChange={pickImage} style={{ display: 'none' }} />
          </label>
        </div>
        {image && <img src={image} alt="hit" style={{ maxHeight: 120, borderRadius: 10, objectFit: 'contain', alignSelf: 'start' }} />}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={submit} disabled={!title.trim()} style={{
            flex: 1, background: title.trim() ? ACCENT : 'var(--gbg)', color: title.trim() ? '#fff' : 'var(--tg)',
            border: 'none', borderRadius: 10, padding: '10px', fontSize: 13, fontWeight: 800, cursor: title.trim() ? 'pointer' : 'default',
          }}>Log hit</button>
          <button onClick={onCancel} style={{ background: 'var(--gbg)', border: '1px solid var(--gb)', color: 'var(--gc)', borderRadius: 10, padding: '10px 16px', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── main ──────────────────────────────────────────────────────────────────────
export default function BreakerHitLog({ sets }) {
  const [hits, setHits] = useState(loadHits);
  const [showForm, setShowForm] = useState(false);
  const [pendingShare, setPendingShare] = useState(null);
  const shareRef = useRef(null);

  const persist = useCallback((next) => { setHits(next); saveHits(next); }, []);
  const addHit = (hit) => { persist([hit, ...hits]); setShowForm(false); };
  const removeHit = (id) => persist(hits.filter(h => h.id !== id));

  const totalValue = hits.reduce((a, h) => a + (Number(h.value) || 0), 0);
  const biggest = hits.reduce((m, h) => ((Number(h.value) || 0) > (Number(m?.value) || 0) ? h : m), null);

  const shareHit = async (hit) => {
    setPendingShare(hit);
    await new Promise(r => setTimeout(r, 60)); // let the share card render
    try {
      const canvas = await html2canvas(shareRef.current, { backgroundColor: '#0f1115', scale: 2, useCORS: true });
      await new Promise((resolve) => {
        canvas.toBlob(async (blob) => {
          if (blob) {
            const file = new File([blob], 'vault-hit.png', { type: 'image/png' });
            let shared = false;
            try {
              if (navigator.share && navigator.canShare?.({ files: [file] })) {
                await navigator.share({ files: [file], title: hit.title });
                shared = true;
              }
            } catch { /* user cancelled or unsupported */ }
            if (!shared) {
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url; a.download = 'vault-hit.png';
              document.body.appendChild(a); a.click(); document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }
          }
          resolve();
        }, 'image/png');
      });
    } catch { /* html2canvas failed */ }
    setPendingShare(null);
  };

  return (
    <div style={{ padding: '14px 16px 48px' }}>
      {/* Stats + add */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14, flexWrap: 'wrap' }}>
        <div><div style={{ fontSize: 9.5, color: 'var(--tg)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>Hits</div><div style={{ fontSize: 20, fontWeight: 800, color: 'var(--t)', fontFamily: "'Barlow Condensed', sans-serif" }}>{hits.length}</div></div>
        <div><div style={{ fontSize: 9.5, color: 'var(--tg)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>Total value</div><div style={{ fontSize: 20, fontWeight: 800, color: ACCENT, fontFamily: "'Barlow Condensed', sans-serif" }}>{money(totalValue) || '$0'}</div></div>
        {biggest && <div><div style={{ fontSize: 9.5, color: 'var(--tg)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>Biggest</div><div style={{ fontSize: 20, fontWeight: 800, color: 'var(--t)', fontFamily: "'Barlow Condensed', sans-serif" }}>{money(biggest.value) || '—'}</div></div>}
        {!showForm && (
          <button onClick={() => setShowForm(true)} style={{ marginLeft: 'auto', background: ACCENT, color: '#fff', border: 'none', borderRadius: 999, padding: '8px 16px', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>＋ Log a hit</button>
        )}
      </div>

      {showForm && <HitForm sets={sets} onAdd={addHit} onCancel={() => setShowForm(false)} />}

      {hits.length === 0 && !showForm && (
        <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--tg)', fontSize: 13, lineHeight: 1.6 }}>
          🔥<br />Log the big pulls from your breaks and share them to promote your next stream.
        </div>
      )}

      {/* Hit list */}
      <div style={{ display: 'grid', gap: 10 }}>
        {hits.map(h => (
          <div key={h.id} style={{ display: 'flex', gap: 12, background: 'var(--card)', border: '1px solid var(--b)', borderRadius: 12, padding: 10 }}>
            {h.image
              ? <img src={h.image} alt="" style={{ width: 56, height: 78, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />
              : <div style={{ width: 56, height: 78, borderRadius: 8, background: 'var(--gbg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>🃏</div>}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--t)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.title}</div>
              <div style={{ fontSize: 11, color: 'var(--tg)', marginTop: 2 }}>
                {[h.player, h.setName, h.format].filter(Boolean).join(' · ')}
              </div>
              <div style={{ fontSize: 11, color: 'var(--tg)', marginTop: 2 }}>{h.date}{money(h.value) ? ` · ${money(h.value)}` : ''}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'center' }}>
              <button onClick={() => shareHit(h)} style={{ background: 'rgba(255,107,53,0.12)', border: '1px solid rgba(255,107,53,0.35)', color: ACCENT, borderRadius: 8, padding: '6px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Share</button>
              <button onClick={() => removeHit(h.id)} style={{ background: 'var(--gbg)', border: '1px solid var(--gb)', color: 'var(--tg)', borderRadius: 8, padding: '6px 10px', fontSize: 11, cursor: 'pointer' }}>Delete</button>
            </div>
          </div>
        ))}
      </div>

      {/* Off-screen branded share card (rendered only while sharing) */}
      {pendingShare && (
        <div ref={shareRef} style={{
          position: 'fixed', left: -99999, top: 0, width: 500, padding: 34, boxSizing: 'border-box',
          background: 'linear-gradient(160deg, #0f1115 0%, #1a1d24 100%)', color: '#fff', fontFamily: "'Inter', sans-serif",
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
            <span style={{ fontSize: 22 }}>🎬</span>
            <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: ACCENT, fontFamily: "'Bebas Neue', sans-serif" }}>Break Hit</span>
          </div>
          {pendingShare.image && (
            <img src={pendingShare.image} alt="" style={{ width: '100%', maxHeight: 360, objectFit: 'contain', borderRadius: 14, marginBottom: 18, background: '#000' }} />
          )}
          <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.15, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 0.4 }}>{pendingShare.title}</div>
          <div style={{ fontSize: 14, color: '#aab', marginTop: 8 }}>{[pendingShare.player, pendingShare.setName, pendingShare.format].filter(Boolean).join(' · ')}</div>
          {money(pendingShare.value) && (
            <div style={{ fontSize: 34, fontWeight: 800, color: ACCENT, marginTop: 12, fontFamily: "'Bebas Neue', sans-serif" }}>{money(pendingShare.value)}</div>
          )}
          <div style={{ marginTop: 20, fontSize: 12, color: '#889', letterSpacing: 0.5 }}>myvaults.io</div>
        </div>
      )}
    </div>
  );
}
