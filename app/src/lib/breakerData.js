// breakerData.js — shared data layer for the Breakers hub (BK-1 Products & Odds, BK-2 Calculator).
//
// Sets + odds come from the same API the consumer tracker uses:
//   GET /api/sets-list            → { sets: [{ id, name, year, sport, brand, subsetCount, totalCards, totalVariants }] }
//   GET /api/sets-odds?setId=ID   → full odds JSON (configurations, perParallel, …, breakPricingGuidance)
//
// The `breakPricingGuidance` block comes in two shapes; normalizeOdds() flattens both so the rest of
// the app never branches on it:
//   • multi-config  (e.g. Bowman): { multiConfig:true, breakRelevantConfigs:[…], Hobby:{…}, Jumbo:{…}, … }
//   • flat/uniform  (e.g. Cosmic Chrome): { caseCost, revenueTarget, pytPricing, randomBreak, … }
//   • absent        (e.g. Hoops): odds-only, no pricing → pricing.configs = []

const API_BASE = import.meta.env.VITE_API_BASE || '';

// ── Fetch ─────────────────────────────────────────────────────────────────────

export async function fetchSets() {
  const r = await fetch(`${API_BASE}/api/sets-list`);
  if (!r.ok) throw new Error(`sets-list HTTP ${r.status}`);
  const data = await r.json();
  return (data.sets || []).slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

export async function fetchOdds(setId) {
  const r = await fetch(`${API_BASE}/api/sets-odds?setId=${encodeURIComponent(setId)}`);
  if (r.status === 404) return null; // odds not published for this set
  if (!r.ok) throw new Error(`sets-odds HTTP ${r.status}`);
  return r.json();
}

// ── Normalize ─────────────────────────────────────────────────────────────────

// Keys inside a pricing block that are metadata, not configs. Used to detect flat vs multi-config.
const NON_CONFIG_KEYS = new Set([
  '_comment', 'multiConfig', 'breakRelevantConfigs', 'autoStructure', 'topPlayers',
  'evFramework', 'scalingNote',
]);

function num(v) {
  return (typeof v === 'number' && !Number.isNaN(v)) ? v : null;
}

// Pull a single pricing config block into a stable shape.
function normalizeConfigPricing(name, blk) {
  const caseCost = num(blk.caseCost) ?? num(blk.casePriceUSD);
  const pyt = blk.pytPricing && typeof blk.pytPricing === 'object' ? {
    avgSpotPrice: num(blk.pytPricing.avgSpotPrice),
    examples: Array.isArray(blk.pytPricing.examples) ? blk.pytPricing.examples : [],
  } : null;
  const random = blk.randomBreak && typeof blk.randomBreak === 'object' ? {
    spotsRecommended: num(blk.randomBreak.spotsRecommended),
    spotPrice: num(blk.randomBreak.spotPrice),
    totalRevenue: num(blk.randomBreak.totalRevenue),
  } : null;
  const pyp = blk.pypGuidance && typeof blk.pypGuidance === 'object' ? {
    methodology: blk.pypGuidance.methodology || '',
    topPlayerPremium: blk.pypGuidance.topPlayerPremium || '',
    averageSpotAtCost: num(blk.pypGuidance.averageSpotAtCost),
  } : null;

  return {
    configName: name,
    caseCost,
    priceUnconfirmed: !!blk.priceUnconfirmed || caseCost == null,
    estimatedCaseRange: blk.estimatedCaseRange || null,
    boxesPerCase: num(blk.boxesPerCase),
    cardsPerCase: num(blk.cardsPerCase),
    autosPerCase: num(blk.autosPerCase),
    marginTarget: num(blk.marginTarget) ?? 0.15,
    revenueTarget: num(blk.revenueTarget),
    costPerAutoAtBreakeven: num(blk.costPerAutoAtBreakeven),
    caseNote: blk.caseNote || '',
    pyt, random, pyp,
  };
}

// Turn a full odds JSON into { pricing, configurations, topPlayers, … }.
export function normalizeOdds(setMeta, odds) {
  if (!odds) {
    return { ...setMeta, hasOdds: false, configurations: [], topPlayers: [], pricing: { multiConfig: false, configs: [] } };
  }

  // Box configurations (structure + guarantees) live outside pricing, keyed by config name.
  const configurations = Object.entries(odds.configurations || {}).map(([name, c]) => ({
    name,
    cardsPerPack: num(c.cardsPerPack),
    packsPerBox: num(c.packsPerBox),
    boxesPerCase: num(c.boxesPerCase),
    cardsPerCase: (num(c.cardsPerPack) && num(c.packsPerBox) && num(c.boxesPerCase))
      ? c.cardsPerPack * c.packsPerBox * c.boxesPerCase : null,
    guarantees: c.guarantees || {},
  }));

  const bpg = odds.breakPricingGuidance || {};
  const topPlayers = bpg.topPlayers || [];
  let configs = [];
  let multiConfig = false;

  if (bpg.multiConfig) {
    multiConfig = true;
    const names = bpg.breakRelevantConfigs && bpg.breakRelevantConfigs.length
      ? bpg.breakRelevantConfigs
      : Object.keys(bpg).filter(k => !NON_CONFIG_KEYS.has(k) && bpg[k] && typeof bpg[k] === 'object');
    configs = names
      .filter(n => bpg[n] && typeof bpg[n] === 'object')
      .map(n => normalizeConfigPricing(n, bpg[n]));
  } else if (bpg.caseCost != null || bpg.casePriceUSD != null || bpg.pytPricing || bpg.randomBreak) {
    // Flat / uniform pricing → single pseudo-config.
    configs = [normalizeConfigPricing('Case', bpg)];
  }

  // Which box configs are break-relevant (for display). Prefer explicit list; else configs that have pricing.
  const breakRelevant = new Set(
    bpg.breakRelevantConfigs && bpg.breakRelevantConfigs.length
      ? bpg.breakRelevantConfigs
      : configs.map(c => c.configName)
  );

  return {
    ...setMeta,
    hasOdds: true,
    lastUpdated: odds.lastUpdated || null,
    source: odds.source || null,
    configurations: configurations.map(c => ({ ...c, breakRelevant: breakRelevant.has(c.name) })),
    topPlayers,
    pricing: { multiConfig, configs },
  };
}

// Compute a revenue target from a case cost + margin when the JSON didn't precompute one.
export function revenueTarget(caseCost, marginTarget = 0.15) {
  if (caseCost == null) return null;
  return Math.round(caseCost * (1 + marginTarget));
}

// Convenience: load a set's full normalized detail in one call.
export async function loadSetDetail(setMeta) {
  const odds = await fetchOdds(setMeta.id);
  return normalizeOdds(setMeta, odds);
}
