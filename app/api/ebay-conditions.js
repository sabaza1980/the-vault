/**
 * /api/ebay-conditions
 *
 * Live eBay condition descriptors for a card category, from the Metadata API's
 * getItemConditionPolicies. Use this to populate grader / grade / card-condition
 * dropdowns instead of hardcoding IDs — eBay adds graders regularly.
 *
 * GET  /api/ebay-conditions?categoryId=261328&marketplaceId=EBAY_US
 * POST { card: {...}, categoryId, marketplaceId }  -> resolved descriptors + XML
 */

import { getCardConditionOptions, buildConditionDescriptors, buildConditionDescriptorsXml, CATEGORY } from './_ebay/conditions.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const src = req.method === 'POST' ? (req.body || {}) : (req.query || {});
  const categoryId = src.categoryId || CATEGORY.SPORTS_SINGLES;
  const marketplaceId = src.marketplaceId || 'EBAY_US';

  try {
    if (req.method === 'POST' && src.card) {
      const resolved = await buildConditionDescriptors(src.card, categoryId, marketplaceId);
      return res.status(200).json({ ...resolved, xml: buildConditionDescriptorsXml(resolved.descriptors) });
    }
    const options = await getCardConditionOptions(categoryId, marketplaceId);
    return res.status(200).json(options);
  } catch (err) {
    console.error('[ebay-conditions]', err);
    return res.status(200).json({ error: err.message, categoryId, marketplaceId });
  }
}
