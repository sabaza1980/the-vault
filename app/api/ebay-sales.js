/**
 * /api/ebay-sales  (compatibility shim)
 *
 * The Finding API path this endpoint used (findCompletedItems with
 * SoldItemsOnly) was decommissioned by eBay on 4 Feb 2025, and the Browse
 * fallback returned ASKING prices for active listings, which is not a valuation.
 *
 * It now delegates to the sold-comp engine behind /api/ebay-value and maps the
 * result onto the old response shape so existing callers keep working. New code
 * should call /api/ebay-value directly.
 */

import { valueCard } from './_ebay/soldComps.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { playerName, fullCardName, parallel, year, brand, series, cardNumber,
          graded, grader, grade, condition, marketplaceId = 'EBAY_US' } = req.body || {};
  if (!playerName && !fullCardName) return res.status(400).json({ error: 'playerName required' });

  const result = await valueCard(
    { playerName: playerName || fullCardName, fullCardName, parallel, year, brand, series,
      cardNumber, graded, grader, grade, condition },
    { marketplaceId }
  );

  // Old contract: null when there is nothing to show; callers check `data.avg`.
  if (result.value == null) {
    return res.status(200).json(null);
  }

  return res.status(200).json({
    avg: result.value,
    value: result.value,
    currency: result.currency,
    source: 'sold',
    method: result.method,
    itemIds: result.itemIds,
    sales: (result.comps || []).map((c) => ({
      title: c.title, price: c.price, currency: c.currency,
      url: c.url, date: c.soldDate, itemId: c.itemId,
    })),
    asOf: result.asOf,
    priceSource: 'eBay sold',
  });
}
