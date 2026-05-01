import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { db } from './firebase.js';
import { collection, doc, getDocs, updateDoc, query, orderBy } from 'firebase/firestore';

const BREAKS_LS_KEY = 'vault.saved.breaks';

function loadLocalBreaks() {
  try { return JSON.parse(localStorage.getItem(BREAKS_LS_KEY) || '[]'); } catch { return []; }
}
function saveLocalBreaks(breaks) {
  try { localStorage.setItem(BREAKS_LS_KEY, JSON.stringify(breaks)); } catch {}
}

function resizeImageFile(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 800;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
        else { width = Math.round(width * MAX / height); height = MAX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = reject;
    img.src = url;
  });
}

// ── Hit Row ──────────────────────────────────────────────────────────────────
function HitRow({ hit, onMarkReceived, onAddToVault }) {
  const inVault = !!hit.vaultCardId;
  const received = hit.received || inVault;

  return (
    <div style={{
      background: 'var(--card)', border: `1px solid ${inVault ? 'rgba(255,107,53,0.25)' : received ? 'rgba(76,175,80,0.2)' : 'var(--b)'}`,
      borderRadius: 12, padding: '10px 14px', marginBottom: 8,
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 700,
          color: inVault ? '#ff6b35' : received ? '#4caf50' : 'var(--t)',
          fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 0.4,
        }}>
          {hit.variantName}
          {hit.cardNumber && (
            <span style={{ fontSize: 11, color: 'var(--tg)', marginLeft: 6, fontWeight: 400 }}>#{hit.cardNumber}</span>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--tg)', marginTop: 2 }}>
          {hit.subsetId && hit.subsetId !== 'base' ? hit.subsetId : 'Base Set'}
        </div>
      </div>

      {inVault ? (
        <div style={{
          fontSize: 11, color: '#ff6b35', fontWeight: 700,
          display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
        }}>
          🏛️ In Vault
        </div>
      ) : received ? (
        <button
          onClick={onAddToVault}
          style={{
            flexShrink: 0, padding: '6px 12px', borderRadius: 8,
            background: 'rgba(255,107,53,0.12)', border: '1px solid rgba(255,107,53,0.3)',
            color: '#ff6b35', fontSize: 11, fontWeight: 700, cursor: 'pointer',
          }}
        >
          📷 Add to Vault
        </button>
      ) : (
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button
            onClick={onMarkReceived}
            style={{
              padding: '6px 10px', borderRadius: 8,
              background: 'rgba(76,175,80,0.12)', border: '1px solid rgba(76,175,80,0.3)',
              color: '#4caf50', fontSize: 11, fontWeight: 700, cursor: 'pointer',
            }}
          >
            ✓ Received
          </button>
          <button
            onClick={onAddToVault}
            style={{
              padding: '6px 10px', borderRadius: 8,
              background: 'rgba(255,107,53,0.1)', border: '1px solid rgba(255,107,53,0.25)',
              color: '#ff6b35', fontSize: 11, fontWeight: 700, cursor: 'pointer',
            }}
          >
            📷 Vault
          </button>
        </div>
      )}
    </div>
  );
}

// ── Add to Vault Modal ───────────────────────────────────────────────────────
function AddToVaultModal({ hit, brk, onClose, onAdded, onAddCard }) {
  const [imageFile, setImageFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const fileInputRef = useRef();

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImageFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleAdd = async () => {
    setLoading(true);
    let imageDataUrl = null;
    if (imageFile) {
      try { imageDataUrl = await resizeImageFile(imageFile); } catch {}
    }
    try {
      const cardId = await onAddCard({ hit, setId: brk.setId, setName: brk.setName, imageDataUrl });
      await onAdded(hit, cardId);
      setDone(true);
    } catch (e) {
      console.error('Add to vault failed', e);
    }
    setLoading(false);
  };

  const containerStyle = {
    position: 'fixed', inset: 0, zIndex: 702,
    background: 'rgba(0,0,0,0.92)', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', padding: '24px 16px',
    fontFamily: "'Inter', sans-serif",
  };

  if (done) {
    return (
      <div style={containerStyle}>
        <div style={{ fontSize: 52, marginBottom: 14 }}>🏛️</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#fff', marginBottom: 6 }}>Added to Vault!</div>
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', textAlign: 'center', marginBottom: 24 }}>
          {hit.playerName} · {hit.variantName}
        </div>
        <button
          onClick={onClose}
          style={{
            padding: '12px 32px', borderRadius: 12,
            background: 'linear-gradient(135deg, #ff6b35, #e84d1e)',
            border: 'none', color: '#fff', fontSize: 14, fontWeight: 700,
            cursor: 'pointer', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1.2,
          }}
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={{
        width: '100%', maxWidth: 420,
        background: 'var(--card)', border: '1px solid var(--b)', borderRadius: 16,
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(255,107,53,0.15), rgba(255,107,53,0.05))',
          borderBottom: '1px solid rgba(255,107,53,0.2)',
          padding: '16px 20px',
        }}>
          <div style={{ fontSize: 11, color: '#ff6b35', fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4 }}>
            Add to Vault
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 0.5 }}>
            {hit.playerName}
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginTop: 3 }}>
            {hit.variantName} · {brk.setName}
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '20px' }}>
          {/* Photo input area */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleImageChange}
            style={{ display: 'none' }}
          />
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{
              width: '100%', aspectRatio: '3/2', borderRadius: 12,
              border: `2px dashed ${previewUrl ? 'rgba(255,107,53,0.4)' : 'rgba(255,255,255,0.12)'}`,
              background: previewUrl ? 'none' : 'rgba(255,255,255,0.02)',
              cursor: 'pointer', overflow: 'hidden', marginBottom: 16,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'border-color 0.2s',
            }}
          >
            {previewUrl ? (
              <img src={previewUrl} alt="Card preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ textAlign: 'center', color: 'var(--tg)', userSelect: 'none' }}>
                <div style={{ fontSize: 30, marginBottom: 6 }}>📷</div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Tap to add a photo</div>
                <div style={{ fontSize: 11, marginTop: 3, color: 'rgba(255,255,255,0.28)' }}>optional — you can skip this</div>
              </div>
            )}
          </div>

          {/* Pre-filled card details */}
          <div style={{
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 10, padding: '12px 14px', marginBottom: 16,
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px',
          }}>
            {[
              ['Player', hit.playerName],
              ['Team', hit.team],
              ['Set', brk.setName],
              ['Card #', hit.cardNumber || '—'],
              ['Variant', hit.variantName],
            ].map(([label, value]) => (
              <div key={label}>
                <div style={{ fontSize: 9, color: 'var(--tg)', textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 700 }}>{label}</div>
                <div style={{ fontSize: 12, color: 'var(--t)', marginTop: 2, fontWeight: 600 }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onClose}
              style={{
                flex: 1, padding: '12px 0', borderRadius: 10,
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={loading}
              style={{
                flex: 2, padding: '12px 0', borderRadius: 10,
                background: 'linear-gradient(135deg, #ff6b35, #e84d1e)',
                border: 'none', color: '#fff', fontSize: 13, fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
                fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1.2,
              }}
            >
              {loading ? 'Saving…' : 'ADD TO VAULT'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Break List Card ──────────────────────────────────────────────────────────
function BreakListCard({ brk, onClick }) {
  const hitCount = brk.hits?.length || 0;
  const receivedCount = brk.hits?.filter(h => h.received || h.vaultCardId).length || 0;
  const vaultedCount = brk.hits?.filter(h => h.vaultCardId).length || 0;

  const dateStr = brk.date
    ? new Date(brk.date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
    : brk.savedAt
      ? new Date(brk.savedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
      : '';

  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--card)', border: '1px solid var(--b)', borderRadius: 14,
        padding: '14px 16px', cursor: 'pointer',
        transition: 'border-color 0.15s',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 0.5 }}>
            {brk.setName || 'Unknown Set'}
          </div>
          {brk.breakerName && (
            <div style={{ fontSize: 11, color: 'var(--tg)', marginTop: 2 }}>{brk.breakerName}</div>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--tg)', flexShrink: 0, marginLeft: 8 }}>{dateStr}</div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
        {brk.breakType && (
          <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: 'rgba(255,107,53,0.1)', color: '#ff6b35', border: '1px solid rgba(255,107,53,0.25)', fontWeight: 700 }}>
            {brk.breakType}
          </span>
        )}
        {brk.platform && (
          <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: 'rgba(100,181,246,0.08)', color: '#64b5f6', border: '1px solid rgba(100,181,246,0.2)', fontWeight: 700 }}>
            {brk.platform}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--tg)' }}>🏆 {hitCount} hit{hitCount !== 1 ? 's' : ''}</span>
        {receivedCount > 0 && <span style={{ fontSize: 12, color: '#4caf50' }}>✓ {receivedCount} received</span>}
        {vaultedCount > 0 && <span style={{ fontSize: 12, color: '#ff6b35' }}>🏛️ {vaultedCount} in vault</span>}
        <span style={{ marginLeft: 'auto', fontSize: 14, color: 'var(--tg)' }}>›</span>
      </div>
    </div>
  );
}

// ── Break Detail View ────────────────────────────────────────────────────────
function BreakDetailView({ brk, onBack, onMarkReceived, onAddToVault, topOffset = 0 }) {
  const grouped = useMemo(() => {
    if (!brk.hits?.length) return [];
    const map = {};
    for (const h of brk.hits) {
      const key = h.playerSlug || h.playerName;
      if (!map[key]) map[key] = { playerName: h.playerName, team: h.team, hits: [] };
      map[key].hits.push(h);
    }
    return Object.values(map).sort((a, b) => b.hits.length - a.hits.length);
  }, [brk.hits]);

  const dateStr = brk.date
    ? new Date(brk.date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 701,
      background: 'var(--bg)', display: 'flex', flexDirection: 'column',
      fontFamily: "'Inter', sans-serif", overflow: 'hidden',
    }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Header */}
      <div style={{
        background: 'var(--hbg)', borderBottom: '1px solid var(--hb)',
        padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
        backdropFilter: 'blur(20px)',
      }}>
        <button
          onClick={onBack}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tg)', fontSize: 18, padding: '2px 6px', flexShrink: 0 }}
        >
          ←
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 400, color: '#ff6b35', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 2, lineHeight: 1 }}>
            {brk.setName || 'Break Details'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--tg)', marginTop: 2 }}>
            {dateStr}{brk.breakerName ? ` · ${brk.breakerName}` : ''}{brk.breakType ? ` · ${brk.breakType}` : ''}
          </div>
        </div>
        <div style={{
          background: 'rgba(76,175,80,0.15)', border: '1px solid rgba(76,175,80,0.3)',
          borderRadius: 20, padding: '4px 10px', fontSize: 11, fontWeight: 700, color: '#4caf50', flexShrink: 0,
        }}>
          🏆 {brk.hits?.length || 0}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
        {grouped.length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: 60, color: 'var(--tg)', fontSize: 13 }}>No hits recorded.</div>
        ) : (
          grouped.map(group => (
            <div key={group.playerName} style={{ marginBottom: 18 }}>
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--t)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 0.5 }}>
                  {group.playerName}
                </div>
                {group.team && <div style={{ fontSize: 11, color: 'var(--tg)' }}>{group.team}</div>}
              </div>
              {group.hits.map(hit => (
                <HitRow
                  key={hit.id}
                  hit={hit}
                  onMarkReceived={() => onMarkReceived(brk, hit.id)}
                  onAddToVault={() => onAddToVault(hit)}
                />
              ))}
            </div>
          ))
        )}
        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}

// ── Main BreaksView ──────────────────────────────────────────────────────────
export default function BreaksView({ user, onClose, onAddCard, topOffset = 0 }) {
  const [breaks, setBreaks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null); // full break object
  const [vaultTarget, setVaultTarget] = useState(null); // { brk, hit }

  // Load breaks
  useEffect(() => {
    let active = true;
    setLoading(true);
    if (user) {
      getDocs(query(collection(db, 'users', user.uid, 'breaks'), orderBy('savedAt', 'desc')))
        .then(snap => {
          if (!active) return;
          setBreaks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
          setLoading(false);
        })
        .catch(() => {
          if (!active) return;
          setBreaks(loadLocalBreaks());
          setLoading(false);
        });
    } else {
      setBreaks(loadLocalBreaks());
      setLoading(false);
    }
    return () => { active = false; };
  }, [user]);

  // Persist a break update (hits array changed)
  const persistBreakUpdate = useCallback(async (breakId, updatedBreak) => {
    setBreaks(prev => prev.map(b => b.id === breakId ? updatedBreak : b));
    setSelected(prev => prev?.id === breakId ? updatedBreak : prev);

    if (user) {
      try {
        await updateDoc(doc(db, 'users', user.uid, 'breaks', breakId), { hits: updatedBreak.hits });
      } catch (e) { console.error('Failed to update break', e); }
    } else {
      const local = loadLocalBreaks().map(b => b.id === breakId ? updatedBreak : b);
      saveLocalBreaks(local);
    }
  }, [user]);

  const handleMarkReceived = useCallback(async (brk, hitId) => {
    const updated = { ...brk, hits: brk.hits.map(h => h.id === hitId ? { ...h, received: true } : h) };
    await persistBreakUpdate(brk.id, updated);
  }, [persistBreakUpdate]);

  const handleAddedToVault = useCallback(async (brk, hitId, cardId) => {
    const updated = { ...brk, hits: brk.hits.map(h => h.id === hitId ? { ...h, received: true, vaultCardId: String(cardId) } : h) };
    await persistBreakUpdate(brk.id, updated);
  }, [persistBreakUpdate]);

  // Add to vault modal
  if (vaultTarget) {
    return (
      <AddToVaultModal
        hit={vaultTarget.hit}
        brk={vaultTarget.brk}
        onClose={() => setVaultTarget(null)}
        onAdded={async (hit, cardId) => {
          await handleAddedToVault(vaultTarget.brk, hit.id, cardId);
          setVaultTarget(null);
        }}
        onAddCard={onAddCard}
      />
    );
  }

  // Break detail view
  if (selected) {
    return (
      <BreakDetailView
        brk={selected}
        onBack={() => setSelected(null)}
        onMarkReceived={handleMarkReceived}
        onAddToVault={(hit) => setVaultTarget({ brk: selected, hit })}
        topOffset={topOffset}
      />
    );
  }

  // Breaks list
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 700,
      background: 'var(--bg)', display: 'flex', flexDirection: 'column',
      fontFamily: "'Inter', sans-serif", overflow: 'hidden',
    }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Header */}
      <div style={{
        background: 'var(--hbg)', borderBottom: '1px solid var(--hb)',
        padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
        backdropFilter: 'blur(20px)',
      }}>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tg)', fontSize: 18, padding: '2px 6px', flexShrink: 0 }}
        >
          ←
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 22, fontWeight: 400, color: '#ff6b35', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 2, lineHeight: 1 }}>
            MY BREAKS
          </div>
          <div style={{ fontSize: 11, color: 'var(--tg)', marginTop: 1 }}>
            {loading ? 'Loading…' : `${breaks.length} saved break${breaks.length !== 1 ? 's' : ''}`}
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
            <div style={{ width: 24, height: 24, border: '3px solid #ff6b35', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : breaks.length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: 80 }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>📦</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--t)', marginBottom: 6 }}>No breaks saved yet</div>
            <div style={{ fontSize: 13, color: 'var(--tg)', lineHeight: 1.5 }}>
              Breaks are saved automatically when you end a break session.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {breaks.map(brk => (
              <BreakListCard
                key={brk.id}
                brk={brk}
                onClick={() => setSelected(brk)}
              />
            ))}
          </div>
        )}
        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}
