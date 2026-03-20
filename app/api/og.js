/**
 * GET /api/og?shareCard=ID&uid=UID   → Card OG preview
 * GET /api/og?shareVault=1&uid=UID   → Vault OG preview
 * GET /api/og?shareSet=NAME&uid=UID  → Set OG preview
 *
 * Returns an HTML page with proper Open Graph + Twitter Card meta tags so that
 * messaging apps (WhatsApp, iMessage, Twitter, etc.) show a rich link preview.
 * Humans are immediately redirected to the SPA via <meta refresh> + JS.
 */

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  const { shareCard, shareVault, shareSet, uid } = req.query;

  // Validate uid — Firebase UIDs are 28 chars, Play Store may vary; cap at 128.
  if (uid && !/^[a-zA-Z0-9_-]{1,128}$/.test(uid)) {
    return res.status(400).end();
  }

  let title = 'The Vault — Trading Card Collection';
  let description = 'Track, identify, value, and share your trading card collection.';
  let ogImage = 'https://app.myvaults.io/the-vault-icon.png';
  let redirectUrl = 'https://app.myvaults.io';

  if (uid && shareCard) {
    redirectUrl = `https://app.myvaults.io?shareCard=${encodeURIComponent(shareCard)}&uid=${encodeURIComponent(uid)}`;
    try {
      const r = await fetch(
        `https://app.myvaults.io/api/public-card?uid=${encodeURIComponent(uid)}&cardId=${encodeURIComponent(shareCard)}`
      );
      if (r.ok) {
        const card = await r.json();
        if (card && !card.error && card.playerName) {
          const name   = card.playerName;
          const year   = card.year   ? ` (${card.year})`                            : '';
          const series = card.fullCardName                                          || '';
          const par    = card.parallel && card.parallel !== 'Base' ? ` ${card.parallel}` : '';
          const rar    = card.rarity  && card.rarity  !== 'Common' ? ` — ${card.rarity}`  : '';
          title       = `Check out my ${name}${year} card in The Vault!`;
          description = `${series}${par}${rar}. Tracked and valued on The Vault — the smart trading card collection app.`;
          if (card.imageUrl && card.imageUrl.startsWith('https://')) ogImage = card.imageUrl;
        }
      }
    } catch { /* fall through to defaults */ }

  } else if (uid && shareVault) {
    redirectUrl  = `https://app.myvaults.io?shareVault=${encodeURIComponent(uid)}`;
    title        = 'Check out my trading card vault in The Vault!';
    description  = 'View my complete trading card collection — tracked, identified, and valued on The Vault.';

  } else if (uid && shareSet) {
    const setName = decodeURIComponent(shareSet);
    redirectUrl  = `https://app.myvaults.io?shareSet=${encodeURIComponent(shareSet)}&uid=${encodeURIComponent(uid)}`;
    title        = `Check out my ${setName} collection in The Vault!`;
    description  = 'View my trading card set — tracked, identified, and valued on The Vault.';
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  return res.status(200).send(`<!DOCTYPE html>
<html lang="en"><head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escHtml(title)}</title>
  <meta property="og:title"       content="${escHtml(title)}">
  <meta property="og:description" content="${escHtml(description)}">
  <meta property="og:image"       content="${escHtml(ogImage)}">
  <meta property="og:url"         content="${escHtml(redirectUrl)}">
  <meta property="og:type"        content="website">
  <meta property="og:site_name"   content="The Vault">
  <meta name="twitter:card"        content="summary_large_image">
  <meta name="twitter:title"       content="${escHtml(title)}">
  <meta name="twitter:description" content="${escHtml(description)}">
  <meta name="twitter:image"       content="${escHtml(ogImage)}">
  <meta http-equiv="refresh" content="0;url=${escHtml(redirectUrl)}">
  <script>window.location.replace(${JSON.stringify(redirectUrl)});</script>
</head><body>
  <p>Opening The Vault… <a href="${escHtml(redirectUrl)}">Tap here if not redirected</a></p>
</body></html>`);
}
