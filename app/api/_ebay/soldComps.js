// eBay sold-comp valuation engine for The Vault.
//
// Sold ("completed, sold") search on eBay is available through exactly one API:
//   Buy > Marketplace Insights > item_sales/search   (90 days of sales history)
// The Finding API's findCompletedItems was decommissioned 4 Feb 2025, and the
// Browse API returns active listings only (no sold filter exists — soldItemsOnly,
// buyingOptions:{SOLD} and itemEndDate are all rejected).
//
// Marketplace Insights is a Limited Release API. Until eBay approves the app for
// the buy.marketplace.insights scope, every call here resolves to a structured
// "unavailable" result rather than throwing — the caller shows an empty state.
//
// Valuation rule (per spec):
//   >= 5 sold comps  -> average of the 5 most recent
//    1-4 sold comps  -> price of the single most recent
//      0 sold comps  -> null (unknown / blank)

import { getAppToken, EbayScopeError, EBAY_API_BASE, SCOPE_MARKETPLACE_INSIGHTS } from './token.js';
import { CONDITION_ID } from './conditions.js';

const MI_PATH = '/buy/marketplace_insights/v1_beta/item_sales/search';
const REQUEST_TIMEOUT_MS = 9000;
const FETCH_LIMIT = 100;      // pull a wide page, then rank locally by sold date
const COMP_WINDOW = 5;        // "last 5 sold"

// Reasons surfaced to the client. All non-fatal: value is null, app shows empty state.
export const UNAVAILABLE = {
  NO_ACCESS: 'NO_MARKETPLACE_INSIGHTS_ACCESS',
  RATE_LIMITED: 'RATE_LIMITED',
  UPSTREAM: 'UPSTREAM_ERROR',
  TIMEOUT: 'TIMEOUT',
  BAD_REQUEST: 'BAD_REQUEST',
  NOT_CONFIGURED: 'NOT_CONFIGURED',
};

// Listings that are not a single copy of the card being valued. Averaging these
// in is the single biggest source of nonsense valuations.
const NOISE_RE = new RegExp(
  [
    '\\blots?\\b', '\\bbundle', '\\bset of\\b', '\\bcomplete set\\b',
    '\\breprint', '\\bre-print', '\\bproxy\\b', '\\bcustom\\b', '\\bfacsimile\\b',
    '\\bdigital\\b', '\\bnft\\b', '\\bsticker\\b', '\\bposter\\b',
    '\\bbreak\\b', '\\brandom\\b', '\\bpick your\\b', '\\bchoose your\\b',
    '\\brepack\\b', '\\bmystery\\b', '\\bteam set\\b', '\\byou pick\\b',
    '\\bhobby box\\b', '\\bblaster\\b', '\\bcase\\b', '\\bsealed\\b',
  ].join('|'),
  'i'
);

// Grader abbreviations as they appear in listing titles.
const GRADER_TITLE_RE =
  /\b(PSA|BGS|BVG|BCCG|SGC|CGC|CSG|KSA|GMA|HGA|ISA|AGS|TAG|RCG|MNT|GSG|PGS|DSG|CGA|GRAAD)\b/i;
const GRADED_TITLE_RE =
  /\b(PSA|BGS|BVG|BCCG|SGC|CGC|CSG|KSA|GMA|HGA|ISA|AGS|TAG|RCG|MNT|GSG|PGS|DSG|CGA|GRAAD)\s*\.?\s*(10|9\.5|9|8\.5|8|7\.5|7|6\.5|6|5\.5|5|4\.5|4|3\.5|3|2\.5|2|1\.5|1|AUTH(?:ENTIC)?)\b/i;

const clean = (s) => String(s ?? '').trim();
const money = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Build progressively looser search queries. Tier 0 is the most specific; each
 * later tier drops one signal. The tier actually used is reported back so the
 * UI can say how tight the match was.
 */
export function buildQueryTiers(card = {}) {
  const player = clean(card.playerName) && clean(card.playerName) !== 'Unknown Player' ? clean(card.playerName) : '';
  const year = clean(card.year);
  const brand = clean(card.brand);
  const series = clean(card.series);
  const parallel = clean(card.parallel) && clean(card.parallel).toLowerCase() !== 'base' ? clean(card.parallel) : '';
  const num = clean(card.cardNumber);
  const gradeTag =
    card.graded && card.grader && card.grade ? `${clean(card.grader)} ${clean(card.grade)}` : '';

  const join = (...parts) => parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

  const tiers = [
    { tier: 0, label: 'exact', q: join(year, brand, series, player, parallel, num && `#${num}`, gradeTag) },
    { tier: 1, label: 'no card number', q: join(year, brand, series, player, parallel, gradeTag) },
    { tier: 2, label: 'no parallel', q: join(year, brand, player, gradeTag) },
    { tier: 3, label: 'player and year', q: join(year, player) },
  ];

  // Drop empties and duplicates while preserving order.
  const seen = new Set();
  return tiers.filter((t) => {
    if (!t.q || seen.has(t.q)) return false;
    seen.add(t.q);
    return true;
  });
}

function withTimeout(ms) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return { signal: c.signal, done: () => clearTimeout(t) };
}

/** One raw call to item_sales/search. */
async function searchItemSales({ q, categoryIds, marketplaceId, conditionIds, filters = [] }) {
  const token = await getAppToken(SCOPE_MARKETPLACE_INSIGHTS);

  const params = new URLSearchParams({ q, limit: String(FETCH_LIMIT) });
  if (categoryIds) params.set('category_ids', categoryIds);

  const filterParts = [...filters];
  if (conditionIds?.length) filterParts.push(`conditionIds:{${conditionIds.join('|')}}`);
  // Sales history maxes out at 90 days; asking for it explicitly keeps the
  // window deterministic rather than relying on the default.
  const since = new Date(Date.now() - 89 * 24 * 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  filterParts.push(`lastSoldDate:[${since}..]`);
  if (filterParts.length) params.set('filter', filterParts.join(','));

  const { signal, done } = withTimeout(REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${EBAY_API_BASE}${MI_PATH}?${params}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': marketplaceId,
        Accept: 'application/json',
      },
      signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError') { const e = new Error('eBay request timed out'); e.reason = UNAVAILABLE.TIMEOUT; throw e; }
    const e = new Error(`eBay request failed: ${err.message}`); e.reason = UNAVAILABLE.UPSTREAM; throw e;
  } finally {
    done();
  }

  if (res.status === 403 || res.status === 401) {
    const e = new Error('eBay denied access to Marketplace Insights'); e.reason = UNAVAILABLE.NO_ACCESS; throw e;
  }
  if (res.status === 429) {
    const e = new Error('eBay rate limit reached'); e.reason = UNAVAILABLE.RATE_LIMITED;
    e.retryAfter = res.headers.get('retry-after') || null; throw e;
  }
  if (res.status === 400) {
    const body = await res.text().catch(() => '');
    const e = new Error(`eBay rejected the query: ${body.slice(0, 300)}`); e.reason = UNAVAILABLE.BAD_REQUEST; throw e;
  }
  if (!res.ok) {
    const e = new Error(`Marketplace Insights HTTP ${res.status}`); e.reason = UNAVAILABLE.UPSTREAM; throw e;
  }

  return res.json();
}

/** Normalise one itemSale into the shape the app stores. */
function normaliseSale(s) {
  const price = money(s?.lastSoldPrice?.value);
  if (!price) return null;
  const soldDate = s?.lastSoldDate || null;
  if (!soldDate || Number.isNaN(Date.parse(soldDate))) return null;
  return {
    itemId: s.itemId || null,
    legacyItemId: s.legacyItemId || null,
    title: s.title || '',
    price,
    currency: s?.lastSoldPrice?.currency || null,
    soldDate,
    soldQuantity: s.totalSoldQuantity ?? null,
    conditionId: s.conditionId ? String(s.conditionId) : null,
    condition: s.condition || null,
    url: s.itemWebUrl || null,
    image: s?.image?.imageUrl || null,
  };
}

/** True when the title looks like a graded slab of the requested grader+grade. */
function titleMatchesGrade(title, grader, grade) {
  const m = GRADED_TITLE_RE.exec(title || '');
  if (!m) return false;
  const tGrader = m[1].toUpperCase();
  const tGrade = m[2].toUpperCase();
  const wantGrader = clean(grader).toUpperCase();
  const wantGrade = clean(grade).toUpperCase().replace(/^.*\s/, '');
  const graderOk = !wantGrader || tGrader === wantGrader || wantGrader.includes(tGrader);
  const gradeOk = !wantGrade || tGrade === wantGrade || parseFloat(tGrade) === parseFloat(wantGrade);
  return graderOk && gradeOk;
}

/**
 * Keep only comps that plausibly are the same card in the same condition tier.
 * Returns { kept, rejected } so the reason for a thin sample is inspectable.
 */
export function filterComps(sales, card = {}, { excludeNoise = true } = {}) {
  const kept = [];
  const rejected = [];
  const isGraded = Boolean(card.graded ?? (card.grader && card.grade));
  const lastName = clean(card.playerName).split(/\s+/).filter(Boolean).pop();

  for (const s of sales) {
    const title = s.title || '';

    if (excludeNoise && NOISE_RE.test(title)) { rejected.push({ ...s, why: 'noise' }); continue; }

    // The player's surname must appear, otherwise eBay's fuzzy match drifted.
    if (lastName && lastName.length > 2 && !new RegExp(`\\b${lastName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(title)) {
      rejected.push({ ...s, why: 'player mismatch' }); continue;
    }

    const looksGraded = s.conditionId === CONDITION_ID.GRADED || GRADED_TITLE_RE.test(title);

    if (isGraded) {
      if (!looksGraded) { rejected.push({ ...s, why: 'raw comp for graded card' }); continue; }
      if (!titleMatchesGrade(title, card.grader, card.grade) && s.conditionId !== CONDITION_ID.GRADED) {
        rejected.push({ ...s, why: 'different grade' }); continue;
      }
      // conditionId says Graded but the title names a different grade — drop it.
      if (GRADED_TITLE_RE.test(title) && !titleMatchesGrade(title, card.grader, card.grade)) {
        rejected.push({ ...s, why: 'different grade' }); continue;
      }
    } else {
      if (looksGraded) { rejected.push({ ...s, why: 'graded comp for raw card' }); continue; }
      if (GRADER_TITLE_RE.test(title) && /\bgraded\b/i.test(title)) {
        rejected.push({ ...s, why: 'graded comp for raw card' }); continue;
      }
    }

    kept.push(s);
  }
  return { kept, rejected };
}

/**
 * Apply the valuation rule to a set of comps.
 * @returns {{value:number|null, method:string|null, used:Array, currency:string|null}}
 */
export function valueFromComps(comps) {
  if (!comps.length) return { value: null, method: null, used: [], currency: null, droppedForCurrency: 0 };

  // Newest first. Ties broken by item id so the result is deterministic.
  const sorted = [...comps].sort((a, b) => {
    const d = Date.parse(b.soldDate) - Date.parse(a.soldDate);
    return d !== 0 ? d : String(a.itemId).localeCompare(String(b.itemId));
  });

  // Never average across currencies: anchor on the most recent sale's currency.
  const currency = sorted[0].currency || null;
  const sameCurrency = currency ? sorted.filter((c) => c.currency === currency) : sorted;
  const droppedForCurrency = sorted.length - sameCurrency.length;

  const used = sameCurrency.slice(0, COMP_WINDOW);

  if (used.length >= COMP_WINDOW) {
    const avg = used.reduce((sum, c) => sum + c.price, 0) / used.length;
    return { value: round2(avg), method: 'average_of_5', used, currency, droppedForCurrency };
  }
  return { value: round2(used[0].price), method: 'most_recent', used: [used[0]], currency, droppedForCurrency };
}

/**
 * Full valuation for one card. Never throws.
 * @returns {Promise<object>} always includes `value` (number|null)
 */
export async function valueCard(card = {}, opts = {}) {
  const marketplaceId = opts.marketplaceId || 'EBAY_US';
  const categoryIds = opts.categoryIds || null;
  const excludeNoise = opts.excludeNoise !== false;
  const asOf = new Date().toISOString();

  const base = {
    value: null,
    currency: null,
    method: null,
    sampleSize: 0,
    itemIds: [],
    legacyItemIds: [],
    comps: [],
    query: null,
    queryTier: null,
    marketplaceId,
    asOf,
    priceSource: 'eBay sold',
    unavailable: null,
    note: null,
  };

  if (!process.env.VITE_EBAY_CLIENT_ID || !process.env.VITE_EBAY_CLIENT_SECRET) {
    return { ...base, unavailable: UNAVAILABLE.NOT_CONFIGURED, note: 'eBay app credentials are not configured.' };
  }

  const tiers = buildQueryTiers(card);
  if (!tiers.length) {
    return { ...base, unavailable: UNAVAILABLE.BAD_REQUEST, note: 'Not enough card detail to build a search query.' };
  }

  const isGraded = Boolean(card.graded ?? (card.grader && card.grade));
  const conditionIds = isGraded ? [CONDITION_ID.GRADED] : [CONDITION_ID.UNGRADED, CONDITION_ID.USED];

  let lastRejected = [];

  for (const t of tiers) {
    let data;
    try {
      data = await searchItemSales({ q: t.q, categoryIds, marketplaceId, conditionIds });
    } catch (err) {
      if (err instanceof EbayScopeError) {
        return {
          ...base,
          unavailable: UNAVAILABLE.NO_ACCESS,
          query: t.q,
          queryTier: t.label,
          note: 'This eBay app is not approved for the Marketplace Insights API (buy.marketplace.insights). Sold-price lookup stays unavailable until eBay grants access.',
        };
      }
      const reason = err.reason || UNAVAILABLE.UPSTREAM;
      // A malformed query at one tier should not kill the looser tiers.
      if (reason === UNAVAILABLE.BAD_REQUEST) { continue; }
      return { ...base, unavailable: reason, query: t.q, queryTier: t.label, note: err.message, retryAfter: err.retryAfter || null };
    }

    const sales = (data?.itemSales || []).map(normaliseSale).filter(Boolean);
    const { kept, rejected } = filterComps(sales, card, { excludeNoise });
    lastRejected = rejected;

    if (kept.length) {
      const { value, method, used, currency, droppedForCurrency } = valueFromComps(kept);
      return {
        ...base,
        value,
        currency,
        method,
        sampleSize: used.length,
        matchedComps: kept.length,
        itemIds: used.map((c) => c.itemId).filter(Boolean),
        legacyItemIds: used.map((c) => c.legacyItemId).filter(Boolean),
        comps: used,
        query: t.q,
        queryTier: t.label,
        droppedForCurrency,
        rejectedCount: rejected.length,
        note:
          method === 'average_of_5'
            ? 'Average of the 5 most recent eBay sales.'
            : `Most recent eBay sale (only ${used.length === 1 ? kept.length : used.length} comp${kept.length === 1 ? '' : 's'} found, fewer than 5).`,
      };
    }
  }

  // Searched every tier, found nothing usable: value is unknown, not zero.
  return {
    ...base,
    query: tiers[tiers.length - 1].q,
    queryTier: tiers[tiers.length - 1].label,
    rejectedCount: lastRejected.length,
    note: lastRejected.length
      ? `No matching sold listings in the last 90 days (${lastRejected.length} nearby sales rejected as a different card or condition).`
      : 'No sold listings found for this card in the last 90 days.',
  };
}
