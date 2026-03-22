// Server-side proxy for PriceCharting API (avoids CORS + keeps API key secret)
const PC_BASE = 'https://www.pricecharting.com/api';

export const config = {
  api: { bodyParser: true },
};

// Rate limiter: 1100ms gap between calls
let lastCall = 0;
async function rateLimit() {
  const gap = Date.now() - lastCall;
  if (gap < 1100) {
    await new Promise(res => setTimeout(res, 1100 - gap));
  }
  lastCall = Date.now();
}

function buildTCGQuery(cardInfo) {
  const brand = (cardInfo.brand || '').toLowerCase();
  const series = cardInfo.series || '';
  const name = cardInfo.playerName && cardInfo.playerName !== 'Unknown Player' ? cardInfo.playerName : '';
  const number = cardInfo.cardNumber || '';
  if (brand.includes('pokemon') || series.toLowerCase().includes('pokemon')) {
    return [name, number, series].filter(Boolean).join(' ');
  }
  if (brand.includes('magic') || series.toLowerCase().includes('magic')) {
    return [name, series].filter(Boolean).join(' ');
  }
  if (brand.includes('yu-gi-oh') || series.toLowerCase().includes('yu-gi-oh')) {
    return [name, number, series].filter(Boolean).join(' ');
  }
  return [name, cardInfo.year, series, number].filter(Boolean).join(' ');
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

  const cardInfo = req.body || {};
  const queryParts = buildTCGQuery(cardInfo).trim();

  if (!queryParts) return res.status(200).json(null);

  try {
    // Step 1 — search
    await rateLimit();
    const searchRes = await fetch(`${PC_BASE}/products?t=${token}&q=${encodeURIComponent(queryParts)}`);
    if (!searchRes.ok) {
      console.error('[pricecharting] search failed:', searchRes.status);
      return res.status(200).json(null);
    }
    const searchData = await searchRes.json();
    if (searchData.status !== 'success' || !searchData.products?.length) {
      console.log('[pricecharting] no results for:', queryParts);
      return res.status(200).json(null);
    }

    const bestMatch = searchData.products[0];

    // Step 2 — fetch full pricing by id
    await rateLimit();
    const priceRes = await fetch(`${PC_BASE}/product?t=${token}&id=${bestMatch.id}`);
    if (!priceRes.ok) {
      console.error('[pricecharting] price fetch failed:', priceRes.status);
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
      priceSource: 'PriceCharting'
    });
  } catch (e) {
    console.error('[pricecharting] error:', e);
    return res.status(200).json(null);
  }
}
