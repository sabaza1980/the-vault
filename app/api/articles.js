/**
 * GET /api/articles
 *
 * Returns published articles from Firestore for the public blog page.
 * Uses Firestore REST API + Node.js built-in crypto (no firebase-admin needed).
 *
 * Query params:
 *   ?limit=N       — max results (default 20)
 *   ?category=X    — filter by category
 *   ?slug=X        — return a single article by slug
 */

import { createSign } from "node:crypto";

// ── Firestore REST helpers ───────────────────────────────────────────────────
function b64url(s) {
  return Buffer.from(s).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

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

function toFsVal(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFsVal) } };
  return { stringValue: String(v) };
}

function fieldFilter(field, op, value) {
  return { fieldFilter: { field: { fieldPath: field }, op, value: toFsVal(value) } };
}

async function googleToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/datastore", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const sign = createSign("RSA-SHA256");
  sign.update(`${header}.${payload}`);
  const sig = sign.sign(sa.private_key).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${header}.${payload}.${sig}` });
  if (!r.ok) throw new Error(`Google token exchange failed: ${r.status}`);
  return (await r.json()).access_token;
}

async function fsQuery(token, projectId, collectionId, filters, orderBy, limit) {
  const sq = { from: [{ collectionId }] };
  if (filters.length === 1) sq.where = filters[0];
  else if (filters.length > 1) sq.where = { compositeFilter: { op: "AND", filters } };
  if (orderBy) sq.orderBy = [{ field: { fieldPath: orderBy.field }, direction: orderBy.direction }];
  if (limit) sq.limit = limit;
  const r = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ structuredQuery: sq }),
  });
  if (!r.ok) throw new Error(`Firestore query failed: ${r.status}`);
  const data = await r.json();
  return data.filter((row) => row.document).map((row) => fromDoc(row.document));
}

// ── Handler ──────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=60");

  try {
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "{}");
    if (!sa.project_id) return res.status(500).json({ error: "Firebase not configured" });

    const token = await googleToken(sa);
    const { limit = "20", category, slug } = req.query;

    const filters = [fieldFilter("status", "EQUAL", "published")];
    if (category) filters.push(fieldFilter("category", "EQUAL", category));
    if (slug) filters.push(fieldFilter("slug", "EQUAL", slug));

    const limitN = Math.min(parseInt(limit, 10) || 20, 50);
    const docs = await fsQuery(token, sa.project_id, "articles", filters, { field: "publishedAt", direction: "DESCENDING" }, limitN);

    if (slug) {
      if (!docs.length) return res.status(404).json({ error: "Article not found" });
      return res.status(200).json(docs[0]);
    }

    const articles = docs.map(({ htmlContent, ...rest }) => rest);
    return res.status(200).json({ articles });
  } catch (err) {
    console.error("articles API error:", err);
    return res.status(500).json({ error: err.message });
  }
}
