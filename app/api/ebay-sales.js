// Primary: eBay Finding API — findCompletedItems (soldItemsOnly=true)
// Fallback: eBay Browse API — live listings (if no sold data found)

let cachedToken = null;
let tokenExpiry = 0;

async function getBrowseToken() {
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

async function findSoldItems(q) {
  const appId = process.env.VITE_EBAY_CLIENT_ID;
  const params = new URLSearchParams({
    'RESPONSE-DATA-FORMAT': 'JSON',
    'OPERATION-NAME': 'findCompletedItems',
    'SERVICE-VERSION': '1.0.0',
    'SECURITY-APPNAME': appId,
    'keywords': q,
    'itemFilter(0).name': 'SoldItemsOnly',
    'itemFilter(0).value': 'true',
    'sortOrder': 'EndTimeSoonest',
    'paginationInput.entriesPerPage': '10',
    'paginationInput.pageNumber': '1',
  });
  const url = `https://svcs.ebay.com/services/search/FindingService/v1?${params}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Finding API ${res.status}`);
  const data = await res.json();
  const resp = data?.findCompletedItemsResponse?.[0];
  if (resp?.ack?.[0] !== 'Success' && resp?.ack?.[0] !== 'Warning') return [];
  const items = resp?.searchResult?.[0]?.item || [];
  return items
    .filter(i => i?.sellingStatus?.[0]?.currentPrice?.[0]?.__value__)
    .map(i => ({
      title: i.title?.[0] || '',
      price: parseFloat(i.sellingStatus[0].currentPrice[0].__value__),
      currency: i.sellingStatus[0].currentPrice[0]['@currencyId'] || 'USD',
      url: i.viewItemURL?.[0] || '',
      date: i.listingInfo?.[0]?.endTime?.[0] || null,
    }));
}

async function findActiveItems(q) {
  const token = await getBrowseToken();
  const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(q)}&sort=newlyListed&limit=10`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
    },
  });
  if (!res.ok) throw new Error(`Browse API ${res.status}`);
  const data = await res.json();
  return (data.itemSummaries || [])
    .filter(i => i.price)
    .map(i => ({
      title: i.title,
      price: parseFloat(i.price.value),
      currency: i.price.currency,
      url: i.itemWebUrl,
      date: i.itemEndDate || null,
    }));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { playerName, fullCardName, parallel } = req.body || {};
  if (!playerName) return res.status(400).json({ error: 'playerName required' });

  const q = [playerName, fullCardName, parallel && parallel !== 'Base' ? parallel : '']
    .filter(Boolean).join(' ').trim();

  try {
    // Sold listings only via Finding API (Browse/active fallback paused)
    let sales = [];
    const source = 'sold';
    try {
      sales = await findSoldItems(q);
    } catch (soldErr) {
      console.error('Finding API failed:', soldErr.message);
    }

    if (sales.length === 0) return res.status(200).json(null);

    const avg = sales.reduce((s, i) => s + i.price, 0) / sales.length;
    return res.status(200).json({ sales, avg: Math.round(avg * 100) / 100, source });
  } catch (err) {
    console.error('eBay sales error:', err);
    return res.status(500).json({ error: err.message });
  }
}

