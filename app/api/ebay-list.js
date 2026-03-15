/**
 * /api/ebay-list.js
 * Creates and publishes an eBay listing via the Trading API AddItem call.
 * The Trading API has a direct <Country> field so no merchant location is needed.
 *
 * Required Vercel env vars (in addition to the OAuth ones):
 *   EBAY_DEV_ID   — your Developer ID from the eBay developer portal keyset
 *   EBAY_CERT_ID  — your Cert ID from the eBay developer portal keyset
 *   (VITE_EBAY_CLIENT_ID is your App ID — already set)
 */

const API = 'https://api.ebay.com';
const TRADING_API_URL = 'https://api.ebay.com/ws/api.dll';
const TRADING_COMPAT  = '1119';
const CATEGORY_ID = '183050'; // Sports Trading Cards — eBay auto-maps if not found on the local site

// Map eBay marketplace IDs → Trading API site IDs
const SITE_IDS = {
  EBAY_US: '0',  EBAY_CA: '2',  EBAY_GB: '3',  EBAY_AU: '15',
  EBAY_AT: '16', EBAY_BE: '23', EBAY_FR: '71', EBAY_DE: '77',
  EBAY_IT: '101',EBAY_NL: '146',EBAY_ES: '186',EBAY_CH: '193',
  EBAY_HK: '201',EBAY_IN: '203',EBAY_MY: '207',EBAY_PH: '211',
  EBAY_PL: '212',EBAY_SG: '216',
};
function getSiteId(marketplace) { return SITE_IDS[marketplace] || '0'; }

// Fetch the seller's registered country code and marketplace from eBay identity API.
async function getSellerInfo(accessToken) {
  try {
    const res  = await fetch(`${API}/commerce/identity/v1/user/`, {
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    });
    const data = await res.json();
    console.log('eBay identity response:', JSON.stringify(data));
    const marketplace = data.registrationMarketplaceId || 'EBAY_US';
    const account     = data.individualAccount || data.businessAccount || {};
    const country     = account.primaryAddress?.country
                      || marketplace.replace(/^EBAY_/, '')
                      || 'US';
    console.log('Seller marketplace:', marketplace, 'country:', country);
    return { marketplace, country };
  } catch (e) {
    console.warn('Could not fetch seller identity:', e.message);
    return { marketplace: 'EBAY_US', country: 'US' };
  }
}

// Map eBay marketplace IDs to their currency codes
const MARKETPLACE_CURRENCY = {
  EBAY_US: 'USD', EBAY_CA: 'CAD', EBAY_GB: 'GBP', EBAY_AU: 'AUD',
  EBAY_DE: 'EUR', EBAY_FR: 'EUR', EBAY_IT: 'EUR', EBAY_ES: 'EUR',
  EBAY_NL: 'EUR', EBAY_BE: 'EUR', EBAY_AT: 'EUR', EBAY_IE: 'EUR',
  EBAY_CH: 'CHF', EBAY_PL: 'PLN', EBAY_SG: 'SGD', EBAY_MY: 'MYR',
  EBAY_PH: 'PHP', EBAY_IN: 'INR', EBAY_HK: 'HKD',
};
function getCurrency(marketplace) { return MARKETPLACE_CURRENCY[marketplace] || 'USD'; }

// Map our condition strings to Trading API ConditionIDs (numeric)
const TRADING_CONDITION_MAP = {
  'Mint':       '1000',
  'Near Mint':  '3000',
  'Excellent':  '4000',
  'Good':       '5000',
  'Fair':       '6000',
  'Poor':       '6000',
  'Unknown':    '5000',
};

function escapeXml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Build an HTML listing description from card data
function buildDescription(cards, extraNotes) {
  const note   = extraNotes ? `<p>${extraNotes}</p>` : '';
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

// Only include public HTTPS image URLs — skip Firebase Storage (requires auth tokens)
function getImageUrls(cards) {
  const urls = [];
  for (const c of cards) {
    for (const url of [c.imageUrl, c.backImageUrl]) {
      if (url?.startsWith('https://') && !url.includes('firebasestorage.googleapis.com')) {
        urls.push(url);
        if (urls.length >= 12) return urls; // eBay max
      }
    }
  }
  return urls;
}

function truncateTitle(title) {
  if (title.length <= 80) return title;
  return title.slice(0, 79).replace(/\s+\S*$/, '').slice(0, 80);
}

// Build Trading API ItemSpecifics XML entries for sports cards
function buildItemSpecificsXml(cards) {
  const c = cards[0];
  const pairs = [
    ['Sport',            'Basketball'],
    c.playerName                        ? ['Player/Athlete',    c.playerName]              : null,
    c.year                              ? ['Season',            String(c.year)]            : null,
    c.brand                             ? ['Card Manufacturer', c.brand]                   : null,
    c.series                            ? ['Set',               c.series]                  : null,
    c.cardNumber                        ? ['Card Number',       String(c.cardNumber)]      : null,
    c.parallel && c.parallel !== 'Base' ? ['Parallel/Variety',  c.parallel]               : null,
    c.hasAutograph                      ? ['Autograph',         'Yes']                    : null,
    c.isRookie                          ? ['Rookie',            'Yes']                    : null,
  ].filter(Boolean);

  return pairs.map(([name, value]) =>
    `    <NameValueList><Name>${escapeXml(name)}</Name><Value>${escapeXml(value)}</Value></NameValueList>`
  ).join('\n');
}

export const config = {
  api: { bodyParser: { sizeLimit: '32kb' } },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    cards, title, price, condition, conditionDescription,
    accessToken, fulfillmentPolicyId, paymentPolicyId, returnPolicyId,
  } = req.body ?? {};

  if (!Array.isArray(cards) || cards.length === 0) return res.status(400).json({ error: 'cards array is required' });
  if (!title?.trim())             return res.status(400).json({ error: 'title is required' });
  if (!price || price <= 0)       return res.status(400).json({ error: 'price must be greater than 0' });
  if (!accessToken)               return res.status(400).json({ error: 'accessToken is required' });
  if (!fulfillmentPolicyId || !paymentPolicyId || !returnPolicyId) {
    return res.status(400).json({ error: 'All three eBay seller policies are required. Please set up shipping, payment, and return policies on eBay.' });
  }

  const devId  = process.env.EBAY_DEV_ID;
  const certId = process.env.EBAY_CERT_ID;
  const appId  = process.env.VITE_EBAY_CLIENT_ID;
  if (!devId || !certId || !appId) {
    return res.status(500).json({
      error: 'eBay Trading API credentials not fully configured. Please add EBAY_DEV_ID and EBAY_CERT_ID to your Vercel environment variables (found in your eBay developer portal keyset).',
    });
  }

  try {
    const { marketplace, country } = await getSellerInfo(accessToken);
    const currency    = getCurrency(marketplace);
    const siteId      = getSiteId(marketplace);
    const conditionId = TRADING_CONDITION_MAP[condition] || '5000';
    const cleanTitle  = truncateTitle(title.trim());
    const description = buildDescription(cards, conditionDescription);
    const imageUrls   = getImageUrls(cards);
    const specificsXml = buildItemSpecificsXml(cards);

    const picturesXml = imageUrls.length > 0
      ? `  <PictureDetails>\n    <GalleryType>Gallery</GalleryType>\n${imageUrls.map(u => `    <PictureURL>${escapeXml(u)}</PictureURL>`).join('\n')}\n  </PictureDetails>`
      : '';

    const xmlBody = `<?xml version="1.0" encoding="utf-8"?>
<AddItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken>${accessToken}</eBayAuthToken>
  </RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <Item>
    <Title>${escapeXml(cleanTitle)}</Title>
    <Description><![CDATA[${description}]]></Description>
    <PrimaryCategory><CategoryID>${CATEGORY_ID}</CategoryID></PrimaryCategory>
    <StartPrice>${price.toFixed(2)}</StartPrice>
    <CategoryMappingAllowed>true</CategoryMappingAllowed>
    <Country>${escapeXml(country)}</Country>
    <Currency>${escapeXml(currency)}</Currency>
    <ConditionID>${conditionId}</ConditionID>
    <ListingDuration>GTC</ListingDuration>
    <ListingType>FixedPriceItem</ListingType>
    <Quantity>1</Quantity>
    <SellerProfiles>
      <SellerShippingProfile>
        <ShippingProfileID>${escapeXml(fulfillmentPolicyId)}</ShippingProfileID>
      </SellerShippingProfile>
      <SellerReturnProfile>
        <ReturnProfileID>${escapeXml(returnPolicyId)}</ReturnProfileID>
      </SellerReturnProfile>
      <SellerPaymentProfile>
        <PaymentProfileID>${escapeXml(paymentPolicyId)}</PaymentProfileID>
      </SellerPaymentProfile>
    </SellerProfiles>
${picturesXml}
${specificsXml ? `  <ItemSpecifics>\n${specificsXml}\n  </ItemSpecifics>` : ''}
  </Item>
</AddItemRequest>`;

    console.log('Trading API AddItem request siteId:', siteId, 'country:', country, 'currency:', currency);

    const tradingRes = await fetch(TRADING_API_URL, {
      method:  'POST',
      headers: {
        'X-EBAY-API-COMPATIBILITY-LEVEL': TRADING_COMPAT,
        'X-EBAY-API-CALL-NAME':           'AddItem',
        'X-EBAY-API-SITEID':              siteId,
        'X-EBAY-API-APP-NAME':            appId,
        'X-EBAY-API-DEV-NAME':            devId,
        'X-EBAY-API-CERT-NAME':           certId,
        'Content-Type':                   'text/xml',
      },
      body: xmlBody,
    });
    const responseText = await tradingRes.text();
    console.log('Trading API AddItem response:', tradingRes.status, responseText);

    const ack    = responseText.match(/<Ack>(.*?)<\/Ack>/)?.[1];
    const itemId = responseText.match(/<ItemID>(\d+)<\/ItemID>/)?.[1];

    if (!itemId || (ack !== 'Success' && ack !== 'Warning')) {
      const longMsg  = responseText.match(/<LongMessage>(.*?)<\/LongMessage>/s)?.[1];
      const shortMsg = responseText.match(/<ShortMessage>(.*?)<\/ShortMessage>/s)?.[1];
      const errMsg   = longMsg || shortMsg || responseText;
      return res.status(400).json({ error: `Listing failed: ${errMsg}` });
    }

    const listingUrl = `https://www.ebay.com/itm/${itemId}`;
    return res.json({ success: true, listingId: itemId, listingUrl });

  } catch (err) {
    console.error('ebay-list error:', err);
    return res.status(500).json({ error: err.message });
  }
}


// Fetch the seller's registered country code and marketplace from eBay identity API.
// Falls back to US/EBAY_US if the call fails.
async function getSellerInfo(accessToken) {
  try {
    const res  = await fetch(`${API}/commerce/identity/v1/user/`, {
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    });
    const data = await res.json();
    console.log('eBay identity response:', JSON.stringify(data));

    const marketplace = data.registrationMarketplaceId || 'EBAY_US';

    // Get country directly from the registered address — no string parsing needed
    const account = data.individualAccount || data.businessAccount || {};
    const country  = account.primaryAddress?.country
                  || marketplace.replace(/^EBAY_/, '')
                  || 'US';

    console.log('Seller marketplace:', marketplace, 'country:', country);
    return { marketplace, country, identityData: data };
  } catch (e) {
    console.warn('Could not fetch seller identity:', e.message);
    return { marketplace: 'EBAY_US', country: 'US', identityData: null };
  }
}

// Map eBay marketplace IDs to their currency codes
const MARKETPLACE_CURRENCY = {
  EBAY_US: 'USD', EBAY_CA: 'CAD', EBAY_GB: 'GBP', EBAY_AU: 'AUD',
  EBAY_DE: 'EUR', EBAY_FR: 'EUR', EBAY_IT: 'EUR', EBAY_ES: 'EUR',
  EBAY_NL: 'EUR', EBAY_BE: 'EUR', EBAY_AT: 'EUR', EBAY_IE: 'EUR',
  EBAY_CH: 'CHF', EBAY_PL: 'PLN', EBAY_SG: 'SGD', EBAY_MY: 'MYR',
  EBAY_PH: 'PHP', EBAY_IN: 'INR', EBAY_HK: 'HKD',
};
function getCurrency(marketplace) {
  return MARKETPLACE_CURRENCY[marketplace] || 'USD';
}

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

function authHeaders(accessToken, marketplace) {
  return {
    'Authorization':           `Bearer ${accessToken}`,
    'X-EBAY-C-MARKETPLACE-ID': marketplace,
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

  const { marketplace, country, identityData } = await getSellerInfo(accessToken);
  const headers = authHeaders(accessToken, marketplace);

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
    // If not already saved in Firestore, check eBay for any locations the user
    // may have created via eBay Seller Hub since their last re-check.
    let locationKey = merchantLocationKey || null;
    if (!locationKey) {
      const locRes  = await fetch(`${API}/sell/inventory/v1/location`, { headers });
      const locData = await locRes.json().catch(() => ({}));
      console.log('eBay locations fetch:', locRes.status, JSON.stringify(locData));
      locationKey = locData.locations?.[0]?.merchantLocationKey || null;
    }
    if (!locationKey) {
      // Try to create a location — this fails for some account types, which is fine.
      // merchantLocationKey is optional; the marketplace already establishes the country.
      const key = 'vaultdefault';
      const createRes = await fetch(`${API}/sell/inventory/v1/location/${key}`, {
        method:  'PUT',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ location: { address: { country } }, name: 'The Vault' }),
      });
      console.log('list.js location create:', createRes.status);
      if (createRes.ok || createRes.status === 204 || createRes.status === 409) {
        locationKey = key;
      } else {
        console.log('Location creation not available for this account; proceeding without merchantLocationKey');
      }
    }

    // ── Step 3: Create offer ─────────────────────────────────────────────────
    const offerBody = {
      sku,
      marketplaceId:    marketplace,
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
        price: { currency: getCurrency(marketplace), value: price.toFixed(2) },
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
