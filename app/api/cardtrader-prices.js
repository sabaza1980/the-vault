// CardTrader pricing lookup
// 1. Search blueprints by card name to find blueprint_id
// 2. Fetch marketplace products for that blueprint_id → return prices + blueprint_id

const CT_HOST = 'https://api.cardtrader.com';

function authHeader() {
  return { 'Authorization': `Bearer ${process.env.CARDTRADER_TOKEN}` };
}

async function searchBlueprints(name) {
  // Try name search endpoint — returns array of matching blueprints
  const res = await fetch(
    `${CT_HOST}/api/v2/blueprints/export?name=${encodeURIComponent(name)}`,
    { headers: authHeader() }
  );
  if (!res.ok) throw new Error(`CT blueprint search ${res.status}`);
  const data = await res.json();
  // Response may be array directly or wrapped
  return Array.isArray(data) ? data : (data.blueprints || []);
}

async function getMarketplaceProducts(blueprintId) {
  const res = await fetch(
    `${CT_HOST}/api/v2/marketplace/products?blueprint_id=${blueprintId}`,
    { headers: authHeader() }
  );
  if (!res.ok) throw new Error(`CT marketplace ${res.status}`);
  const data = await res.json();
  // Products may be at data directly (array) or data.products
  return Array.isArray(data) ? data : (data.products || []);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = process.env.CARDTRADER_TOKEN;
  if (!token) return res.status(200).json(null); // CT not configured — silently skip

  const { playerName, fullCardName, parallel } = req.body || {};
  if (!playerName) return res.status(400).json({ error: 'playerName required' });

  // Build search query: prefer specific (player + set + parallel), fall back to player only
  const queries = [
    [playerName, fullCardName, parallel && parallel !== 'Base' ? parallel : ''].filter(Boolean).join(' ').trim(),
    playerName.trim(),
  ];

  try {
    let blueprints = [];
    for (const q of queries) {
      blueprints = await searchBlueprints(q);
      if (blueprints.length > 0) break;
    }

    if (blueprints.length === 0) return res.status(200).json(null);

    // Pick best match — prefer exact name match, otherwise first result
    const nameLower = playerName.toLowerCase();
    const best = blueprints.find(b =>
      (b.name || b.card_name || '').toLowerCase().includes(nameLower)
    ) || blueprints[0];

    const products = await getMarketplaceProducts(best.id);
    if (!products.length) return res.status(200).json(null);

    // Normalise product shape
    const listings = products
      .filter(p => p.price_cents || p.price?.cents)
      .map(p => {
        const cents = p.price_cents ?? p.price?.cents ?? 0;
        return {
          id: p.id,
          sellerName: p.user?.username || p.seller?.username || '',
          condition: p.properties?.condition || p.condition || 'Unknown',
          price: cents / 100,
          currency: p.price_currency || p.price?.currency || 'EUR',
          quantity: p.quantity || 1,
          url: `https://www.cardtrader.com/cards/${best.id}`,
        };
      })
      .sort((a, b) => a.price - b.price)
      .slice(0, 10);

    if (!listings.length) return res.status(200).json(null);

    const avg = listings.reduce((s, l) => s + l.price, 0) / listings.length;
    return res.status(200).json({
      listings,
      avg: Math.round(avg * 100) / 100,
      currency: listings[0].currency,
      blueprint: { id: best.id, name: best.name || best.card_name || playerName },
    });
  } catch (err) {
    console.error('CardTrader prices error:', err);
    return res.status(200).json(null); // fail silently — CT is supplementary
  }
}
