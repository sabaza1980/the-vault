/**
 * /api/ebay-list.js
 * Creates and publishes an eBay listing via the Trading API AddItem call.
 * The Trading API has a direct <Country> field so no merchant location is needed.
 *
 * Required Vercel env vars (in addition to the OAuth ones):
 *   EBAY_DEV_ID   � your Developer ID from the eBay developer portal keyset
 *   EBAY_CERT_ID  � your Cert ID from the eBay developer portal keyset
 *   (VITE_EBAY_CLIENT_ID is your App ID � already set)
 */

const API             = 'https://api.ebay.com';
const TRADING_API_URL = 'https://api.ebay.com/ws/api.dll';
const TRADING_COMPAT  = '1119';
const CATEGORY_ID     = '183050'; // Sports Trading Cards � eBay auto-maps for non-US sites

// Map eBay marketplace IDs to Trading API site IDs
const SITE_IDS = {
  EBAY_US: '0',  EBAY_CA: '2',  EBAY_GB: '3',  EBAY_AU: '15',
  EBAY_AT: '16', EBAY_BE: '23', EBAY_FR: '71', EBAY_DE: '77',
  EBAY_IT: '101',EBAY_NL: '146',EBAY_ES: '186',EBAY_CH: '193',
  EBAY_HK: '201',EBAY_IN: '203',EBAY_MY: '207',EBAY_PH: '211',
  EBAY_PL: '212',EBAY_SG: '216',
};
function getSiteId(marketplace) { return SITE_IDS[marketplace] || '0'; }

// Map eBay marketplace IDs to their currency codes
const MARKETPLACE_CURRENCY = {
  EBAY_US: 'USD', EBAY_CA: 'CAD', EBAY_GB: 'GBP', EBAY_AU: 'AUD',
  EBAY_DE: 'EUR', EBAY_FR: 'EUR', EBAY_IT: 'EUR', EBAY_ES: 'EUR',
  EBAY_NL: 'EUR', EBAY_BE: 'EUR', EBAY_AT: 'EUR', EBAY_IE: 'EUR',
  EBAY_CH: 'CHF', EBAY_PL: 'PLN', EBAY_SG: 'SGD', EBAY_MY: 'MYR',
  EBAY_PH: 'PHP', EBAY_IN: 'INR', EBAY_HK: 'HKD',
};
function getCurrency(marketplace) { return MARKETPLACE_CURRENCY[marketplace] || 'USD'; }

// Map condition strings to Trading API ConditionIDs valid for category 183050
// Only 4000/5000/6000 are confirmed valid for category 183050 on eBay US
const TRADING_CONDITION_MAP = {
  'Mint':      '4000', // Near Mint or Better (1000 is invalid for 183050)
  'Near Mint': '4000', // Near Mint or Better
  'Excellent': '4000', // Near Mint or Better
  'Good':      '5000', // Good
  'Fair':      '6000', // Acceptable
  'Poor':      '6000', // Acceptable
  'Unknown':   '5000', // Good
};

// Map condition strings to eBay "Card Condition" item specific (aspect ID 40001)
// Valid values per Taxonomy API for category 183050:
// "Near Mint or Better", "Excellent", "Very Good", "Poor"
const CARD_CONDITION_SPECIFIC_MAP = {
  'Mint':      'Near Mint or Better',
  'Near Mint': 'Near Mint or Better',
  'Excellent': 'Excellent',
  'Good':      'Very Good',
  'Fair':      'Poor',
  'Poor':      'Poor',
  'Unknown':   'Very Good',
};

// Fetch the seller''s registered country + marketplace from eBay identity API
async function getSellerInfo(accessToken) {
  try {
    const res  = await fetch(`${API}/commerce/identity/v1/user/`, {
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Identity API ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = await res.json();
    console.log('eBay identity response:', JSON.stringify(data));
    const marketplace = data.registrationMarketplaceId || 'EBAY_US';
    const account     = data.individualAccount || data.businessAccount || {};
    const addr        = account.primaryAddress || {};
    const country     = addr.country
                      || marketplace.replace(/^EBAY_/, '')
                      || 'US';
    // Location is a buyer-facing text string (city or region)
    const location    = [addr.city, addr.stateOrProvince, country].filter(Boolean).join(', ') || country;
    console.log('Seller marketplace:', marketplace, 'country:', country, 'location:', location);
    return { marketplace, country, location };
  } catch (e) {
    console.warn('Could not fetch seller identity:', e.message);
    return { marketplace: 'EBAY_US', country: 'US', location: 'US' };
  }
}

function escapeXml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildDescription(cards, extraNotes) {
  const note   = extraNotes ? `<p>${extraNotes}</p>` : '';
  const footer = '<p style="font-size:11px;color:#888;margin-top:16px;">Listed via The Vault card collection manager.</p>';
  if (cards.length === 1) {
    const c = cards[0];
    const rows = [
      ['Player', c.playerName], ['Team', c.team], ['Year', c.year],
      ['Brand', c.brand], ['Set', c.series],
      c.parallel && c.parallel !== 'Base' ? ['Parallel', c.parallel] : null,
      c.cardNumber   ? ['Card #',   c.cardNumber]            : null,
      c.serialNumber ? ['Serial #', c.serialNumber]          : null,
      c.hasAutograph ? ['Autograph', c.autographType || 'Yes'] : null,
      c.isRookie     ? ['Note', 'Rookie Card']               : null,
      ['Condition', c.condition || 'Used'],
    ].filter(Boolean);
    const table = rows.map(([k, v]) =>
      `<tr><td style="padding:4px 12px 4px 0;color:#888;font-size:13px;">${k}</td><td style="padding:4px 0;font-size:13px;">${v}</td></tr>`
    ).join('');
    return `<h2 style="font-size:16px;margin-bottom:12px;">${c.playerName} � ${c.fullCardName || c.series || ''}</h2><table>${table}</table>${note}${footer}`;
  }
  const listItems = cards.map(c => {
    const flags = [
      c.parallel && c.parallel !== 'Base' ? c.parallel : null,
      c.serialNumber ? `S/N ${c.serialNumber}` : null,
      c.hasAutograph ? 'Auto' : null,
      c.isRookie     ? 'RC'   : null,
    ].filter(Boolean).join(' . ');
    return `<li style="margin-bottom:6px;font-size:13px;"><strong>${c.playerName}</strong> - ${c.fullCardName || c.series || 'Unknown Set'}${flags ? ` (${flags})` : ''}</li>`;
  }).join('');
  return `<h2 style="font-size:16px;margin-bottom:12px;">Basketball Card Bundle - ${cards.length} cards</h2><ul style="padding-left:18px;">${listItems}</ul>${note}${footer}`;
}

function getImageUrls(cards) {
  const urls = [];
  for (const c of cards) {
    for (const url of [c.imageUrl, c.backImageUrl]) {
      // Accept any public HTTPS URL including Firebase Storage (publicly readable)
      if (url?.startsWith('https://') && !url.startsWith('data:')) {
        urls.push(url);
        if (urls.length >= 12) return urls;
      }
    }
  }
  return urls;
}

function truncateTitle(title) {
  if (title.length <= 80) return title;
  return title.slice(0, 79).replace(/\s+\S*$/, '').slice(0, 80);
}

function buildItemSpecificsXml(cards, condition) {
  const c = cards[0];
  const cardCondition = CARD_CONDITION_SPECIFIC_MAP[condition] || 'Good';
  const pairs = [
    ['Sport', 'Basketball'],
    ['Franchise', c.team || 'NBA'], // required by eBay for category 183050
    ['Card Condition', cardCondition],  // required aspect ID 40001
    c.playerName                        ? ['Player/Athlete',    c.playerName]         : null,
    c.year                              ? ['Season',            String(c.year)]       : null,
    c.brand                             ? ['Card Manufacturer', c.brand]              : null,
    c.series                            ? ['Set',               c.series]             : null,
    c.cardNumber                        ? ['Card Number',       String(c.cardNumber)] : null,
    c.parallel && c.parallel !== 'Base' ? ['Parallel/Variety',  c.parallel]          : null,
    c.hasAutograph                      ? ['Autograph',         'Yes']               : null,
    c.isRookie                          ? ['Rookie',            'Yes']               : null,
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
  if (!title?.trim())       return res.status(400).json({ error: 'title is required' });
  if (!price || price <= 0) return res.status(400).json({ error: 'price must be greater than 0' });
  if (!accessToken)         return res.status(400).json({ error: 'accessToken is required' });
  if (!fulfillmentPolicyId || !paymentPolicyId || !returnPolicyId) {
    return res.status(400).json({ error: 'All three eBay seller policies are required.' });
  }

  const devId  = process.env.EBAY_DEV_ID;
  const certId = process.env.EBAY_CERT_ID;
  const appId  = process.env.VITE_EBAY_CLIENT_ID;
  if (!devId || !certId || !appId) {
    return res.status(500).json({
      error: 'eBay Trading API credentials not configured. Please add EBAY_DEV_ID and EBAY_CERT_ID to your Vercel environment variables.',
    });
  }

  try {
    const { marketplace, country, location } = await getSellerInfo(accessToken);
    const currency     = getCurrency(marketplace);
    const siteId       = getSiteId(marketplace);
    const conditionId  = TRADING_CONDITION_MAP[condition] || '5000';
    const cleanTitle   = truncateTitle(title.trim());
    const description  = buildDescription(cards, conditionDescription);
    const imageUrls    = getImageUrls(cards);

    const specificsXml = buildItemSpecificsXml(cards, condition);

    const picturesXml = imageUrls.length > 0
      ? `  <PictureDetails>\n    <GalleryType>Gallery</GalleryType>\n${imageUrls.map(u => `    <PictureURL>${escapeXml(u)}</PictureURL>`).join('\n')}\n  </PictureDetails>`
      : '';

    const xmlBody = `<?xml version="1.0" encoding="utf-8"?>
<AddItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken>${accessToken}</eBayAuthToken>
  </RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>Low</WarningLevel>
  <Item>
    <Title>${escapeXml(cleanTitle)}</Title>
    <Description><![CDATA[${description}]]></Description>
    <PrimaryCategory><CategoryID>${CATEGORY_ID}</CategoryID></PrimaryCategory>
    <StartPrice>${price.toFixed(2)}</StartPrice>
    <CategoryMappingAllowed>true</CategoryMappingAllowed>
    <Country>${escapeXml(country)}</Country>
    <Location>${escapeXml(location)}</Location>
    <Currency>${escapeXml(currency)}</Currency>
    <ConditionID>${conditionId}</ConditionID>
    <ItemSpecifics>
${specificsXml}
    </ItemSpecifics>
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
  </Item>
</AddItemRequest>`;

    console.log('Trading API AddItem siteId:', siteId, 'country:', country, 'currency:', currency);
    console.log('AddItem XML body:', xmlBody);

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
    console.log('Trading API response:', tradingRes.status, responseText);

    const ack    = responseText.match(/<Ack>(.*?)<\/Ack>/)?.[1];
    const itemId = responseText.match(/<ItemID>(\d+)<\/ItemID>/)?.[1];

    // If eBay returned an ItemID the listing was created — treat as success even
    // if Ack=Warning (e.g. payment-hold notice for new sellers).
    if (itemId) {
      const listingUrl = `https://www.ebay.com/itm/${itemId}`;
      return res.json({ success: true, listingId: itemId, listingUrl });
    }

    const longMsg  = responseText.match(/<LongMessage>(.*?)<\/LongMessage>/s)?.[1];
    const shortMsg = responseText.match(/<ShortMessage>(.*?)<\/ShortMessage>/s)?.[1];
    return res.status(400).json({ error: `Listing failed: ${longMsg || shortMsg || responseText}` });

  } catch (err) {
    console.error('ebay-list error:', err);
    return res.status(500).json({ error: err.message });
  }
}
