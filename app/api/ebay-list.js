/**
 * /api/ebay-list.js
 * Creates and publishes an eBay listing for one card or a bundle of cards.
 *
 * Flow:
 *   1. Build SKU (vault-{cardId} or vault-bundle-{timestamp})
 *   2. PUT /sell/inventory/v1/inventory_item/{sku}   — create/update inventory item
 *   3. POST /sell/inventory/v1/offer                 — create offer
 *   4. POST /sell/inventory/v1/offer/{offerId}/publish — go live
 *
 * The calling client is responsible for passing a valid (non-expired) access token
 * along with the seller's policy IDs (obtained via /api/ebay-policies).
 */

const API = 'https://api.ebay.com';
const MARKETPLACE  = 'EBAY_US';
const CATEGORY_ID  = '183050'; // Sports Trading Cards
const LISTING_DURATION = 'GTC'; // Good Till Cancelled

// Map our card condition strings to eBay's condition enum
// FOR_PARTS_OR_NOT_WORKING is not valid for sports trading cards
const CONDITION_MAP = {
  Mint:       'LIKE_NEW',
  'Near Mint':'USED_EXCELLENT',
  Excellent:  'USED_VERY_GOOD',
  Good:       'USED_GOOD',
  Fair:       'USED_ACCEPTABLE',
  Poor:       'USED_ACCEPTABLE',
  Unknown:    'USED_GOOD',
};

function authHeaders(accessToken) {
  return {
    'Authorization':           `Bearer ${accessToken}`,
    'X-EBAY-C-MARKETPLACE-ID': MARKETPLACE,
    'Content-Type':            'application/json',
    'Accept-Language':         'en-US',
    'Content-Language':        'en-US',
  };
}

// Build an HTML listing description from card data
function buildDescription(cards, extraNotes) {
  const note = extraNotes ? `<p>${extraNotes}</p>` : '';
  const footer = '<p style="font-size:11px;color:#888;margin-top:16px;">Listed via The Vault card collection manager.</p>';

  if (cards.length === 1) {
    const c = cards[0];
    const rows = [
      ['Player',    c.playerName],
      ['Team',      c.team],
      ['Year',      c.year],
      ['Brand',     c.brand],
      ['Set',       c.series],
      c.parallel && c.parallel !== 'Base' ? ['Parallel', c.parallel] : null,
      c.cardNumber   ? ['Card #',    c.cardNumber]   : null,
      c.serialNumber ? ['Serial #',  c.serialNumber] : null,
      c.hasAutograph ? ['Autograph', c.autographType || 'Yes'] : null,
      c.isRookie     ? ['Note',      'Rookie Card']  : null,
      ['Condition',  c.condition || 'Used'],
    ].filter(Boolean);

    const table = rows.map(([k, v]) =>
      `<tr><td style="padding:4px 12px 4px 0;color:#888;font-size:13px;">${k}</td><td style="padding:4px 0;font-size:13px;">${v}</td></tr>`
    ).join('');

    return `<h2 style="font-size:16px;margin-bottom:12px;">${c.playerName} — ${c.fullCardName || c.series || ''}</h2><table>${table}</table>${note}${footer}`;
  }

  const listItems = cards.map(c => {
    const flags = [
      c.parallel && c.parallel !== 'Base' ? c.parallel : null,
      c.serialNumber ? `S/N ${c.serialNumber}` : null,
      c.hasAutograph ? 'Auto' : null,
      c.isRookie     ? 'RC'   : null,
    ].filter(Boolean).join(' · ');
    return `<li style="margin-bottom:6px;font-size:13px;"><strong>${c.playerName}</strong> — ${c.fullCardName || c.series || 'Unknown Set'}${flags ? ` <span style="color:#888;">(${flags})</span>` : ''}</li>`;
  }).join('');

  return `<h2 style="font-size:16px;margin-bottom:12px;">Basketball Card Bundle — ${cards.length} cards</h2><ul style="padding-left:18px;">${listItems}</ul>${note}${footer}`;
}

// Only include HTTPS image URLs that eBay's servers can fetch without auth.
// Firebase Storage URLs require a download token and are publicly accessible,
// but firebasestorage.googleapis.com URLs can be slow for eBay to fetch — skip them
// and only send other CDN/static URLs.
function getImageUrls(cards) {
  const urls = [];
  for (const c of cards) {
    const front = c.imageUrl;
    const back  = c.backImageUrl;
    // Accept any https URL that isn't a Firebase Storage or data URL
    if (front?.startsWith('https://') && !front.includes('firebasestorage.googleapis.com')) urls.push(front);
    if (back?.startsWith('https://')  && !back.includes('firebasestorage.googleapis.com'))  urls.push(back);
    if (urls.length >= 12) break; // eBay max
  }
  return urls;
}

// Truncate title to eBay's 80-char limit, preserving whole words
function truncateTitle(title) {
  if (title.length <= 80) return title;
  return title.slice(0, 79).replace(/\s+\S*$/, '').slice(0, 80);
}

export const config = {
  api: { bodyParser: { sizeLimit: '32kb' } },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    cards,
    title,
    price,
    condition,
    conditionDescription,
    accessToken,
    fulfillmentPolicyId,
    paymentPolicyId,
    returnPolicyId,
    merchantLocationKey,
  } = req.body ?? {};

  // Validate required fields
  if (!Array.isArray(cards) || cards.length === 0) return res.status(400).json({ error: 'cards array is required' });
  if (!title?.trim())               return res.status(400).json({ error: 'title is required' });
  if (!price || price <= 0)         return res.status(400).json({ error: 'price must be greater than 0' });
  if (!accessToken)                 return res.status(400).json({ error: 'accessToken is required' });
  if (!fulfillmentPolicyId || !paymentPolicyId || !returnPolicyId) {
    return res.status(400).json({ error: 'All three eBay seller policies are required. Please set up shipping, payment, and return policies on eBay.' });
  }

  const isBundle = cards.length > 1;
  const sku = isBundle
    ? `vault-bundle-${Date.now()}`
    : `vault-${cards[0].id}`;

  const ebayCondition = CONDITION_MAP[condition] || CONDITION_MAP[cards[0]?.condition] || 'USED_GOOD';
  const imageUrls     = getImageUrls(cards);
  const description   = buildDescription(cards, conditionDescription);
  const cleanTitle    = truncateTitle(title.trim());

  const headers = authHeaders(accessToken);

  // Build item aspects — only use well-known eBay aspect names for category 183050.
  // Avoid sending aspects with unknown/arbitrary values as eBay may reject them.
  function buildAspects(cards) {
    const c = cards[0];
    const aspects = {};
    if (c.playerName)                        aspects['Player/Athlete']    = [String(c.playerName)];
    if (c.year)                              aspects['Season']            = [String(c.year)];
    if (c.brand)                             aspects['Card Manufacturer'] = [String(c.brand)];
    if (c.series)                            aspects['Set']               = [String(c.series)];
    if (c.cardNumber)                        aspects['Card Number']       = [String(c.cardNumber)];
    if (c.parallel && c.parallel !== 'Base') aspects['Parallel/Variety']  = [String(c.parallel)];
    if (c.hasAutograph)                      aspects['Autograph']         = ['Yes'];
    if (c.isRookie)                          aspects['Rookie']            = ['Yes'];
    aspects['Sport'] = ['Basketball'];
    return aspects;
  }

  try {
    // ── Step 1: Create / update inventory item ───────────────────────────────
    const inventoryBody = {
      availability: { shipToLocationAvailability: { quantity: 1 } },
      condition: ebayCondition,
      ...(conditionDescription ? { conditionDescription } : {}),
      product: {
        title:       cleanTitle,
        description: description,
        aspects:     buildAspects(cards),
        ...(imageUrls.length > 0 ? { imageUrls } : {}),
      },
    };

    const inventoryRes = await fetch(`${API}/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, {
      method:  'PUT',
      headers,
      body:    JSON.stringify(inventoryBody),
    });

    // 204 = created, 200 = updated — both are OK
    if (inventoryRes.status !== 200 && inventoryRes.status !== 204) {
      const rawText = await inventoryRes.text();
      console.error('eBay inventory PUT body sent:', JSON.stringify(inventoryBody, null, 2));
      console.error('eBay inventory error response:', rawText);
      // Return the raw eBay response verbatim so the client can display it
      return res.status(inventoryRes.status).json({
        error: `eBay said: ${rawText}`,
        sentBody: inventoryBody,
      });
    }

    // ── Step 2: Resolve merchant location key ────────────────────────────────
    // merchantLocationKey tells eBay where the item is located (determines country).
    // If not already saved, try to fetch existing locations, then try to create one.
    // If creation is not permitted for this account type, omit the key entirely —
    // eBay will fall back to the seller's registered account address.
    let locationKey = merchantLocationKey || null;
    if (!locationKey) {
      const locRes  = await fetch(`${API}/sell/inventory/v1/location`, { headers });
      const locData = await locRes.json().catch(() => ({}));
      console.log('eBay locations fetch:', locRes.status, JSON.stringify(locData));
      locationKey = locData.locations?.[0]?.merchantLocationKey || null;
    }
    if (!locationKey) {
      const key       = 'vaultdefault';
      const createRes = await fetch(`${API}/sell/inventory/v1/location/${key}`, {
        method: 'PUT',
        headers,
        body:   JSON.stringify({ location: { address: { country: 'US' } }, name: 'The Vault' }),
      });
      const createText = await createRes.text();
      console.log('eBay location create:', createRes.status, createText);
      if (createRes.ok || createRes.status === 204 || createRes.status === 409) {
        locationKey = key;
      } else {
        // Can't create a location (ACCESS 2004) — omit from offer so eBay uses
        // the seller's account-registered address instead.
        console.warn('Location creation not permitted; omitting merchantLocationKey from offer.');
        locationKey = null;
      }
    }

    // ── Step 3: Create offer ─────────────────────────────────────────────────
    const offerBody = {
      sku,
      marketplaceId:    MARKETPLACE,
      format:            'FIXED_PRICE',
      availableQuantity: 1,
      categoryId:        CATEGORY_ID,
      listingDescription: description,
      listingDuration:    LISTING_DURATION,
      listingPolicies: {
        fulfillmentPolicyId,
        paymentPolicyId,
        returnPolicyId,
      },
      pricingSummary: {
        price: { currency: 'USD', value: price.toFixed(2) },
      },
      ...(locationKey ? { merchantLocationKey: locationKey } : {}),
    };

    const offerRes  = await fetch(`${API}/sell/inventory/v1/offer`, {
      method:  'POST',
      headers,
      body:    JSON.stringify(offerBody),
    });
    const offerData = await offerRes.json();

    let offerId = offerData.offerId;

    if (!offerRes.ok) {
      // If offer already exists for this SKU, fetch it and reuse it
      const alreadyExists = offerData.errors?.some(e =>
        e.message?.toLowerCase().includes('already exists') ||
        e.longMessage?.toLowerCase().includes('already exists')
      );
      if (alreadyExists) {
        const existingRes  = await fetch(`${API}/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}`, { headers });
        const existingData = await existingRes.json();
        offerId = existingData.offers?.[0]?.offerId || null;
        if (!offerId) {
          return res.status(400).json({ error: 'Offer already exists but could not retrieve it. Please try again.' });
        }
        // Update existing offer with new price/policies
        await fetch(`${API}/sell/inventory/v1/offer/${offerId}`, {
          method:  'PUT',
          headers,
          body:    JSON.stringify(offerBody),
        });
      } else {
        const msg = offerData.errors?.[0]?.longMessage || offerData.errors?.[0]?.message || JSON.stringify(offerData);
        return res.status(offerRes.status).json({ error: `Offer creation failed: ${msg}` });
      }
    }

    // ── Step 4: Publish offer ────────────────────────────────────────────────
    const publishRes  = await fetch(`${API}/sell/inventory/v1/offer/${offerId}/publish`, {
      method:  'POST',
      headers,
    });
    const publishData = await publishRes.json();

    if (!publishRes.ok) {
      const msg = publishData.errors?.[0]?.longMessage || publishData.errors?.[0]?.message || JSON.stringify(publishData);
      return res.status(publishRes.status).json({ error: `Publish failed: ${msg}` });
    }

    const listingId  = publishData.listingId;
    const listingUrl = `https://www.ebay.com/itm/${listingId}`;

    return res.json({ success: true, offerId, listingId, listingUrl, sku });
  } catch (err) {
    console.error('ebay-list error:', err);
    return res.status(500).json({ error: err.message });
  }
}
