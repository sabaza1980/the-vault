// listingExport.js — shared bulk-listing CSV engine for the Breakers hub (BK-3) and the
// Collections → sheet path (BK-4). Pure JS, no React, so it can be unit-tested with node.
//
// One internal item shape → several platform adapters. Column specs sourced from public docs:
//   • Whatnot  — help.whatnot.com "Bulk import products from a CSV file" (US/AU/NL template).
//   • eBay     — File Exchange / Seller Hub bulk trading-card fields (Action, Category, item specifics).
//   • Generic  — clean superset for any other tool. Fanatics Collect has no public self-serve CSV
//                (managed Dealer Program / vault intake), so "Fanatics" maps to the generic sheet.
//
// Internal item shape (all fields optional except where a platform requires them):
//   { title, description, price, quantity, format:'Auction'|'BuyItNow', condition, sport, category,
//     imageUrls:[], sku, offerable,
//     player, year, brand, series, cardNumber, parallel, grade, grader, team }

// ── helpers ─────────────────────────────────────────────────────────────────
const s = (v) => (v == null ? '' : String(v));
const money = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? '' : Number(v).toFixed(2));

// RFC-4180 CSV cell escaping. eBay rejects newlines inside cells, so collapse them.
function cell(v) {
  let str = s(v).replace(/\r?\n/g, ' ').trim();
  if (/[",]/.test(str)) str = `"${str.replace(/"/g, '""')}"`;
  return str;
}
function toCSVRows(headers, rows) {
  const head = headers.map(cell).join(',');
  const body = rows.map(r => headers.map(h => cell(r[h])).join(',')).join('\n');
  return body ? `${head}\n${body}` : head;
}

// Build a listing title from card fields when the caller didn't supply one (≤80 chars for eBay/Whatnot).
export function buildTitle(item) {
  if (item.title) return s(item.title).slice(0, 80);
  const parts = [
    item.year, item.brand, item.series,
    item.player || item.team,
    item.parallel && !/^base$/i.test(item.parallel) ? item.parallel : null,
    item.serial ? (String(item.serial).includes('/') ? item.serial : `/${item.serial}`) : null,
    item.cardNumber ? `#${item.cardNumber}` : null,
    item.grade ? `${item.grader || ''} ${item.grade}`.trim() : null,
  ].filter(Boolean);
  return parts.join(' ').slice(0, 80);
}

function buildDescription(item) {
  if (item.description) return s(item.description);
  return buildTitle(item);
}

// ── condition / category maps (overridable via opts) ──────────────────────────
// eBay ConditionID for raw/graded cards. 4000 = "Near Mint or Better" style raw grade bucket.
const EBAY_CONDITION_ID = {
  Mint: 275000, 'Near Mint': 4000, 'Near Mint or Better': 4000,
  Excellent: 3000, Good: 3000, Fair: 3000, Poor: 3000, Ungraded: 4000, Unknown: 4000,
};
const EBAY_DEFAULTS = {
  categoryId: '183454',   // Trading Card Singles (editable per docs)
  conditionId: 4000,
  location: '',
};
const WHATNOT_DEFAULTS = {
  category: 'Sports Cards',   // must match an allowed value in the Whatnot template's Values tab
  shippingProfile: '',        // e.g. "1-3 oz" — must match Whatnot's allowed options; blank = fill later
};

// ── adapters ──────────────────────────────────────────────────────────────────

// Whatnot: order per the official help article.
function whatnotAdapter(items, opts = {}) {
  const cfg = { ...WHATNOT_DEFAULTS, ...opts };
  const headers = [
    'Category', 'Sub Category', 'Title', 'Description', 'Quantity', 'Type', 'Price',
    'Shipping Profile', 'Offerable', 'Condition',
    'Image URL 1', 'Image URL 2', 'Image URL 3', 'Image URL 4',
    'Image URL 5', 'Image URL 6', 'Image URL 7', 'Image URL 8',
  ];
  const rows = items.map(it => {
    const imgs = it.imageUrls || [];
    const row = {
      Category: it.category || cfg.category,
      'Sub Category': it.sport || cfg.subCategory || '',
      Title: buildTitle(it),
      Description: buildDescription(it),
      Quantity: it.quantity ?? 1,
      Type: it.format === 'Auction' ? 'Auction' : 'Buy It Now',
      Price: money(it.price),
      'Shipping Profile': it.shippingProfile || cfg.shippingProfile,
      Offerable: it.offerable ? 'TRUE' : 'FALSE',
      Condition: it.condition || '',
    };
    for (let i = 0; i < 8; i++) row[`Image URL ${i + 1}`] = imgs[i] || '';
    return row;
  });
  return { headers, rows };
}

// eBay: File Exchange / Seller Hub bulk trading-card columns.
function ebayAdapter(items, opts = {}) {
  const cfg = { ...EBAY_DEFAULTS, ...opts };
  const headers = [
    'Action(SiteID=US|Country=US|Currency=USD|Version=1193)', 'CustomLabel', 'Category', 'Title',
    'ConditionID', 'PicURL', 'Description', 'Format', 'Duration', 'StartPrice', 'Quantity', 'Location',
    'C:Sport', 'C:Player/Athlete', 'C:Season', 'C:Manufacturer', 'C:Parallel/Variety',
    'C:Card Number', 'C:Grade', 'C:Professional Grader',
  ];
  const rows = items.map(it => {
    const auction = it.format === 'Auction';
    return {
      'Action(SiteID=US|Country=US|Currency=USD|Version=1193)': 'Add',
      CustomLabel: it.sku || '',
      Category: it.categoryId || cfg.categoryId,
      Title: buildTitle(it),
      ConditionID: it.conditionId || EBAY_CONDITION_ID[it.condition] || cfg.conditionId,
      PicURL: (it.imageUrls || []).join('|'),   // eBay accepts pipe-separated image URLs
      Description: buildDescription(it),
      Format: auction ? 'Auction' : 'FixedPrice',
      Duration: auction ? 'Days_7' : 'GTC',
      StartPrice: money(it.price),
      Quantity: it.quantity ?? 1,
      Location: it.location || cfg.location,
      'C:Sport': it.sport || '',
      'C:Player/Athlete': it.player || '',
      'C:Season': it.year || '',
      'C:Manufacturer': it.brand || '',
      'C:Parallel/Variety': [it.parallel, it.serial ? (String(it.serial).includes('/') ? it.serial : `/${it.serial}`) : ''].filter(Boolean).join(' '),
      'C:Card Number': it.cardNumber || '',
      'C:Grade': it.grade || '',
      'C:Professional Grader': it.grader || '',
    };
  });
  return { headers, rows };
}

// Generic superset — also used for Fanatics and any other tool.
function genericAdapter(items) {
  const headers = [
    'Title', 'Description', 'Sport', 'Player', 'Team', 'Year', 'Brand/Set', 'Card Number',
    'Parallel', 'Serial', 'Grade', 'Grader', 'Condition', 'Quantity', 'Price', 'Format', 'SKU',
    'Image URL 1', 'Image URL 2', 'Image URL 3',
  ];
  const rows = items.map(it => {
    const imgs = it.imageUrls || [];
    return {
      Title: buildTitle(it),
      Description: buildDescription(it),
      Sport: it.sport || '',
      Player: it.player || '',
      Team: it.team || '',
      Year: it.year || '',
      'Brand/Set': [it.brand, it.series].filter(Boolean).join(' ') || '',
      'Card Number': it.cardNumber || '',
      Parallel: it.parallel || '',
      Serial: it.serial || '',
      Grade: it.grade || '',
      Grader: it.grader || '',
      Condition: it.condition || '',
      Quantity: it.quantity ?? 1,
      Price: money(it.price),
      Format: it.format === 'Auction' ? 'Auction' : 'BuyItNow',
      SKU: it.sku || '',
      'Image URL 1': imgs[0] || '',
      'Image URL 2': imgs[1] || '',
      'Image URL 3': imgs[2] || '',
    };
  });
  return { headers, rows };
}

export const PLATFORMS = [
  { id: 'whatnot', label: 'Whatnot', note: 'Matches Whatnot’s bulk-import template. Set Category / Shipping Profile to an allowed value before uploading.' },
  { id: 'ebay', label: 'eBay', note: 'File Exchange / Seller Hub bulk format. Category ID and item specifics are editable.' },
  { id: 'generic', label: 'Generic / Fanatics', note: 'Clean superset sheet. Fanatics Collect has no public self-serve CSV (managed Dealer Program), so use this for Fanatics or any other tool.' },
];

const ADAPTERS = { whatnot: whatnotAdapter, ebay: ebayAdapter, generic: genericAdapter, fanatics: genericAdapter };

// Build the { headers, rows } table for a platform.
export function buildTable(platform, items, opts = {}) {
  const adapter = ADAPTERS[platform] || genericAdapter;
  return adapter(items, opts);
}

// Build the CSV string for a platform.
export function toCSV(platform, items, opts = {}) {
  const { headers, rows } = buildTable(platform, items, opts);
  return toCSVRows(headers, rows);
}

// Turn priced break spots (from the calculator) into listing items.
export function spotsToItems(spots, meta = {}) {
  const { setName, sport = '', format = '', condition = '' } = meta;
  return spots.map(sp => {
    const isTeam = format === 'PYT' || format === 'Mix';
    const label = sp.label;
    const title = [setName, label, format ? `(${format} spot)` : 'spot'].filter(Boolean).join(' ');
    return {
      title: title.slice(0, 80),
      description: `${setName} break — ${label} ${format ? `${format} ` : ''}spot.`,
      price: sp.sold != null ? sp.sold : sp.list,
      quantity: 1,
      format: sp.method === 'Buy Now' ? 'BuyItNow' : 'Auction',
      condition,
      sport,
      category: 'Sports Cards',
      team: isTeam ? label : '',
      player: !isTeam && format === 'PYP' ? label : '',
      imageUrls: [],
    };
  });
}

// Turn collection cards (Vault card shape) into listing items (BK-4 singles path).
// Field names match The Vault card model: playerName, brand, series, insertName, cardNumber,
// parallel, serialNumber, grade, gradingCompany, condition, estimatedValue, imageUrl, fullCardName.
export function cardsToItems(cards) {
  return (cards || []).map(c => ({
    title: c.fullCardName || '',
    // suggest 90% of estimated value for a quicker sale (mirrors EbayListingModal)
    price: c.estimatedValue != null && c.estimatedValue > 0 ? Number((c.estimatedValue * 0.9).toFixed(2)) : '',
    quantity: 1,
    format: 'BuyItNow',
    condition: c.condition || (c.grade ? '' : 'Near Mint'),
    sport: c.sport || c.cardCategory || c.category || '',
    player: c.playerName || '',
    year: c.year || '',
    brand: c.brand || '',
    series: c.series || c.insertName || '',
    cardNumber: c.cardNumber || '',
    parallel: c.parallel && !/^base$/i.test(c.parallel) ? c.parallel : '',
    serial: c.serialNumber || '',
    grade: c.grade || '',
    grader: c.gradingCompany || '',
    sku: c.id != null ? String(c.id) : '',
    imageUrls: [c.imageUrl].filter(Boolean),
  }));
}
