#!/usr/bin/env node
/**
 * scripts/seed-articles.js
 *
 * Seeds the first 20 articles by POSTing each topic to the generate-article
 * API endpoint. Requires Claude + Firestore to be configured on the deployment.
 *
 * Usage:
 *   node scripts/seed-articles.js
 *
 * Environment variables (or edit the constants below):
 *   ARTICLE_API_BASE    — deployed Vercel URL, e.g. https://app-five-xi-40.vercel.app
 *   ARTICLE_GEN_SECRET  — the bearer token set in Vercel env vars
 *
 * The script waits 3 seconds between each request to avoid hitting Claude's
 * rate limits. Run time: ~60-90 seconds for 20 articles.
 */

const BASE_URL = process.env.ARTICLE_API_BASE || "https://app-five-xi-40.vercel.app";
const SECRET   = process.env.ARTICLE_GEN_SECRET || "";

// ── The 20 seed topics ───────────────────────────────────────────────────────
// listSize is set for "Top N" articles so Claude places one image per entry.
const TOPICS = [
  // ── Pokémon (5) ────────────────────────────────────────────────────────────
  {
    topic: "scheduled",
    title: "The 10 Most Valuable Pokémon Cards Right Now (And Why)",
    category: "Pokemon",
    articleType: "market-analysis",
    keyFocus: "Scarlet & Violet, alt arts, special illustration rares, PSA 10 values, eBay sales records",
    listSize: 10,
  },
  {
    topic: "scheduled",
    title: "Pokémon Card Grading: PSA vs CGC vs Beckett — Which Is Best for Your Cards?",
    category: "Pokemon",
    articleType: "guide",
    keyFocus: "PSA 10 premium, grading costs, turnaround times, CGC sub-grades, centering on vintage holo cards",
  },
  {
    topic: "scheduled",
    title: "Every Major Pokémon Card Set Releasing in 2025 — What Collectors Need to Know",
    category: "Pokemon",
    articleType: "news",
    keyFocus: "Twilight Masquerade, Shrouded Fable, Stellar Crown, Prismatic Evolutions, set release dates",
  },
  {
    topic: "scheduled",
    title: "Why 1st Edition Base Set Charizard Is Still the Hobby's Greatest Icon",
    category: "Pokemon",
    articleType: "opinion",
    keyFocus: "cultural significance, PSA 10 population, historical sales, nostalgia premium, investment vs. collecting",
  },
  {
    topic: "scheduled",
    title: "How to Spot a Fake Pokémon Card: The Complete 2025 Guide",
    category: "Pokemon",
    articleType: "guide",
    keyFocus: "light test, printing quality, font comparison, texture check, WOTC era fakes vs modern fakes",
  },

  // ── MTG (4) ────────────────────────────────────────────────────────────────
  {
    topic: "scheduled",
    title: "Why Modern Horizons 3 Is Reshaping the MTG Collector Market",
    category: "MTG",
    articleType: "market-analysis",
    keyFocus: "fetch lands, Commander staples, collector booster pull rates, foil prices, secondary market trends",
  },
  {
    topic: "scheduled",
    title: "The Reserved List Explained: Why These MTG Cards Can Never Be Reprinted",
    category: "MTG",
    articleType: "guide",
    keyFocus: "Black Lotus, Mox Pearl, dual lands, power nine, original dual land values, Legacy demand",
  },
  {
    topic: "scheduled",
    title: "The 15 Most Expensive MTG Cards in 2025 — Ranked and Explained",
    category: "MTG",
    articleType: "market-analysis",
    keyFocus: "Black Lotus Alpha, Power Nine, Mox, dual lands, showcase cards, serialised cards",
    listSize: 15,
  },

  // ── Basketball (3) ─────────────────────────────────────────────────────────
  {
    topic: "scheduled",
    title: "The 10 Hottest Basketball Rookie Cards in 2025 — and What They're Worth",
    category: "Basketball",
    articleType: "market-analysis",
    keyFocus: "Panini Prizm rookies, PSA 10 values, eBay sold prices, Wembanyama, Caitlin Clark, Bronny James",
    listSize: 10,
  },
  {
    topic: "scheduled",
    title: "Panini Prizm Basketball: The Complete Collector's Guide to Every Parallel",
    category: "Basketball",
    articleType: "guide",
    keyFocus: "Silver, Gold, Red Wave, Green Wave, Orange, Purple, aqua, holo, printing plates, box odds",
  },
  {
    topic: "scheduled",
    title: "The Best Basketball Cards to Buy Right Now (According to a Collector, Not a Flipper)",
    category: "Basketball",
    articleType: "opinion",
    keyFocus: "Giannis, Luka, Jokic, Tatum, player career trajectory, set prestige, long-term hold",
  },

  // ── American Football (2) ──────────────────────────────────────────────────
  {
    topic: "scheduled",
    title: "The Top 10 NFL Rookie Card Investments of 2025",
    category: "American Football",
    articleType: "market-analysis",
    keyFocus: "Panini Prizm NFL, Donruss Optic, National Treasures, Patrick Mahomes, Caleb Williams, RPA cards",
    listSize: 10,
  },
  {
    topic: "scheduled",
    title: "NFL Rookie Patch Autographs (RPAs): Everything You Need to Know",
    category: "American Football",
    articleType: "guide",
    keyFocus: "National Treasures RPA, Immaculate Collection, printing plates, 1/1s, on-card vs. sticker autos",
  },

  // ── Soccer (2) ─────────────────────────────────────────────────────────────
  {
    topic: "scheduled",
    title: "The Most Valuable Soccer Cards in 2025 — From Mbappé to Haaland",
    category: "Soccer",
    articleType: "market-analysis",
    keyFocus: "Panini Prizm World Cup, Topps UCL Chrome, Mbappé auto, Haaland RC, Bellingham, serial numbered rookies",
  },
  {
    topic: "scheduled",
    title: "Soccer Card Collecting 101: The Best Sets, Players and Parallels to Know",
    category: "Soccer",
    articleType: "guide",
    keyFocus: "Panini Prizm, Topps Chrome UCL, Match Attax, rookie year, auto cards, global demand",
  },

  // ── Baseball (2) ───────────────────────────────────────────────────────────
  {
    topic: "scheduled",
    title: "Bowman Chrome Baseball: Why These Prospects Are Worth Watching in 2025",
    category: "Baseball",
    articleType: "market-analysis",
    keyFocus: "Bowman Chrome auto, first Bowman, prospect cards, PSA 10 rookie autos, Jackson Chourio, Elly De La Cruz",
  },
  {
    topic: "scheduled",
    title: "The 1952 Topps Mickey Mantle: Understanding Baseball's Most Important Card",
    category: "Baseball",
    articleType: "guide",
    keyFocus: "1952 Topps, Mickey Mantle #311, PSA grades, SGC, auction records, vintage market",
  },

  // ── General (3) ───────────────────────────────────────────────────────────
  {
    topic: "scheduled",
    title: "PSA vs Beckett vs SGC: Which Grading Service Is Right for Your Card Collection?",
    category: "General",
    articleType: "guide",
    keyFocus: "grading tiers, PSA 10, BGS 9.5, SGC 10, turnaround time, cost, sub-grades, labels",
  },
  {
    topic: "scheduled",
    title: "Card Collecting in 2025: Which Markets Are Up, Which Are Down?",
    category: "General",
    articleType: "market-analysis",
    keyFocus: "Pokémon vs sports vs MTG market trends, eBay sales data, grading submissions, bubble versus growth",
  },
  {
    topic: "scheduled",
    title: "How to Build a Card Collection From Scratch in 2025",
    category: "General",
    articleType: "guide",
    keyFocus: "budget collecting, storage, tracking apps, eBay, TCGPlayer, card shows, protecting cards, The Vault app",
  },
];

// ── Runner ───────────────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function generateArticle(topic, index, total) {
  const label = `[${index + 1}/${total}] "${topic.title}"`;
  process.stdout.write(`${label} … `);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90_000); // 90s timeout
    const res = await fetch(`${BASE_URL}/api/generate-article`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(SECRET ? { Authorization: `Bearer ${SECRET}` } : {}),
      },
      body: JSON.stringify(topic),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.log(`FAILED (${res.status}) — ${text.slice(0, 120)}`);
      return false;
    }

    const data = await res.json();
    console.log(`OK — id: ${data.id}, slug: ${data.slug}`);
    return true;
  } catch (err) {
    console.log(`ERROR — ${err.message}`);
    return false;
  }
}

async function main() {
  if (!SECRET) {
    console.warn("⚠  ARTICLE_GEN_SECRET is not set — requests may be rejected if the endpoint requires auth.\n");
  }

  console.log(`Seeding ${TOPICS.length} articles → ${BASE_URL}\n`);

  let ok = 0;
  let fail = 0;

  // Start from a specific index if passed as CLI arg: node seed-articles.js 6
  const startFrom = parseInt(process.argv[2] || "0", 10);
  if (startFrom > 0) console.log(`▶ Resuming from article ${startFrom + 1}\n`);

  for (let i = startFrom; i < TOPICS.length; i++) {
    const success = await generateArticle(TOPICS[i], i, TOPICS.length);
    if (success) ok++; else fail++;

    // 6-second gap between requests to avoid Claude rate limits
    if (i < TOPICS.length - 1) await sleep(6000);
  }

  console.log(`\n✓ Done — ${ok} generated, ${fail} failed`);
  if (fail > 0) {
    console.log(`  Re-run with a starting index to retry failed ones, e.g.: node seed-articles.js 6`);
  }
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
