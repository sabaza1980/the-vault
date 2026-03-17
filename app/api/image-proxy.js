// Proxies Firebase Storage images server-side so the browser canvas can draw
// them without hitting CORS restrictions.  Restricted to Firebase Storage only
// to prevent SSRF abuse.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url required' });

  let decoded;
  try { decoded = decodeURIComponent(url); } catch {
    return res.status(400).json({ error: 'invalid url' });
  }

  // Security: only proxy Firebase Storage for this project
  if (!decoded.startsWith('https://firebasestorage.googleapis.com/')) {
    return res.status(403).json({ error: 'URL not allowed' });
  }

  try {
    const response = await fetch(decoded);
    if (!response.ok) return res.status(response.status).end();

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const buffer = await response.arrayBuffer();

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(Buffer.from(buffer));
  } catch {
    res.status(500).json({ error: 'fetch failed' });
  }
}
