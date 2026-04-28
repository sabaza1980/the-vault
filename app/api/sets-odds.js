import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../data');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { setId } = req.query;
  if (!setId) return res.status(400).json({ error: 'setId required' });

  // Validate to prevent path traversal
  if (!/^[a-z0-9-]+$/.test(setId)) return res.status(400).json({ error: 'Invalid setId' });

  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=300');

  try {
    const filePath = join(DATA_DIR, `${setId}-odds.json`);
    const data = JSON.parse(readFileSync(filePath, 'utf8'));
    return res.status(200).json(data);
  } catch (e) {
    if (e.code === 'ENOENT') return res.status(404).json({ error: `Odds not found for: ${setId}` });
    console.error('[sets-odds]', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
