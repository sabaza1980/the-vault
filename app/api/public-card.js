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

async function googleToken() {
  const now = Math.floor(Date.now() / 1000);
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
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

// ── Handler ──────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // CORS headers so the SPA can call this from any origin
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { uid, cardId } = req.query;
  if (!uid) return res.status(400).json({ error: 'uid is required' });

  // Basic sanity — uid must look like a Firebase UID
  if (!/^[a-zA-Z0-9_-]{20,128}$/.test(uid)) {
    return res.status(400).json({ error: 'Invalid uid' });
  }

  const PROJECT_ID = process.env.FIREBASE_PROJECT_ID;
  if (!PROJECT_ID) return res.status(500).json({ error: 'Server misconfigured' });

  let token;
  try { token = await googleToken(); }
  catch (e) { return res.status(500).json({ error: 'Auth error' }); }

  const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

  if (cardId) {
    // Single card
    const url = `${BASE}/users/${uid}/cards/${cardId}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return res.status(404).json({ error: 'card not found' });
    const doc = await r.json();
    const card = docToCard(doc);
    return res.json({ ...card, id: cardId });
  } else {
    // All cards for the vault (max 200)
    const url = `${BASE}/users/${uid}/cards?pageSize=200`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return res.status(404).json({ error: 'vault not found', cards: [] });
    const data = await r.json();
    const cards = (data.documents || []).map(d => {
      const id = d.name.split('/').pop();
      return { ...docToCard(d), id };
    });
    return res.json({ cards });
  }
}
