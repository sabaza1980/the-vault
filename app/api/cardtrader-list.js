// CardTrader listing endpoint
// Lists a single card for sale using the user's personal CardTrader API token.
// The token is passed from the client (never stored server-side).
// POST body: { ctToken, blueprint_id, price, quantity, condition, description }

const CT_HOST = 'https://api.cardtrader.com';

// Map our condition labels to CardTrader's accepted condition property values
const CONDITION_MAP = {
  'Mint':       'Mint',
  'Near Mint':  'Near Mint',
  'Excellent':  'Excellent',
  'Good':       'Good',
  'Fair':       'Fair',
  'Poor':       'Poor',
  'Unknown':    'Good', // safe fallback
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { ctToken, blueprint_id, price, quantity = 1, condition, description } = req.body || {};

  if (!ctToken)      return res.status(400).json({ error: 'ctToken required' });
  if (!blueprint_id) return res.status(400).json({ error: 'blueprint_id required' });
  if (!price || parseFloat(price) <= 0) return res.status(400).json({ error: 'Valid price required' });

  const body = {
    blueprint_id: Number(blueprint_id),
    price: parseFloat(parseFloat(price).toFixed(2)),
    quantity: Number(quantity) || 1,
    error_mode: 'strict',
    properties: {
      condition: CONDITION_MAP[condition] || 'Good',
    },
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

    // data is the created product object
    return res.status(200).json({
      id: data.id,
      url: `https://www.cardtrader.com/cards/${blueprint_id}`,
    });
  } catch (err) {
    console.error('CardTrader list error:', err);
    return res.status(500).json({ error: err.message });
  }
}
