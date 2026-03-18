/**
 * /api/ebay-auth.js
 * Combined eBay OAuth endpoint.
 * POST { code }         — exchange authorization code for access+refresh tokens
 * POST { refreshToken } — exchange refresh token for a new access token
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const clientId     = process.env.VITE_EBAY_CLIENT_ID;
  const clientSecret = process.env.VITE_EBAY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: 'eBay credentials not configured on server' });
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const { code, refreshToken } = req.body ?? {};

  // ── Code exchange (initial authorization) ────────────────────────────────
  if (code) {
    const ruName = process.env.VITE_EBAY_RU_NAME;
    if (!ruName) return res.status(500).json({ error: 'eBay RU_NAME not configured on server' });

    const upstream = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        grant_type:   'authorization_code',
        code,
        redirect_uri: ruName,
      }).toString(),
    });

    const data = await upstream.json();
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: data.error_description || data.error || 'Token exchange failed' });
    }

    return res.json({
      accessToken:  data.access_token,
      refreshToken: data.refresh_token,
      expiresAt:    Date.now() + (data.expires_in - 60) * 1000,
    });
  }

  // ── Token refresh ─────────────────────────────────────────────────────────
  if (refreshToken) {
    const upstream = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        grant_type:    'refresh_token',
        refresh_token: refreshToken,
        scope: [
          'https://api.ebay.com/oauth/api_scope/sell.inventory',
          'https://api.ebay.com/oauth/api_scope/sell.account',
        ].join(' '),
      }).toString(),
    });

    const data = await upstream.json();
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: data.error_description || data.error || 'Token refresh failed' });
    }

    return res.json({
      accessToken: data.access_token,
      expiresAt:   Date.now() + (data.expires_in - 60) * 1000,
    });
  }

  return res.status(400).json({ error: 'code or refreshToken required' });
}
