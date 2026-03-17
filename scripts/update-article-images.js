#!/usr/bin/env node
/**
 * scripts/update-article-images.js
 *
 * Retroactively updates heroImageUrl for all existing articles.
 * Uses Google Custom Search API (primary) with Pexels as fallback.
 *
 * Usage:
 *   node scripts/update-article-images.js
 *
 * Image API env vars (at least one required):
 *   GOOGLE_CSE_KEY   — Google API key with Custom Search API enabled
 *   GOOGLE_CSE_ID    — Programmable Search Engine ID (cx)
 *   PEXELS_API_KEY   — fallback; free at pexels.com/api
 *
 * Firebase env vars (required):
 *   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 *   — OR — FIREBASE_SERVICE_ACCOUNT_JSON
 */

const PEXELS_KEY = process.env.PEXELS_API_KEY || "";
const GOOGLE_KEY = process.env.GOOGLE_CSE_KEY  || "";
const GOOGLE_CX  = process.env.GOOGLE_CSE_ID   || "";

// Accept either a full FIREBASE_SERVICE_ACCOUNT_JSON or individual parts
let SA = {};
if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  try {
    SA = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  } catch {
    // Some formats (e.g. Vercel local pull) use unquoted keys — rebuild from known parts
  }
}
// Allow individual env var overrides
if (process.env.FIREBASE_PROJECT_ID)     SA.project_id    = process.env.FIREBASE_PROJECT_ID;
if (process.env.FIREBASE_CLIENT_EMAIL)   SA.client_email  = process.env.FIREBASE_CLIENT_EMAIL;
if (process.env.FIREBASE_PRIVATE_KEY)    SA.private_key   = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n");

if (!GOOGLE_KEY && !PEXELS_KEY) {
  console.error("Error: set GOOGLE_CSE_KEY+GOOGLE_CSE_ID (recommended) or PEXELS_API_KEY.");
  process.exit(1);
}
if (!SA.project_id || !SA.client_email || !SA.private_key) {
  console.error("Error: Firebase credentials required. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.");
  process.exit(1);
}

// ── Google Auth (same pattern as generate-article.js) ───────────────────────
function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function googleToken() {
  const now = Math.floor(Date.now() / 1000);
  const header  = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({
    iss: SA.client_email,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    iat: now, exp: now + 3600,
  }));
  const pemBody = SA.private_key.replace(/-----[^-]+-----|[\r\n]/g, "");
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    "pkcs8", Buffer.from(pemBody, "base64"),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]
  );
  const sigBuffer = await globalThis.crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", cryptoKey,
    new TextEncoder().encode(`${header}.${payload}`)
  );
  const sig = b64url(Buffer.from(sigBuffer));
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${header}.${payload}.${sig}`,
  });
  if (!r.ok) throw new Error(`Google token failed: ${r.status}`);
  return (await r.json()).access_token;
}

// ── Firestore helpers ────────────────────────────────────────────────────────
function fromFsVal(fv) {
  if (!fv) return null;
  if ("stringValue" in fv) return fv.stringValue;
  if ("integerValue" in fv) return parseInt(fv.integerValue, 10);
  if ("booleanValue" in fv) return fv.booleanValue;
  if ("arrayValue" in fv) return (fv.arrayValue.values || []).map(fromFsVal);
  if ("mapValue" in fv) return Object.fromEntries(Object.entries(fv.mapValue.fields || {}).map(([k, v]) => [k, fromFsVal(v)]));
  return null;
}

async function fsListAll(token) {
  const projectId = SA.project_id;
  let allDocs = [];
  let pageToken = null;
  do {
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/articles?pageSize=100${pageToken ? `&pageToken=${pageToken}` : ""}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`Firestore list failed: ${r.status}`);
    const data = await r.json();
    if (data.documents) {
      allDocs = allDocs.concat(data.documents.map(doc => ({
        id: doc.name.split("/").pop(),
        name: doc.name,
        title: fromFsVal(doc.fields?.title),
        category: fromFsVal(doc.fields?.category),
        heroImageUrl: fromFsVal(doc.fields?.heroImageUrl),
      })));
    }
    pageToken = data.nextPageToken || null;
  } while (pageToken);
  return allDocs;
}

async function fsPatch(token, docName, heroImageUrl) {
  const r = await fetch(
    `https://firestore.googleapis.com/v1/${docName}?updateMask.fieldPaths=heroImageUrl`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ fields: { heroImageUrl: { stringValue: heroImageUrl } } }),
    }
  );
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`Firestore patch failed: ${r.status} — ${text.slice(0, 200)}`);
  }
}

// ── Image search ─────────────────────────────────────────────────────────────
async function googleSearch(query) {
  if (!GOOGLE_KEY || !GOOGLE_CX) return null;
  try {
    const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_KEY}&cx=${GOOGLE_CX}` +
      `&searchType=image&imgSize=xlarge&imgType=photo&num=1&safe=active&q=${encodeURIComponent(query)}`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const data = await r.json();
    return data.items?.[0]?.link || null;
  } catch { return null; }
}

async function pexelsSearch(query) {
  if (!PEXELS_KEY) return null;
  try {
    const r = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`,
      { headers: { Authorization: PEXELS_KEY } }
    );
    if (!r.ok) return null;
    const data = await r.json();
    return data.photos?.[0]?.src?.large2x || null;
  } catch { return null; }
}

async function searchImage(query) {
  return (await googleSearch(query)) || (await pexelsSearch(query));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("Fetching Google auth token…");
  const token = await googleToken();

  console.log("Listing articles from Firestore…");
  const articles = await fsListAll(token);
  console.log(`Found ${articles.length} articles.\n`);

  let updated = 0;
  let failed  = 0;

  for (let i = 0; i < articles.length; i++) {
    const a = articles[i];
    process.stdout.write(`[${i + 1}/${articles.length}] "${a.title}" … `);

    try {
      // Try article-specific search first, then category fallback
      const query1 = `${a.title} trading card`;
      let imgUrl = await searchImage(query1);
      if (!imgUrl) {
        imgUrl = await searchImage(`${a.category} trading cards collecting`);
      }
      if (!imgUrl) {
        console.log("SKIP (no image found)");
        failed++;
        continue;
      }

      await fsPatch(token, a.name, imgUrl);
      console.log("OK");
      updated++;
    } catch (err) {
      console.log(`ERROR — ${err.message}`);
      failed++;
    }

    // Pexels free tier: 200 req/hour — space requests out
    if (i < articles.length - 1) await sleep(1000);
  }

  console.log(`\n✓ Done — ${updated} updated, ${failed} skipped/failed`);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
