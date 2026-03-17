#!/usr/bin/env node
/**
 * scripts/dedupe-articles.js
 *
 * Removes duplicate articles from Firestore, keeping the most recently
 * published document for each unique slug. Duplicates with the same title
 * but different slugs are also detected and reported.
 *
 * Usage:
 *   node scripts/dedupe-articles.js          — dry run (shows what would be deleted)
 *   node scripts/dedupe-articles.js --delete  — actually delete duplicates
 *
 * Firebase env vars (required):
 *   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 *   — OR — FIREBASE_SERVICE_ACCOUNT_JSON
 */

const DRY_RUN = !process.argv.includes("--delete");

// ── Firebase credentials ─────────────────────────────────────────────────────
let SA = {};
if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  try { SA = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON); } catch {}
}
if (process.env.FIREBASE_PROJECT_ID)   SA.project_id   = process.env.FIREBASE_PROJECT_ID;
if (process.env.FIREBASE_CLIENT_EMAIL) SA.client_email = process.env.FIREBASE_CLIENT_EMAIL;
if (process.env.FIREBASE_PRIVATE_KEY)  SA.private_key  = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n");

if (!SA.project_id || !SA.client_email || !SA.private_key) {
  console.error("Error: Firebase credentials required. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.");
  process.exit(1);
}

// ── Google Auth ──────────────────────────────────────────────────────────────
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
  if ("stringValue"  in fv) return fv.stringValue;
  if ("integerValue" in fv) return parseInt(fv.integerValue, 10);
  if ("booleanValue" in fv) return fv.booleanValue;
  if ("arrayValue"   in fv) return (fv.arrayValue.values || []).map(fromFsVal);
  if ("mapValue"     in fv) return Object.fromEntries(Object.entries(fv.mapValue.fields || {}).map(([k, v]) => [k, fromFsVal(v)]));
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
        id:           doc.name.split("/").pop(),
        name:         doc.name,
        title:        fromFsVal(doc.fields?.title)       || "",
        slug:         fromFsVal(doc.fields?.slug)        || "",
        publishedAt:  fromFsVal(doc.fields?.publishedAt) || "",
        status:       fromFsVal(doc.fields?.status)      || "",
      })));
    }
    pageToken = data.nextPageToken || null;
  } while (pageToken);
  return allDocs;
}

async function fsDelete(token, docName) {
  const r = await fetch(
    `https://firestore.googleapis.com/v1/${docName}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
  );
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`Delete failed: ${r.status} — ${text.slice(0, 200)}`);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  if (DRY_RUN) {
    console.log("DRY RUN — pass --delete to actually remove duplicates\n");
  }

  console.log("Fetching Google auth token…");
  const token = await googleToken();

  console.log("Listing articles from Firestore…");
  const articles = await fsListAll(token);
  console.log(`Found ${articles.length} total articles.\n`);

  // Group by normalized title (primary dedup key — catches same title with different slugs)
  const byTitle = new Map();
  for (const a of articles) {
    const key = a.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!byTitle.has(key)) byTitle.set(key, []);
    byTitle.get(key).push(a);
  }

  const toDelete = [];

  for (const [slug, group] of byTitle) {
    if (group.length <= 1) continue;

    // Keep the one with the latest publishedAt; tie-break by doc id (lexicographically last)
    group.sort((a, b) => {
      const ta = a.publishedAt || "";
      const tb = b.publishedAt || "";
      if (tb !== ta) return tb > ta ? 1 : -1;
      return b.id > a.id ? 1 : -1;
    });

    const [keep, ...dupes] = group;
    console.log(`DUPLICATE slug "${slug}" (${group.length} copies)`);
    console.log(`  KEEP:   ${keep.id}  (publishedAt: ${keep.publishedAt || "none"})`);
    for (const d of dupes) {
      console.log(`  DELETE: ${d.id}  (publishedAt: ${d.publishedAt || "none"})`);
      toDelete.push(d);
    }
  }

  console.log(`\n${toDelete.length} duplicate(s) to remove out of ${articles.length} articles.`);

  if (toDelete.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  if (DRY_RUN) {
    console.log("\nRun with --delete to remove them.");
    return;
  }

  console.log("\nDeleting…");
  let deleted = 0;
  let failed  = 0;
  for (const d of toDelete) {
    process.stdout.write(`  Deleting ${d.id} ("${d.title.slice(0, 50)}") … `);
    try {
      await fsDelete(token, d.name);
      console.log("OK");
      deleted++;
    } catch (err) {
      console.log(`ERROR — ${err.message}`);
      failed++;
    }
  }

  console.log(`\n✓ Done — ${deleted} deleted, ${failed} failed`);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
