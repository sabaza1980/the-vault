import { readdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../data');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=300');

  try {
    const files = readdirSync(DATA_DIR).filter(f => f.endsWith('-checklist.json'));

    const sets = files.map(filename => {
      const setId = filename.replace('-checklist.json', '');
      try {
        const data = JSON.parse(readFileSync(join(DATA_DIR, filename), 'utf8'));
        const setMeta = data.set || {};
        const totalCards = (data.subsets || []).reduce((s, sub) => s + sub.cards.length, 0);
        const totalVariants = (data.subsets || []).reduce((s, sub) => {
          return s + sub.cards.length * (1 + (sub.parallels || []).length);
        }, 0);
        return {
          id: setId,
          name: setMeta.name || setId,
          year: setMeta.year || '',
          sport: setMeta.sport || '',
          brand: setMeta.brand || '',
          subsetCount: (data.subsets || []).length,
          totalCards,
          totalVariants,
        };
      } catch {
        return { id: setId, name: setId };
      }
    });

    return res.status(200).json({ sets });
  } catch (e) {
    console.error('[sets-list]', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
