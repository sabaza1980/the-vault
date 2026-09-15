/**
 * Shared Firebase helpers for the public-profile endpoints.
 *
 * Vercel ignores files in /api whose name starts with "_", so this is a module
 * rather than a route.
 *
 * Two kinds of access live here:
 *   - Service-account access to Firestore's REST API, for reads and writes that
 *     must bypass client security rules (public profile reads, reaction counters).
 *   - ID-token verification, so an endpoint can trust "who is calling".
 */

// ── Service account ──────────────────────────────────────────────────────────

function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function getServiceAccount() {
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '{}');
  return {
    projectId: sa.project_id || process.env.FIREBASE_PROJECT_ID || '',
    clientEmail: sa.client_email || process.env.FIREBASE_CLIENT_EMAIL || '',
    privateKey: (sa.private_key || process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  };
}

let _tokenCache = { token: null, exp: 0 };

export async function googleToken() {
  // Reuse the token across warm invocations; it is valid for an hour.
  const now = Math.floor(Date.now() / 1000);
  if (_tokenCache.token && _tokenCache.exp - 60 > now) return _tokenCache.token;

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
    'RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(`${header}.${payload}`)
  );
  const sig = b64url(Buffer.from(sigBuffer));

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${header}.${payload}.${sig}`,
  });
  if (!r.ok) throw new Error(`Google token failed: ${r.status}`);
  const j = await r.json();
  _tokenCache = { token: j.access_token, exp: now + (j.expires_in || 3600) };
  return j.access_token;
}

export function fsBase() {
  const { projectId } = getServiceAccount();
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
}

// ── Firestore value codec ────────────────────────────────────────────────────

export function fromFsVal(v) {
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromFsVal);
  if ('mapValue' in v) return fromFsFields(v.mapValue.fields || {});
  return null;
}

export function fromFsFields(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields || {})) out[k] = fromFsVal(v);
  return out;
}

export function docToObj(doc) {
  if (!doc || !doc.fields) return null;
  const o = fromFsFields(doc.fields);
  if (doc.name) o.id = doc.name.split('/').pop();
  return o;
}

export function toFsVal(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFsVal) } };
  if (typeof v === 'object') return { mapValue: { fields: toFsFields(v) } };
  return { nullValue: null };
}

export function toFsFields(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) out[k] = toFsVal(v);
  return out;
}

// ── Firestore REST convenience ───────────────────────────────────────────────

export async function fsGet(path, token) {
  const r = await fetch(`${fsBase()}/${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Firestore GET ${path}: ${r.status}`);
  return docToObj(await r.json());
}

export async function fsList(path, token, pageSize = 300) {
  const r = await fetch(`${fsBase()}/${path}?pageSize=${pageSize}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return [];
  const j = await r.json();
  return (j.documents || []).map(docToObj).filter(Boolean);
}

/**
 * Patch a document, creating it if absent. `fields` is a plain object; only the
 * keys present are written (updateMask), so concurrent writers to different
 * fields do not clobber each other.
 */
export async function fsPatch(path, obj, token) {
  const mask = Object.keys(obj).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
  const r = await fetch(`${fsBase()}/${path}?${mask}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: toFsFields(obj) }),
  });
  if (!r.ok) throw new Error(`Firestore PATCH ${path}: ${r.status} ${await r.text()}`);
  return docToObj(await r.json());
}

/**
 * Atomic field transform, used for reaction counters. `transforms` looks like
 * [{ fieldPath: 'fire', increment: 1 }].
 */
export async function fsCommitTransform(docPath, transforms, token) {
  const { projectId } = getServiceAccount();
  const name = `projects/${projectId}/databases/(default)/documents/${docPath}`;
  const r = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        writes: [{
          transform: {
            document: name,
            fieldTransforms: transforms.map(t => ({
              fieldPath: t.fieldPath,
              increment: { integerValue: String(t.increment) },
            })),
          },
        }],
      }),
    }
  );
  if (!r.ok) throw new Error(`Firestore commit: ${r.status} ${await r.text()}`);
  return r.json();
}

// ── Caller identity ──────────────────────────────────────────────────────────

/**
 * Verify a Firebase ID token and return its uid, or null.
 *
 * Uses the Identity Toolkit lookup endpoint rather than verifying the JWT
 * locally: it needs no crypto plumbing and it also catches accounts that have
 * been disabled or deleted since the token was minted, which local signature
 * checking does not.
 */
export async function uidFromIdToken(idToken) {
  if (!idToken || typeof idToken !== 'string' || idToken.length > 4096) return null;
  const key = process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY || '';
  if (!key) throw new Error('Missing Firebase web API key for token verification');
  try {
    const r = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    );
    if (!r.ok) return null;
    const j = await r.json();
    const u = (j.users || [])[0];
    if (!u || u.disabled) return null;
    return u.localId || null;
  } catch { return null; }
}

export function bearer(req) {
  const h = req.headers.authorization || req.headers.Authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}

// ── Handles ──────────────────────────────────────────────────────────────────

export const HANDLE_RE = /^[a-z][a-z0-9_]{2,19}$/;

/**
 * Anything that is already a route, or that would let someone pass themselves
 * off as us. Kept here so routing and handle-claiming cannot drift apart.
 */
export const RESERVED_HANDLES = new Set([
  'u', 'api', 'app', 'www', 'admin', 'blog', 'terms', 'privacy', 'privacy-policy',
  'delete-account', 'ebay-callback', 'assets', 'static', 'screens', 'sitemap',
  'robots', 'favicon', 'login', 'signup', 'signin', 'logout', 'auth', 'settings',
  'profile', 'search', 'explore', 'about', 'contact', 'pricing', 'help', 'support',
  'official', 'staff', 'mod', 'moderator', 'team', 'security', 'abuse', 'legal',
  'thevault', 'the-vault', 'myvaults', 'vault', 'breakers', 'pj', 'toppsy',
]);

export function handleError(handle) {
  if (typeof handle !== 'string') return 'Handle is required';
  const h = handle.trim().toLowerCase();
  if (!HANDLE_RE.test(h)) {
    return 'Use 3 to 20 characters: lowercase letters, numbers and underscores, starting with a letter';
  }
  if (RESERVED_HANDLES.has(h)) return 'That handle is reserved';
  return null;
}

// ── Misc ─────────────────────────────────────────────────────────────────────

export function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function cors(res, methods = 'GET, OPTIONS') {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}
