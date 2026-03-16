/**
 * POST /api/generate-article
 *
 * Generates an SEO-optimised article about card collecting using Claude
 * and stores it in Firestore. Called by a Vercel cron job daily.
 *
 * Body (optional): { topic, category, articleType }
 * If body is empty, a topic is chosen automatically from the rotation pool.
 */

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

// Lazy-initialise Firebase Admin SDK
function getDb() {
  if (!getApps().length) {
    const serviceAccount = JSON.parse(
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "{}"
    );
    initializeApp({ credential: cert(serviceAccount) });
  }
  return getFirestore();
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
function buildArticlePrompt(topic) {
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
7. **Output format**: Return ONLY a JSON object with these fields — no markdown code fences, no extra text:
   {
     "title": "exact article title",
     "slug": "url-friendly-slug-from-title",
     "category": "${topic.category}",
     "articleType": "${topic.articleType}",
     "excerpt": "1-2 sentence compelling summary for SEO meta description (max 155 chars)",
     "tags": ["array", "of", "5-8", "relevant", "keyword", "tags"],
     "htmlContent": "<full article HTML using h1, h2, p, ul, li tags — no outer wrapper>"
   }`;
}

// ── Handler ──────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== "POST") {
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

    const prompt = buildArticlePrompt(topic);

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

    // Persist to Firestore
    const db = getDb();
    const docRef = await db.collection("articles").add({
      ...article,
      publishedAt: Timestamp.now(),
      status: "published",
      source: "auto-generated",
    });

    return res.status(200).json({ id: docRef.id, title: article.title, slug: article.slug });
  } catch (err) {
    console.error("generate-article error:", err);
    return res.status(500).json({ error: err.message });
  }
}
