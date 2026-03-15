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
    const account = data.individualAccount || data.businessAccount || {};
    return account.registrationMarketplaceId || data.registrationMarketplaceId || 'EBAY_US';
  } catch (e) {
    return 'EBAY_US';
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
  return { status: res.status, ok: res.ok };
}
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { accessToken } = req.body ?? {};
  if (!accessToken) return res.status(400).json({ error: 'accessToken is required' });

  try {
    const marketplace = await getSellerMarketplace(accessToken);
    const country     = marketplace.replace('EBAY_', '') || 'US';

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

    // Ensure a merchant location exists; create a minimal one if not
    let merchantLocationKey = locations[0]?.merchantLocationKey || null;
    if (!merchantLocationKey) {
      const key = 'vaultdefault';
      const createRes = await ebayPut(`/sell/inventory/v1/location/${key}`, accessToken, {
        location: { address: { country } },
        name:     'The Vault',
      });
      // Accept success or already-exists; if it fails still proceed — listing will retry
      if (createRes.ok || createRes.status === 204 || createRes.status === 409) {
        merchantLocationKey = key;
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
    });
  } catch (err) {
    console.error('ebay-policies error:', err);
    return res.status(500).json({ error: err.message });
  }
}
