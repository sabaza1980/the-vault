/**
 * POST /api/generate-article  (GET also accepted for Vercel cron)
 *
 * Generates an SEO-optimised article about card collecting using Claude
 * and stores it in Firestore. Called by a Vercel cron job daily.
 *
 * Uses globalThis.crypto.subtle for JWT (Node 18+, no imports needed).
 * Uses Firestore REST API for writes (authenticated via service account JWT).
 *
 * Body (optional): { topic, category, articleType }
 */

// ── Google Auth JWT (Web Crypto API — no imports required) ──────────────────
function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function googleToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    iat: now, exp: now + 3600,
  }));

  // Strip PEM headers and decode to DER bytes
  const pemBody = sa.private_key.replace(/-----[^-]+-----|[\r\n]/g, "");
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    "pkcs8",
    Buffer.from(pemBody, "base64"),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuffer = await globalThis.crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
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

// ── Firestore REST write ─────────────────────────────────────────────────────
function toFsVal(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFsVal) } };
  if (typeof v === "object") return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, val]) => [k, toFsVal(val)])) } };
  return { stringValue: String(v) };
}

async function fsSlugExists(token, projectId, slug) {
  const body = {
    structuredQuery: {
      from: [{ collectionId: "articles" }],
      where: { fieldFilter: { field: { fieldPath: "slug" }, op: "EQUAL", value: { stringValue: slug } } },
      limit: 1,
    },
  };
  const r = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`,
    { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) }
  );
  if (!r.ok) return false;
  const results = await r.json();
  return results.some(row => row.document);
}

async function fsAdd(token, projectId, collectionId, data) {
  const fields = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, toFsVal(v)]));
  const r = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collectionId}`,
    { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ fields }) }
  );
  if (!r.ok) throw new Error(`Firestore add failed: ${r.status} ${await r.text()}`);
  return (await r.json()).name?.split("/").pop();
}

// ── Google Custom Search image fetch ────────────────────────────────────────
// Requires GOOGLE_CSE_KEY (Google API key with Custom Search API enabled)
// and GOOGLE_CSE_ID (Programmable Search Engine ID, set to search entire web).
// Returns actual card images from TCGPlayer, collector sites, etc.
async function fetchGoogleImages(query, count = 5) {
  const key = process.env.GOOGLE_CSE_KEY;
  const cx  = process.env.GOOGLE_CSE_ID;
  if (!key || !cx) return null;
  try {
    const url = `https://www.googleapis.com/customsearch/v1?key=${key}&cx=${cx}` +
      `&searchType=image&imgSize=xlarge&imgType=photo&num=${Math.min(count, 10)}&safe=active` +
      `&q=${encodeURIComponent(query)}`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const data = await r.json();
    if (!data.items?.length) return null;
    return data.items.map(item => item.link);
  } catch {
    return null;
  }
}

// ── Pexels API image search (fallback) ──────────────────────────────────────
// Used when Google CSE is not configured.
async function fetchPexelsImages(query, count = 5) {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return null;
  try {
    const r = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${Math.min(count, 20)}&orientation=landscape`,
      { headers: { Authorization: key } }
    );
    if (!r.ok) return null;
    const data = await r.json();
    if (!data.photos?.length) return null;
    return data.photos.map(p => p.src.large2x);
  } catch {
    return null;
  }
}

// Try Google first, fall back to Pexels
async function fetchImages(query, count = 5) {
  return (await fetchGoogleImages(query, count)) ||
         (await fetchPexelsImages(query, count));
}

// ── Royalty-free image pools per category (Pexels CDN — free to use) ────────
// Fallback used when PEXELS_API_KEY is not set.
// All images are verified Pexels photos. Format: w=1260&h=750 for hero (16:9)
const CATEGORY_IMAGES = {
  "Pokemon": [
    "https://images.pexels.com/photos/9661254/pexels-photo-9661254.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1",
    "https://images.pexels.com/photos/9572050/pexels-photo-9572050.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1",
    "https://images.pexels.com/photos/9661257/pexels-photo-9661257.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1",
    "https://images.pexels.com/photos/7708408/pexels-photo-7708408.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1",
    "https://images.pexels.com/photos/9343494/pexels-photo-9343494.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1",
    "https://images.pexels.com/photos/9661258/pexels-photo-9661258.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1",
    "https://images.pexels.com/photos/8811594/pexels-photo-8811594.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1",
    "https://images.pexels.com/photos/9560283/pexels-photo-9560283.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1",
  ],
  "MTG": [
    "https://images.pexels.com/photos/7708410/pexels-photo-7708410.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1",
    "https://images.pexels.com/photos/7809125/pexels-photo-7809125.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1",
    "https://images.pexels.com/photos/9661256/pexels-photo-9661256.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1",
    "https://images.pexels.com/photos/9661254/pexels-photo-9661254.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1",
    "https://images.pexels.com/photos/7708411/pexels-photo-7708411.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1",
  ],
  "Yu-Gi-Oh": [
    "https://images.pexels.com/photos/31296167/pexels-photo-31296167.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1",
    "https://images.pexels.com/photos/31296169/pexels-photo-31296169.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1",
    "https://images.pexels.com/photos/20131195/pexels-photo-20131195.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1",
    "https://images.pexels.com/photos/7708410/pexels-photo-7708410.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1",
  ],
  "Basketball": [
    "https://images.pexels.com/photos/7708410/pexels-photo-7708410.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1",
    "https://images.pexels.com/photos/7809125/pexels-photo-7809125.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1",
    "https://images.pexels.com/photos/9661256/pexels-photo-9661256.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1",
    "https://images.pexels.com/photos/9343494/pexels-photo-9343494.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1",
  ],
  "American Football": [
    "https://images.pexels.com/photos/7708410/pexels-photo-7708410.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1",
    "https://images.pexels.com/photos/9661256/pexels-photo-9661256.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1",
    "https://images.pexels.com/photos/7809125/pexels-photo-7809125.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1",
    "https://images.pexels.com/photos/7708408/pexels-photo-7708408.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1",
  ],
  "Soccer": [
    "https://images.pexels.com/photos/7708410/pexels-photo-7708410.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1",
    "https://images.pexels.com/photos/7809125/pexels-photo-7809125.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1",
    "https://images.pexels.com/photos/9343494/pexels-photo-9343494.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1",
    "https://images.pexels.com/photos/9661258/pexels-photo-9661258.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1",
  ],
  "Baseball": [
    "https://images.pexels.com/photos/7708410/pexels-photo-7708410.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1",
    "https://images.pexels.com/photos/9661256/pexels-photo-9661256.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1",
    "https://images.pexels.com/photos/9343494/pexels-photo-9343494.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1",
    "https://images.pexels.com/photos/7708408/pexels-photo-7708408.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1",
  ],
  "Hockey": [
    "https://images.pexels.com/photos/7708410/pexels-photo-7708410.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1",
    "https://images.pexels.com/photos/9661256/pexels-photo-9661256.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1",
    "https://images.pexels.com/photos/7809125/pexels-photo-7809125.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1",
    "https://images.pexels.com/photos/9343494/pexels-photo-9343494.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1",
  ],
  "General": [
    "https://images.pexels.com/photos/7708410/pexels-photo-7708410.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1",
    "https://images.pexels.com/photos/7809125/pexels-photo-7809125.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1",
    "https://images.pexels.com/photos/9661256/pexels-photo-9661256.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1",
    "https://images.pexels.com/photos/9343494/pexels-photo-9343494.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1",
    "https://images.pexels.com/photos/9661254/pexels-photo-9661254.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1",
    "https://images.pexels.com/photos/7708408/pexels-photo-7708408.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1",
  ],
};

function pickImages(category) {
  return CATEGORY_IMAGES[category] || CATEGORY_IMAGES["General"];
}

// Cycle through the pool to supply N images (repeats if pool is smaller than N)
function pickNImages(category, n) {
  const pool = CATEGORY_IMAGES[category] || CATEGORY_IMAGES["General"];
  const out = [];
  for (let i = 0; i < n; i++) out.push(pool[i % pool.length]);
  return out;
}

// ── Topic rotation pool ──────────────────────────────────────────────────────
// Each entry: { category, articleType, title, keyFocus }
const TOPIC_POOL = [
  // Pokemon
  { category: "Pokemon", articleType: "market-analysis", title: "The 10 Most Valuable Pokémon Cards Right Now (And Why)", keyFocus: "Scarlet & Violet, alt arts, special illustration rares, PSA 10 values, eBay sales records" },
  { category: "Pokemon", articleType: "guide", title: "Pokémon Card Grading: PSA vs CGC vs Beckett — Which Is Best for Your Cards?", keyFocus: "PSA 10 premium, grading costs, turnaround times, CGC sub-grades, centering on vintage holo cards" },
  { category: "Pokemon", articleType: "news", title: "Every Major Pokémon Card Set Releasing in 2025 — What Collectors Need to Know", keyFocus: "Twilight Masquerade, Shrouded Fable, Stellar Crown, Prismatic Evolutions, set release dates" },
  { category: "Pokemon", articleType: "opinion", title: "Why 1st Edition Base Set Charizard Is Still the Hobby's Greatest Icon", keyFocus: "cultural significance, PSA 10 population, historical sales, nostalgia premium, investment vs. collecting" },
  { category: "Pokemon", articleType: "guide", title: "How to Spot a Fake Pokémon Card: The Complete 2025 Guide", keyFocus: "light test, printing quality, font comparison, texture check, WOTC era fakes vs modern fakes" },

  // MTG
  { category: "MTG", articleType: "market-analysis", title: "Why Modern Horizons 3 Is Reshaping the MTG Collector Market", keyFocus: "fetch lands, Commander staples, collector booster pull rates, foil prices, secondary market trends" },
  { category: "MTG", articleType: "guide", title: "The Reserved List Explained: Why These MTG Cards Can Never Be Reprinted", keyFocus: "Black Lotus, Mox Pearl, dual lands, power nine, original dual land values, Legacy demand" },
  { category: "MTG", articleType: "opinion", title: "From Draft Chaff to $1,000 Cards: The Magic of MTG Price Memory", keyFocus: "fetchlands, snapcaster mage, price spikes, reprint risk, Commander demand, format staples" },
  { category: "MTG", articleType: "market-analysis", title: "The 15 Most Expensive MTG Cards in 2025 — Ranked and Explained", keyFocus: "Black Lotus Alpha, Power Nine, Mox, dual lands, showcase cards, serialised cards" },

  // Sports — Basketball
  { category: "Basketball", articleType: "market-analysis", title: "The 10 Hottest Basketball Rookie Cards in 2025 — and What They're Worth", keyFocus: "Panini Prizm rookies, PSA 10 values, eBay sold prices, Wembanyama, Caitlin Clark, Bronny James" },
  { category: "Basketball", articleType: "guide", title: "Panini Prizm Basketball: The Complete Collector's Guide to Every Parallel", keyFocus: "Silver, Gold, Red Wave, Green Wave, Orange, Purple, aqua, holo, printing plates, box odds" },
  { category: "Basketball", articleType: "opinion", title: "The Best Basketball Cards to Buy Right Now (According to a Collector, Not a Flipper)", keyFocus: "Giannis, Luka, Jokic, Tatum, player career trajectory, set prestige, long-term hold" },

  // Sports — American Football
  { category: "American Football", articleType: "market-analysis", title: "The Top 10 NFL Rookie Card Investments of 2025", keyFocus: "Panini Prizm NFL, Donruss Optic, National Treasures, Patrick Mahomes, Caleb Williams, RPA cards" },
  { category: "American Football", articleType: "guide", title: "NFL Rookie Patch Autographs (RPAs): Everything You Need to Know", keyFocus: "National Treasures RPA, Immaculate Collection, printing plates, 1/1s, on-card vs. sticker autos" },

  // Sports — Soccer
  { category: "Soccer", articleType: "market-analysis", title: "The Most Valuable Soccer Cards in 2025 — From Mbappé to Haaland", keyFocus: "Panini Prizm World Cup, Topps UCL Chrome, Mbappé auto, Haaland RC, Bellingham, serial numbered rookies" },
  { category: "Soccer", articleType: "guide", title: "Soccer Card Collecting 101: The Best Sets, Players and Parallels to Know", keyFocus: "Panini Prizm, Topps Chrome UCL, Match Attax, rookie year, auto cards, global demand" },

  // Sports — Baseball
  { category: "Baseball", articleType: "market-analysis", title: "Bowman Chrome Baseball: Why These Prospects Are Worth Watching in 2025", keyFocus: "Bowman Chrome auto, first Bowman, prospect cards, PSA 10 rookie autos, Jackson Chourio, Elly De La Cruz" },
  { category: "Baseball", articleType: "guide", title: "The 1952 Topps Mickey Mantle: Understanding Baseball's Most Important Card", keyFocus: "1952 Topps, Mickey Mantle #311, PSA grades, SGC, auction records, vintage market" },

  // Sports — Hockey
  { category: "Hockey", articleType: "guide", title: "Upper Deck Young Guns: The Definitive Guide to Hockey's Premier Rookie Card", keyFocus: "Series 1, Series 2, Short Print YGs, Connor Bedard, population reports, PSA 10, authentication" },

  // Cross-category / General
  { category: "General", articleType: "guide", title: "PSA vs Beckett vs SGC: Which Grading Service Is Right for Your Card Collection?", keyFocus: "grading tiers, PSA 10, BGS 9.5, SGC 10, turnaround time, cost, sub-grades, labels" },
  { category: "General", articleType: "opinion", title: "10 Cards Every Serious Collector Should Own (One From Every Category)", keyFocus: "diversity, PSA 10 Charizard, Black Lotus, Wembanyama Prizm, Mbappé RC, Mantle 1952, graded sets" },
  { category: "General", articleType: "news", title: "The Biggest Card Auction Results of 2025 So Far", keyFocus: "Heritage Auctions, PWCC, Goldin Auctions, record sales, Charizard, Mantle, Mahomes, Pokémon promos" },
  { category: "General", articleType: "guide", title: "How to Build a Pokémon and Sports Card Collection From Scratch in 2025", keyFocus: "budget collecting, storage, tracking apps, eBay, TCGPlayer, card shows, protecting cards, The Vault app" },
  { category: "General", articleType: "opinion", title: "My Favourite Cards: What Every Collector's Dream Pull Says About the Hobby", keyFocus: "personal collecting, first card, dream card, 1/1 cards, emotional value vs. monetary value" },
  { category: "General", articleType: "market-analysis", title: "Card Collecting in 2025: Which Markets Are Up, Which Are Down?", keyFocus: "Pokémon vs sports vs MTG market trends, eBay sales data, grading submissions, bubble versus growth" },
];

// ── Article prompt builder ───────────────────────────────────────────────────
function buildArticlePrompt(topic, inlineImages, listSize) {
  let imgInstructions = "";
  if (listSize && inlineImages.length > 0) {
    imgInstructions = `8. **Images — one per list entry**: This is a "Top ${listSize}" article. After the paragraph describing EACH numbered entry (${listSize} entries total), insert one <img> tag from the list below IN ORDER. Use descriptive, relevant alt text for each.
${inlineImages.slice(0, listSize).map((url, i) => `   Entry ${i + 1}: <img src="${url}" alt="[descriptive alt text]" class="article-img" />`).join("\n")}
   This means ${listSize} images total, one per entry, placed after the last paragraph of each numbered section.`;
  } else if (inlineImages.length > 0) {
    imgInstructions = `8. **Inline images**: You MUST include exactly ${Math.min(inlineImages.length, 3)} images inside \`htmlContent\` as \`<img>\` tags. Place each one after a paragraph where a visual adds context — never in the middle of running text. Use this exact HTML format for each (write descriptive alt text relevant to the article):
${inlineImages.slice(0, 3).map((url, i) => `   Image ${i + 1}: <img src="${url}" alt="[descriptive alt text]" class="article-img" />`).join("\n")}
   Vary the placement: put Image 1 after the intro, Image 2 mid-article, Image 3 near the end.`;
  }

  return `You are The Vault's expert content editor, writing high-quality SEO articles for a card collecting app. Write a fully formatted, long-form article for the following brief.

BRIEF
Title: ${topic.title}
Category: ${topic.category}
Article Type: ${topic.articleType}
Key SEO focus areas: ${topic.keyFocus}

REQUIREMENTS
1. **Audience**: Card collectors of all levels — from casual to serious.
2. **Tone**: Knowledgeable, enthusiastic, honest. Not overly salesy. Like a trusted collector friend who happens to write really well.
3. **Length**: 800–1200 words of actual article content.
4. **SEO**: 
   - Use the article title as an H1.
   - Include at least 4 natural secondary H2 headings.
   - Naturally weave in keyword phrases like: "card collection app", "scan cards with AI", "track card value", "The Vault app", "PSA grading advice", "eBay card pricing", and 3–5 category-specific terms.
   - Include a brief closing CTA paragraph referring readers to The Vault app at https://www.thevaultapp.com without sounding like an ad — frame it as a natural recommendation.
5. **Structure**: Intro → 3–5 body sections with H2s → conclusion with soft CTA.
6. **Accuracy**: Only state things that are factually correct about the hobby. If referencing recent pricing, frame them as "as of early 2025" or "recent eBay sold data".
7. **HTML tags**: Use only h1, h2, p, ul, li, strong, em, a tags — no outer wrapper div.
${imgInstructions ? imgInstructions + "\n" : ""}${imgInstructions ? "9" : "8"}. **Output format**: Return ONLY a JSON object with these fields — no markdown code fences, no extra text:
   {
     "title": "exact article title",
     "slug": "url-friendly-slug-from-title",
     "category": "${topic.category}",
     "articleType": "${topic.articleType}",
     "excerpt": "1-2 sentence compelling summary for SEO meta description (max 155 chars)",
     "tags": ["array", "of", "5-8", "relevant", "keyword", "tags"],
     "htmlContent": "<full article HTML using h1, h2, p, ul, li tags${(listSize || inlineImages.length > 0) ? " — includes the <img class=\\\"article-img\\\"> tags exactly as specified above" : ""} — no outer wrapper>"
   }`;
}

// ── Handler ──────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // Accept GET (Vercel cron invocations) and POST (manual triggers)
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Simple bearer token auth to prevent abuse
  const authHeader = req.headers.authorization || "";
  const expectedToken = process.env.ARTICLE_GEN_SECRET;
  if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const apiKey = process.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Anthropic API key not configured" });
  }

  try {
    // Pick a topic: use body if provided, otherwise rotate by day-of-year
    let topic;
    if (req.body && req.body.topic) {
      topic = req.body;
    } else {
      const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
      topic = TOPIC_POOL[dayOfYear % TOPIC_POOL.length];
    }

    // Guard: skip if an article with this slug already exists
    const previewSlug = topic.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const saCheck = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "{}");
    if (saCheck.project_id) {
      const checkToken = await googleToken(saCheck);
      if (await fsSlugExists(checkToken, saCheck.project_id, previewSlug)) {
        return res.status(200).json({ skipped: true, reason: "Article with this slug already exists", slug: previewSlug });
      }
    }

    // Pick images for this article (hero = first, inline = rest)
    const listSize = (req.body && req.body.listSize) ? req.body.listSize : null;

    // Build a specific search query from the article topic for relevant images
    const imageQuery = `${topic.title} trading card`;
    const imageCount = listSize ? listSize + 1 : 5;
    let images = await fetchImages(imageQuery, imageCount);

    // If we didn't get enough images for a list article, top up with a broader query
    if (images && listSize && images.length < listSize + 1) {
      const extra = await fetchImages(`${topic.category} card collecting`, listSize + 1 - images.length);
      if (extra) images = images.concat(extra);
    }
    // Last resort: static category pool
    if (!images || images.length === 0) {
      images = listSize ? pickNImages(topic.category, listSize + 1) : pickImages(topic.category);
    }

    const heroImageUrl = images[0];
    let inlineImages;
    if (listSize) {
      // Cycle through available images to fill all list slots
      const pool = images.slice(1);
      inlineImages = Array.from({ length: listSize }, (_, i) => pool[i % pool.length]);
    } else {
      inlineImages = images.slice(1, 4); // up to 3 inline images
    }

    const prompt = buildArticlePrompt(topic, inlineImages, listSize);

    // Call Claude
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text().catch(() => "");
      return res.status(502).json({ error: `Claude API error: ${claudeRes.status}`, detail: errText.slice(0, 300) });
    }

    const claudeData = await claudeRes.json();
    const rawText = claudeData.content.filter((b) => b.type === "text").map((b) => b.text).join("");

    let article;
    try {
      const clean = rawText.replace(/```json|```/g, "").trim();
      article = JSON.parse(clean);
    } catch {
      return res.status(500).json({ error: "Failed to parse article JSON from Claude", raw: rawText.slice(0, 500) });
    }

    // Persist to Firestore via REST API
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "{}");
    if (!sa.project_id) return res.status(500).json({ error: "Firebase not configured" });

    const token = await googleToken(sa);
    const docId = await fsAdd(token, sa.project_id, "articles", {
      ...article,
      heroImageUrl,
      publishedAt: new Date().toISOString(),
      status: "published",
      source: "auto-generated",
    });

    return res.status(200).json({ id: docId, title: article.title, slug: article.slug });
  } catch (err) {
    console.error("generate-article error:", err);
    return res.status(500).json({ error: err.message });
  }
}
