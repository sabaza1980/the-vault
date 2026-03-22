// Server-side proxy for SportsCardsPro API (avoids CORS + keeps API key secret)
const SCP_BASE = 'https://www.sportscardspro.com/api';

export const config = {
  api: { bodyParser: true },
};

// Rate limiter: SportsCardsPro enforces 1 req/sec — use 1100ms buffer
let lastCall = 0;
async function rateLimit() {
  const gap = Date.now() - lastCall;
  if (gap < 1100) {
    await new Promise(res => setTimeout(res, 1100 - gap));
  }
  lastCall = Date.now();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = process.env.SPORTSCARDSPRO_API_KEY;
  if (!token) {
    return res.status(500).json({ error: 'SPORTSCARDSPRO_API_KEY not configured' });
  }

  const { playerName, year, brand, series, parallel, cardNumber } = req.body || {};

  const queryParts = [
    playerName && playerName !== 'Unknown Player' ? playerName : '',
    year || '',
    brand || '',
    series || '',
    parallel && parallel !== 'Base' ? parallel : '',
    cardNumber ? `#${cardNumber}` : ''
  ].filter(Boolean).join(' ').trim();

  if (!queryParts) return res.status(200).json(null);

  try {
    // Step 1 — search
    await rateLimit();
    const searchRes = await fetch(`${SCP_BASE}/products?t=${token}&q=${encodeURIComponent(queryParts)}`);
    if (!searchRes.ok) {
      console.error('[scp] search failed:', searchRes.status);
      return res.status(200).json(null);
    }
    const searchData = await searchRes.json();
    if (searchData.status !== 'success' || !searchData.products?.length) {
      console.log('[scp] no results for:', queryParts);
      return res.status(200).json(null);
    }

    const bestMatch = searchData.products[0];

    // Step 2 — fetch full pricing by id
    await rateLimit();
    const priceRes = await fetch(`${SCP_BASE}/product?t=${token}&id=${bestMatch.id}`);
    if (!priceRes.ok) {
      console.error('[scp] price fetch failed:', priceRes.status);
      return res.status(200).json(null);
    }
    const priceData = await priceRes.json();
    if (priceData.status !== 'success') return res.status(200).json(null);

    const pennies = (val) => val ? (val / 100).toFixed(2) : null;

    return res.status(200).json({
      matchedCard: priceData['product-name'],
      matchedSet: priceData['console-name'],
      raw: pennies(priceData['loose-price']),
      grade8: pennies(priceData['new-price']),
      grade9: pennies(priceData['graded-price']),
      psa10: pennies(priceData['manual-only-price']),
      bgs10: pennies(priceData['bgs-10-price']),
      cgc10: pennies(priceData['condition-17-price']),
      sgc10: pennies(priceData['condition-18-price']),
      salesVolume: priceData['sales-volume'] || null,
      releaseDate: priceData['release-date'] || null,
      priceSource: 'SportsCardsPro'
    });
  } catch (e) {
    console.error('[scp] error:', e);
    return res.status(200).json(null);
  }
}
