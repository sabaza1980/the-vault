// Shared eBay application-level OAuth tokens (client credentials grant).
//
// This is NOT user OAuth — per-user authorization-code tokens are handled in
// api/ebay-auth.js + src/useEbayAuth.js and stored in Firestore. Use this only
// for app-scoped, public read calls: Browse search, Metadata condition policies,
// and Marketplace Insights sold-item search.
//
// Files prefixed with "_" are ignored by Vercel as routes (helper module only).
//
// Required env vars (server-side, NOT exposed to the client despite the VITE_
// prefix — these are read in serverless functions via process.env):
//   VITE_EBAY_CLIENT_ID      — eBay app Client ID (App ID)
//   VITE_EBAY_CLIENT_SECRET  — eBay app Client Secret (Cert ID)
// Optional:
//   EBAY_ENV                 — "sandbox" to target the eBay sandbox

export const EBAY_API_BASE =
  process.env.EBAY_ENV === 'sandbox'
    ? 'https://api.sandbox.ebay.com'
    : 'https://api.ebay.com';

export const EBAY_OAUTH_URL = `${EBAY_API_BASE}/identity/v1/oauth2/token`;

// Scope constants. Note the scope STRINGS always use the production host, even
// when calling sandbox — that is how eBay defines them.
export const SCOPE_BASE = 'https://api.ebay.com/oauth/api_scope';
export const SCOPE_MARKETPLACE_INSIGHTS =
  'https://api.ebay.com/oauth/api_scope/buy.marketplace.insights';

// Raised when eBay refuses to mint a token for a scope the app is not approved
// for. Marketplace Insights is a Limited Release API, so this is the expected
// error until eBay grants access — callers translate it into a clean
// "value unavailable" rather than a 500.
export class EbayScopeError extends Error {
  constructor(scope, detail) {
    super(`eBay app is not authorized for scope: ${scope}${detail ? ` (${detail})` : ''}`);
    this.name = 'EbayScopeError';
    this.scope = scope;
    this.code = 'SCOPE_NOT_GRANTED';
  }
}

// One cache entry per scope string.
const cache = new Map(); // scope -> { token, expiresAt }

function credentials() {
  // Trim aggressively: .env files written on Windows or by the Vercel CLI can
  // carry CRLF endings and wrapping quotes, either of which silently produces
  // "invalid_client" from eBay.
  const clean = (v) => (v || '').trim().replace(/^["']|["']$/g, '');
  const clientId = clean(process.env.VITE_EBAY_CLIENT_ID);
  const clientSecret = clean(process.env.VITE_EBAY_CLIENT_SECRET);
  if (!clientId || !clientSecret) {
    throw new Error('eBay app credentials missing (VITE_EBAY_CLIENT_ID / VITE_EBAY_CLIENT_SECRET)');
  }
  return Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
}

/**
 * Fetch (and cache) an application access token for the given scope(s).
 * @param {string|string[]} scopes
 * @returns {Promise<string>} access token
 * @throws {EbayScopeError} when the app is not approved for the scope
 */
export async function getAppToken(scopes = SCOPE_BASE) {
  const scopeStr = Array.isArray(scopes) ? scopes.join(' ') : scopes;

  const hit = cache.get(scopeStr);
  if (hit && Date.now() < hit.expiresAt) return hit.token;

  const res = await fetch(EBAY_OAUTH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials()}`,
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope: scopeStr,
    }).toString(),
  });

  let data = {};
  try {
    data = await res.json();
  } catch {
    /* fall through to the status-based error below */
  }

  if (!res.ok || !data.access_token) {
    const desc = data.error_description || data.error || `HTTP ${res.status}`;
    // eBay signals "your app may not have this scope" in two ways:
    //   invalid_scope  — "exceeds the scope granted to the client"
    //   invalid_client — sometimes returned for ungranted Limited Release scopes
    const scopeRefused =
      data.error === 'invalid_scope' ||
      /exceeds the scope granted|scope is invalid|unknown, malformed/i.test(desc);
    if (scopeRefused && scopeStr !== SCOPE_BASE) {
      throw new EbayScopeError(scopeStr, desc);
    }
    throw new Error(`eBay auth failed: ${desc}`);
  }

  const token = data.access_token;
  // Refresh 60s early so an in-flight request never uses a just-expired token.
  cache.set(scopeStr, {
    token,
    expiresAt: Date.now() + Math.max(60, (data.expires_in || 7200) - 60) * 1000,
  });
  return token;
}

/** Back-compat alias used by the existing Browse-based helpers. */
export async function getBrowseToken() {
  return getAppToken(SCOPE_BASE);
}

/** Clears the token cache. Used by the self-test script. */
export function _resetTokenCache() {
  cache.clear();
}

export { SCOPE_BASE as APP_SCOPE };
