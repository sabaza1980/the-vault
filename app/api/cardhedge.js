// Server-side proxy for Card Hedge API (avoids CORS restrictions)
const CARDHEDGE_BASE = 'https://api.cardhedger.com';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.CARDHEDGE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'CARDHEDGE_API_KEY not configured' });
  }

  const { playerName, year, brand, series, parallel, cardCategory, isRookie } = req.body;

  const categoryMap = {
    'Panini': 'Basketball', 'Topps': 'Baseball', 'Bowman': 'Baseball',
    'Upper Deck': 'Hockey', 'Pokemon': 'Pokemon', 'Pokémon': 'Pokemon',
    'Magic': 'Magic The Gathering', 'Yu-Gi-Oh': 'Yu-Gi-Oh', 'One Piece': 'One Piece'
  };
  const category = cardCategory || categoryMap[brand] || 'Basketball';

  const searchQuery = [playerName, year, brand, series, parallel && parallel !== 'Base' ? parallel : null]
    .filter(Boolean).join(' ');

  try {
    // Step 1: Search for card
    const searchRes = await fetch(`${CARDHEDGE_BASE}/v1/cards/card-search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: JSON.stringify({ search: searchQuery, category, rookie: isRookie || false, page: 1, page_size: 5 })
    });

    if (!searchRes.ok) {
      const text = await searchRes.text();
      console.error('[cardhedge api] search failed:', searchRes.status, text);
      return res.status(200).json(null);
    }

    const searchData = await searchRes.json();
    const results = searchData?.results || searchData?.data || searchData?.cards || [];

    if (!results.length) {
      console.log('[cardhedge api] no results for:', searchQuery);
      return res.status(200).json(null);
    }

    const topCard = results[0];
    const cardId = topCard.id || topCard.card_id;

    // Step 2: Get price history
    const priceRes = await fetch(`${CARDHEDGE_BASE}/v1/cards/${cardId}/price-history`, {
      headers: { 'X-API-Key': apiKey }
    });

    if (!priceRes.ok) {
      console.error('[cardhedge api] price fetch failed:', priceRes.status);
      return res.status(200).json(null);
    }

    const priceData = await priceRes.json();

    return res.status(200).json({
      matchedCard: topCard.name || topCard.card_name || topCard.title,
      matchedImage: topCard.image_url || topCard.image,
      rawPrice: priceData.raw_price ?? priceData.prices?.raw ?? priceData.ungraded ?? null,
      psa9Price: priceData.psa9_price ?? priceData.prices?.psa9 ?? priceData.psa_9 ?? null,
      psa10Price: priceData.psa10_price ?? priceData.prices?.psa10 ?? priceData.psa_10 ?? null,
      sevenDaySales: priceData.seven_day_sales ?? priceData.sales_velocity?.seven_day ?? priceData.sales_7d ?? null,
      thirtyDaySales: priceData.thirty_day_sales ?? priceData.sales_velocity?.thirty_day ?? priceData.sales_30d ?? null,
      gain: priceData.weekly_gain ?? priceData.price_trend?.weekly ?? priceData.gain_7d ?? null,
      cardId,
      isRookie: topCard.is_rookie || topCard.rookie,
      priceSource: 'Card Hedge',
      _debug: { searchQuery, category, resultsCount: results.length }
    });

  } catch (e) {
    console.error('[cardhedge api] error:', e);
    return res.status(200).json(null);
  }
}
