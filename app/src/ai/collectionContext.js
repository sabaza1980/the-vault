/**
 * Transforms the user's card collection into a compact, structured text block
 * suitable for injection into a Claude system prompt.
 *
 * The goal is maximum usefulness per token:
 * - Summary stats at the top for fast reference
 * - Top value cards listed explicitly
 * - Full card index so the AI can answer precise lookups
 *
 * @param {Array<Object>} cards - The user's card array from Firestore/state
 * @returns {string} - Formatted collection context block, or empty string if no cards
 */
export function buildCollectionContext(cards) {
  if (!cards || cards.length === 0) return "";

  // ── Summary stats ──────────────────────────────────────────────────────────
  const total = cards.length;

  const totalValue = cards.reduce((sum, c) => sum + (c.estimatedValue || 0), 0);
  const valuedCount = cards.filter((c) => c.estimatedValue > 0).length;

  const rookieCount = cards.filter((c) => c.isRookie).length;
  const autoCount = cards.filter((c) => c.hasAutograph).length;
  const onCardAutoCount = cards.filter((c) => c.autographType === "On-Card").length;
  const stickerAutoCount = cards.filter((c) => c.autographType === "Sticker").length;
  const serialCount = cards.filter((c) => c.serialNumber || c.isNumbered).length;
  const patchCount = cards.filter((c) => c.hasPatch).length;
  const gradedCount = cards.filter((c) => c.isGraded).length;
  const insertCount = cards.filter((c) => c.isInsert).length;
  const favouriteCount = cards.filter((c) => c.isFavourite).length;
  const pcCount = cards.filter((c) => c.isPC).length;

  // Rarity breakdown
  const rarityCounts = {};
  cards.forEach((c) => {
    const r = c.rarity || "Unknown";
    rarityCounts[r] = (rarityCounts[r] || 0) + 1;
  });
  const rarityOrder = ["Common", "Uncommon", "Rare", "Very Rare", "Ultra Rare", "Legendary", "Unknown"];
  const rarityBreakdown = rarityOrder
    .filter((r) => rarityCounts[r])
    .map((r) => `${r}: ${rarityCounts[r]}`)
    .join(", ");

  // ── Category distribution ──────────────────────────────────────────────────
  const categoryCounts = {};
  cards.forEach((c) => {
    const cat = c.cardCategory || "Unknown";
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
  });
  const categoryBreakdown = Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, count]) => `${cat}: ${count}`)
    .join(", ");

  // ── Player distribution ────────────────────────────────────────────────────
  const playerCounts = {};
  cards.forEach((c) => {
    if (c.playerName && c.playerName !== "Unknown Player") {
      playerCounts[c.playerName] = (playerCounts[c.playerName] || 0) + 1;
    }
  });
  const topPlayers = Object.entries(playerCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([name, count]) => `${name} (${count})`)
    .join(", ");

  // ── Brand distribution ─────────────────────────────────────────────────────
  const brandCounts = {};
  cards.forEach((c) => {
    if (c.brand && c.brand !== "Unknown") {
      brandCounts[c.brand] = (brandCounts[c.brand] || 0) + 1;
    }
  });
  const brandBreakdown = Object.entries(brandCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([brand, count]) => `${brand} (${count})`)
    .join(", ");

  // ── Sport distribution (for sport cards) ──────────────────────────────────
  const sportCards = cards.filter((c) => c.sport);
  const sportCounts = {};
  sportCards.forEach((c) => {
    sportCounts[c.sport] = (sportCounts[c.sport] || 0) + 1;
  });
  const sportBreakdown = Object.entries(sportCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([s, count]) => `${s}: ${count}`)
    .join(", ");

  // ── League distribution ────────────────────────────────────────────────────
  const leagueCounts = {};
  cards.forEach((c) => {
    if (c.league) {
      leagueCounts[c.league] = (leagueCounts[c.league] || 0) + 1;
    }
  });
  const leagueBreakdown = Object.entries(leagueCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([l, count]) => `${l}: ${count}`)
    .join(", ");

  // ── Insert breakdown ───────────────────────────────────────────────────────
  const insertGroups = {};
  cards.forEach((c) => {
    if (c.insertName) {
      insertGroups[c.insertName] = (insertGroups[c.insertName] || 0) + 1;
    }
  });
  const insertBreakdown = Object.entries(insertGroups)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => `${name}: ${count}`)
    .join(", ");

  // ── Position distribution ──────────────────────────────────────────────────
  const positionCounts = {};
  cards.forEach((c) => {
    if (c.playerPosition) {
      positionCounts[c.playerPosition] = (positionCounts[c.playerPosition] || 0) + 1;
    }
  });
  const positionBreakdown = Object.entries(positionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([p, count]) => `${p}: ${count}`)
    .join(", ");

  // ── Top cards by estimated value ───────────────────────────────────────────
  const topValueCards = [...cards]
    .filter((c) => c.estimatedValue > 0)
    .sort((a, b) => b.estimatedValue - a.estimatedValue)
    .slice(0, 15);

  const topValueLines = topValueCards
    .map((c, i) => {
      const parts = [
        c.playerName || "Unknown",
        c.fullCardName || [c.year, c.brand, c.series].filter(Boolean).join(" ") || "Unknown Set",
        c.parallel && c.parallel !== "Base" ? c.parallel : null,
        c.serialNumber ? `Serial: ${c.serialNumber}` : null,
        c.hasAutograph ? "AUTO" : null,
        c.isRookie ? "RC" : null,
        c.condition ? `Condition: ${c.condition}` : null,
      ]
        .filter(Boolean)
        .join(" | ");
      return `  ${i + 1}. ${parts} → $${c.estimatedValue.toFixed(2)}`;
    })
    .join("\n");

  // ── Full card index ────────────────────────────────────────────────────────
  // Compact single-line-per-card format for precise lookup
  const cardLines = cards
    .map((c) => {
      const flags = [
        c.isRookie ? "RC" : null,
        c.hasAutograph ? (c.autographType ? `AUTO(${c.autographType})` : "AUTO") : null,
        c.hasPatch ? "PATCH" : null,
        c.serialNumber ? `SN:${c.serialNumber}` : (c.isNumbered && c.printRun ? `SN:/${c.printRun}` : null),
        c.isInsert ? "INSERT" : null,
        c.isGraded ? (c.gradingCompany && c.grade ? `${c.gradingCompany} ${c.grade}` : "GRADED") : null,
        c.isFavourite ? "FAV" : null,
        c.estimatedValue > 0 ? `$${c.estimatedValue.toFixed(2)}` : null,
      ]
        .filter(Boolean)
        .join(" ");

      const setLabel =
        c.fullCardName || [c.year, c.brand, c.series].filter(Boolean).join(" ") || "Unknown Set";
      const parallelPart =
        c.parallel && c.parallel !== "Base" ? ` [${c.parallel}]` : "";
      const insertPart = c.insertName ? ` {${c.insertName}}` : "";
      const condPart = c.condition && c.condition !== "Unknown" ? ` | ${c.condition}` : "";
      const teamPart = c.team && c.team !== "Unknown" ? ` | ${c.team}` : "";
      const catPart = c.cardCategory ? ` | ${c.cardCategory}` : "";
      const sportPart = c.sport ? ` | ${c.sport}` : "";
      const leaguePart = c.league ? ` | ${c.league}` : "";
      const posPart = c.playerPosition ? ` | ${c.playerPosition}` : "";

      return `- ${c.playerName || "Unknown"} | ${setLabel}${parallelPart}${insertPart}${teamPart}${catPart}${sportPart}${leaguePart}${posPart}${condPart}${flags ? " | " + flags : ""}`;
    })
    .join("\n");

  // ── Assemble ───────────────────────────────────────────────────────────────
  const lines = [
    "=== COLLECTION CONTEXT ===",
    "",
    `Total items: ${total}`,
    totalValue > 0
      ? `Total estimated value: $${totalValue.toFixed(2)} (eBay sold averages across ${valuedCount} of ${total} items — estimates only, not guaranteed sale prices)`
      : `Estimated values: not yet loaded (requires expanding items to fetch eBay data)`,
    `Rookie cards: ${rookieCount}`,
    `Autographs: ${autoCount}${autoCount > 0 ? ` (${onCardAutoCount} on-card, ${stickerAutoCount} sticker)` : ""}`,
    `Patch / memorabilia cards: ${patchCount}`,
    `Serial-numbered: ${serialCount}`,
    `Insert / subset cards: ${insertCount}`,
    `Graded: ${gradedCount}`,
    `Favourited: ${favouriteCount}`,
    `PC (Personal Collection): ${pcCount}`,
    "",
    `Rarity breakdown: ${rarityBreakdown}`,
    "",
    `Collection categories: ${categoryBreakdown || "unknown (items may predate category detection)"}`,
    ...(sportBreakdown ? ["", `Sports breakdown: ${sportBreakdown}`] : []),
    ...(leagueBreakdown ? [`Leagues: ${leagueBreakdown}`] : []),
    ...(positionBreakdown ? [`Positions: ${positionBreakdown}`] : []),
    ...(insertBreakdown ? ["", `Inserts & subsets by name: ${insertBreakdown}`] : []),
    "",
    `Top players by card count: ${topPlayers || "none"}`,
    "",
    `Brands in collection: ${brandBreakdown || "none"}`,
  ];

  if (topValueCards.length > 0) {
    lines.push("", "Top items by estimated value:");
    lines.push(topValueLines);
  }

  lines.push("", "Full item index (for precise lookups):");
  lines.push(cardLines);

  return lines.join("\n");
}

/**
 * Mock collection for testing prompt output without real data.
 */
export const MOCK_COLLECTION = [
  {
    id: 1,
    playerName: "LeBron James",
    fullCardName: "2003-04 Upper Deck Exquisite",
    year: "2003-04",
    brand: "Upper Deck",
    series: "Exquisite",
    parallel: "Base",
    team: "Cleveland Cavaliers",
    isRookie: true,
    hasAutograph: true,
    autographType: "On-Card",
    serialNumber: "08/99",
    rarity: "Legendary",
    condition: "Near Mint",
    estimatedValue: 4200.0,
    isFavourite: true,
  },
  {
    id: 2,
    playerName: "Kobe Bryant",
    fullCardName: "2000-01 Topps Chrome",
    year: "2000-01",
    brand: "Topps",
    series: "Chrome",
    parallel: "Refractor",
    team: "Los Angeles Lakers",
    isRookie: false,
    hasAutograph: false,
    rarity: "Rare",
    condition: "Near Mint",
    estimatedValue: 320.0,
    isFavourite: true,
  },
  {
    id: 3,
    playerName: "Stephen Curry",
    fullCardName: "2009-10 Panini Prizm",
    year: "2009-10",
    brand: "Panini",
    series: "Prizm",
    parallel: "Silver",
    team: "Golden State Warriors",
    isRookie: true,
    hasAutograph: false,
    rarity: "Rare",
    condition: "Near Mint",
    estimatedValue: 180.0,
  },
];
