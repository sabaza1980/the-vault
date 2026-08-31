/**
 * /api/ebay-value
 *
 * Estimated value of a single card from eBay sold listings.
 *
 * POST body:
 *   {
 *     playerName, year, brand, series, parallel, cardNumber, fullCardName,
 *     graded?: boolean, grader?: "PSA", grade?: "10", certNumber?: "12345678",
 *     condition?: "Near Mint",            // ungraded cards
 *     marketplaceId?: "EBAY_US",
 *     categoryIds?: "261328",
 *     includeComps?: boolean,             // default true
 *     includeConditionDescriptors?: boolean
 *   }
 *
 * Rules:
 *   >= 5 sold  -> average of the 5 most recent
 *    1-4 sold  -> the most recent sale price
 *      0 sold  -> value: null (unknown / blank, never 0)
 *
 * Always responds 200 with a structured body. `value` is the single number the
 * app should display; `unavailable` explains a null when the cause was not
 * simply "no comps".
 */

import { valueCard } from './_ebay/soldComps.js';
import { buildConditionDescriptors, CATEGORY } from './_ebay/conditions.js';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// Small in-process cache. Vercel keeps warm instances alive between requests, so
// this absorbs the repeat lookups that happen when a user scrolls a collection.
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 500;
const cache = new Map();

function cacheKey(card, marketplaceId) {
  return JSON.stringify([
    marketplaceId,
    card.playerName, card.year, card.brand, card.series,
    card.parallel, card.cardNumber,
    card.graded ? 1 : 0, card.grader, card.grade, card.condition,
  ]).toLowerCase();
}

function readCache(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) { cache.delete(key); return null; }
  return hit.payload;
}

function writeCache(key, payload) {
  // Do not cache transient failures — only real answers (including "no comps").
  if (payload.unavailable && payload.unavailable !== 'NO_MARKETPLACE_INSIGHTS_ACCESS') return;
  if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
  cache.set(key, { at: Date.now(), payload });
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body || {};
  const {
    playerName, year, brand, series, parallel, cardNumber, fullCardName,
    graded, grader, grade, certNumber, condition,
    marketplaceId = 'EBAY_US',
    categoryIds,
    includeComps = true,
    includeConditionDescriptors = false,
  } = body;

  if (!playerName && !fullCardName) {
    return res.status(400).json({ error: 'playerName or fullCardName required' });
  }

  const card = {
    playerName: playerName || fullCardName,
    year, brand, series, parallel, cardNumber,
    graded: graded ?? Boolean(grader && grade),
    grader, grade, certNumber, condition,
  };

  const key = cacheKey(card, marketplaceId);
  const cached = readCache(key);
  if (cached) {
    return res.status(200).json({ ...cached, cached: true });
  }

  let result;
  try {
    result = await valueCard(card, { marketplaceId, categoryIds });
  } catch (err) {
    // valueCard is written not to throw; this is belt-and-braces so the app
    // never sees a 500 on a pricing call.
    console.error('[ebay-value] unexpected error:', err);
    return res.status(200).json({
      value: null, currency: null, method: null, sampleSize: 0, itemIds: [], comps: [],
      priceSource: 'eBay sold', unavailable: 'UPSTREAM_ERROR', note: err.message,
      asOf: new Date().toISOString(),
    });
  }

  // Optional: the eBay condition descriptor IDs for this card, so the listing
  // flow and the valuation flow agree on how the card is described.
  if (includeConditionDescriptors) {
    try {
      result.conditionDescriptors = await buildConditionDescriptors(
        card,
        categoryIds || CATEGORY.SPORTS_SINGLES,
        marketplaceId
      );
    } catch (err) {
      console.error('[ebay-value] condition descriptors failed:', err.message);
      result.conditionDescriptors = { error: err.message };
    }
  }

  if (!includeComps) delete result.comps;

  writeCache(key, result);
  return res.status(200).json(result);
}
