/**
 * GET /api/articles
 *
 * Returns published articles from Firestore for the public blog page.
 * Query params:
 *   ?limit=N       — max results (default 20)
 *   ?category=X    — filter by category
 *   ?slug=X        — return a single article by slug
 */

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

function getDb() {
  if (!getApps().length) {
    const serviceAccount = JSON.parse(
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "{}"
    );
    initializeApp({ credential: cert(serviceAccount) });
  }
  return getFirestore();
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // CORS — allow the website domain to call this
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=60");

  try {
    const db = getDb();
    const { limit = "20", category, slug } = req.query;

    let query = db.collection("articles").where("status", "==", "published");

    if (slug) {
      query = db.collection("articles").where("slug", "==", slug).where("status", "==", "published").limit(1);
      const snap = await query.get();
      if (snap.empty) return res.status(404).json({ error: "Article not found" });
      const doc = snap.docs[0];
      return res.status(200).json({ id: doc.id, ...doc.data(), publishedAt: doc.data().publishedAt?.toDate?.()?.toISOString() });
    }

    if (category) {
      query = query.where("category", "==", category);
    }

    query = query.orderBy("publishedAt", "desc").limit(Math.min(parseInt(limit, 10) || 20, 50));

    const snap = await query.get();
    const articles = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        title: data.title,
        slug: data.slug,
        category: data.category,
        articleType: data.articleType,
        excerpt: data.excerpt,
        tags: data.tags || [],
        publishedAt: data.publishedAt?.toDate?.()?.toISOString() || null,
      };
    });

    return res.status(200).json({ articles });
  } catch (err) {
    console.error("articles API error:", err);
    return res.status(500).json({ error: err.message });
  }
}
