// breakPricing.js — pure break-pricing engine for the Breakers calculator (BK-2). No React.
//
// Model (per Sherif's spec):
//   revenueTarget = qty × unitCost + marginDollars      (margin is an ABSOLUTE $ amount, not a %)
//   spots get an EV WEIGHT → list prices scale so Σ list = revenueTarget
//   floor price = list × (totalCost / revenueTarget)     (sell every spot at floor → break even; at list → hit margin)
//   Random format = flat: every spot = revenueTarget / spots (no weighting)
//   Live leeway: as spots sell (or buy-now spots lock), remaining $ needed spreads over the unsold
//                spots by weight, so the breaker sees how low they can go and still hit target.

export const NBA_TEAMS = [
  'Atlanta Hawks', 'Boston Celtics', 'Brooklyn Nets', 'Charlotte Hornets', 'Chicago Bulls',
  'Cleveland Cavaliers', 'Dallas Mavericks', 'Denver Nuggets', 'Detroit Pistons', 'Golden State Warriors',
  'Houston Rockets', 'Indiana Pacers', 'LA Clippers', 'LA Lakers', 'Memphis Grizzlies',
  'Miami Heat', 'Milwaukee Bucks', 'Minnesota Timberwolves', 'New Orleans Pelicans', 'New York Knicks',
  'OKC Thunder', 'Orlando Magic', 'Philadelphia 76ers', 'Phoenix Suns', 'Portland Trail Blazers',
  'Sacramento Kings', 'San Antonio Spurs', 'Toronto Raptors', 'Utah Jazz', 'Washington Wizards',
];

export const FORMATS = ['PYT', 'PYP', 'Random', 'Mix'];
export const SALE_METHODS = ['Buy Now', 'Auction', 'Mix'];

const round = (n, to = 5) => (to <= 0 ? Math.round(n) : Math.round(n / to) * to);
const clean = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// ── Cost + target ───────────────────────────────────────────────────────────
// unit: 'case' | 'box'. caseCost + boxesPerCase come from the normalized pricing config.
export function unitCost({ caseCost, boxesPerCase, unit }) {
  if (caseCost == null) return null;
  if (unit === 'box') return boxesPerCase ? caseCost / boxesPerCase : null;
  return caseCost;
}

export function computeTargets({ qty, unit, caseCost, boxesPerCase, marginDollars }) {
  const uc = unitCost({ caseCost, boxesPerCase, unit });
  if (uc == null || !qty) return { totalCost: null, revenueTarget: null, unitCost: uc };
  const totalCost = uc * qty;
  const revenueTarget = totalCost + (Number(marginDollars) || 0);
  return { totalCost, revenueTarget, unitCost: uc };
}

// ── Weights ───────────────────────────────────────────────────────────────────
// PYT: weight each NBA team by the odds file's example prices; unlisted teams get the baseline.
export function pytWeights(pricingConfig, teams = NBA_TEAMS) {
  const examples = pricingConfig?.pyt?.examples || [];
  const explicit = {};
  let baseline = pricingConfig?.pyt?.avgSpotPrice || null;
  for (const ex of examples) {
    const name = ex.team || '';
    const c = clean(name);
    if (c.includes('other') || c.includes('avg') || c.includes('ncaa')) {
      if (ex.price) baseline = ex.price; // "All other teams (avg)" sets the baseline
      continue;
    }
    // match example team to a known team (either direction contains)
    const match = teams.find(t => { const ct = clean(t); return ct === c || ct.includes(c) || c.includes(ct); });
    if (match && ex.price) explicit[match] = ex.price;
  }
  if (!baseline) {
    const vals = Object.values(explicit);
    baseline = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 100;
  }
  return teams.map(t => ({ id: t, label: t, weight: explicit[t] ?? baseline }));
}

// PYP: geometric taper so the top player ≈ `premium`× the lowest (odds guidance: 15–20×).
export function pypWeights(players, premium = 18) {
  const list = (players || []).filter(Boolean);
  const n = list.length;
  if (n === 0) return [];
  if (n === 1) return [{ id: list[0], label: list[0], weight: 1 }];
  return list.map((p, i) => {
    const t = (n - 1 - i) / (n - 1); // 1 for first player → 0 for last
    return { id: p, label: p, weight: Math.pow(premium, t) };
  });
}

// ── Price the spots ─────────────────────────────────────────────────────────
// Scales weights so Σ list = revenueTarget (rounded), absorbing the rounding remainder into the top spot.
// Returns spots with { id, label, weight, list, floor }.
export function priceSpots(weighted, { revenueTarget, totalCost, roundTo = 5 }) {
  const spots = weighted.map(s => ({ ...s }));
  const totalWeight = spots.reduce((a, s) => a + s.weight, 0) || 1;
  const costRatio = (revenueTarget && totalCost != null) ? totalCost / revenueTarget : 0;

  let listSum = 0;
  for (const s of spots) {
    s.list = round((s.weight / totalWeight) * revenueTarget, roundTo);
    s.floor = round(s.list * costRatio, roundTo);
    listSum += s.list;
  }
  // Absorb rounding drift into the highest-weight spot so Σ list == revenueTarget exactly.
  if (spots.length) {
    const top = spots.reduce((a, b) => (b.weight > a.weight ? b : a), spots[0]);
    top.list += round(revenueTarget - listSum, 1);
    top.floor = round(top.list * costRatio, roundTo);
  }
  return spots;
}

// Flat pricing for Random breaks — every spot equal, no weighting.
export function randomSpots(spotCount, { revenueTarget, totalCost, roundTo = 5 }) {
  const n = Math.max(1, spotCount | 0);
  const list = round(revenueTarget / n, roundTo);
  const floor = round((totalCost != null ? totalCost / n : list), roundTo);
  return Array.from({ length: n }, (_, i) => ({ id: `spot-${i + 1}`, label: `Spot ${i + 1}`, weight: 1, list, floor }));
}

// ── Live recompute (the negotiation tool) ─────────────────────────────────────
// spots: [{ id, label, weight, list, floor, method: 'Buy Now'|'Auction', sold: number|null }]
// Buy-now spots not yet sold are assumed to lock at their list price. Remaining $ needed is spread
// over the UNSOLD AUCTION spots by weight → each gets a live "min to still hit target".
export function recompute(spots, { revenueTarget, totalCost }) {
  const soldRevenue = spots.reduce((a, s) => a + (s.sold != null ? Number(s.sold) : 0), 0);

  const unsold = spots.filter(s => s.sold == null);
  const unsoldBuyNow = unsold.filter(s => s.method === 'Buy Now');
  const unsoldAuction = unsold.filter(s => s.method !== 'Buy Now');

  const buyNowLocked = unsoldBuyNow.reduce((a, s) => a + (s.list || 0), 0);
  const remainingTarget = revenueTarget - soldRevenue - buyNowLocked;

  const auctionWeight = unsoldAuction.reduce((a, s) => a + (s.weight || 0), 0) || 1;
  const liveById = {};
  for (const s of unsoldAuction) {
    // Minimum this spot can go for and still hit target, given everything else lands as expected.
    liveById[s.id] = Math.max(0, round((s.weight / auctionWeight) * remainingTarget, 5));
  }

  // Projection: sold as actual; unsold buy-now at list; unsold auction at its live min (conservative).
  const projectedRevenue = soldRevenue + buyNowLocked
    + unsoldAuction.reduce((a, s) => a + (liveById[s.id] || 0), 0);
  const projectedAtList = spots.reduce((a, s) => a + (s.sold != null ? Number(s.sold) : (s.list || 0)), 0);

  return {
    soldRevenue,
    committed: soldRevenue + buyNowLocked,
    remainingTarget,
    remainingSpots: unsold.length,
    remainingAuctionSpots: unsoldAuction.length,
    avgNeededPerRemaining: unsoldAuction.length ? round(remainingTarget / unsoldAuction.length, 5) : 0,
    projectedMarginFloor: (projectedRevenue - (totalCost ?? 0)),   // if remaining auctions hit floor
    projectedMarginAtList: (projectedAtList - (totalCost ?? 0)),   // if remaining hit list
    liveMinById: liveById,
  };
}

// Build the initial spot set for a given format.
export function buildSpots({ format, pricingConfig, revenueTarget, totalCost, teams, players, spotCount, roundTo = 5 }) {
  if (format === 'Random') return randomSpots(spotCount || 30, { revenueTarget, totalCost, roundTo });
  const weighted = format === 'PYP'
    ? pypWeights(players || pricingConfig?.__players || [])
    : pytWeights(pricingConfig, teams || NBA_TEAMS);
  return priceSpots(weighted, { revenueTarget, totalCost, roundTo });
}
