/**
 * /api/ebay-refresh.js
 * Exchanges a refresh token for a fresh access token.
 * Called transparently whenever the access token has expired.
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { refreshToken } = req.body ?? {};
  if (!refreshToken) return res.status(400).json({ error: 'refreshToken is required' });

  const clientId     = process.env.VITE_EBAY_CLIENT_ID;
  const clientSecret = process.env.VITE_EBAY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: 'eBay credentials not configured on server' });
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

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
