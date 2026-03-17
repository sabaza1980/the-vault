import { useState, useCallback } from 'react';

const RARITY_COLORS = {
  Common: '#555', Uncommon: '#4caf50', Rare: '#2196f3',
  'Very Rare': '#9c27b0', 'Ultra Rare': '#ff9800', Legendary: '#f44336',
};

// Fetch any URL and return a data URL so Canvas can draw it without taint
async function urlToDataUrl(src) {
  if (!src || src.startsWith('data:')) return src || null;
  try {
    const res = await fetch(src);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function loadImg(src) {
  if (!src) return null;
  try {
    const dataUrl = src.startsWith('data:') ? src : await urlToDataUrl(src);
    if (!dataUrl) return null;
    return await new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = dataUrl;
    });
  } catch { return null; }
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
  await document.fonts.ready;
  const W = 1080, H = 1080;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  const rColor = RARITY_COLORS[card.rarity] || '#555';
  const fullCardName = card.fullCardName ||
    [card.year, card.brand, card.series].filter(Boolean).join(' ') || 'Unknown Set';

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

  const playerText = (card.playerName || 'UNKNOWN').toUpperCase();
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
  if (card.condition) badges.push({ label: card.condition, color: '#888', bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.1)' });
  if (card.isRookie) badges.push({ label: 'RC', color: '#ff6b35', bg: 'rgba(255,107,53,0.15)', border: 'rgba(255,107,53,0.35)' });
  if (card.hasAutograph) badges.push({ label: 'AUTO', color: '#f0c040', bg: 'rgba(240,192,64,0.15)', border: 'rgba(240,192,64,0.35)' });
  if (card.serialNumber) badges.push({ label: card.serialNumber, color: '#ce93d8', bg: 'rgba(206,147,216,0.15)', border: 'rgba(206,147,216,0.35)' });
  if (card.rarity && card.rarity !== 'Common') badges.push({ label: card.rarity.toUpperCase(), color: rColor, bg: rColor + '18', border: rColor + '40' });

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
    ry += 10;
    ctx.font = '400 84px "Bebas Neue", sans-serif';
    ctx.fillStyle = '#4caf50';
    ctx.fillText(`$${card.estimatedValue.toFixed(2)}`, RX, ry + 72);
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
  await document.fonts.ready;
  const W = 1080, H = 1080;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  const RARITY_ORDER = { Legendary: 0, 'Ultra Rare': 1, 'Very Rare': 2, Rare: 3, Uncommon: 4, Common: 5 };
  const sorted = [...cards].sort((a, b) => (RARITY_ORDER[a.rarity] ?? 6) - (RARITY_ORDER[b.rarity] ?? 6));
  const gridCards = sorted.slice(0, 9);
  const overflow = cards.length - 9;
  const namePrefix = user?.displayName ? `${user.displayName.toUpperCase()}'S` : 'MY';
  const titleLine = filterLabel ? `${filterLabel.toUpperCase()} SET` : 'VAULT';
  const rarePlus = cards.filter(c => ['Rare', 'Very Rare', 'Ultra Rare', 'Legendary'].includes(c.rarity)).length;
  const totalValue = cards.reduce((s, c) => s + (c.estimatedValue || 0), 0);

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
  if (overflow > 0 && gridCards.length < 9) {
    const col = gridCards.length % GCOLS, row = Math.floor(gridCards.length / GCOLS);
    const gx = GRID_X + col * (GW + GGAP), gy = GRID_Y + row * (GH + GGAP);
    ctx.fillStyle = 'rgba(255,107,53,0.08)';
    rrect(ctx, gx, gy, GW, GH, 14); ctx.fill();
    ctx.strokeStyle = 'rgba(255,107,53,0.22)';
    ctx.lineWidth = 3;
    rrect(ctx, gx, gy, GW, GH, 14); ctx.stroke();
    ctx.font = '400 52px "Bebas Neue", sans-serif';
    ctx.fillStyle = '#ff6b35';
    ctx.textAlign = 'center';
    ctx.fillText(`+${overflow}`, gx + GW / 2, gy + GH / 2 + 20);
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

export function useShareCard({ card, cards, mode, filterLabel, user }) {
  const [imageBlob, setImageBlob] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [capturing, setCapturing] = useState(false);

  const generate = useCallback(async () => {
    setCapturing(true);
    try {
      const canvas = mode === 'card'
        ? await drawSingleCard(card)
        : await drawCollection(cards || [], filterLabel || null, user || null);
      return await new Promise((resolve) => {
        canvas.toBlob((blob) => {
          if (!blob) { setCapturing(false); resolve(null); return; }
          const url = URL.createObjectURL(blob);
          setImageBlob(blob);
          setPreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return url; });
          setCapturing(false);
          resolve({ blob, url });
        }, 'image/png');
      });
    } catch (err) {
      console.error('Canvas generation error:', err);
      setCapturing(false);
      return null;
    }
  }, [mode, card, cards, filterLabel, user]);

  const share = useCallback(async (destination) => {
    const cardName = card?.playerName || 'Card';
    const BASE = 'https://app.myvaults.io';
    const uid = user?.uid || '';
    const cardId = card ? String(card.id) : '';
    const shareUrl = mode === 'card' && cardId && uid
      ? `${BASE}?shareCard=${cardId}&uid=${uid}`
      : uid
        ? filterLabel
          ? `${BASE}?shareSet=${encodeURIComponent(filterLabel)}&uid=${uid}`
          : `${BASE}?shareVault=${uid}`
        : BASE;
    const shareTitle = mode === 'card' ? `${cardName} — The Vault` : 'My Trading Card Vault';
    const shareText = mode === 'card'
      ? `Check out my ${cardName} on The Vault!`
      : 'Check out my trading card collection on The Vault!';

    if (destination === 'download') {
      if (!imageBlob) return false;
      const a = document.createElement('a');
      const objUrl = URL.createObjectURL(imageBlob);
      a.href = objUrl;
      a.download = `vault-${mode}-${Date.now()}.png`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(objUrl);
      return true;
    }
    if (destination === 'native') {
      if (!imageBlob) return false;
      const file = new File([imageBlob], 'vault-share.png', { type: 'image/png' });
      try {
        if (navigator.share && navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: shareTitle, text: shareText, url: shareUrl });
        } else if (navigator.share) {
          await navigator.share({ title: shareTitle, text: shareText, url: shareUrl });
        }
      } catch (err) { if (err.name !== 'AbortError') console.error('Web Share error', err); }
      return true;
    }
    if (destination === 'whatsapp') {
      window.open(`https://wa.me/?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`, '_blank', 'noopener,noreferrer');
      return true;
    }
    if (destination === 'facebook') {
      window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`, '_blank', 'noopener,noreferrer');
      return true;
    }
    if (destination === 'reddit') {
      window.open(`https://reddit.com/submit?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(shareTitle)}`, '_blank', 'noopener,noreferrer');
      return true;
    }
    if (destination === 'copy') {
      try {
        await navigator.clipboard.writeText(shareUrl);
      } catch {
        const ta = document.createElement('textarea');
        ta.value = shareUrl;
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
      }
      return true;
    }
    return false;
  }, [imageBlob, card, cards, mode, filterLabel, user]);

  return { generate, share, imageBlob, previewUrl, capturing };
}
