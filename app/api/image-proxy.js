/**
 * GET /api/image-proxy?url=<encoded-url>
 *
 * Fetches an image server-side and streams it back with CORS headers so the
 * client-side canvas can draw it without cross-origin taint errors.
 *
 * SECURITY: only Firebase / Google Storage hosts are allowed (SSRF prevention).
 */

const ALLOWED_HOSTS = new Set([
  'firebasestorage.googleapis.com',
  'storage.googleapis.com',
]);

export default async function handler(req, res) {
  // Support preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'missing url' });

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return res.status(400).json({ error: 'invalid url' });
  }

  // Enforce HTTPS + whitelist (SSRF guard)
  if (parsed.protocol !== 'https:' || !ALLOWED_HOSTS.has(parsed.hostname)) {
    return res.status(403).json({ error: 'forbidden host' });
  }

  try {
    const upstream = await fetch(url);
    if (!upstream.ok) return res.status(upstream.status).end();

    const contentType = upstream.headers.get('content-type') || 'image/jpeg';
    const buffer = await upstream.arrayBuffer();

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=3600');
    res.status(200).send(Buffer.from(buffer));
  } catch (err) {
    console.error('[image-proxy] fetch error:', err);
    res.status(502).json({ error: 'upstream fetch failed' });
  }
}
