import { useState, useEffect, useCallback } from 'react';
import { useShareCard } from './useShareCard';

// ── Icon components ──────────────────────────────────────────────────────────
function DownloadIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v13M7 11l5 5 5-5" /><path d="M5 20h14" />
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
          padding: 0, transition: 'transform 0.12s',
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

// ── Main modal ───────────────────────────────────────────────────────────────
export default function ShareModal({ mode, card, cards, filterLabel, user, onClose }) {
  const { generate, share, previewUrl, capturing } = useShareCard({
    card, cards, mode, filterLabel, user,
  });
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [shareResult, setShareResult] = useState(null); // 'saved' | 'shared' | 'copied' | null

  const isDesktop = typeof navigator !== 'undefined'
    && !/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  // Build the share URL to display in the URL bar
  const BASE = 'https://app.myvaults.io';
  const uid = user?.uid || '';
  const cardId = card ? String(card.id) : '';
  const displayUrl = mode === 'card' && cardId && uid
    ? `app.myvaults.io?shareCard=${cardId}&uid=${uid}`
    : uid
      ? filterLabel
        ? `app.myvaults.io?shareSet=${encodeURIComponent(filterLabel)}&uid=${uid}`
        : `app.myvaults.io?shareVault=${uid}`
      : 'app.myvaults.io';
  const fullShareUrl = mode === 'card' && cardId && uid
    ? `${BASE}?shareCard=${cardId}&uid=${uid}`
    : uid
      ? filterLabel
        ? `${BASE}?shareSet=${encodeURIComponent(filterLabel)}&uid=${uid}`
        : `${BASE}?shareVault=${uid}`
      : BASE;

  // Generate image on mount
  useEffect(() => {
    generate();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleShare = useCallback(async (destination) => {
    const result = await share(destination);
    if (result === 'saved' || result === 'shared' || result === 'copied') {
      setShareResult(result);
      setTimeout(() => setShareResult(null), 3000);
    }
  }, [share]);

  const handleCopy = useCallback(async () => {
    try { await navigator.clipboard.writeText(fullShareUrl); }
    catch { const ta = document.createElement('textarea'); ta.value = fullShareUrl; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); }
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  }, [fullShareUrl]);

  const modalTitle = mode === 'card' ? 'SHARE CARD'
    : mode === 'set' ? `SHARE ${(filterLabel || 'SET').toUpperCase()}`
    : 'SHARE VAULT';

  return (
    <>
      <style>{`
        @keyframes slideUp { from{transform:translateY(100%);opacity:0} to{transform:translateY(0);opacity:1} }
        @keyframes shareSpinner { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes fadeInUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

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
            background: '#0d0d1a', border: '1px solid #1a1a2e',
            borderRadius: '20px 20px 0 0',
            padding: '20px 20px 36px',
            width: '100%', maxWidth: 480,
            animation: 'slideUp 0.28s cubic-bezier(0.34,1.56,0.64,1)',
          }}
        >
          <div style={{ width: 36, height: 4, borderRadius: 2, background: '#ffffff18', margin: '0 auto 18px' }} />

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
                }}>GENERATING IMAGE…</span>
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
            }}>{displayUrl}</span>
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

          {/* Share buttons */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
            <ShareButton label="Save" onClick={() => handleShare('download')} bg="#1a1a28" border="rgba(255,107,53,0.15)" icon={<DownloadIcon />} />
            <ShareButton label="WhatsApp" onClick={() => handleShare('whatsapp')} bg="#1a2a1a" border="rgba(37,211,102,0.2)" icon={<WhatsAppIcon />} />
            <ShareButton label="Facebook" onClick={() => handleShare('facebook')} bg="#1a1a2a" border="rgba(24,119,242,0.2)" icon={<FacebookIcon />} />
            <ShareButton label="Reddit" onClick={() => handleShare('reddit')} bg="#1a1a1a" border="rgba(255,69,0,0.2)" icon={<RedditIcon />} />
            <ShareButton label="More" onClick={() => handleShare('native')} bg="#0d0d1a" border="transparent" isGradientBorder icon={<MoreIcon />} />
          </div>

          {/* Share feedback toast */}
          {shareResult && (
            <div style={{
              background: shareResult === 'saved' ? 'rgba(255,107,53,0.12)' : 'rgba(76,175,80,0.12)',
              border: `1px solid ${shareResult === 'saved' ? 'rgba(255,107,53,0.3)' : 'rgba(76,175,80,0.3)'}`,
              borderRadius: 10, padding: '10px 14px', marginBottom: 12,
              display: 'flex', alignItems: 'center', gap: 10,
              animation: 'fadeInUp 0.2s ease',
            }}>
              <span style={{ fontSize: 16, flexShrink: 0 }}>
                {shareResult === 'saved' ? '✅' : shareResult === 'copied' ? '📋' : '🚀'}
              </span>
              <span style={{ fontSize: 11, fontFamily: "'Barlow', sans-serif", lineHeight: 1.5,
                color: shareResult === 'saved' ? 'rgba(255,107,53,0.9)' : 'rgba(76,175,80,0.9)' }}>
                {shareResult === 'saved'
                  ? isDesktop
                    ? 'Image saved to Downloads! Attach it when posting.'
                    : 'Image saved to your camera roll!'
                  : shareResult === 'copied'
                    ? 'Link copied to clipboard!'
                    : 'Shared!'}
              </span>
            </div>
          )}

          {/* Note */}
          <div style={{
            background: 'rgba(255,107,53,0.06)', border: '1px solid rgba(255,107,53,0.14)',
            borderRadius: 10, padding: '10px 14px', marginBottom: 18,
            display: 'flex', alignItems: 'flex-start', gap: 10,
          }}>
            <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>📸</span>
            <span style={{ fontSize: 11, color: 'rgba(255,107,53,0.75)', fontFamily: "'Barlow', sans-serif", lineHeight: 1.5 }}>
              {isDesktop
                ? <>Tap <strong style={{ color: '#ff6b35' }}>Save</strong> to download the image, then attach it when posting on Instagram, WhatsApp, or Reddit.</>
                : <>To share on Instagram, tap <strong style={{ color: '#ff6b35' }}>Save</strong> then post from your camera roll.</>
              }
            </span>
          </div>

          <button
            onClick={onClose}
            style={{
              width: '100%', background: '#0d0d1a', border: '1px solid #1a1a2e',
              borderRadius: 12, padding: '13px', cursor: 'pointer',
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
