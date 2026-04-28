import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../data');

function toSlug(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function loadChecklist(setId) {
  const filePath = join(DATA_DIR, `${setId}-checklist.json`);
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { setId, player: playerSlug } = req.query;
  if (!setId) return res.status(400).json({ error: 'setId required' });
  if (!playerSlug) return res.status(400).json({ error: 'player required' });

  // Validate to prevent path traversal
  if (!/^[a-z0-9-]+$/.test(setId)) return res.status(400).json({ error: 'Invalid setId' });
  if (!/^[a-z0-9-/]+$/.test(playerSlug)) return res.status(400).json({ error: 'Invalid player slug' });

  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=300');

  try {
    const data = loadChecklist(setId);
    const { parallelLibrary, subsets } = data;

    // Find all subsets/cards where this player appears
    const appearances = [];
    let playerName = null;
    let playerTeam = null;
    let playerIsRC = false;
    let playerLeague = null;
    let totalVariants = 0;

    for (const subset of subsets) {
      const parallels = (subset.parallels || []).map(pId => {
        const pDef = parallelLibrary[pId] || {};
        return {
          id: pId,
          name: pDef.name || pId,
          shortName: pDef.shortName || pDef.name || pId,
          printRun: pDef.printRun || null,
          color: pDef.color || null,
          exclusive: pDef.exclusive || null,
          isBase: false,
        };
      });

      // Include base as the first variant
      const allVariants = [
        { id: null, name: 'Base', shortName: 'Base', printRun: null, color: null, exclusive: subset.exclusive || null, isBase: true },
        ...parallels,
      ];

      const matchingCards = (subset.cards || []).filter(card => {
        const names = card.player.includes(' / ')
          ? card.player.split(' / ').map(n => n.trim())
          : [card.player];
        return names.some(n => toSlug(n) === playerSlug);
      });

      for (const card of matchingCards) {
        if (!playerName) {
          // Prefer the exact name that matches the slug
          const names = card.player.includes(' / ')
            ? card.player.split(' / ').map(n => n.trim())
            : [card.player];
          playerName = names.find(n => toSlug(n) === playerSlug) || names[0];
          playerTeam = card.team;
          playerIsRC = card.isRC || false;
          playerLeague = subset.league || 'NBA';
        }
        if (card.isRC) playerIsRC = true;

        totalVariants += allVariants.length;

        appearances.push({
          subset: {
            id: subset.id,
            name: subset.name,
            isAuto: subset.isAuto || false,
            isInsert: subset.isInsert || false,
            league: subset.league || 'NBA',
            exclusive: subset.exclusive || null,
          },
          card: {
            number: card.number,
            player: card.player,
            team: card.team,
            isRC: card.isRC || false,
            isDualAuto: card.player.includes(' / '),
          },
          variants: allVariants,
        });
      }
    }

    if (!playerName) return res.status(404).json({ error: `Player not found: ${playerSlug}` });

    return res.status(200).json({
      player: {
        name: playerName,
        slug: playerSlug,
        team: playerTeam,
        isRC: playerIsRC,
        league: playerLeague,
      },
      appearances,
      totalVariants,
    });
  } catch (e) {
    if (e.code === 'ENOENT') return res.status(404).json({ error: `Set not found: ${setId}` });
    console.error('[sets-player]', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
