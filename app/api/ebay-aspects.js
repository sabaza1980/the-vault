/**
 * GET /api/ebay-aspects?categoryId=183050
 * Returns the required item aspects and their valid values for an eBay category
 * using the Taxonomy API with a client-credentials app token.
 *
 * Visit in browser: https://app.myvaults.io/api/ebay-aspects?categoryId=183050
 */
export default async function handler(req, res) {
  const clientId     = process.env.VITE_EBAY_CLIENT_ID;
  const clientSecret = process.env.VITE_EBAY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: 'Missing VITE_EBAY_CLIENT_ID or VITE_EBAY_CLIENT_SECRET' });
  }

  // Get an app-level token via client credentials grant
  const tokenRes = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/x-www-form-urlencoded',
      'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope',
  });

  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    return res.status(500).json({ error: 'Failed to get app token', details: tokenData });
  }

  const categoryId = req.query.categoryId || '183050';

  // Call Taxonomy API for category aspects (tree 0 = eBay US)
  const aspectRes = await fetch(
    `https://api.ebay.com/commerce/taxonomy/v1/category_tree/0/get_item_aspects_for_category?category_id=${categoryId}`,
    {
      headers: {
        'Authorization':          `Bearer ${tokenData.access_token}`,
        'Accept':                 'application/json',
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
      },
    }
  );

  const aspectData = await aspectRes.json();

  if (!aspectRes.ok) {
    return res.status(aspectRes.status).json({ error: 'Taxonomy API error', details: aspectData });
  }

  // Return required aspects plus any aspect whose name contains "Condition"
  const aspects = (aspectData.aspects || [])
    .filter(a => a.aspectConstraint?.aspectRequired || (a.localizedAspectName || '').toLowerCase().includes('condition'))
    .map(a => ({
      name:     a.localizedAspectName,
      required: !!a.aspectConstraint?.aspectRequired,
      values:   (a.aspectValues || []).map(v => v.localizedValue),
    }));

  return res.json({ categoryId, aspects });
}
