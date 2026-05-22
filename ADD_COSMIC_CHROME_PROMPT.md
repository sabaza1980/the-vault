# Add 2025-26 Topps Cosmic Chrome Basketball to the Break Tracker

> Paste this into Cursor / Claude Code / Copilot Chat in VS Code.
> The original feature spec lives at `/the-vault/BREAK_TRACKER_PROMPT.md`. This file is additive — don't redo the architecture, just integrate the new set.

---

## What's already done

You shipped the Break Hit Tracker for **2025-26 Bowman Basketball**. The home page dropdown lets users pick which set they're breaking, and selecting a set deep-links to the tracker for that set. The seeder loads any `/the-vault/*-checklist.json` file as a registered set.

## What I need

Two new files have been added to `/the-vault/`:

- `/the-vault/2025-26-topps-cosmic-chrome-basketball-checklist.json` — 18 subsets, 687 cards, ~6,120 trackable variants
- `/the-vault/2025-26-topps-cosmic-chrome-basketball-odds.json` — official Topps per-pack odds (almost no estimates)

Make this set available everywhere the Bowman set already is — the home page dropdown, the tracker page, search results, the AI assistant, share links — without code changes specific to "Bowman" or "basketball-only." If you need to special-case anything for this set, the data file has the structure to express it; don't hardcode.

## Steps

1. **Run the seeder.** Confirm the new set registers cleanly. After it runs, `card_sets` should have 2 rows (Bowman + Cosmic Chrome). The new set should show 18 subsets, 687 cards.
2. **Home page dropdown.** Verify the new set appears. The label should pull from `set.name` ("2025-26 Topps Cosmic Chrome Basketball"). Sort order: most recent release date first (Cosmic Chrome released 2026-04-29, Bowman 2026-04-22 — Cosmic Chrome should appear above Bowman).
3. **Tracker page.** Navigate to the new set's tracker. Confirm both Player view and Team view render, search works, the AI assistant has set-specific context, and the player quick-filter chip works exactly like Bowman's.
4. **Odds.** The Cosmic Chrome odds are mostly published values — display them as authoritative (no "estimated" badge unless `estimated: true` is set on the specific row). Print runs render alongside per-pack odds in each parallel cell.

## Cosmic Chrome-specific things you must handle (all expressible via the data files — DO NOT hardcode)

These are the points where Cosmic Chrome diverges from Bowman. The data files already encode each one — your job is to make sure the existing rendering logic respects them.

1. **Two configurations: Hobby and First Day Issue (FDI).** The dropdown for box configuration on the tracker should show both options for this set, and only one (Hobby) for Bowman. Source: `set.configurations[]` in the checklist, plus `configurations` block in the odds JSON.

2. **FDI is a parallel-only configuration.** The `cc-fdi-1` parallel (FDI 1 Refractor /12) is `exclusive: "FDI"`. When the user has Hobby selected, FDI parallels render as "Not in Hobby" — same pattern as Mega-exclusive parallels in Bowman.

3. **Planetary Pursuit is "versions," not parallels.** The Planetary Pursuit subset has a `versions` array (`["Sun", "Mercury", ..., "Pluto"]`) instead of `parallels`. Each card has 10 trackable variants — one per version — with vastly different odds (Sun 1:80, Pluto 1:29,423). The variant explosion logic must multiply by `versions` for this subset and look up odds in `odds.perVersion["planetary-pursuit"]`. Render these as a 10-cell grid per card with the planet name and pull rate, not as a parallel rainbow.

4. **Card #48 is also printed as #101.** Nikola Jović's base card has `printedNumber: "101"` and a `note` field explaining the Topps numbering quirk. UI: show the position number ("#48") prominently, but render a small badge "Printed as #101" below it. The note string can be the badge tooltip. Search by either "48" or "101" should find this card.

5. **Pink /1 instead of Superfractor /1 on numbered inserts.** Starfractor, Re-Entry, Geocentric, and First Light use `cc-pink` (Pink Refractor /1) at the top of their rainbow instead of `cc-superfractor`. The "rarity tier" UI (Common / Limited / Rare / Ultra / Mythic) should treat both Pink /1 and Superfractor /1 as Mythic — both are 1/1s. Don't tier on the parallel id; tier on the print run.

6. **Space Walk has inverted print runs.** This subset has Green Space Dust /99 and Blue Moon /75 — the print runs are flipped vs every other insert and the base set. The data file uses two distinct parallel ids (`cc-green-space-dust-99` and `cc-blue-moon-75`) just for this subset. The display name will be the same ("Green Space Dust Refractor"); only the print run differs. Make sure the rendering reads `printRun` from the parallel definition, not from a hardcoded lookup.

7. **Cosmic Chrome Autographs II is a 2-card ultra-rare subset.** Its base auto falls at the same rate as the /25 parallel of CCA. Don't drop it from the UI just because it's rare — collectors specifically chase the Jokić and SGA cards in this subset.

8. **Hyper Nova and Cosmic Dust are SSPs with no parallels.** Their subset records have `parallels: []` and `rarity: "SSP"`. The UI should render an "SSP" chip on the subset header, no parallel rainbow, just the base card.

## AI assistant updates

The AI's fact pack for this set must include:
- Set metadata, subset list, parallel library, odds (perParallel + perInsert + perInsertParallel + perAutoSubset + perAutoParallel + perVersion).
- The `versions` array for Planetary Pursuit and the per-version odds.
- The Pink /1 vs Superfractor /1 distinction.

Verify with these test questions on the new set:

1. "What are the odds of pulling a Cooper Flagg auto?" → Should reference Cosmic Chrome Autographs at 1:383 packs and divide by the 48-card subset, ending around 1:18,400 packs.
2. "Show me my missing Cooper Flagg cards" → Lists all variants in the set the user hasn't marked owned.
3. "Which is rarer — a Pluto Planetary Pursuit or a Cooper Flagg Refractor?" → Should compare 1:29,423 vs 1:10/200=1:2,000 and answer the Pluto.
4. "How many boxes for an expected Stephen Curry Singularity auto?" → Combine Singularity rate (1:331), 80 cards per box, divide by 46 cards in subset.
5. "Do I have the Cooper Flagg #101 card?" → Must find #48 (Nikola Jović is #101 — and also alert if user is asking about Jović vs Flagg).

## Acceptance criteria

A change is done when ALL are true:

1. Seeder runs idempotently. After running, `2025-26-topps-cosmic-chrome-basketball` exists with 18 subsets, 687 cards.
2. Home page dropdown shows both sets, ordered by release date (Cosmic Chrome first).
3. Selecting Cosmic Chrome from the dropdown navigates to its tracker page.
4. Both Player and Team view render. Search, filters, and the player quick-filter chip work.
5. Box configuration switcher shows Hobby + FDI for this set (Hobby only for Bowman).
6. Planetary Pursuit cards render with 10 version cells (Sun → Pluto) with per-version odds. Marking the "Mars" version of Cooper Flagg's PP card as Owned does NOT mark the "Saturn" version as Owned.
7. Card #48 (Jović) shows the "Printed as #101" badge. Searching "101" finds both Jović (#48) and Garland (#101).
8. Status mutations work for anonymous users via localStorage, and migrate to the user's account on signup — same as Bowman.
9. AI assistant correctly answers all 5 test questions above.
10. The Bowman set still works end-to-end. No regressions.

## Out of scope

- Re-doing any of the architectural work from the original prompt.
- Cross-set features ("show me every Cooper Flagg card across both sets") — that's a separate feature on the roadmap.
- Image hosting (placeholders are fine).

---

**Start by reading `/the-vault/2025-26-topps-cosmic-chrome-basketball-checklist.json` and `/the-vault/2025-26-topps-cosmic-chrome-basketball-odds.json` to confirm the shapes match what your seeder expects.** If anything in the data doesn't fit cleanly, propose a small data-layer change rather than special-casing this set in code. The whole point of the set-agnostic architecture is that the next set after this one (and the one after that) drop in the same way.
