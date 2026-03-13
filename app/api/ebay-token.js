/**
 * /api/ebay-token.js
 * Exchanges an eBay OAuth authorization code for user access + refresh tokens.
 * Called after the user completes the eBay consent popup.
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { code } = req.body ?? {};
  if (!code) return res.status(400).json({ error: 'code is required' });

  const clientId     = process.env.VITE_EBAY_CLIENT_ID;
  const clientSecret = process.env.VITE_EBAY_CLIENT_SECRET;
  const ruName       = process.env.VITE_EBAY_RU_NAME;

  if (!clientId || !clientSecret || !ruName) {
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
    // Subtract 60s safety margin so we refresh before actual expiry
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  });
}
