/**
 * GET /api/public-card?uid=USER_UID&cardId=CARD_ID  → single card JSON
 * GET /api/public-card?uid=USER_UID                 → { cards: [...] }
 *
 * Reads from Firestore using a service-account JWT so no client auth is needed.
 * This makes shared vault/card links viewable without logging in.
 */

// ── Google Auth JWT (same pattern as generate-article.js) ───────────────────
function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function getServiceAccount() {
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '{}');
  return {
    projectId: sa.project_id || process.env.FIREBASE_PROJECT_ID || '',
    clientEmail: sa.client_email || process.env.FIREBASE_CLIENT_EMAIL || '',
    privateKey: (sa.private_key || process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  };
}

async function googleToken() {
  const now = Math.floor(Date.now() / 1000);
  const { clientEmail, privateKey } = getServiceAccount();
  if (!clientEmail || !privateKey) throw new Error('Missing Firebase service account env vars');

  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
  }));

  const pemBody = privateKey.replace(/-----[^-]+-----|[\r\n]/g, '');
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    'pkcs8', Buffer.from(pemBody, 'base64'),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']
  );
  const sigBuffer = await globalThis.crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', cryptoKey,
    new TextEncoder().encode(`${header}.${payload}`)
  );
  const sig = b64url(Buffer.from(sigBuffer));

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${header}.${payload}.${sig}`,
  });
  if (!r.ok) throw new Error(`Google token failed: ${r.status}`);
  return (await r.json()).access_token;
}

// ── Firestore value deserialiser ─────────────────────────────────────────────
function fromFsVal(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return parseInt(v.integerValue, 10);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromFsVal);
  if ('mapValue' in v) {
    const obj = {};
    for (const [k, fv] of Object.entries(v.mapValue.fields || {})) obj[k] = fromFsVal(fv);
    return obj;
  }
  return null;
}

function docToCard(doc) {
  const fields = doc.fields || {};
  const card = {};
  for (const [k, v] of Object.entries(fields)) card[k] = fromFsVal(v);
  return card;
}

// ── Fetch display name from users/{uid} doc ─────────────────────────────────
async function getOwnerName(uid, token, BASE) {
  try {
    const r = await fetch(`${BASE}/users/${uid}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return null;
    const d = docToCard(await r.json());
    return d.display_name || null;
  } catch { return null; }
}

// ── Handler ──────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function ogResponse(res, { title, description, ogImage, redirectUrl }) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  return res.status(200).send(`<!DOCTYPE html>
<html lang="en"><head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escHtml(title)}</title>
  <meta property="og:title" content="${escHtml(title)}">
  <meta property="og:description" content="${escHtml(description)}">
  <meta property="og:image" content="${escHtml(ogImage)}">
  <meta property="og:url" content="${escHtml(redirectUrl)}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="The Vault">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escHtml(title)}">
  <meta name="twitter:description" content="${escHtml(description)}">
  <meta name="twitter:image" content="${escHtml(ogImage)}">
  <meta http-equiv="refresh" content="0;url=${escHtml(redirectUrl)}">
  <script>window.location.replace(${JSON.stringify(redirectUrl)});</script>
</head><body><p>Opening The Vault… <a href="${escHtml(redirectUrl)}">Tap here if not redirected</a></p></body></html>`);
}

export default async function handler(req, res) {
  // CORS headers so the SPA can call this from any origin
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { uid, cardId, shareVault, shareSet, shareCollection, og, collectionId } = req.query;

  // ── OG share-link preview (no uid required for vault/set defaults) ────────
  if (og) {
    const BASE_APP = 'https://app.myvaults.io';
    let title = 'The Vault — Trading Card Collection';
    let description = 'Track, identify, value, and share your trading card collection.';
    let ogImage = `${BASE_APP}/the-vault-icon.png`;
    let redirectUrl = BASE_APP;

    if (uid && cardId && /^[a-zA-Z0-9_-]{1,128}$/.test(uid)) {
      redirectUrl = `${BASE_APP}?shareCard=${encodeURIComponent(cardId)}&uid=${encodeURIComponent(uid)}`;
      // Try to fetch the card to build a rich title/description
      try {
        const { projectId: PID } = getServiceAccount();
        const token = await googleToken();
        const fsBase = `https://firestore.googleapis.com/v1/projects/${PID}/databases/(default)/documents`;
        const r = await fetch(`${fsBase}/users/${uid}/cards/${cardId}`, { headers: { Authorization: `Bearer ${token}` } });
        if (r.ok) {
          const card = docToCard(await r.json());
          if (card.playerName) {
            const year = card.year ? ` (${card.year})` : '';
            const series = card.fullCardName ? ` — ${card.fullCardName}` : '';
            const par = card.parallel && card.parallel !== 'Base' ? ` ${card.parallel}` : '';
            const rar = card.rarity && card.rarity !== 'Common' ? ` — ${card.rarity}` : '';
            title = `Check out my ${card.playerName}${year} card in The Vault!`;
            description = `${series}${par}${rar}. Tracked and valued on The Vault.`.trim().replace(/^[—\s]+/, '');
            if (card.imageUrl && card.imageUrl.startsWith('https://')) ogImage = card.imageUrl;
          }
        }
      } catch { /* use defaults */ }
    } else if (uid && shareCollection && /^[a-zA-Z0-9_-]{1,128}$/.test(uid)) {
      const safeColId = String(shareCollection).slice(0, 128);
      redirectUrl = `${BASE_APP}?shareCollection=${encodeURIComponent(safeColId)}&uid=${encodeURIComponent(uid)}`;
      title = 'Check out my collection in The Vault!';
      description = 'View my trading card collection — tracked, identified, and valued on The Vault.';
      try {
        const { projectId: PID } = getServiceAccount();
        const token2 = await googleToken();
        const fsBase2 = `https://firestore.googleapis.com/v1/projects/${PID}/databases/(default)/documents`;
        const colR = await fetch(`${fsBase2}/users/${uid}/collections/${safeColId}`, { headers: { Authorization: `Bearer ${token2}` } });
        if (colR.ok) {
          const colDoc = docToCard(await colR.json());
          if (colDoc.name) title = `Check out my "${colDoc.name}" collection in The Vault!`;
          if (colDoc.coverImageUrl && colDoc.coverImageUrl.startsWith('https://')) ogImage = colDoc.coverImageUrl;
        }
      } catch { /* use defaults */ }
    } else if (uid && shareSet && /^[a-zA-Z0-9_-]{1,128}$/.test(uid)) {
      const setName = decodeURIComponent(shareSet);
      redirectUrl = `${BASE_APP}?shareSet=${encodeURIComponent(shareSet)}&uid=${encodeURIComponent(uid)}`;
      title = `Check out my ${setName} collection in The Vault!`;
      description = 'View my trading card set — tracked, identified, and valued on The Vault.';
    } else if (uid && shareVault && /^[a-zA-Z0-9_-]{1,128}$/.test(uid)) {
      redirectUrl = `${BASE_APP}?shareVault=${encodeURIComponent(uid)}`;
      title = 'Check out my trading card vault in The Vault!';
      description = 'View my complete trading card collection — tracked, identified, and valued on The Vault.';
    }
    return ogResponse(res, { title, description, ogImage, redirectUrl });
  }

  if (!uid) return res.status(400).json({ error: 'uid is required' });

  // Basic sanity — uid must look like a Firebase UID
  if (!/^[a-zA-Z0-9_-]{20,128}$/.test(uid)) {
    return res.status(400).json({ error: 'Invalid uid' });
  }

  const { projectId: PROJECT_ID } = getServiceAccount();
  if (!PROJECT_ID) return res.status(500).json({ error: 'Server misconfigured' });

  let token;
  try { token = await googleToken(); }
  catch (e) { return res.status(500).json({ error: 'Auth error' }); }

  const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

  if (cardId) {
    // Single card
    const url = `${BASE}/users/${uid}/cards/${cardId}`;
    const [r, ownerName] = await Promise.all([
      fetch(url, { headers: { Authorization: `Bearer ${token}` } }),
      getOwnerName(uid, token, BASE),
    ]);
    if (!r.ok) return res.status(404).json({ error: 'card not found' });
    const card = docToCard(await r.json());
    return res.json({ ...card, id: cardId, ownerName });
  } else if (collectionId) {
    // Collection definition + all user cards (client resolves which cards belong)
    const safeColId = String(collectionId).slice(0, 128);
    const [colR, cardsR, ownerName] = await Promise.all([
      fetch(`${BASE}/users/${uid}/collections/${safeColId}`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${BASE}/users/${uid}/cards?pageSize=200`, { headers: { Authorization: `Bearer ${token}` } }),
      getOwnerName(uid, token, BASE),
    ]);
    if (!colR.ok) return res.status(404).json({ error: 'collection not found' });
    const col = docToCard(await colR.json());
    col.id = safeColId;
    const cardsData = cardsR.ok ? await cardsR.json() : { documents: [] };
    const cards = (cardsData.documents || []).map(d => {
      const id = d.name.split('/').pop();
      return { ...docToCard(d), id };
    });
    return res.json({ collection: col, cards, ownerName });
  } else {
    // All cards for the vault (max 200)
    const [r, ownerName] = await Promise.all([
      fetch(`${BASE}/users/${uid}/cards?pageSize=200`, { headers: { Authorization: `Bearer ${token}` } }),
      getOwnerName(uid, token, BASE),
    ]);
    if (!r.ok) return res.status(404).json({ error: 'vault not found', cards: [] });
    const data = await r.json();
    const cards = (data.documents || []).map(d => {
      const id = d.name.split('/').pop();
      return { ...docToCard(d), id };
    });
    return res.json({ cards, ownerName });
  }
}
