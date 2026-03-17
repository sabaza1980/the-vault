#!/usr/bin/env node
/**
 * scripts/update-article-images.js
 *
 * Retroactively updates heroImageUrl for all existing articles using the
 * Pexels API — searching by each article's title for relevant images.
 *
 * Usage:
 *   node scripts/update-article-images.js
 *
 * Required environment variables:
 *   PEXELS_API_KEY              — free at pexels.com/api
 *   FIREBASE_SERVICE_ACCOUNT_JSON — from .env.local
 *
 * The script reads all articles from Firestore, searches Pexels for each
 * one using its title, and patches the heroImageUrl field.
 */

const PEXELS_KEY = process.env.PEXELS_API_KEY || "";
const SA         = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "{}");

if (!PEXELS_KEY) {
  console.error("Error: PEXELS_API_KEY is required. Get a free key at pexels.com/api");
  process.exit(1);
}
if (!SA.project_id) {
  console.error("Error: FIREBASE_SERVICE_ACCOUNT_JSON is required.");
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

// ── Pexels search ────────────────────────────────────────────────────────────
async function pexelsSearch(query) {
  const r = await fetch(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`,
    { headers: { Authorization: PEXELS_KEY } }
  );
  if (!r.ok) return null;
  const data = await r.json();
  return data.photos?.[0]?.src?.large2x || null;
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
      const query1 = `${a.title} ${a.category}`;
      let imgUrl = await pexelsSearch(query1);
      if (!imgUrl) {
        imgUrl = await pexelsSearch(`${a.category} trading cards collecting`);
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
