/**
 * /api/cardtrader.js
 * Combined CardTrader endpoint.
 * POST { action: 'prices', playerName, fullCardName?, parallel? }
 *   — blueprint search + marketplace price lookup (uses server CARDTRADER_TOKEN)
 * POST { action: 'list', ctToken, blueprint_id, price, quantity?, condition, description? }
 *   — list a card for sale using the user's personal CT token
 */

const CT_HOST = 'https://api.cardtrader.com';

// ── Prices ────────────────────────────────────────────────────────────────

function appAuthHeader() {
  return { 'Authorization': `Bearer ${process.env.CARDTRADER_TOKEN}` };
}

async function searchBlueprints(name) {
  const res = await fetch(
    `${CT_HOST}/api/v2/blueprints/export?name=${encodeURIComponent(name)}`,
    { headers: appAuthHeader() }
  );
  if (!res.ok) throw new Error(`CT blueprint search ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : (data.blueprints || []);
}

async function getMarketplaceProducts(blueprintId) {
  const res = await fetch(
    `${CT_HOST}/api/v2/marketplace/products?blueprint_id=${blueprintId}`,
    { headers: appAuthHeader() }
  );
  if (!res.ok) throw new Error(`CT marketplace ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : (data.products || []);
}

async function handlePrices(req, res) {
  const appToken = process.env.CARDTRADER_TOKEN;
  if (!appToken) return res.status(200).json(null);

  const { playerName, fullCardName, parallel } = req.body;
  if (!playerName) return res.status(400).json({ error: 'playerName required' });

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
    if (!blueprints.length) return res.status(200).json(null);

    const nameLower = playerName.toLowerCase();
    const best = blueprints.find(b =>
      (b.name || b.card_name || '').toLowerCase().includes(nameLower)
    ) || blueprints[0];

    const products = await getMarketplaceProducts(best.id);
    if (!products.length) return res.status(200).json(null);

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
    return res.status(200).json(null);
  }
}

// ── List ──────────────────────────────────────────────────────────────────

const CONDITION_MAP = {
  'Mint': 'Mint', 'Near Mint': 'Near Mint', 'Excellent': 'Excellent',
  'Good': 'Good', 'Fair': 'Fair', 'Poor': 'Poor', 'Unknown': 'Good',
};

async function handleList(req, res) {
  const { ctToken, blueprint_id, price, quantity = 1, condition, description } = req.body;

  if (!ctToken)      return res.status(400).json({ error: 'ctToken required' });
  if (!blueprint_id) return res.status(400).json({ error: 'blueprint_id required' });
  if (!price || parseFloat(price) <= 0) return res.status(400).json({ error: 'Valid price required' });

  const body = {
    blueprint_id: Number(blueprint_id),
    price: parseFloat(parseFloat(price).toFixed(2)),
    quantity: Number(quantity) || 1,
    error_mode: 'strict',
    properties: { condition: CONDITION_MAP[condition] || 'Good' },
  };
  if (description) body.description = String(description).slice(0, 500);

  try {
    const ctRes = await fetch(`${CT_HOST}/api/v2/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ctToken}`,
      },
      body: JSON.stringify(body),
    });

    const data = await ctRes.json();
    if (!ctRes.ok) {
      const msg = data?.error || data?.message || JSON.stringify(data);
      return res.status(ctRes.status).json({ error: msg });
    }

    return res.status(200).json({
      id: data.id,
      url: `https://www.cardtrader.com/cards/${blueprint_id}`,
    });
  } catch (err) {
    console.error('CardTrader list error:', err);
    return res.status(500).json({ error: err.message });
  }
}

// ── Router ────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { action } = req.body ?? {};
  if (action === 'prices') return handlePrices(req, res);
  if (action === 'list')   return handleList(req, res);
  return res.status(400).json({ error: 'action must be "prices" or "list"' });
}
