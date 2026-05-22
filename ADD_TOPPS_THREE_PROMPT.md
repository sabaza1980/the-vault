# Add 2025-26 Topps Three Basketball to the Break Tracker

> Paste this into Cursor / Claude Code / Copilot Chat in VS Code.
> The original feature spec lives at `/the-vault/BREAK_TRACKER_PROMPT.md`. This file is additive — don't redo the architecture, just integrate the new set.

---

## What's already done

You shipped the Break Hit Tracker for **2025-26 Bowman Basketball** and **2025-26 Topps Cosmic Chrome Basketball**. The home page dropdown lets users pick which set they're breaking, and selecting a set deep-links to the tracker for that set. The seeder loads any `/the-vault/*-checklist.json` file as a registered set.

## What I need

Two new files have been added to `/the-vault/`:

- `/the-vault/2025-26-topps-three-basketball-checklist.json` — 28 subsets, 1170 trackable card entries
- `/the-vault/2025-26-topps-three-basketball-odds.json` — official Topps per-card odds plus break pricing guidance

Make this set available everywhere the Bowman and Cosmic Chrome sets already are — the home page dropdown, the tracker page, search results, the AI assistant, share links — without code changes specific to "Topps Three." If you need to special-case anything for this set, the data file has the structure to express it; don't hardcode.

## Set overview

| Field | Value |
|---|---|
| Set ID | `2025-26-topps-three-basketball` |
| Release date | 2026-05-20 |
| Configuration | Hobby only |
| Case config | 4 boxes/case, 4 cards/box, 3 autos/box guaranteed |
| Case cost | $6,750 (~$1,687.50/box) |
| Subsets | 28 |
| Card entries | 1,170 |

## Steps

1. **Run the seeder.** Confirm the new set registers cleanly. After it runs, `card_sets` should have 3 rows (Bowman + Cosmic Chrome + Topps Three). The new set should show 28 subsets, 1170 card entries.
2. **Home page dropdown.** Verify the new set appears. The label should pull from `set.name` ("2025-26 Topps Three Basketball"). Sort order: most recent release date first — Topps Three (2026-05-20) → Cosmic Chrome (2026-04-29) → Bowman (2026-04-22).
3. **Tracker page.** Navigate to the new set's tracker. Confirm both Player view and Team view render, search works, the AI assistant has set-specific context, and the player quick-filter chip works exactly like Bowman's.
4. **Odds.** These are official Topps published values — display them as authoritative (no "estimated" badge). Odds are expressed as per-card (e.g., 1:5), not per-pack, because Topps Three has no traditional packs. Display accordingly.
5. **Break pricing.** The odds JSON includes a `breakPricingGuidance` block. Surface this data to the AI assistant so it can answer break-pricing questions (see AI section below).

## Topps Three-specific things you must handle (all expressible via the data files — DO NOT hardcode)

### 1. No traditional packs — per-card odds

Topps Three is a high-end product where each card in the box IS the product. Odds are expressed as 1:N cards (not packs). The UI should label odds as "per card" not "per pack." The `odds.meta.oddsUnit` field is `"per-card"` — respect it.

### 2. Parallel library: two distinct rainbow structures

Non-auto subsets use: `t3-base` (unlimited) → `t3-bronze` (/25) → `t3-blue` (/15) → `t3-gold` (/10) → `t3-red` (/5) → `t3-platinum` (1/1)

Auto subsets use: `t3-auto-49` (/49, the base auto) → `t3-bronze` (/25) → `t3-blue` (/15) → `t3-gold` (/10) → `t3-red` (/5) → `t3-platinum` (1/1)

Special insert subsets (3&D, Monsters of the Deep, The Paint) use: `t3-base-15` (/15) → `t3-red` (/5) → `t3-holo-gold` (/3) → `t3-platinum` (1/1)

Rim Reapers, City Drip, and Quest for Glory use: `t3-base-10` (/10) → `t3-holo-gold` (/3) → `t3-platinum` (1/1)

The `parallels` array on each subset in the checklist JSON encodes the correct list. Read from there — don't infer from a global rule.

### 3. Rarity tiers based on print run, not parallel ID

- Platinum (1/1) → **Mythic**
- Red (/5) or Holo Gold (/3) → **Ultra**
- Gold (/10) → **Rare**
- Blue (/15), Bronze (/25) → **Limited**
- Base, Base /49 → **Common**

Tier on `printRun` from the parallel definition. Don't tier on the parallel ID string.

### 4. Auto base is /49, NOT unlimited

The auto base parallel `t3-auto-49` has `printRun: 49`. This is not an unlimited base — it is the lowest-rarity parallel for auto subsets. The UI should show "/49" prominently on auto cards.

### 5. SSP-style subsets with no higher parallels

Ice Water, Flight Path, Architects, 3&D, Monsters of the Deep, and The Paint are inserts with their own limited base print runs (see parallel arrays). They do not have an unlimited base version. The "base" for these subsets is already numbered.

### 6. Box/case economics for AI context

```
Case:  4 boxes × 4 cards = 16 cards total
Autos: 3 per box guaranteed = 12 autos per case
Case cost: $6,750 → breakeven (0% margin): $6,750
20% margin target: $8,100 revenue needed
```

The `breakPricingGuidance` block in the odds JSON has full PYT, PYP, and random pricing tables. Feed this to the AI assistant so it can answer break pricing questions correctly.

## AI assistant updates

The AI's fact pack for this set must include:

- Set metadata, configuration, case economics
- Full subset list and parallel library with print runs
- Odds (perParallel, perInsert, perInsertParallel, perAutoSubset, perAutoParallel)
- The `breakPricingGuidance` block (revenueTarget, pytPricing, pypPricing, randomPricing, referenceSales)
- The `oddsUnit: "per-card"` distinction vs Bowman/Cosmic Chrome which are per-pack

Verify with these test questions on the new set:

1. **"What are the odds of pulling a Cooper Flagg auto?"**
   → Should reference RPH at 1:13 per card. With 16 cards/case, ~1.23 RPH autos per case. Flagg is 1 of ~12 RPH subjects.

2. **"Show me my missing Cooper Flagg cards"**
   → Lists all variants in the set the user hasn't marked owned.

3. **"How should I price a PYT break for Topps Three?"**
   → Should reference the `breakPricingGuidance.pytPricing` block: avg $270/spot, Dallas Mavericks at $600–900+ (Luka + Flagg), San Antonio $400–600 (Wembanyama), etc. Total 30 spots = $8,100 target.

4. **"Which is rarer — a Cooper Flagg Platinum or a Cooper Flagg Red auto?"**
   → Both are 1/1 and /5 respectively. Platinum (1/1) is Mythic; Red /5 is Ultra. Platinum wins on scarcity.

5. **"How many cases for an expected Cooper Flagg Red auto?"**
   → RPH Red /5 is 1:111 per card. Case = 16 cards. ~111/16 ≈ 7 cases for an expected Red auto of any RPH player. Divide by number of RPH subjects (~12 veterans) for Flagg specifically: ~84 cases.

6. **"What's the best PYP player to buy?"**
   → Should surface Cooper Flagg (Mavs RC, highest demand), Dylan Harper (Nets RC), Giannis, LeBron, and Wembanyama as top targets, with reference sales from `breakPricingGuidance.referenceSales`.

## Acceptance criteria

A change is done when ALL are true:

1. Seeder runs idempotently. After running, `2025-26-topps-three-basketball` exists with 28 subsets.
2. Home page dropdown shows all three sets, ordered by release date (Topps Three first).
3. Selecting Topps Three from the dropdown navigates to its tracker page.
4. Both Player and Team view render. Search, filters, and the player quick-filter chip work.
5. Box configuration switcher shows Hobby only (no FDI, no multiple configs).
6. Odds display as "per card" (not "per pack") throughout the Topps Three tracker.
7. Auto base cards show "/49" prominently. Non-auto base cards show no print run number (unlimited).
8. Special insert subsets (3&D, Monsters, Paint, Rim Reapers, City Drip, Quest for Glory) render only their applicable parallels — not the full non-auto rainbow.
9. Status mutations work for anonymous users via localStorage, and migrate to the user's account on signup — same as Bowman/Cosmic Chrome.
10. AI assistant correctly answers all 6 test questions above.
11. The Bowman and Cosmic Chrome sets still work end-to-end. No regressions.

## Out of scope

- Re-doing any of the architectural work from the original prompt.
- Cross-set features ("show me every Cooper Flagg card across all sets") — that's a separate roadmap item.
- Image hosting (placeholders are fine).
- FDI configuration (Topps Three Hobby only).

---

**Start by reading `/the-vault/2025-26-topps-three-basketball-checklist.json` and `/the-vault/2025-26-topps-three-basketball-odds.json` to confirm the shapes match what your seeder expects.** The data is fully structured — if anything doesn't fit cleanly, propose a data-layer change rather than special-casing this set in code.
