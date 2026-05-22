/**
 * /api/sets-ai-context.js
 *
 * Returns a compact, AI-readable text block of:
 *   1. All set checklists (player-level card data)
 *   2. Break pricing guidance from all odds files (PYT/PYP/random pricing tables)
 *
 * Used by VaultChat to inject set knowledge into the system prompt so
 * Toppsy/PJ can answer questions like "what Brunson cards are in NBA Hoops?"
 * and "how should I price a Bowman PYT break?"
 *
 * Output format (plain text):
 *   === SET NAME ===
 *   Subset Name: #N Player [RC], #N Player, ...
 *
 *   === BREAK PRICING GUIDANCE — ALL SETS ===
 *   --- SET NAME ---
 *   Case cost: $X | N autos/case | ...
 *
 * Cached aggressively — set data changes infrequently.
 */

import { readdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../data');

function buildSetText(data) {
  const setName = (data.set?.name || data.setId || 'Unknown Set').toUpperCase();
  const lines = [`=== ${setName} ===`];

  for (const subset of (data.subsets || [])) {
    if (!subset.cards?.length) continue;
    const entries = subset.cards.map(c => {
      const rc = c.isRC ? ' [RC]' : '';
      return `${c.number} ${c.player}${rc}`;
    }).join(', ');
    lines.push(`${subset.name}: ${entries}`);
  }

  return lines.join('\n');
}

/**
 * Builds a compact break pricing block from a single odds file.
 * Reads entirely from the JSON — no hardcoded prices here.
 */
function buildBreakPricingText(setId, data) {
  const g = data.breakPricingGuidance;
  if (!g || !g.caseCost) return null;

  const setName = data.setName || setId;
  const oddsUnit = data.oddsUnit || 'per-pack';
  const firstConfig = Object.values(data.configurations || {})[0] || {};
  const boxesPerCase = firstConfig.boxesPerCase || g.boxesPerCase || '?';

  // Check whether a checklist exists for this set
  const hasChecklist = (() => {
    try { readFileSync(join(DATA_DIR, `${setId}-checklist.json`)); return true; } catch { return false; }
  })();

  const lines = [`--- ${setName.toUpperCase()} ---`];

  const checklistNote = hasChecklist ? '' : ' | ⚠️ NO CHECKLIST YET — player/card queries unavailable for this set';
  lines.push(`${boxesPerCase}-box case | odds unit: ${oddsUnit}${checklistNote}`);
  lines.push(
    `Case cost: $${g.caseCost} | ${g.autosPerCase} autos/case | ` +
    `${Math.round((g.marginTarget || 0.15) * 100)}% margin → $${g.revenueTarget} revenue target | ` +
    `Cost/auto at breakeven: $${g.costPerAutoAtBreakeven}`
  );

  if (g.caseNote) {
    lines.push(`NOTE: ${g.caseNote}`);
  }

  if (g.pytPricing) {
    const pyt = g.pytPricing;
    const examples = (pyt.examples || [])
      .map(e => `${e.team} $${e.price} (${e.reason})`)
      .join(', ');
    lines.push(`PYT avg spot: $${pyt.avgSpotPrice}/30 teams | ${examples}`);
  }

  if (g.randomBreak) {
    const rb = g.randomBreak;
    lines.push(`Random: ${rb.spotsRecommended} spots × $${rb.spotPrice} = $${rb.totalRevenue}`);
  }

  return lines.join('\n');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Aggressive caching — daily TTL, stale-while-revalidate for an hour
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=3600');

  try {
    // ── 1. Checklist blocks ──────────────────────────────────────────────────
    const checklistFiles = readdirSync(DATA_DIR)
      .filter(f => f.endsWith('-checklist.json'))
      .sort();

    const checklistBlocks = [];
    for (const filename of checklistFiles) {
      try {
        const raw = readFileSync(join(DATA_DIR, filename), 'utf8');
        const data = JSON.parse(raw);
        checklistBlocks.push(buildSetText(data));
      } catch (_) {
        // Skip any malformed files
      }
    }

    // ── 2. Break pricing blocks (from odds files) ────────────────────────────
    const oddsFiles = readdirSync(DATA_DIR)
      .filter(f => f.endsWith('-odds.json'))
      .sort();

    // Deduplicate: prefer the file whose setId matches its filename exactly.
    // (app/data has both 2025-26-topps-hoops-basketball-odds.json and
    //  2025-26-topps-nba-hoops-basketball-odds.json — only include one per setId.)
    const seenSetIds = new Set();
    const pricingBlocks = [];
    for (const filename of oddsFiles) {
      try {
        const raw = readFileSync(join(DATA_DIR, filename), 'utf8');
        const data = JSON.parse(raw);
        const setId = data.setId || filename.replace('-odds.json', '');
        if (seenSetIds.has(setId)) continue;
        seenSetIds.add(setId);
        const block = buildBreakPricingText(setId, data);
        if (block) pricingBlocks.push(block);
      } catch (_) {
        // Skip malformed
      }
    }

    // ── 3. Auto-value ranking (derived from pricing data, not hardcoded) ─────
    const rankingLines = [];
    if (pricingBlocks.length > 0) {
      // Re-parse to build ranking
      const ranked = [];
      for (const filename of oddsFiles) {
        try {
          const data = JSON.parse(readFileSync(join(DATA_DIR, filename), 'utf8'));
          const g = data.breakPricingGuidance;
          if (!g || !g.costPerAutoAtBreakeven) continue;
          const setId = data.setId || filename.replace('-odds.json', '');
          if (ranked.some(r => r.setId === setId)) continue;
          ranked.push({ setId, name: data.setName || setId, costPerAuto: g.costPerAutoAtBreakeven, autosPerCase: g.autosPerCase });
        } catch (_) {}
      }
      ranked.sort((a, b) => a.costPerAuto - b.costPerAuto);
      if (ranked.length > 1) {
        rankingLines.push('Auto value ranking (best cost/auto → worst):');
        ranked.forEach((r, i) => {
          rankingLines.push(`  ${i + 1}. ${r.name}: $${r.costPerAuto}/auto (${r.autosPerCase} autos/case)`);
        });
        rankingLines.push('NOTE: Cosmic Chrome value is in numbered parallels/SSPs, NOT autos. Do not rank it as an auto product.');
      }
    }

    // ── 4. Assemble full response ────────────────────────────────────────────
    const parts = [];
    if (checklistBlocks.length > 0) parts.push(checklistBlocks.join('\n\n'));
    if (pricingBlocks.length > 0) {
      const header = [
        '=== BREAK PRICING GUIDANCE — ALL SETS ===',
        '(Auto-generated from odds JSON files. Values update when JSON files are updated.)',
        '(Topps Three: odds are per-CARD. All other sets: odds are per-PACK.)',
      ].join('\n');
      parts.push(header + '\n\n' + pricingBlocks.join('\n\n'));
    }
    if (rankingLines.length > 0) {
      parts.push('=== SET COMPARISON — AUTO VALUE ===\n' + rankingLines.join('\n'));
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(200).send(parts.join('\n\n'));
  } catch (err) {
    console.error('sets-ai-context error:', err);
    return res.status(500).json({ error: 'Failed to build checklist context' });
  }
}
