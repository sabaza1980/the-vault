// Server-side proxy for Ximilar Collectibles Recognition (WP-5a).
//
// Image -> structured card identity (set, set_code, series, card_number, year,
// rarity, full_name) so we STOP hallucinating set/serial/year. This becomes the
// ground truth fed into pricing (WP-5b). Claude stays for the "About this card"
// narrative + condition assessment + non-card fallback.
//
// Docs: https://docs.ximilar.com/collectibles/recognition
// Auth: header  Authorization: Token <XIMILAR_API_KEY>   (get token at app.ximilar.com)
//
// Required env var:
//   XIMILAR_API_KEY  — Ximilar API token (server-side only)

const XIMILAR_BASE = 'https://api.ximilar.com/collectibles/v2';

// Map a coarse hint to the right endpoint. "analyze" is the all-in-one detector+
// identifier — safest default when we don't yet know what the item is.
const ENDPOINTS = {
  sport: 'sport_id',
  tcg: 'tcg_id',
  comics: 'comics_id',
  slab: 'slab_id',
  analyze: 'analyze',
};

// Pull the first identified card object out of Ximilar's nested response and
// flatten the bits we care about. Defensive: response shape varies by endpoint.
function normalize(data) {
  const rec = data?.records?.[0];
  const objects = rec?._objects || [];
  // Prefer a "Card" object that carries an identification; else first with best_match.
  const cardObj =
    objects.find(o => o?._identification?.best_match && /card/i.test(o?.name || '')) ||
    objects.find(o => o?._identification?.best_match) ||
    null;

  const best = cardObj?._identification?.best_match || null;
  const tags = cardObj?._tags_simple || [];
  if (!best) return { found: false, raw: data };

  return {
    found: true,
    confidence: cardObj?.prob ?? null,          // 0..1 detection confidence
    subcategory: best.subcategory ?? null,       // e.g. "Basketball", "Pokemon"
    side: tags.includes('back') ? 'back' : 'front',
    identity: {
      name: best.name ?? null,                   // player / character
      fullName: best.full_name ?? null,
      set: best.set ?? null,
      setCode: best.set_code ?? null,
      series: best.series ?? null,
      cardNumber: best.card_number ?? null,
      year: best.year ?? null,
      rarity: best.rarity ?? null,
      subcategory: best.subcategory ?? null,
    },
    priceStats: best.price_stats ?? null,        // overall/graded/ungraded min/max/mean (if requested)
    links: best.links ?? null,
    raw: data,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = process.env.XIMILAR_API_KEY;
  if (!token) return res.status(500).json({ error: 'XIMILAR_API_KEY not configured' });

  const { base64, imageUrl, hint, graded = false, priceStats = true } = req.body || {};
  if (!base64 && !imageUrl) return res.status(400).json({ error: 'Provide base64 or imageUrl' });

  const endpoint = ENDPOINTS[hint] || ENDPOINTS.analyze;
  const record = imageUrl ? { _url: imageUrl } : { _base64: base64 };

  try {
    const upstream = await fetch(`${XIMILAR_BASE}/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${token}`,
      },
      body: JSON.stringify({
        records: [record],
        rotate: true,            // auto-correct card rotation before ID
        price_stats: !!priceStats,
        slab_id: !!graded,       // analyze the slab label when the card looks graded
        slab_grade: !!graded,
      }),
    });

    const data = await upstream.json();
    if (!upstream.ok) {
      console.error('[ximilar] error:', upstream.status, data?.status || data);
      return res.status(200).json({ found: false, error: `Ximilar ${upstream.status}`, raw: data });
    }
    return res.status(200).json(normalize(data));
  } catch (e) {
    console.error('[ximilar] fetch error:', e);
    return res.status(200).json({ found: false, error: e.message });
  }
}
