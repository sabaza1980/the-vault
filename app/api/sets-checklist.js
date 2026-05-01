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

function processChecklist(data) {
  const { parallelLibrary, subsets } = data;

  // player slug → { name, slug, team, isRC, league, totalVariants }
  const playerMap = new Map();
  // team name → { name, league, totalVariants, playerSlugs: Set }
  const teamMap = new Map();

  for (const subset of subsets) {
    const parallelCount = (subset.parallels || []).length;
    const variantsPerCard = 1 + parallelCount; // base + each parallel

    for (const card of subset.cards) {
      // Handle dual autos: "Player A / Player B"
      const playerNames = card.player.includes(' / ')
        ? card.player.split(' / ').map(n => n.trim())
        : [card.player];

      const teamName = card.team || 'Unknown';

      // Update team map
      if (!teamMap.has(teamName)) {
        teamMap.set(teamName, {
          name: teamName,
          league: subset.league || 'NBA',
          totalVariants: 0,
          playerSlugs: new Set(),
        });
      }
      const t = teamMap.get(teamName);
      t.totalVariants += variantsPerCard;

      for (const pName of playerNames) {
        const slug = toSlug(pName);

        if (!playerMap.has(slug)) {
          playerMap.set(slug, {
            name: pName,
            slug,
            team: teamName,
            isRC: card.isRC || false,
            league: subset.league || 'NBA',
            totalVariants: 0,
          });
        }
        const p = playerMap.get(slug);
        p.totalVariants += variantsPerCard;
        if (!p.team) p.team = teamName;
        if (card.isRC) p.isRC = true;

        t.playerSlugs.add(slug);
      }
    }
  }

  const players = [...playerMap.values()].sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  const teams = [...teamMap.values()]
    .map(t => ({
      name: t.name,
      league: t.league,
      totalVariants: t.totalVariants,
      playerCount: t.playerSlugs.size,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { players, teams };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { setId } = req.query;
  if (!setId) return res.status(400).json({ error: 'setId required' });

  // Validate setId to prevent path traversal
  if (!/^[a-z0-9-]+$/.test(setId)) return res.status(400).json({ error: 'Invalid setId' });

  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=300');

  try {
    const data = loadChecklist(setId);
    const { players, teams } = processChecklist(data);

    // Subset summaries (no cards array — keep response small)
    const subsets = (data.subsets || []).map(s => ({
      id: s.id,
      name: s.name,
      cardCount: (s.cards || []).length,
      type: s.type || null,
      isAuto: s.isAuto || false,
      isInsert: s.isInsert || false,
      league: s.league || 'NBA',
      exclusive: s.exclusive || null,
      parallels: s.parallels || [],
      versions: s.versions || [],
    }));

    return res.status(200).json({
      set: data.set,
      subsets,
      parallelLibrary: data.parallelLibrary,
      players,
      teams,
    });
  } catch (e) {
    if (e.code === 'ENOENT') return res.status(404).json({ error: `Set not found: ${setId}` });
    console.error('[sets-checklist]', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
