/**
 * /api/ebay-policies.js
 * Fetches the seller's eBay account policies (fulfillment, payment, return)
 * and ensures at least one merchant location exists, creating a default if needed.
 *
 * Called once after the user grants OAuth consent. Results are cached in Firestore
 * so this only needs to run when re-connecting.
 */

const API = 'https://api.ebay.com';

// Fetch seller's marketplace dynamically from eBay identity API
async function getSellerMarketplace(accessToken) {
  try {
    const res  = await fetch(`${API}/commerce/identity/v1/user/`, {
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    });
    const data = await res.json();
    const marketplace = data.registrationMarketplaceId || 'EBAY_US';
    const account     = data.individualAccount || data.businessAccount || {};
    const country     = account.primaryAddress?.country || marketplace.replace(/^EBAY_/, '') || 'US';
    return { marketplace, country };
  } catch (e) {
    return { marketplace: 'EBAY_US', country: 'US' };
  }
}

const EBAY_HEADERS = (accessToken, marketplace) => ({
  'Authorization':           `Bearer ${accessToken}`,
  'X-EBAY-C-MARKETPLACE-ID': marketplace,
  'Content-Type':            'application/json',
  'Accept-Language':         'en-US',
  'Content-Language':        'en-US',
});

async function ebayGet(path, accessToken, marketplace) {
  const res = await fetch(`${API}${path}`, {
    headers: EBAY_HEADERS(accessToken, marketplace),
  });
  return { status: res.status, data: await res.json() };
}

async function ebayPost(path, accessToken, marketplace, body) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: EBAY_HEADERS(accessToken, marketplace),
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

async function ebayPut(path, accessToken, body) {
  // Location endpoint uses minimal headers — no marketplace or language headers
  const res = await fetch(`${API}${path}`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, ok: res.ok, data };
}
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { accessToken } = req.body ?? {};
  if (!accessToken) return res.status(400).json({ error: 'accessToken is required' });

  try {
    const { marketplace, country } = await getSellerMarketplace(accessToken);

    // Fetch all three policy types in parallel
    const [fulfillmentRes, paymentRes, returnRes, locationRes] = await Promise.all([
      ebayGet(`/sell/account/v1/fulfillment_policy?marketplace_id=${marketplace}`, accessToken, marketplace),
      ebayGet(`/sell/account/v1/payment_policy?marketplace_id=${marketplace}`,    accessToken, marketplace),
      ebayGet(`/sell/account/v1/return_policy?marketplace_id=${marketplace}`,     accessToken, marketplace),
      ebayGet('/sell/inventory/v1/location', accessToken, marketplace),
    ]);

    const fulfillmentPolicies = fulfillmentRes.data.fulfillmentPolicies || [];
    const paymentPolicies     = paymentRes.data.paymentPolicies         || [];
    const returnPolicies      = returnRes.data.returnPolicies           || [];
    const locations           = locationRes.data.locations              || [];

    // Pick the first (default) policy of each type
    const fulfillmentPolicyId = fulfillmentPolicies[0]?.fulfillmentPolicyId || null;
    const paymentPolicyId     = paymentPolicies[0]?.paymentPolicyId         || null;
    const returnPolicyId      = returnPolicies[0]?.returnPolicyId           || null;

    // Try to create a default location; silently ignore failures — some account types
    // don't support location creation via API. merchantLocationKey is optional.
    let merchantLocationKey = locations[0]?.merchantLocationKey || null;
    let locationError = null;
    console.log('Location fetch result:', locationRes.status, JSON.stringify(locationRes.data));
    if (!merchantLocationKey) {
      const key = 'vaultdefault';
      const createRes = await ebayPut(`/sell/inventory/v1/location/${key}`, accessToken, {
        location: { address: { country } }, name: 'The Vault',
      });
      console.log('location create:', createRes.status, JSON.stringify(createRes.data));
      if (createRes.ok || createRes.status === 204 || createRes.status === 409) {
        merchantLocationKey = key;
      } else {
        locationError = { status: createRes.status, body: createRes.data };
      }
    }

    // Build a human-readable list of what's missing so the UI can show a clear error
    const missing = [];
    if (!fulfillmentPolicyId) missing.push('shipping policy');
    if (!paymentPolicyId)     missing.push('payment policy');
    if (!returnPolicyId)      missing.push('return policy');

    return res.json({
      fulfillmentPolicyId,
      paymentPolicyId,
      returnPolicyId,
      merchantLocationKey,
      missingPolicies: missing.length > 0 ? missing : null,
      locationError,
    });
  } catch (err) {
    console.error('ebay-policies error:', err);
    return res.status(500).json({ error: err.message });
  }
}
