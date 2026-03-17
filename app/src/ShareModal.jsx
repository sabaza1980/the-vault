import { useState, useEffect, useCallback } from 'react';
import { useShareCard } from './useShareCard';

const RARITY_COLORS = {
  Common: '#555',
  Uncommon: '#4caf50',
  Rare: '#2196f3',
  'Very Rare': '#9c27b0',
  'Ultra Rare': '#ff9800',
  Legendary: '#f44336',
};

// Convert any URL to a data URL so html2canvas can render it without CORS taint
async function toDataUrl(src) {
  if (!src || src.startsWith('data:')) return src || '';
  try {
    const res = await fetch(src);
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return src;
  }
}

// ── Off-screen single card share image (540×540 → html2canvas ×2 = 1080×1080) ──
function SingleCardShareImage({ card, cardDataUrl }) {
  const rColor = RARITY_COLORS[card?.rarity] || '#555';
  const fullCardName =
    card?.fullCardName ||
    [card?.year, card?.brand, card?.series].filter(Boolean).join(' ') ||
    'Unknown Set';

  return (
    <div
      style={{
        width: 540, height: 540, position: 'relative', overflow: 'hidden',
        background: '#07070f', flexShrink: 0,
      }}
    >
      {/* Orange radial glow behind card */}
      <div style={{
        position: 'absolute', left: 60, top: '50%',
        transform: 'translateY(-50%)',
        width: 320, height: 420, borderRadius: '50%',
        background: `radial-gradient(ellipse at center, ${rColor}20 0%, rgba(255,107,53,0.08) 40%, transparent 70%)`,
        pointerEvents: 'none',
      }} />
      {/* Diagonal stripe accent — right side */}
      <div style={{
        position: 'absolute', right: -60, top: -80,
        width: 180, height: 760,
        background: 'rgba(255,107,53,0.04)',
        transform: 'rotate(18deg)',
        pointerEvents: 'none',
      }} />

      {/* Card photo — left side */}
      <div style={{
        position: 'absolute', left: 36, top: '50%',
        transform: 'translateY(-50%)',
        width: 190, height: 265,
        borderRadius: 12, overflow: 'hidden',
        border: `2px solid ${rColor}50`,
        boxShadow: `0 0 40px ${rColor}28`,
      }}>
        {cardDataUrl && (
          <img
            src={cardDataUrl}
            alt={card?.playerName || ''}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        )}
      </div>

      {/* Right side info */}
      <div style={{
        position: 'absolute', left: 258, top: 55, right: 24, bottom: 64,
        display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 5,
      }}>
        {/* Set name */}
        <div style={{
          fontSize: 10, color: '#ff6b35',
          textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 700,
          fontFamily: "'Barlow Condensed', sans-serif", lineHeight: 1.3,
        }}>{fullCardName}</div>

        {/* Player name */}
        <div style={{
          fontSize: 40, fontWeight: 400, color: '#f0f0f0',
          fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 2,
          lineHeight: 1, marginTop: 4,
        }}>{card?.playerName || 'Unknown'}</div>

        {/* Team */}
        {card?.team && card.team !== 'Unknown' && (
          <div style={{
            fontSize: 12, color: '#666', marginTop: 2,
            fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 0.5,
          }}>{card.team}</div>
        )}

        {/* Badges row */}
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6 }}>
          {card?.condition && (
            <span style={{
              fontSize: 9, padding: '2px 7px', borderRadius: 6,
              background: 'rgba(255,255,255,0.06)', color: '#999',
              border: '1px solid rgba(255,255,255,0.1)',
              fontWeight: 600, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 0.5,
            }}>{card.condition}</span>
          )}
          {card?.isRookie && (
            <span style={{
              fontSize: 9, padding: '2px 7px', borderRadius: 6,
              background: 'rgba(255,107,53,0.15)', color: '#ff6b35',
              border: '1px solid rgba(255,107,53,0.3)',
              fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 1,
            }}>RC</span>
          )}
          {card?.hasAutograph && (
            <span style={{
              fontSize: 9, padding: '2px 7px', borderRadius: 6,
              background: 'rgba(240,192,64,0.15)', color: '#f0c040',
              border: '1px solid rgba(240,192,64,0.3)',
              fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 1,
            }}>AUTO</span>
          )}
          {card?.serialNumber && (
            <span style={{
              fontSize: 9, padding: '2px 7px', borderRadius: 6,
              background: 'rgba(206,147,216,0.15)', color: '#ce93d8',
              border: '1px solid rgba(206,147,216,0.3)',
              fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 1,
            }}>{card.serialNumber}</span>
          )}
        </div>

        {/* eBay price if available */}
        {card?.estimatedValue > 0 && (
          <div style={{
            fontSize: 28, fontWeight: 400, color: '#4caf50',
            fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1.5, marginTop: 8,
          }}>${card.estimatedValue.toFixed(2)}</div>
        )}
      </div>

      {/* Bottom bar */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 54,
        background: 'rgba(0,0,0,0.75)',
        borderTop: '1px solid rgba(255,107,53,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 28px',
      }}>
        <div style={{
          fontSize: 20, fontWeight: 400, color: '#ff6b35',
          fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 3,
        }}>🏀 THE VAULT</div>
        <div style={{
          fontSize: 11, color: '#444',
          fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 1,
        }}>myvaults.io</div>
      </div>
    </div>
  );
}

// ── Off-screen collection/set share image ────────────────────────────────────
function CollectionShareImage({ cards, filterLabel, user, cardDataUrls }) {
  const RARITY_ORDER = {
    Legendary: 0, 'Ultra Rare': 1, 'Very Rare': 2,
    Rare: 3, Uncommon: 4, Common: 5,
  };
  const sorted = [...cards].sort(
    (a, b) => (RARITY_ORDER[a.rarity] ?? 6) - (RARITY_ORDER[b.rarity] ?? 6)
  );
  const gridCards = sorted.slice(0, 9);
  const overflow = cards.length - 9;

  const namePrefix = user?.displayName
    ? `${user.displayName.toUpperCase()}'S`
    : 'MY';
  const titleLine = filterLabel
    ? `${filterLabel.toUpperCase()} COLLECTION`
    : 'VAULT';

  const rarePlus = cards.filter(c =>
    ['Rare', 'Very Rare', 'Ultra Rare', 'Legendary'].includes(c.rarity)
  ).length;
  const totalValue = cards.reduce((s, c) => s + (c.estimatedValue || 0), 0);

  return (
    <div style={{
      width: 540, height: 540, position: 'relative', overflow: 'hidden',
      background: '#07070f', flexShrink: 0,
    }}>
      {/* Diagonal orange stripe */}
      <div style={{
        position: 'absolute', right: -80, top: -80,
        width: 260, height: 820,
        background: 'rgba(255,107,53,0.05)',
        transform: 'rotate(22deg)',
        pointerEvents: 'none',
      }} />

      {/* Title area — top left */}
      <div style={{ position: 'absolute', top: 30, left: 30, right: 270 }}>
        <div style={{
          fontSize: 11, color: 'rgba(255,107,53,0.65)', fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: 2,
          fontFamily: "'Barlow Condensed', sans-serif", marginBottom: 2,
        }}>{namePrefix}</div>
        <div style={{
          fontSize: 46, fontWeight: 400, lineHeight: 0.9, color: '#ff6b35',
          fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 3,
        }}>{titleLine}</div>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: 18, marginTop: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{
              fontSize: 22, fontWeight: 400, color: '#ff6b35',
              fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1,
            }}>{cards.length}</span>
            <span style={{
              fontSize: 9, color: '#444', textTransform: 'uppercase', letterSpacing: 1,
              fontFamily: "'Barlow Condensed', sans-serif",
            }}>Cards</span>
          </div>
          {rarePlus > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{
                fontSize: 22, fontWeight: 400, color: '#9c27b0',
                fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1,
              }}>{rarePlus}</span>
              <span style={{
                fontSize: 9, color: '#444', textTransform: 'uppercase', letterSpacing: 1,
                fontFamily: "'Barlow Condensed', sans-serif",
              }}>Rare+</span>
            </div>
          )}
          {totalValue > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{
                fontSize: 22, fontWeight: 400, color: '#4caf50',
                fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1,
              }}>${totalValue.toFixed(0)}</span>
              <span style={{
                fontSize: 9, color: '#444', textTransform: 'uppercase', letterSpacing: 1,
                fontFamily: "'Barlow Condensed', sans-serif",
              }}>Est. Value</span>
            </div>
          )}
        </div>
      </div>

      {/* 3×3 card grid — right side */}
      <div style={{
        position: 'absolute', right: 24, top: 30, bottom: 64,
        display: 'flex', alignItems: 'center',
      }}>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 72px)',
          gap: 6, width: 228,
        }}>
          {gridCards.map((c) => {
            const rc = RARITY_COLORS[c.rarity] || '#333';
            const dataUrl = cardDataUrls[c.id] || '';
            return (
              <div key={c.id} style={{
                width: 72, height: 100, borderRadius: 7, overflow: 'hidden',
                border: `1.5px solid ${rc}55`,
                boxShadow: `0 0 10px ${rc}18`,
              }}>
                {dataUrl && (
                  <img
                    src={dataUrl}
                    alt={c.playerName || ''}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                )}
              </div>
            );
          })}
          {overflow > 0 && (
            <div style={{
              width: 72, height: 100, borderRadius: 7,
              background: 'rgba(255,107,53,0.08)',
              border: '1.5px solid rgba(255,107,53,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{
                fontSize: 18, fontWeight: 400, color: '#ff6b35',
                fontFamily: "'Bebas Neue', sans-serif",
              }}>+{overflow}</span>
            </div>
          )}
        </div>
      </div>

      {/* Bottom bar */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 54,
        background: 'rgba(0,0,0,0.75)',
        borderTop: '1px solid rgba(255,107,53,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 28px',
      }}>
        <div style={{
          fontSize: 20, fontWeight: 400, color: '#ff6b35',
          fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 3,
        }}>🏀 THE VAULT</div>
        <div style={{
          fontSize: 11, color: '#444',
          fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 1,
        }}>myvaults.io</div>
      </div>
    </div>
  );
}

// ── Icon components ──────────────────────────────────────────────────────────
function DownloadIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v13M7 11l5 5 5-5" />
      <path d="M5 20h14" />
    </svg>
  );
}
function WhatsAppIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="16" fill="#25D366" />
      <path d="M23.5 8.5A10.36 10.36 0 0 0 16 5.5C10.75 5.5 6.5 9.75 6.5 15c0 1.65.45 3.25 1.3 4.65L6 26l6.5-1.75A10.47 10.47 0 0 0 16 24.5c5.25 0 9.5-4.25 9.5-9.5 0-2.55-1-4.95-2.75-6.75l.75.25z" fill="#fff" />
      <path d="M20.75 18.25c-.25.75-1.5 1.5-2.25 1.5-.75.25-1.75.25-5.5-2.5-3-2.25-4-5-4.25-5.75-.25-.75 0-1.75.5-2.25.5-.5.75-.5 1-.5h.75c.25 0 .5.25.75.75l1 2.5c.25.5 0 .75-.25 1l-.5.5c-.25.25-.25.5 0 .75.75 1 1.5 1.75 2.25 2.5.75.5 1.5 1 2.5 1.25.25.25.5 0 .75-.25l.5-.75c.25-.25.5-.5 1-.25l2.5 1c.25.25.5.5.25 1v.5z" fill="#25D366" />
    </svg>
  );
}
function FacebookIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="16" fill="#1877F2" />
      <path d="M19.5 16h-2.5v8h-3v-8H12v-3h2v-1.5c0-2.25 1.25-3.5 3.25-3.5.75 0 1.75.25 2.25.25v2.5H18c-1 0-1.25.5-1.25 1.25V13H19l-.5 3z" fill="#fff" />
    </svg>
  );
}
function RedditIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="16" fill="#FF4500" />
      <path d="M26 16a2.5 2.5 0 0 0-4.25-1.75c-1.25-.75-3-.75-4.25-.5l.75-3.25 2.5.5a1.5 1.5 0 1 0 1.5-1.5 1.5 1.5 0 0 0-1.5 1.25l-2.75-.5c-.25 0-.5.25-.5.5l-.75 3.75c-1.25-.25-2.75 0-3.75.5A2.5 2.5 0 0 0 6 18a2.5 2.5 0 0 0 .5 1.5c0 .25 0 .25-.25.5 0 2.5 2.75 4.5 6 4.5s6-2 6-4.5v-.5A2.5 2.5 0 0 0 26 16zm-3.25 0c.75 0 1.25.5 1.25 1.25s-.5 1.25-1.25 1.25-1.25-.5-1.25-1.25.5-1.25 1.25-1.25zM9.25 17.25c0-.75.5-1.25 1.25-1.25s1.25.5 1.25 1.25-.5 1.25-1.25 1.25-1.25-.5-1.25-1.25zm6.75 5.5c-1.5 0-2.75-.75-2.75-.75a.25.25 0 0 1 .25-.5s1 .75 2.5.75 2.5-.75 2.5-.75a.25.25 0 0 1 .25.5c.25 0-1 .75-2.75.75z" fill="#fff" />
    </svg>
  );
}
function MoreIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ff6b35" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v13M7 8l5-6 5 6" />
      <path d="M5 18h14a2 2 0 0 1 0 4H5a2 2 0 0 1 0-4z" />
    </svg>
  );
}

// ── Share button component ───────────────────────────────────────────────────
function ShareButton({ label, onClick, bg, border, isGradientBorder, icon }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <button
        onClick={onClick}
        style={{
          width: 48, height: 48, borderRadius: 14,
          background: isGradientBorder
            ? 'linear-gradient(#0d0d1a, #0d0d1a) padding-box, linear-gradient(135deg, #ff6b35, #f7c59f) border-box'
            : bg,
          border: isGradientBorder ? '1.5px solid transparent' : `1px solid ${border}`,
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 0, transition: 'transform 0.12s, opacity 0.12s',
        }}
        onMouseDown={e => e.currentTarget.style.transform = 'scale(0.88)'}
        onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
      >{icon}</button>
      <span style={{
        fontSize: 9, color: '#666',
        fontFamily: "'Barlow Condensed', sans-serif",
        letterSpacing: 0.5, textTransform: 'uppercase',
      }}>{label}</span>
    </div>
  );
}

// ── Main modal component ─────────────────────────────────────────────────────
export default function ShareModal({ mode, card, cards, filterLabel, user, onClose }) {
  const { containerRef, capture, share, previewUrl, capturing } = useShareCard({ card, cards, mode });
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [mainCardDataUrl, setMainCardDataUrl] = useState(null);
  const [cardDataUrls, setCardDataUrls] = useState({});
  const [imagesReady, setImagesReady] = useState(false);

  const shareUrl =
    user?.uid ? `myvaults.io/vault/${user.uid}` : 'myvaults.io';

  // Load card images as data URLs for html2canvas (avoids canvas CORS taint)
  useEffect(() => {
    let cancelled = false;
    async function loadImages() {
      if (mode === 'card' && card?.imageUrl) {
        const du = await toDataUrl(card.imageUrl);
        if (!cancelled) {
          setMainCardDataUrl(du);
          setImagesReady(true);
        }
      } else if (cards?.length) {
        const top9 = cards.slice(0, 9);
        const entries = await Promise.all(
          top9.map(async (c) => [c.id, await toDataUrl(c.imageUrl)])
        );
        if (!cancelled) {
          setCardDataUrls(Object.fromEntries(entries));
          setImagesReady(true);
        }
      } else {
        if (!cancelled) setImagesReady(true);
      }
    }
    loadImages();
    return () => { cancelled = true; };
  }, [mode, card, cards]);

  // Trigger capture once images + DOM are ready
  useEffect(() => {
    if (!imagesReady) return;
    const timer = setTimeout(() => {
      capture();
    }, 180);
    return () => clearTimeout(timer);
  }, [imagesReady, capture]);

  const handleCopy = useCallback(async () => {
    await share('copy');
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  }, [share]);

  const modalTitle =
    mode === 'card'
      ? 'SHARE CARD'
      : mode === 'set'
      ? `SHARE ${(filterLabel || 'SET').toUpperCase()}`
      : 'SHARE VAULT';

  return (
    <>
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        @keyframes shareSpinner {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>

      {/* Off-screen render target — captured by html2canvas */}
      <div
        ref={containerRef}
        aria-hidden="true"
        style={{
          position: 'fixed',
          left: '-9999px',
          top: 0,
          pointerEvents: 'none',
          zIndex: -1,
        }}
      >
        {mode === 'card' ? (
          <SingleCardShareImage card={card} cardDataUrl={mainCardDataUrl} />
        ) : (
          <CollectionShareImage
            cards={cards || []}
            filterLabel={filterLabel}
            user={user}
            cardDataUrls={cardDataUrls}
          />
        )}
      </div>

      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.93)',
          backdropFilter: 'blur(16px)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          animation: 'fadeIn 0.2s ease',
        }}
      >
        {/* Bottom-sheet panel */}
        <div
          onClick={e => e.stopPropagation()}
          style={{
            background: '#0d0d1a',
            border: '1px solid #1a1a2e',
            borderRadius: '20px 20px 0 0',
            padding: '20px 20px 36px',
            width: '100%',
            maxWidth: 480,
            animation: 'slideUp 0.28s cubic-bezier(0.34,1.56,0.64,1)',
          }}
        >
          {/* Drag handle */}
          <div style={{
            width: 36, height: 4, borderRadius: 2,
            background: '#ffffff18', margin: '0 auto 18px',
          }} />

          {/* Title */}
          <div style={{
            fontSize: 14, fontWeight: 400, color: '#f0f0f0',
            marginBottom: 16, textAlign: 'center',
            fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 2,
          }}>{modalTitle}</div>

          {/* Preview thumbnail */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            {capturing || !previewUrl ? (
              <div style={{
                width: 200, height: 200, borderRadius: 12,
                background: '#07070f', border: '1px solid rgba(255,107,53,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexDirection: 'column', gap: 10,
              }}>
                <div style={{
                  width: 26, height: 26,
                  border: '3px solid #ff6b35', borderTopColor: 'transparent',
                  borderRadius: '50%', animation: 'shareSpinner 0.8s linear infinite',
                }} />
                <span style={{
                  fontSize: 9, color: '#555',
                  fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 1.5,
                }}>GENERATING…</span>
              </div>
            ) : (
              <img
                src={previewUrl}
                alt="Share preview"
                style={{
                  width: 200, height: 200, objectFit: 'cover',
                  borderRadius: 12, border: '1px solid rgba(255,107,53,0.2)',
                }}
              />
            )}
          </div>

          {/* URL bar */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: '#07070f', border: '1px solid #1a1a2e',
            borderRadius: 10, padding: '8px 10px', marginBottom: 20,
          }}>
            <span style={{
              flex: 1, fontSize: 12, color: '#555',
              fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 0.5,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{shareUrl}</span>
            <button
              onClick={handleCopy}
              style={{
                background: copiedUrl ? 'rgba(76,175,80,0.15)' : 'rgba(255,107,53,0.12)',
                border: `1px solid ${copiedUrl ? 'rgba(76,175,80,0.35)' : 'rgba(255,107,53,0.3)'}`,
                color: copiedUrl ? '#4caf50' : '#ff6b35',
                borderRadius: 6, padding: '4px 12px', cursor: 'pointer',
                fontSize: 11, fontWeight: 700, flexShrink: 0,
                fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 1,
                transition: 'all 0.2s',
              }}
            >{copiedUrl ? 'COPIED!' : 'COPY'}</button>
          </div>

          {/* Share destination buttons */}
          <div style={{
            display: 'flex', gap: 8, justifyContent: 'center',
            marginBottom: 16, flexWrap: 'wrap',
          }}>
            <ShareButton
              label="Save"
              onClick={() => share('download')}
              bg="#1a1a28"
              border="rgba(255,107,53,0.15)"
              icon={<DownloadIcon />}
            />
            <ShareButton
              label="WhatsApp"
              onClick={() => share('whatsapp')}
              bg="#1a2a1a"
              border="rgba(37,211,102,0.2)"
              icon={<WhatsAppIcon />}
            />
            <ShareButton
              label="Facebook"
              onClick={() => share('facebook')}
              bg="#1a1a2a"
              border="rgba(24,119,242,0.2)"
              icon={<FacebookIcon />}
            />
            <ShareButton
              label="Reddit"
              onClick={() => share('reddit')}
              bg="#1a1a1a"
              border="rgba(255,69,0,0.2)"
              icon={<RedditIcon />}
            />
            <ShareButton
              label="More"
              onClick={() => share('native')}
              bg="#0d0d1a"
              border="transparent"
              isGradientBorder
              icon={<MoreIcon />}
            />
          </div>

          {/* Instagram note */}
          <div style={{
            background: 'rgba(255,107,53,0.06)',
            border: '1px solid rgba(255,107,53,0.14)',
            borderRadius: 10, padding: '10px 14px', marginBottom: 18,
            display: 'flex', alignItems: 'flex-start', gap: 10,
          }}>
            <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>📸</span>
            <span style={{
              fontSize: 11, color: 'rgba(255,107,53,0.75)',
              fontFamily: "'Barlow', sans-serif", lineHeight: 1.5,
            }}>
              To share on Instagram, tap <strong style={{ color: '#ff6b35' }}>Save</strong> then post from your camera roll.
            </span>
          </div>

          {/* Cancel */}
          <button
            onClick={onClose}
            style={{
              width: '100%', background: '#0d0d1a',
              border: '1px solid #1a1a2e', borderRadius: 12,
              padding: '13px', cursor: 'pointer',
              color: '#444', fontSize: 12, fontWeight: 600,
              fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 1.5,
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.color = '#888'}
            onMouseLeave={e => e.currentTarget.style.color = '#444'}
          >CANCEL</button>
        </div>
      </div>
    </>
  );
}
