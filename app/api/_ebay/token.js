// Shared eBay app-level token (WP-0 / S4).
//
// Client-credentials (application) OAuth token for read APIs like Browse.
// This is NOT user OAuth — per-user authorization-code tokens are handled in
// api/ebay-auth.js + src/useEbayAuth.js and stored in Firestore. Use this only
// for app-scoped, public read calls (e.g. Browse search) shared by pricing (WP-5)
// and bulk-listing helpers (WP-8).
//
// Files prefixed with "_" are ignored by Vercel as routes (helper module only).
//
// Required env vars (server-side, NOT exposed to client despite the VITE_ prefix —
// these are read in serverless functions via process.env):
//   VITE_EBAY_CLIENT_ID      — eBay app Client ID (App ID)
//   VITE_EBAY_CLIENT_SECRET  — eBay app Client Secret (Cert ID)

const EBAY_OAUTH_URL = 'https://api.ebay.com/identity/v1/oauth2/token';
const APP_SCOPE = 'https://api.ebay.com/oauth/api_scope';

let cachedToken = null;
let tokenExpiry = 0;

// Returns a cached app-level access token, refreshing ~60s before expiry.
export async function getBrowseToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const clientId = process.env.VITE_EBAY_CLIENT_ID;
  const clientSecret = process.env.VITE_EBAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('eBay app credentials missing (VITE_EBAY_CLIENT_ID / VITE_EBAY_CLIENT_SECRET)');
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch(EBAY_OAUTH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`,
    },
    body: `grant_type=client_credentials&scope=${encodeURIComponent(APP_SCOPE)}`,
  });
  if (!res.ok) throw new Error(`eBay auth failed: ${res.status}`);

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}

export { EBAY_OAUTH_URL, APP_SCOPE };
