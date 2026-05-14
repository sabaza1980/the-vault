/**
 * /api/sets-ai-context.js
 *
 * Returns a compact, AI-readable text block of all set checklists.
 * Used by VaultChat to inject card-level knowledge into the system prompt so
 * Toppsy/PJ can answer questions like "what Brunson cards are in NBA Hoops?"
 *
 * Output format (plain text):
 *   === SET NAME ===
 *   Subset Name: #N Player [RC], #N Player, ...
 *   ...
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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Aggressive caching — daily TTL, stale-while-revalidate for an hour
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=3600');

  try {
    const files = readdirSync(DATA_DIR)
      .filter(f => f.endsWith('-checklist.json'))
      .sort();

    const blocks = [];
    for (const filename of files) {
      try {
        const raw = readFileSync(join(DATA_DIR, filename), 'utf8');
        const data = JSON.parse(raw);
        blocks.push(buildSetText(data));
      } catch (_) {
        // Skip any malformed files
      }
    }

    const text = blocks.join('\n\n');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(200).send(text);
  } catch (err) {
    console.error('sets-ai-context error:', err);
    return res.status(500).json({ error: 'Failed to build checklist context' });
  }
}
