let cachedToken = null;
let tokenExpiry = 0;

async function getEbayToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  const credentials = Buffer.from(
    `${process.env.VITE_EBAY_CLIENT_ID}:${process.env.VITE_EBAY_CLIENT_SECRET}`
  ).toString('base64');
  const res = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`,
    },
    body: 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope',
  });
  if (!res.ok) throw new Error(`eBay auth failed: ${res.status}`);
  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { playerName, fullCardName, parallel } = req.body || {};
  if (!playerName) return res.status(400).json({ error: 'playerName required' });

  try {
    const token = await getEbayToken();
    const q = [playerName, fullCardName, parallel && parallel !== 'Base' ? parallel : '']
      .filter(Boolean).join(' ').trim();

    const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(q)}&filter=conditionIds%3A%7B3000%7D&sort=newlyListed&limit=5`;
    const ebayRes = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
      },
    });

    if (!ebayRes.ok) {
      const errText = await ebayRes.text();
      return res.status(ebayRes.status).json({ error: errText });
    }

    const data = await ebayRes.json();
    if (!data.itemSummaries || data.itemSummaries.length === 0) {
      return res.status(200).json(null);
    }

    const sales = data.itemSummaries
      .filter(item => item.price)
      .map(item => ({
        title: item.title,
        price: parseFloat(item.price.value),
        currency: item.price.currency,
        url: item.itemWebUrl,
        date: item.itemEndDate || null,
      }));

    if (sales.length === 0) return res.status(200).json(null);

    const avg = sales.reduce((s, i) => s + i.price, 0) / sales.length;
    return res.status(200).json({ sales, avg: Math.round(avg * 100) / 100 });
  } catch (err) {
    console.error('eBay sales error:', err);
    return res.status(500).json({ error: err.message });
  }
}
