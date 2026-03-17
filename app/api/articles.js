/**
 * GET /api/articles
 *
 * Returns published articles from Firestore for the public blog page.
 * Uses Firestore REST API with the public Firebase API key (no auth needed
 * because firestore.rules has: allow read: if true for articles).
 *
 * Query params:
 *   ?limit=N       — max results (default 20)
 *   ?category=X    — filter by category
 *   ?slug=X        — return a single article by slug
 *
 * Zero imports — safe to bundle in any Vercel runtime.
 */

// Helper: decode a Firestore field value to a plain JS value
function fromFsVal(fv) {
  if (!fv) return null;
  if ("stringValue" in fv) return fv.stringValue;
  if ("integerValue" in fv) return parseInt(fv.integerValue, 10);
  if ("doubleValue" in fv) return fv.doubleValue;
  if ("booleanValue" in fv) return fv.booleanValue;
  if ("nullValue" in fv) return null;
  if ("timestampValue" in fv) return fv.timestampValue;
  if ("arrayValue" in fv) return (fv.arrayValue.values || []).map(fromFsVal);
  if ("mapValue" in fv) return Object.fromEntries(Object.entries(fv.mapValue.fields || {}).map(([k, v]) => [k, fromFsVal(v)]));
  return null;
}

function fromDoc(doc) {
  if (!doc?.fields) return null;
  return { id: doc.name?.split("/").pop(), ...Object.fromEntries(Object.entries(doc.fields).map(([k, v]) => [k, fromFsVal(v)])) };
}

// ── Handler ──────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=60");

  try {
    const projectId = process.env.VITE_FIREBASE_PROJECT_ID;
    const apiKey = process.env.VITE_FIREBASE_API_KEY;
    if (!projectId) return res.status(500).json({ error: "Firebase not configured" });

    const { limit = "20", category, slug } = req.query;
    const limitN = Math.min(parseInt(limit, 10) || 20, 50);

    // Build structured query — public read is allowed via Firestore rules
    const filters = [{ fieldFilter: { field: { fieldPath: "status" }, op: "EQUAL", value: { stringValue: "published" } } }];
    if (category) filters.push({ fieldFilter: { field: { fieldPath: "category" }, op: "EQUAL", value: { stringValue: category } } });
    if (slug) filters.push({ fieldFilter: { field: { fieldPath: "slug" }, op: "EQUAL", value: { stringValue: slug } } });

    const sq = {
      from: [{ collectionId: "articles" }],
      where: filters.length === 1 ? filters[0] : { compositeFilter: { op: "AND", filters } },
      limit: limitN,
    };

    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery?key=${apiKey}`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ structuredQuery: sq }),
    });
    if (!r.ok) throw new Error(`Firestore error: ${r.status}`);

    const rows = await r.json();
    const docs = rows.filter((row) => row.document).map((row) => fromDoc(row.document));

    if (slug) {
      if (!docs.length) return res.status(404).json({ error: "Article not found" });
      return res.status(200).json(docs[0]);
    }

    const articles = docs
      .sort((a, b) => (b.publishedAt || "").localeCompare(a.publishedAt || ""))
      .map(({ htmlContent, ...rest }) => rest);
    return res.status(200).json({ articles });
  } catch (err) {
    console.error("articles API error:", err);
    return res.status(500).json({ error: err.message });
  }
}
