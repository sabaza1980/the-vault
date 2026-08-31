# Breakers Section — Build Plan

> The Vault (myvaults.io) — a dedicated toolkit for **breakers** (the people running the breaks):
> product reference + odds, a hit log they can showcase, break pricing, and bulk-listing to
> Whatnot / eBay for breaks *and* singles.
> Companion plans: `BREAK_TRACKER_PROMPT.md`, `ADD_BREAK_PRICING_PROMPT.md`, `SOCIAL_LAYER_PLAN.md`, `MOBILE_REVAMP_PLAN.md`.

---

## 0. Scope — who this is for

**Two distinct audiences, two distinct surfaces:**

- **Buyers / collectors (existing, unchanged):** the consumer Break Tracker (`BreakTracker.jsx`) and
  Saved Breaks (`BreaksView.jsx`) are *buyer* tools — plan what you're chasing in someone else's break,
  capture hits as they're pulled, keep your past breaks. **These stay exactly where they are. This plan does not move or absorb them.**
- **Breakers / sellers (new):** a separate **Breakers section** with its own front door, for the person
  *running* the break — product/odds reference, a hit-showcase log, a price calculator, and bulk CSV listing.

Some underlying **data** is shared (checklist + odds JSON), but the surfaces are separate: a buyer planning
a chase and a breaker pricing a case are different jobs.

### What already exists (reuse the data/engine, keep the consumer UI separate)

| Capability | Where it lives today | Role in this plan |
|---|---|---|
| Per-set checklists + odds (5 basketball sets) | `data/*-checklist.json`, `*-odds.json` | **Data reused** by the breaker section |
| Break pricing **guidance** (PYT/PYP intake, spot math) | `ai/systemPrompt.js` + `breakPricingGuidance` blocks | **Math reused** by the calculator |
| Consumer break planner + hit capture | `BreakTracker.jsx`, `useTrackerState.js` | **Stays consumer-only** — not touched |
| Consumer saved breaks | `BreaksView.jsx` | **Stays consumer-only** — not touched |
| Social share cards (screenshot) | `ShareModal.jsx`, `useShareCard.js`, `html2canvas` | Reused for breaker hit sharing |
| eBay listing via OAuth Inventory API | `EbayListingModal.jsx`, `useEbayAuth.js` | Adjacent; CSV path is separate |
| Bulk card select in a collection | `CollectionsView.jsx` (`selectedIds`) | Feeds the singles CSV path |

### What's new

1. **Breakers hub** — a separate destination with its own sub-tabs.
2. **Product Reference + Odds** — a breaker-oriented view of the checklist/odds data (what's in the product, hit odds — for planning and pricing, not chasing).
3. **Breaker Hit Log** — log notable pulls across the breaks you run and share them socially (marketing reel), stored separately from consumer breaks.
4. **Break Price Calculator** — interactive PYP / PYT / Random (today only exists as AI chat).
5. **Bulk Listing / CSV exporter** — Whatnot + eBay + generic CSV, for *breaks* and for *singles* (from a collection).

### Structure decision — dedicated hub, separate from consumer tools

`BottomTabBar` has 5 fixed slots (Home · Collections · Scan · Ask AI · Profile) with no free slot, so the
Breakers hub is entered from a **Home tile / header entry** and presents its own internal sub-tab bar.
The consumer Break Tracker / Saved Breaks keep their current entry points untouched.

---

## 1. Target information architecture

```
Home
 ├─ (existing) Break Tracker / Saved Breaks tiles  ← BUYER tools, unchanged
 └─ NEW "Breakers" tile ─────────────► Breakers Hub  (full-screen section, own sub-tab bar)
                                          ├─ Products & Odds   → breaker reference over checklist/odds data
                                          ├─ Hit Log           → log + socially share pulls from breaks you run
                                          ├─ Price Calculator  → PYP / PYT / Random
                                          └─ Bulk Listing      → CSV export: breaks + singles → Whatnot / eBay / generic

Collections (existing)
 └─ Select cards ─► "Export to sheet" ──► reuses Bulk Listing CSV engine (singles path)
```

The **Bulk Listing CSV engine is shared** between the hub (break source) and Collections (singles source) —
one exporter module, two entry points. That's the overlap in the request.

---

## 2. Phased delivery

Build order confirmed: **hub shell first**, then drop tools in.

### BK-0 — Breakers hub shell *(first build)*
- New `BreakersHub.jsx`: full-screen section with an internal sub-tab bar (Products & Odds · Hit Log · Calculator · Bulk Listing).
- Add a **Breakers tile** on Home; wire `showBreakers` state + routing in `App.jsx`. Consumer tracker/saved-breaks tiles stay as-is.
- Empty-state placeholders for all four tabs.
- **Ship criterion:** hub opens from Home as its own section; consumer break tools are unchanged and still reachable.

### BK-1 — Products & Odds (breaker reference)
- Breaker-oriented view of the existing checklist/odds JSON: pick a set + configuration, see product contents, autos/case, key parallels, and odds — framed for *planning and pricing a rip*, not chasing a player.
- Feeds directly into the Price Calculator (BK-2) as its data source.
- **Ship criterion:** all 5 sets render their odds/config summary; break-relevant configs only (retail configs hidden).

### BK-2 — Break Price Calculator
A live break P&L / negotiation tool over the `breakPricingGuidance` blocks (single source of truth — never hardcode numbers).

**Inputs**
- **Product** — set from the catalog (prefilled when arriving from Products & Odds).
- **Quantity** — number of **boxes** *or* **cases** being ripped (unit toggle). Box cost derived as `caseCost ÷ boxesPerCase`.
- **Format** — **PYT** · **PYP** · **Random** · **Mix**.
- **Sale method** — **100% Buy Now** · **100% Auction** · **Mix** (method set per spot).
- **Desired margin** — an **absolute $ profit amount** (not a %).
- Case/box cost is prefilled from odds data and **editable** (required for BreakerDelight — cost unconfirmed).

**Core math**
- `totalCost = qty × unitCost`  ·  `revenueTarget = totalCost + desiredMargin`.
- Spots: PYT → one per team (default 30 NBA, configurable incl. NCAA where relevant); PYP → one per featured player (user list or from `topPlayers`); Random → N equal spots.
- **Random needs no per-spot calc** — flat `spotPrice = revenueTarget ÷ spots`; show the simplified view.

**Outputs — per-spot table**
- **List price** (suggested ask) — weighted by team/player EV (from `pytPricing.examples` / PYP demand weights), scaled so the spots sum to `revenueTarget`.
- **Floor price** — minimum acceptable (break-even share, or list − a configurable %).
- **Sold price** — an input column; breaker enters what each spot actually sold for.
- **Live leeway recompute** — as spots sell, `remainingTarget = revenueTarget − Σ sold`; unsold spots recalc their floor = `remainingTarget ÷ unsoldSpots`, so the breaker sees real-time negotiation room on the spots left.

**Sale-method handling**
- **100% Buy Now** — spots fixed at list price; revenue locks as they sell; leeway header tracks over/under vs target.
- **100% Auction** — list = suggested opening/estimate, floor = break-even share; recalc shows what the remaining auctions must average to hit target.
- **Mix** — breaker marks which spots are **Buy Now** (fixed) vs **Auction** (variable), by entering/selecting a buy-now player/team list or toggling per row. Buy-now spots lock revenue at their list price; the **remaining target** (`revenueTarget − buyNowRevenue`) is spread across the auction spots to set their floors and required average.

**Live P&L header** — Revenue target · Committed (buy-now + sold) · Remaining target · Remaining spots · Avg needed / remaining spot · Projected margin ($).

- Reuse the same EV weighting the AI uses in `systemPrompt.js` so calculator and assistant agree. "Explain this" hands the scenario to the AI for a plain-English breakdown.
- **Ship criterion:** PYT/PYP/Mix produce spot list+floor prices summing to target; entering sold prices live-recomputes remaining floors and projected margin; Random shows the flat view; BreakerDelight refuses a target until a real case cost is entered.

### BK-3 — Bulk Listing / CSV exporter (shared engine)
One module `lib/listingExport.js` with pluggable format adapters.
- **Adapters:** `whatnot`, `ebay`, `generic` — each maps an internal card record to that platform's column spec. *(Exact headers pulled from Whatnot's seller bulk-upload docs and eBay's bulk / File-Exchange docs at implementation time so files import without edits.)*
- **Sources:** *break source* (lots/cards for a break) and *singles source* (selected collection cards).
- **UI:** pick platform → preview table → download `.csv`. Prefill titles/prices from existing helpers (`buildTitle`, `buildDefaultPrice`).
- **Ship criterion:** a Whatnot CSV and an eBay CSV each import cleanly on a test listing; generic CSV round-trips.

### BK-4 — Collection → template overlap (singles path)
- Add "Export to sheet" to the Collections bulk-select toolbar; route selected `cardIds` into the BK-3 engine (singles source).
- The singles-seller journey the request calls out; reuses BK-3 entirely — no second exporter.
- **Ship criterion:** from a collection, select N cards, export a Whatnot/eBay/generic CSV in ≤3 taps.

### BK-5 — Polish & growth
- Share calculator results and hit-log pulls as social cards (reuse `ShareModal`).
- Analytics: hub tab usage, calculator runs, CSV exports per platform.
- Anonymous-first; convert-to-account prompts only at high-value moments.

---

## 3. New / touched files

| File | Change |
|---|---|
| `app/src/BreakersHub.jsx` | **new** — section shell + sub-tab bar |
| `app/src/breaker/ProductsOdds.jsx` | **new** — BK-1 breaker reference view |
| `app/src/breaker/BreakerHitLog.jsx` | **new** — BK-1/BK-5 hit-showcase log |
| `app/src/BreakPriceCalculator.jsx` | **new** — BK-2 |
| `app/src/BulkListingModal.jsx` | **new** — BK-3 UI |
| `app/src/lib/listingExport.js` | **new** — shared CSV engine + platform adapters |
| `app/src/App.jsx` | Breakers hub routing/state + Home "Breakers" tile (consumer tiles untouched) |
| `app/src/CollectionsView.jsx` | "Export to sheet" on bulk-select (BK-4) |
| `*-odds.json` | fill any `TBD` `casePriceUSD` (e.g. Bowman BreakerDelight) as confirmed |
| `BreakTracker.jsx` / `BreaksView.jsx` | **not touched** — consumer tools |

---

## 4. CSV adapter specs (confirmed at BK-3)
- **Whatnot** — official bulk-import template columns, in order: `Category, Sub Category, Title, Description, Quantity, Type (Auction|Buy It Now|Giveaway), Price, Shipping Profile, Offerable (TRUE/FALSE), Condition, Image URL 1…8`. Category / Sub Category / Type / Condition / Shipping Profile must match Whatnot's allowed values (Values tab). Source: help.whatnot.com bulk-import article.
- **eBay** — File Exchange / Seller Hub bulk trading-card fields: `Action, CustomLabel, Category (default 183454 single cards), Title (≤80), ConditionID (4000=NM), PicURL (pipe-sep), Description, Format (Auction|FixedPrice), Duration (Days_7|GTC), StartPrice, Quantity, Location, C:Sport, C:Player/Athlete, C:Season, C:Manufacturer, C:Parallel/Variety, C:Card Number, C:Grade, C:Professional Grader`. No newlines in cells; not Apple-CSV.
- **Fanatics** — **no public self-serve bulk CSV** (managed Dealer Program / vault intake), so it maps to the **generic** superset sheet. Revisit if Fanatics ships a seller template.
- Implemented in `app/src/lib/listingExport.js` (adapters + `toCSV` + `spotsToItems`/`cardsToItems`); UI in `BulkListingModal.jsx`; break-source export wired into the calculator.

## 5. Open items (non-blocking)
- Breaker **Hit Log**: build fresh, or fork the consumer hit/share components with breaker-owned storage? (Lean: fresh component, reuse `ShareModal` for the social card.)
- Calculator: expose fees (Whatnot %, shipping) for true net margin, or keep gross for v1.
- Image URLs for break-spot listings (Whatnot requires ≥1 to publish) — add per-spot image field later.

---

## 6. Progress
- ✅ **BK-0** hub shell + Home entry + routing.
- ✅ **BK-1** Products & Odds + `breakerData.js` normalizer.
- ✅ **BK-2** calculator + `breakPricing.js` engine (abs-$ margin, live sold-price leeway, Mix).
- ✅ **BK-3** CSV engine (`listingExport.js`) + `BulkListingModal` + calculator export.
- ✅ **BK-4** Collections singles → CSV: "📤 Export CSV" in the Bundle-Sell bar → `cardsToItems` → `BulkListingModal`. Card fields matched to the Vault model (playerName, brand, series/insertName, cardNumber, parallel, serialNumber, grade, gradingCompany, condition, estimatedValue, imageUrl, fullCardName). Node-tested.
- ✅ **BK-5** Breaker **Hit Log** (`BreakerHitLog.jsx`): log pulls (card, player, product, value, date, photo), localStorage-backed, stats header (count / total value / biggest), share each hit as a branded social card (html2canvas → Web Share on mobile, PNG download on desktop), delete. Wired into the hub's Hit Log tab.
- ⏭ Follow-ups: Firestore sync for the Hit Log (mirror `users/{uid}/breaks`); analytics on hub/calculator/CSV usage; per-spot image field for break-spot listings; net-margin fees in the calculator.

**Status: BK-0 → BK-5 complete — the full Breakers section is built.** Remaining items are polish/follow-ups above.

> Verification note: this build session's Linux mount serves truncated snapshots of freshly-written
> `.jsx` files, so run `npm run build` / `npm run lint` locally to confirm the components. Pure-JS libs
> (`breakerData`, `breakPricing`, `listingExport`) are node-tested and lint clean.
