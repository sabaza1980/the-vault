/**
 * One sign-in across both origins.
 *
 * The app is at app.myvaults.io and the feed at www.myvaults.io. Firebase keeps
 * its session in the browser scoped to the origin, so signing in on one left
 * you signed out on the other — a page telling you to sign in while already
 * knowing who you were.
 *
 * The fix is a cookie on the parent domain, `.myvaults.io`, which both origins
 * send. It holds nothing but a long random id; the account it belongs to lives
 * in Firestore where only the service account can read it. The cookie is
 * HttpOnly, so no script on either site can read it either, and the only thing
 * that can do anything with it is this endpoint, which trades it for a
 * short-lived custom token the Firebase SDK signs in with.
 *
 *   POST   /api/session   { idToken }   → starts a session, sets the cookie
 *   GET    /api/session                 → { customToken }, or 204 if signed out
 *   DELETE /api/session                 → ends it everywhere
 *
 * A server-side session store rather than a self-contained signed cookie,
 * because signing out should actually sign you out: deleting one document
 * revokes the session on every device immediately, which a stateless cookie
 * cannot do until it expires.
 *
 * **Reading the feed never touches any of this.** A signed-out visitor gets a
 * 204 and the feed as normal. This decides who you are once you have chosen to
 * be someone; it never decides whether you may look.
 */

import {
  googleToken, fsGet, fsPatch, fsDelete, createCustomToken, uidFromIdToken,
} from './_fb.js';

const COOKIE = '__vault_session';
const DAYS = 14;
const MAX_AGE = DAYS * 24 * 60 * 60;

// Exact origins only: a credentialed request cannot use a wildcard, and should
// not. Anything not on this list gets no CORS headers and no session.
const ALLOWED = new Set([
  'https://www.myvaults.io',
  'https://myvaults.io',
  'https://app.myvaults.io',
]);
const isLocal = (o) => /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o || '');

function cors(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED.has(origin) || isLocal(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  // A session answer is per-visitor. Nothing may cache it, ever.
  res.setHeader('Cache-Control', 'no-store, private');
}

function readCookie(req, name) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) {
      return decodeURIComponent(part.slice(i + 1).trim());
    }
  }
  return null;
}

/**
 * `Domain=.myvaults.io` is the whole point: it is what makes both origins send
 * the cookie. SameSite=Lax still sends it on a normal navigation between the
 * two sites, which is the journey this exists for.
 */
function setCookie(req, res, value, maxAge) {
  const local = isLocal(req.headers.origin || '') || /^(localhost|127\.0\.0\.1)/.test(req.headers.host || '');
  const bits = [
    `${COOKIE}=${encodeURIComponent(value)}`,
    'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`,
  ];
  if (!local) bits.push('Domain=.myvaults.io', 'Secure');
  res.setHeader('Set-Cookie', bits.join('; '));
}

/** 32 random bytes. Guessing one is not a threat model worth entertaining. */
function newSessionId() {
  const b = new Uint8Array(32);
  globalThis.crypto.getRandomValues(b);
  return Buffer.from(b).toString('base64url');
}

const isSafeId = (s) => typeof s === 'string' && /^[A-Za-z0-9_-]{20,64}$/.test(s);

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  let token;
  try {
    token = await googleToken();
  } catch {
    return res.status(500).json({ error: 'Session service unavailable' });
  }

  const sid = readCookie(req, COOKIE);

  // ── end it everywhere ─────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    if (isSafeId(sid)) await fsDelete(`sessions/${sid}`, token).catch(() => {});
    setCookie(req, res, '', 0);
    return res.status(200).json({ ok: true });
  }

  // ── hand the browser something the SDK can sign in with ───────────────────
  if (req.method === 'GET') {
    // No cookie is the normal state for most visitors and is not an error.
    if (!isSafeId(sid)) return res.status(204).end();
    try {
      const doc = await fsGet(`sessions/${sid}`, token);
      if (!doc || !doc.uid || !doc.expiresAt || Date.parse(doc.expiresAt) < Date.now()) {
        // Gone or stale. Clear it so the browser stops sending a dead cookie.
        if (doc) await fsDelete(`sessions/${sid}`, token).catch(() => {});
        setCookie(req, res, '', 0);
        return res.status(204).end();
      }
      return res.status(200).json({ customToken: await createCustomToken(doc.uid), uid: doc.uid });
    } catch (e) {
      console.warn('[session] exchange', e?.message);
      return res.status(204).end();
    }
  }

  // ── take a fresh sign-in and make it cover both origins ───────────────────
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const idToken = typeof body.idToken === 'string' ? body.idToken : '';
  if (!idToken) return res.status(400).json({ error: 'idToken required' });

  // The same verification every other endpoint uses: it also catches an account
  // disabled or deleted since the token was minted.
  const uid = await uidFromIdToken(idToken);
  if (!uid) return res.status(401).json({ error: 'Could not start a session' });

  try {
    // A new id per sign-in, so an old cookie is never silently reused.
    if (isSafeId(sid)) await fsDelete(`sessions/${sid}`, token).catch(() => {});
    const id = newSessionId();
    await fsPatch(`sessions/${id}`, {
      uid,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + MAX_AGE * 1000).toISOString(),
    }, token);
    setCookie(req, res, id, MAX_AGE);
    return res.status(200).json({ ok: true, uid });
  } catch (e) {
    console.error('[session] create', e?.message);
    return res.status(500).json({ error: 'Could not start a session' });
  }
}
