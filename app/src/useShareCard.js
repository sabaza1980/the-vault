import { useState, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';

const API_BASE = Capacitor.isNativePlatform() ? 'https://app.myvaults.io' : '';

const RARITY_COLORS = {
  Common: '#555555', Uncommon: '#4caf50', Rare: '#2196f3',
  'Very Rare': '#9c27b0', 'Ultra Rare': '#ff9800', Legendary: '#f44336',
};

// Fix 2: Load image for canvas drawing without cross-origin taint.
//
// data: URLs are same-origin by definition — load directly, no crossOrigin needed.
// (Setting crossOrigin on a data: URL breaks loading in Safari/WebView.)
//
// HTTP URLs from Firebase Storage are fetched via /api/image-proxy which runs
// server-side (no CORS restriction), returns the bytes, and we create a local
// blob URL — blob URLs are always same-origin so canvas.toBlob never throws.
async function loadImg(src) {
  if (!src) return null;

  // ── data: URLs ───────────────────────────────────────────────────────────
  if (src.startsWith('data:')) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = (err) => {
        console.error('[useShareCard] loadImg data: error', err);
        resolve(null);
      };
      img.src = src;
    });
  }

  // ── HTTP URLs — fetch via server-side proxy to avoid canvas taint ────────
  try {
    const res = await fetch(`${API_BASE}/api/image-proxy?url=${encodeURIComponent(src)}`);
    if (!res.ok) throw new Error(`proxy ${res.status}`);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(objectUrl); resolve(img); };
      img.onerror = (err) => {
        URL.revokeObjectURL(objectUrl);
        console.error('[useShareCard] loadImg img error after proxy', err);
        resolve(null);
      };
      img.src = objectUrl;
    });
  } catch (err) {
    // Fix 4: log every failure so DevTools shows what went wrong
    console.error('[useShareCard] loadImg failed for src:', src, err);
    return null;
  }
}

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function wrapText(ctx, text, x, y, maxW, lineH) {
  const words = text.split(' ');
  let line = '';
  let drawn = 0;
  for (const w of words) {
    const test = line + (line ? ' ' : '') + w;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, y + drawn * lineH);
      drawn++;
      line = w;
    } else {
      line = test;
    }
  }
  if (line) { ctx.fillText(line, x, y + drawn * lineH); drawn++; }
  return drawn * lineH;
}

async function drawSingleCard(card) {
  // Wait for fonts but cap at 3s so slow CDN never blocks canvas generation
  await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 3000))]);
  const W = 1080, H = 1080;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas.getContext("2d") returned null');

  const rColor = RARITY_COLORS[card.rarity] || '#555';
  const fullCardName = String(
    card.fullCardName ||
    [card.year, card.brand, card.series].filter(Boolean).join(' ') ||
    'Unknown Set'
  );

  ctx.fillStyle = '#07070f';
  ctx.fillRect(0, 0, W, H);

  const grd = ctx.createRadialGradient(360, H / 2, 0, 360, H / 2, 480);
  grd.addColorStop(0, rColor + '28');
  grd.addColorStop(0.45, 'rgba(255,107,53,0.09)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.translate(W + 80, -80);
  ctx.rotate((18 * Math.PI) / 180);
  ctx.fillStyle = 'rgba(255,107,53,0.04)';
  ctx.fillRect(-200, 0, 360, 1700);
  ctx.restore();

  // Card image — left side
  const IX = 72, IY = 140, IW = 430, IH = 600;
  const cardImg = await loadImg(card.imageUrl);
  if (cardImg) {
    ctx.save();
    rrect(ctx, IX, IY, IW, IH, 22);
    ctx.clip();
    ctx.drawImage(cardImg, IX, IY, IW, IH);
    ctx.restore();
    ctx.strokeStyle = rColor + '65';
    ctx.lineWidth = 5;
    rrect(ctx, IX, IY, IW, IH, 22);
    ctx.stroke();
  } else {
    ctx.fillStyle = '#1a1a2e';
    rrect(ctx, IX, IY, IW, IH, 22);
    ctx.fill();
  }

  // Right side
  const RX = 576, MAX_W = 452;
  let ry = 168;

  ctx.font = '700 26px "Barlow Condensed", sans-serif';
  ctx.fillStyle = '#ff6b35';
  const setH = wrapText(ctx, fullCardName.toUpperCase(), RX, ry, MAX_W, 34);
  ry += setH + 18;

  const playerText = String(card.playerName || 'UNKNOWN').toUpperCase();
  let pSize = 108;
  ctx.font = `400 ${pSize}px "Bebas Neue", sans-serif`;
  while (ctx.measureText(playerText).width > MAX_W + 10 && pSize > 56) {
    pSize -= 4;
    ctx.font = `400 ${pSize}px "Bebas Neue", sans-serif`;
  }
  ctx.fillStyle = '#f0f0f0';
  ctx.fillText(playerText, RX, ry + pSize * 0.85, MAX_W + 10);
  ry += pSize + 14;

  if (card.team && card.team !== 'Unknown') {
    ctx.font = '400 30px "Barlow Condensed", sans-serif';
    ctx.fillStyle = '#555555';
    ctx.fillText(card.team, RX, ry);
    ry += 48;
  }

  ry += 18;

  const badges = [];
  if (card.condition) badges.push({ label: String(card.condition), color: '#888', bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.1)' });
  // isRookie/hasAutograph can be stored as string 'true'/'false' from the AI JSON
  if (card.isRookie && card.isRookie !== 'false') badges.push({ label: 'RC', color: '#ff6b35', bg: 'rgba(255,107,53,0.15)', border: 'rgba(255,107,53,0.35)' });
  if (card.hasAutograph && card.hasAutograph !== 'false') badges.push({ label: 'AUTO', color: '#f0c040', bg: 'rgba(240,192,64,0.15)', border: 'rgba(240,192,64,0.35)' });
  if (card.serialNumber) badges.push({ label: String(card.serialNumber), color: '#ce93d8', bg: 'rgba(206,147,216,0.15)', border: 'rgba(206,147,216,0.35)' });
  if (card.rarity && card.rarity !== 'Common') badges.push({ label: String(card.rarity).toUpperCase(), color: rColor, bg: rColor + '18', border: rColor + '40' });

  ctx.font = '700 22px "Barlow Condensed", sans-serif';
  let bx = RX;
  for (const badge of badges) {
    const tw = ctx.measureText(badge.label).width;
    const bw = tw + 28, bh = 38, br = 8;
    ctx.fillStyle = badge.bg;
    rrect(ctx, bx, ry, bw, bh, br); ctx.fill();
    ctx.strokeStyle = badge.border;
    ctx.lineWidth = 1.5;
    rrect(ctx, bx, ry, bw, bh, br); ctx.stroke();
    ctx.fillStyle = badge.color;
    ctx.fillText(badge.label, bx + 14, ry + 27);
    bx += bw + 10;
    if (bx > RX + MAX_W - 60) { bx = RX; ry += 52; }
  }
  if (badges.length > 0) ry += 56;

  if (card.estimatedValue > 0) {
    const ev = Number(card.estimatedValue);
    ry += 10;
    ctx.font = '400 84px "Bebas Neue", sans-serif';
    ctx.fillStyle = '#4caf50';
    ctx.fillText(`$${ev.toFixed(2)}`, RX, ry + 72);
    ry += 84;
    ctx.font = '600 22px "Barlow Condensed", sans-serif';
    ctx.fillStyle = '#2d5c2d';
    ctx.fillText('EST. VALUE', RX, ry);
  }

  // Bottom bar
  const barH = 108;
  ctx.fillStyle = 'rgba(0,0,0,0.82)';
  ctx.fillRect(0, H - barH, W, barH);
  ctx.strokeStyle = 'rgba(255,107,53,0.18)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, H - barH); ctx.lineTo(W, H - barH); ctx.stroke();
  ctx.font = '400 52px "Bebas Neue", sans-serif';
  ctx.fillStyle = '#ff6b35';
  ctx.fillText('THE VAULT', 60, H - barH + 68);
  ctx.font = '600 24px "Barlow Condensed", sans-serif';
  ctx.fillStyle = '#3a3a3a';
  ctx.textAlign = 'right';
  ctx.fillText('myvaults.io', W - 60, H - barH + 68);
  ctx.textAlign = 'left';

  return canvas;
}

async function drawCollection(cards, filterLabel, user) {
  await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 3000))]);
  const W = 1080, H = 1080;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  const RARITY_ORDER = { Legendary: 0, 'Ultra Rare': 1, 'Very Rare': 2, Rare: 3, Uncommon: 4, Common: 5 };
  const sorted = [...cards].sort((a, b) => (RARITY_ORDER[a.rarity] ?? 6) - (RARITY_ORDER[b.rarity] ?? 6));
  // Show 8 cards + 1 overflow cell when > 9, otherwise up to 9
  const showOverflow = cards.length > 9;
  const gridCards = showOverflow ? sorted.slice(0, 8) : sorted.slice(0, 9);
  const overflowCount = showOverflow ? cards.length - 8 : 0;
  const namePrefix = user?.displayName ? `${user.displayName.toUpperCase()}'S` : 'MY';
  const titleLine = filterLabel ? filterLabel.toUpperCase() : 'VAULT';
  const rarePlus = cards.filter(c => ['Rare', 'Very Rare', 'Ultra Rare', 'Legendary'].includes(c.rarity)).length;
  const totalValue = cards.reduce((s, c) => s + (Number(c.estimatedValue) || 0), 0);

  ctx.fillStyle = '#07070f';
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.translate(W + 90, -90);
  ctx.rotate((22 * Math.PI) / 180);
  ctx.fillStyle = 'rgba(255,107,53,0.05)';
  ctx.fillRect(-260, 0, 520, 1900);
  ctx.restore();

  // Title — left
  let ty = 80;
  ctx.font = '700 28px "Barlow Condensed", sans-serif';
  ctx.fillStyle = 'rgba(255,107,53,0.55)';
  ctx.fillText(namePrefix, 60, ty);
  ty += 46;

  ctx.font = '400 108px "Bebas Neue", sans-serif';
  ctx.fillStyle = '#ff6b35';
  const titleWords = titleLine.split(' ');
  let l1 = '', l2 = '';
  for (const w of titleWords) {
    const test = l1 + (l1 ? ' ' : '') + w;
    if (ctx.measureText(test).width > 490 && l1) { l2 = titleWords.slice(titleWords.indexOf(w)).join(' '); break; }
    l1 = test;
  }
  ctx.fillText(l1, 60, ty + 94); ty += 102;
  if (l2) { ctx.fillText(l2, 60, ty + 94); ty += 102; }
  ty += 20;

  const statItems = [
    { value: String(cards.length), label: 'CARDS', color: '#ff6b35' },
    ...(rarePlus > 0 ? [{ value: String(rarePlus), label: 'RARE+', color: '#9c27b0' }] : []),
    ...(totalValue > 0 ? [{ value: `$${totalValue.toFixed(0)}`, label: 'EST. VALUE', color: '#4caf50' }] : []),
  ];
  let sx = 60;
  for (const stat of statItems) {
    ctx.font = '400 68px "Bebas Neue", sans-serif';
    ctx.fillStyle = stat.color;
    const vw = ctx.measureText(stat.value).width;
    ctx.fillText(stat.value, sx, ty + 60);
    ctx.font = '700 20px "Barlow Condensed", sans-serif';
    ctx.fillStyle = '#444444';
    ctx.fillText(stat.label, sx, ty + 88);
    sx += Math.max(vw, ctx.measureText(stat.label).width) + 60;
  }

  // 3×3 grid — right
  const GCOLS = 3, GW = 162, GH = 228, GGAP = 14;
  const GRID_X = 576, GRID_Y = 50;
  const gridImgs = await Promise.all(gridCards.map(c => loadImg(c.imageUrl)));
  for (let i = 0; i < gridCards.length; i++) {
    const c = gridCards[i];
    const col = i % GCOLS, row = Math.floor(i / GCOLS);
    const gx = GRID_X + col * (GW + GGAP);
    const gy = GRID_Y + row * (GH + GGAP);
    const rc = RARITY_COLORS[c.rarity] || '#333';
    const img = gridImgs[i];
    if (img) {
      ctx.save();
      rrect(ctx, gx, gy, GW, GH, 14); ctx.clip();
      ctx.drawImage(img, gx, gy, GW, GH);
      ctx.restore();
    } else {
      ctx.fillStyle = '#1a1a2e';
      rrect(ctx, gx, gy, GW, GH, 14); ctx.fill();
    }
    ctx.strokeStyle = rc + '65';
    ctx.lineWidth = 3;
    rrect(ctx, gx, gy, GW, GH, 14); ctx.stroke();
  }
  if (showOverflow) {
    // Draw the +N cell at grid position 8 (3rd column, 3rd row)
    const ox = GRID_X + 2 * (GW + GGAP), oy = GRID_Y + 2 * (GH + GGAP);
    ctx.fillStyle = 'rgba(255,107,53,0.12)';
    rrect(ctx, ox, oy, GW, GH, 14); ctx.fill();
    ctx.strokeStyle = 'rgba(255,107,53,0.3)';
    ctx.lineWidth = 3;
    rrect(ctx, ox, oy, GW, GH, 14); ctx.stroke();
    ctx.font = '400 52px "Bebas Neue", sans-serif';
    ctx.fillStyle = '#ff6b35';
    ctx.textAlign = 'center';
    ctx.fillText(`+${overflowCount}`, ox + GW / 2, oy + GH / 2 + 20);
    ctx.textAlign = 'left';
  }

  // Bottom bar
  const barH = 108;
  ctx.fillStyle = 'rgba(0,0,0,0.82)';
  ctx.fillRect(0, H - barH, W, barH);
  ctx.strokeStyle = 'rgba(255,107,53,0.18)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, H - barH); ctx.lineTo(W, H - barH); ctx.stroke();
  ctx.font = '400 52px "Bebas Neue", sans-serif';
  ctx.fillStyle = '#ff6b35';
  ctx.fillText('THE VAULT', 60, H - barH + 68);
  ctx.font = '600 24px "Barlow Condensed", sans-serif';
  ctx.fillStyle = '#3a3a3a';
  ctx.textAlign = 'right';
  ctx.fillText('myvaults.io', W - 60, H - barH + 68);
  ctx.textAlign = 'left';

  return canvas;
}

// Fix 6: Detect mobile via maxTouchPoints (works on iOS, Android, iPadOS).
// navigator.share + files is only attempted on mobile.
function isMobile() {
  return typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
}

export function useShareCard({ card, cards, mode, filterLabel, user, collectionId }) {
  const [imageBlob, setImageBlob] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [capturing, setCapturing] = useState(false);
  const [generateError, setGenerateError] = useState(false);

  const generate = useCallback(async () => {
    setCapturing(true);
    setGenerateError(false);
    setImageBlob(null);
    setPreviewUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; });

    // Yield to the browser so the spinner is painted before async work starts.
    // Without this, React 18 auto-batching can collapse the start+end state
    // updates into one render when errors occur fast, making Retry look broken.
    await new Promise(r => setTimeout(r, 50));

    try {
      const canvas = mode === 'card'
        ? await drawSingleCard(card)
        : await drawCollection(cards || [], filterLabel || null, user || null);

      return await new Promise((resolve) => {
        // JPEG is ~10× faster to encode than PNG for a 1080×1080 canvas
        canvas.toBlob((blob) => {
          // toBlob can return null on some Safari versions — fall back to toDataURL
          if (!blob) {
            try {
              const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
              const bytes = atob(dataUrl.split(',')[1]);
              const arr = new Uint8Array(bytes.length);
              for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
              blob = new Blob([arr], { type: 'image/jpeg' });
            } catch (e) {
              console.error('[useShareCard] toDataURL fallback failed', e);
            }
          }
          if (!blob) {
            console.error('[useShareCard] canvas.toBlob() returned null and toDataURL fallback failed');
            setCapturing(false);
            setGenerateError(true);
            resolve(null);
            return;
          }
          const url = URL.createObjectURL(blob);
          setGenerateError(false);
          setImageBlob(blob);
          setPreviewUrl(url);
          setCapturing(false);
          resolve({ blob, url });
        }, 'image/jpeg', 0.92);
      });
    } catch (err) {
      console.error('[useShareCard] generate() threw:', err.message, err.stack);
      console.error('[useShareCard] card data:', JSON.stringify({
        id: card?.id,
        playerName: card?.playerName,
        fullCardName: card?.fullCardName,
        year: card?.year,
        brand: card?.brand,
        series: card?.series,
        rarity: card?.rarity,
        condition: card?.condition,
        estimatedValue: card?.estimatedValue,
        isRookie: card?.isRookie,
        hasAutograph: card?.hasAutograph,
        serialNumber: card?.serialNumber,
        imageUrl: card?.imageUrl ? card.imageUrl.slice(0, 80) : null,
      }, null, 2));
      setCapturing(false);
      setGenerateError(true);
      return null;
    }
  }, [mode, card, cards, filterLabel, user]);

  const share = useCallback(async (destination) => {
    const cardName = card?.playerName || 'Card';
    const BASE = 'https://app.myvaults.io';
    const uid = user?.uid || '';
    const cardId = card ? String(card.id) : '';
    // OG-enabled URL: bots get proper meta tags; humans are redirected to the SPA
    const ogBase = `${BASE}/api/public-card`;
    const shareUrl = mode === 'card' && cardId && uid
      ? `${ogBase}?og=1&cardId=${cardId}&uid=${uid}`
      : uid
        ? collectionId
          ? `${ogBase}?og=1&shareCollection=${encodeURIComponent(collectionId)}&uid=${uid}`
          : filterLabel
            ? `${ogBase}?og=1&shareSet=${encodeURIComponent(filterLabel)}&uid=${uid}`
            : `${ogBase}?og=1&shareVault=1&uid=${uid}`
        : BASE;
    const shareTitle = mode === 'card' ? `${cardName} — The Vault` : 'My Trading Card Vault';
    // Include the link inline so every platform gets both the description and the URL
    const cardYear = card?.year ? ` (${card.year})` : '';
    const cardSeries = card?.fullCardName ? ` — ${card.fullCardName}` : '';
    const shareText = mode === 'card'
      ? `Check out my ${cardName}${cardYear}${cardSeries} card in The Vault!\n${shareUrl}`
      : `Check out my trading card collection in The Vault!\n${shareUrl}`;

    // Fix 5: never silently fail when image isn't ready
    if (!imageBlob) return 'not-ready';

    // ── Download helper ───────────────────────────────────────────────────
    function triggerDownload() {
      const a = document.createElement('a');
      const objUrl = URL.createObjectURL(imageBlob);
      a.href = objUrl;
      a.download = `vault-${mode}-${Date.now()}.jpg`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(objUrl);
    }

    if (destination === 'download') {
      // On native iOS/Android the <a download> trick is sandboxed and never
      // reaches the Photos gallery.  Use the native share sheet instead —
      // the user can "Save Image" or forward straight to WhatsApp / IG.
      if (Capacitor.isNativePlatform()) {
        const file = new File([imageBlob], 'vault-share.jpg', { type: 'image/jpeg' });
        const shareData = { files: [file], title: shareTitle, text: shareText };
        let canShare = false;
        try { canShare = !!(navigator.share && navigator.canShare?.(shareData)); } catch {}
        if (canShare) {
          try {
            await navigator.share(shareData);
            return 'shared';
          } catch (err) {
            if (err.name === 'AbortError') return 'cancelled';
          }
        }
      }
      triggerDownload();
      return 'saved';
    }

    // Fix 6: Only attempt native file share on mobile (maxTouchPoints > 0).
    // On desktop, download the image + open the platform.
    const mobile = isMobile();
    const file = new File([imageBlob], 'vault-share.jpg', { type: 'image/jpeg' });

    const tryMobileShare = async () => {
      if (!mobile) return 'unsupported';
      // shareText already contains the link, so text alone carries everything
      const shareData = { files: [file], title: shareTitle, text: shareText };
      let canShare = false;
      try { canShare = !!(navigator.share && navigator.canShare?.(shareData)); } catch {}
      if (!canShare) return 'unsupported';
      try {
        await navigator.share(shareData);
        return 'shared';
      } catch (err) {
        return err.name === 'AbortError' ? 'cancelled' : 'unsupported';
      }
    };

    if (destination === 'native') {
      const result = await tryMobileShare();
      if (result === 'unsupported') {
        triggerDownload();
        return 'saved';
      }
      return result;
    }

    // ── Instagram — image only, no URL/text so IG shows a clean post/story ─
    if (destination === 'instagram') {
      const igFile = new File([imageBlob], 'vault-share.jpg', { type: 'image/jpeg' });
      const igData = { files: [igFile] }; // no text/url — keeps IG post clean
      let canShare = false;
      try { canShare = !!(navigator.share && navigator.canShare?.(igData)); } catch {}
      if (canShare) {
        try {
          await navigator.share(igData);
          return 'shared';
        } catch (err) {
          if (err.name === 'AbortError') return 'cancelled';
        }
      }
      // Desktop fallback: just download the image
      triggerDownload();
      return 'saved';
    }

    // ── Social buttons ────────────────────────────────────────────────────
    // Mobile: Web Share API passes the image FILE to the OS sheet. The user
    // picks the target app and the image + text (with link) are pre-attached.
    // This is the only way to get an image into WhatsApp/Facebook/Reddit on
    // mobile — no URL scheme can inject a locally generated file.
    // Desktop: download image + open the platform URL.
    const socialUrls = {
      whatsapp: `https://wa.me/?text=${encodeURIComponent(shareText)}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
      reddit: `https://www.reddit.com/submit?title=${encodeURIComponent(shareTitle)}&url=${encodeURIComponent(shareUrl)}`,
    };
    if (destination in socialUrls) {
      const result = await tryMobileShare();
      if (result === 'unsupported') {
        // Desktop or file-share not supported: download + open platform
        triggerDownload();
        window.open(socialUrls[destination], '_blank', 'noopener,noreferrer');
        return 'saved-social';
      }
      return result; // 'shared' or 'cancelled'
    }

    if (destination === 'copy') {
      try {
        await navigator.clipboard.writeText(shareUrl);
      } catch {
        const ta = document.createElement('textarea');
        ta.value = shareUrl;
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
      }
      return 'copied';
    }

    return false;
  }, [imageBlob, card, cards, mode, filterLabel, user, collectionId]);

  return { generate, share, imageBlob, previewUrl, capturing, generateError };
}
