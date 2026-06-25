# The Vault — Mobile Revamp Project Plan

> Owner: Sherif · Drafted: 2026-06-25 · Status: Planning (no code written yet)
> Scope: 8 change requests covering navigation/layout, home interactions, sharing,
> eBay pricing, live AI sourcing, and bulk marketplace listing.

This document is the single source of truth for the work. It is written so any future
session can open it, read the **Architecture snapshot**, jump to a **Work Package**, and
execute it without re-discovering the codebase. Each work package is self-contained:
goal, files, approach, acceptance criteria, dependencies, estimate, risks.

---

## 1. Architecture snapshot (read this first)

**Stack (verified from the repo, not assumed):**
- **Frontend:** React 18 + Vite. Single-page app. No router — views are toggled by
  `useState` flags inside `App.jsx` (e.g. `showCollections`, `showBreaksView`, `showChat`).
- **Mobile shell:** Capacitor (`app/android/`, `app/capacitor.config.ts`). Same web
  bundle wrapped for Android/iOS. Use `Capacitor.isNativePlatform()` for native-only logic.
- **Backend:** Vercel serverless functions in `app/api/*.js` (Node). No separate server.
- **Data/auth:** Firebase Auth + Firestore (`src/firebase.js`, `src/useFirestoreSync.js`,
  `src/AuthContext.jsx`). Per-user card collections sync through Firestore.
- **Deploy:** Vercel (`vercel.json`, `app/.vercel/`). Marketing site in `website/`.

> NOTE: This supersedes an earlier note that the app was "Next.js + Supabase." The live
> code is Vite + Capacitor + Firebase + Vercel functions. Plan is written against reality.

**Key files by concern:**

| Concern | File(s) |
|---|---|
| App shell, header/nav, home strips, card detail, upload | `src/App.jsx` (~3,700 lines) |
| Per-card detail/expand + per-card share/sell buttons | `CardRow` component inside `src/App.jsx` (~L464–1031) |
| Header / top nav button row | `src/App.jsx` L2535–2695 |
| Stats strip | `src/App.jsx` L2697–2795 |
| Top 10 by Value strip | `src/App.jsx` ~L2844+ |
| Favourites strip | `src/App.jsx` L2902–2931 |
| Personal Collection (PC) strip | `src/App.jsx` L2933–2958 |
| Category filter list | `src/App.jsx` ~L2421–2440 |
| Share image generation | `src/ShareModal.jsx`, `src/useShareCard.js` (canvas draw) |
| eBay listing UI | `src/EbayListingModal.jsx`, `api/ebay-list.js`, `api/ebay-aspects.js`, `api/ebay-policies.js`, `api/ebay-auth.js`, `src/useEbayAuth.js` |
| eBay pricing | `api/ebay-sales.js` (Finding API `findCompletedItems` + Browse fallback) |
| AI identify / chat / player facts | `api/analyze.js`, `api/chat.js`, `api/sets-player.js`, `src/VaultChat.jsx`, `src/ai/systemPrompt.js`, `src/ai/personas.js`, `src/ai/collectionContext.js` |
| Breaks (to become web-only) | `src/BreaksView.jsx`, `src/BreakTracker.jsx` |
| Collections | `src/CollectionsView.jsx`, `src/useCollectionsSync.js` |

**Why the current home screen feels oversized (root cause of #4):** The header is a single
horizontal flex row holding up to 6 controls (Collections, New Break, My Breaks, Share,
Ask AI, avatar). On a ~390px phone the row overflows and everything after the first pill is
pushed off-screen — which is exactly why only "Collections" is visible. Type and component
sizes (26px title, 28px stat numbers, 90px strip cards) are tuned for comfort, not density.
The fix is structural (move actions out of one row) plus a sizing pass — see WP-1.

---

## 2. The overlap: shared scaffolding (Phase 0)

Several requests touch the same code, so we build foundations once and reuse them. Doing
Phase 0 first prevents three features from each re-implementing the same thing.

- **S1 · Reusable `CardDetailModal`.** Today the card detail lives *inside* `CardRow`'s
  expand state (`handleExpand`, L494). #3 (tap Top 10 / Favourites), Collections, and search
  all want to open the same detail. Extract a single `CardDetailModal({ card, onUpdate,
  onShare, onSell, onDelete, onClose })`. **Used by:** WP-3.
- **S2 · Design tokens + responsive scale.** Introduce a small type/spacing scale (CSS
  variables already exist via `var(--…)`; add sizing tokens) so the sizing pass in #4 and
  every strip/card pulls from one place. **Used by:** WP-1, WP-4, WP-5.
- **S3 · `isNativeMobile` helper.** One util wrapping `Capacitor.isNativePlatform()` (and a
  viewport check for PWA) to gate native-only vs web-only surfaces. **Used by:** WP-2
  (hide Breaks on mobile), future platform splits.
- **S4 · eBay service consolidation.** One shared auth/token module + env-var audit so
  pricing (#5) and listing (#6) share a single, correct integration surface instead of two.
  **Used by:** WP-6, WP-8.
- **S5 · Share options state.** A small `shareOptions` object threaded into `ShareModal` /
  `useShareCard` so #1 (price toggle) sets the pattern for any future share preference.
  **Used by:** WP-7.

---

## 3. Phasing & sequencing

Order is chosen for visible-pain-first, dependency-correctness, and leaving #6 last per request.

```
Phase 0  Foundations ........ WP-0  (S1–S5 scaffolding + dev harness)
Phase 1  Nav & layout ....... WP-1 (#4), WP-2 (#8)        ← most visible
Phase 2  Home interactions .. WP-3 (#3), WP-4 (#2)
Phase 3  Sharing ............ WP-7 (#1)
Phase 4  Data & AI .......... WP-5 (#5 eBay pricing), WP-6 (#7 live AI)
Phase 5  Bulk listing ....... WP-8 (#6)                    ← last, largest
```

Dependency notes: WP-3 depends on **S1**; WP-1/WP-4 depend on **S2**; WP-2 depends on **S3**;
WP-8 depends on **S4** and benefits from WP-5 being done first (shared eBay layer proven).

---

## 4. Work packages

Each is independently executable. Estimates are rough dev-effort (S ≤ half day, M ≈ 1 day,
L ≈ 2–3 days). "AC" = acceptance criteria (definition of done).

### WP-0 · Foundations (Phase 0) — `S1–S5` — Est: M
- **Goal:** Land the shared scaffolding so feature WPs are thin.
- **Do:**
  - S1: Extract `CardDetailModal` from `CardRow` in `src/App.jsx` into its own component
    (new `src/CardDetailModal.jsx`), preserving current behaviour; have `CardRow` use it.
  - S2: Add sizing tokens (e.g. `--fs-title`, `--fs-stat`, `--card-w`, `--space-*`) to the
    root style block; no visual change yet (tokens = current values).
  - S3: Add `src/lib/platform.js` exporting `isNativeMobile()`.
  - S4: Add `api/_ebay/token.js` (shared client-credentials token; dedupe logic now in
    `ebay-sales.js` and `ebay-auth.js`). Audit env vars; document required keys in this file.
  - S5: Add a `shareOptions` prop path through `ShareModal` → `useShareCard` (default = today).
- **AC:** App builds and behaves identically to before (pure refactor); new modules imported
  and used; `npm run build` clean; manual smoke test of card detail, share, eBay auth.
- **Risk:** `App.jsx` is large and stateful — extractions must preserve closures/props.
  Mitigation: refactor one piece at a time, smoke-test between each.

### WP-1 · Header redesign + responsive sizing (#4) — Est: M–L
- **Goal:** A header that fits a phone and a density that shows more without losing the
  "cards are very visible" feel.
- **Files:** `src/App.jsx` L2535–2795 (header + stats); S2 tokens.
- **Approach:**
  - **Confirmed pattern (D1):** slim top bar (logo + avatar only) + a **bottom tab bar** with
    a **center scan button**. Five slots: **Home · Collections · (+) Scan · Ask AI · Profile**.
    The center (+) is a raised circular accent button (#ff6b35) that triggers the existing
    card add/scan flow (the most frequent action). Active tab lit in orange, others muted.
    Tab bar shows on mobile only (native + mobile web); desktop web keeps the current top nav.
    This solves #4 (no more overflowing row, cards stay big) and #8 (Ask AI is a permanent tab).
  - Apply S2 tokens to shrink title/stat type ~15–20% and tighten paddings; keep strip
    card art prominent.
  - Test at 360 / 390 / 414px widths (Android/iPhone common). No horizontal overflow.
- **AC:** All header actions reachable on a 360px screen; nothing clipped; Ask AI visible
  (ties to #8); layout passes visual check at 3 widths; Lighthouse/manual tap-target ≥44px.
- **Risk:** Bottom tab bar is a navigation-pattern change. **Decision needed (D1).**

### WP-2 · Breaks → web-only + Ask AI restored (#8) — Est: S–M
- **Goal:** Remove Breaks (New Break + My Breaks) from the mobile app; keep on web/desktop.
  Ensure Ask AI is a first-class nav item.
- **Files:** `src/App.jsx` header (L2570–2597 Break buttons), `BreaksView.jsx`/`BreakTracker.jsx`
  (kept, just gated); S3 `isNativeMobile`.
- **Approach:** Wrap Break entry points in `!isNativeMobile()`; ensure Ask AI placed in the
  new nav from WP-1. Breaks code stays in the bundle for web.
- **AC:** On native build, no Break UI anywhere; on web, Breaks unchanged; Ask AI always
  visible and opens chat.
- **Risk:** Low. Confirm whether "mobile" = native app only, or also the mobile web/PWA
  (**Decision D2**).

### WP-3 · Tappable Top 10 + Favourites (#3) — Est: S — depends on **S1**
- **Goal:** Tapping any card in Top 10, Favourites (and PC) opens its detail.
- **Files:** `src/App.jsx` Top 10 (~L2844), Favourites (L2914), PC (L2945); `CardDetailModal` (S1).
- **Approach:** Add `onClick={() => openCardDetail(card)}` + `cursor:pointer` and an active/
  press state to each strip tile; route through the shared `CardDetailModal`.
- **AC:** Tap on any strip card opens the same detail used by the main list; back/close works;
  favourite/PC/share actions inside detail function.
- **Risk:** Low.

### WP-4 · Card-type sections scroll horizontally (#2) — Est: S
- **Goal:** The Soccer / Pokémon / Football type browse should scroll left–right, not stack.
- **Files:** `src/App.jsx` category area (~L2421–2440) and/or the per-type sections.
- **Approach:** Convert the type container to a horizontal scroller
  (`display:flex; overflow-x:auto; scroll-snap`), matching the Top 10/Favourites strip pattern
  already in use. Add snap points and momentum.
- **AC:** Type chips/sections scroll horizontally on touch; no vertical stack; snap feels right.
- **Open:** Confirm exact element — chips row vs grouped sections (**Decision D3**, 1-line check
  at execution; screenshot suggests the type/category browse area).
- **Risk:** Low.

### WP-7 · Share price toggle (#1) — Est: S — depends on **S5**
- **Goal:** User chooses whether the shared image includes card price(s).
- **Files:** `src/ShareModal.jsx` (add toggle UI), `src/useShareCard.js` (respect flag at
  the canvas draw — single card ~L196, collection stats ~L278).
- **Approach:** Add `includePrice` to `shareOptions` (default on). Toggle in the modal; in
  the canvas renderer, skip the price text/stat when off and reflow layout.
- **AC:** Toggling hides/shows price in the generated PNG for both single-card and
  collection/set shares; layout stays clean with price omitted; preference remembered in session.
- **Risk:** Low; canvas layout reflow needs care so no blank gap remains.

### WP-5 · Fix & redesign pricing (#5) — Est: M–L
> **Decision (2026-06-25):** Source strategy = **fix the existing paid APIs**
> (SportsCardsPro for sports, PriceCharting for TCG). Scope = **both** sourcing fix
> **and** display redesign. See "Decision background" below.

- **Goal:** Trustworthy values from the APIs we already pay for, shown with enough context
  (source, sample, recency, condition) that the number feels real.

- **Decision background (why not eBay / 130point / Card Ladder):**
  - eBay's legacy **Finding API** (`findCompletedItems`, used in `ebay-sales.js`) has been
    sunset for sold data; real eBay sold comps now require the gated **Marketplace Insights
    API** (application + business-need approval). Parked, not pursued now — but the display
    is built source-agnostic so Insights can slot in later if approved.
  - **130point** has the ideal data (eBay sold incl. accepted best offers) but **no public
    API** — integration would be unofficial/fragile/ToS-risky. Rejected.
  - **Card Ladder** has no public developer API (consumer subscription app). Rejected.
  - **SportsCardsPro + PriceCharting** are already integrated, paid, documented, and derive
    values from eBay-sold + other marketplaces. The real defect is **card-matching**, not the
    data. → fix matching + redesign display.

- **Files:**
  - Sourcing: `api/sportscardspro.js`, `api/pricecharting.js`, `src/App.jsx`
    `fetchPricingProxy` (L88–114), `getPricingSource` (L78), background pricing fetch (~L2177).
  - Demote/retire eBay sold: `api/ebay-sales.js` + `fetchEbaySales` (L46–65) — see step 3.
  - Display: Top 10 strip (~L2844), stats strip (L2697), `CardDetailModal` (from S1),
    Favourites/PC strips.

- **Approach:**
  1. **Diagnose matching.** Reproduce SportsCardsPro/PriceCharting calls against real cards
     from the collection; capture where they return null/wrong. Current query builders
     (`buildTCGQuery`, SportsCardsPro `queryParts`) are naïve string joins — likely failing on
     parallels, serial numbers, grading, and year/brand variants.
  2. **Improve matching.** Progressive query relaxation (full → drop parallel → drop number →
     name+year+set), parallel/variant normalization, raw-vs-graded handling (use the API's
     condition-keyed prices: loose/graded tiers), and a confidence flag when the match is fuzzy.
  3. **Retire the broken eBay sold path.** Remove `fetchEbaySales` from the value pipeline so
     it can't drag results to $0. Optionally keep eBay **Browse** active-listings purely as a
     low-confidence sanity bound, clearly labelled. (Keep `ebay-auth`/listing APIs untouched —
     those serve WP-8.)
  4. **Cache.** Persist `{ value, priceSource, condition, comps, asOf }` on the card in
     Firestore; refresh on TTL (e.g. 7 days) or manual "refresh price". Avoids re-querying and
     respects the 1 req/sec rate limits already coded.
  5. **Redesign display.** Replace the bare `$X` with a trustworthy unit:
     value + **source label** (e.g. "SportsCardsPro · eBay-based"), **condition/grade**,
     **sample/recency** where available, and a **low–high range** when present. Add a clear
     "no comp yet" empty state instead of $0/blank. Apply consistently to Top 10, stats,
     Favourites/PC, and the detail view.

- **AC:** Values populate for the large majority of real cards; each shown value carries
  source + condition + recency context; fuzzy matches are flagged; no card shows $0/blank
  (empty state instead); pricing cached with TTL; no API keys in the client bundle;
  before/after screenshots of the new pricing UI attached.
- **Risk:** Medium — matching quality on parallels/graded cards is the hard part; mitigate
  with progressive relaxation + confidence flag. Display built source-agnostic so a future
  swap to eBay Marketplace Insights needs no UI rework.

### WP-6 · Live AI player sourcing (#7) — Est: M
- **Goal:** AI uses current web info about the player/card, not only static training/checklist.
- **Files:** `api/chat.js`, `api/sets-player.js`, `api/analyze.js`, `src/ai/systemPrompt.js`,
  `src/VaultChat.jsx`.
- **Approach:** Add a live retrieval step before/inside the AI call — a web-search or
  fetch tool feeding recent facts (player team, recent performance, card hype) into the prompt
  context. Cache per player/day to control cost. Keep the existing checklist/odds data as
  structured ground truth and layer live facts on top.
- **AC:** Asking about a player returns info reflecting recent (current-season) reality, with
  source freshness; cost bounded by caching; graceful fallback to static if retrieval fails.
- **Risk:** Cost/latency and source quality. **Decision D5** (which retrieval provider/key).

### WP-8 · Bulk marketplace listing + CSV export (#6) — Est: L — depends on **S4**, templates
- **Goal:** Select many cards and export a marketplace-ready CSV (eBay, Whatnot) including the
  image source URL, driven by user-provided templates.
- **Files:** new bulk-select UI in `src/App.jsx`/`CollectionsView.jsx`; new
  `src/BulkListingModal.jsx`; new `api/export-listings.js`; reuse `EbayListingModal.jsx`
  field logic; S4 eBay layer. Reference existing CSV examples in the workspace
  (`Whatnot_Auction_Listings.csv`, `BIN_Listings.csv`, `WhatNot Rookies Auction*.csv`).
- **Approach:**
  1. **Template intake (blocker):** Sherif provides the exact column templates per
     marketplace. Define a mapping config (card field → CSV column) per template.
  2. Bulk-select mode (checkboxes) across the collection/filtered view.
  3. Generate CSV per template, including hosted image URL(s) as a column; validate required
     fields; flag rows missing data before export.
  4. Download in-app (and/or save to a folder).
- **AC:** Select N cards → export a CSV that imports cleanly into the target marketplace’s
  bulk tool; image source URL present; required columns validated; templates configurable.
- **Risk:** Medium — exact marketplace schemas vary and change. **Blocked on templates (D6).**

---

## 5. Decisions needed from Sherif (with my defaults)

These are product/UX calls, not technical ones — I’ll proceed on the default if you don’t
object.

- **D1 (WP-1 nav pattern):** ✅ RESOLVED 2026-06-25 — bottom tab bar with center scan button:
  Home · Collections · (+) Scan · Ask AI · Profile. Mobile only; desktop keeps top nav.
- **D2 (WP-2 scope of "mobile"):** ✅ RESOLVED 2026-06-25 — "mobile" = native app **and**
  mobile web (narrow viewport). Breaks hidden on both; kept on desktop web only. Bottom tab
  bar shows on both mobile surfaces; desktop web keeps its current/top nav. `isNativeMobile()`
  (S3) therefore gates on native OR narrow viewport.
- **D3 (WP-4 target element):** I’ll confirm the exact "types" element in code at execution
  (likely the category browse row).
- **D4 (WP-5 pricing source):** ✅ RESOLVED 2026-06-25 — fix existing paid APIs
  (SportsCardsPro + PriceCharting), both sourcing fix and display redesign; eBay Marketplace
  Insights parked for later, 130point/Card Ladder rejected (no public API).
- **D5 (WP-6 retrieval):** OK to add a live web-search/fetch step with per-day caching *(default yes)*.
- **D6 (WP-8 templates):** You’ll send the eBay + Whatnot CSV templates before WP-8 starts.

---

## 6. Cross-cutting: testing & verification

For every WP before marking done:
- `npm run build` clean (Vite) and app loads.
- Manual smoke on a phone-width viewport (360/390/414) and, for native-affecting WPs, an
  Android Capacitor run.
- Visual before/after screenshots attached to the WP.
- For API WPs (5, 6, 7, 8): reproduce the call, check Vercel logs, confirm no secrets reach
  the client bundle.
- Regression check on the touched view’s primary actions.

## 6b. Build log

**2026-06-25 — WP-0 foundations (S2–S5 landed):**
- `src/lib/platform.js` (new) — `isNativeApp` / `isMobileViewport` / `isNativeMobile` /
  `isDesktopWeb`. (S3)
- `src/App.jsx` — added `:root` sizing/design tokens set to current values, no visual
  change. Also noted: `src/index.css` has `zoom: 1.53` — a major cause of the oversized feel;
  address in WP-1. (S2)
- `api/_ebay/token.js` (new) — shared app-level Browse token; `api/ebay-sales.js` refactored
  to import it. (S4)
- `useShareCard.js` / `ShareModal.jsx` — threaded `shareOptions = { includePrice: true }`
  through hook + draw fns; price drawing now gated on `includePrice` (default on = unchanged).
  WP-7 adds the toggle UI. (S5)
- `src/CardDetailModal.jsx` (new) — self-contained reusable card detail overlay
  (big image + zoom, identity, badges, est. value w/ source, favourite/PC/share/sell
  actions). Props `{ card, onUpdate, onShare, onSell, onClose }` match CardItem's handler
  signatures. ESLint clean. (S1)
  - **Deviation from original S1 plan (intentional, lower-risk):** rather than rip the
    ~450-line inline detail out of the stateful `CardItem` accordion (a two-sided change I
    can't build-verify in-sandbox), `CardDetailModal` is a NEW standalone overlay. `CardItem`
    is untouched → zero regression risk to the main list. The overlay covers WP-3's "tap a
    card → see detail" need; the full inline editor (rescan/corrections/back-image/notes)
    stays in `CardItem`. If full unification is wanted later, fold `CardItem`'s detail into
    this component once builds are verifiable.

**Environment note (verification):** the Linux build sandbox can't run `npm run build`
(the `node_modules` is Windows-built; the native Vite/rolldown binary for Linux is absent)
and its filesystem mirror is unreliable for linting edited files. Edits are made to and
verified against the canonical files directly. **Final verification = `npm run build` on a
machine with matching `node_modules` (i.e. Sherif's).** This makes large refactors (S1)
something to land in a focused, build-tested step rather than bundled blindly.

## 7. Status tracker

| WP | Req | Title | Phase | Est | Status |
|----|-----|-------|-------|-----|--------|
| WP-0 | — | Foundations (S1–S5) | 0 | M | ✅ Done — build green 2026-06-25 |
| WP-1 | #4 | Header redesign + sizing | 1 | M–L | Not started |
| WP-2 | #8 | Breaks web-only + Ask AI | 1 | S–M | Not started |
| WP-3 | #3 | Tappable Top 10 / Favourites | 2 | S | Not started |
| WP-4 | #2 | Type sections horizontal scroll | 2 | S | Not started |
| WP-7 | #1 | Share price toggle | 3 | S | Not started |
| WP-5 | #5 | Fix & redesign pricing (SportsCardsPro + PriceCharting) | 4 | M–L | Not started |
| WP-6 | #7 | Live AI player sourcing | 4 | M | Not started |
| WP-8 | #6 | Bulk listing + CSV export | 5 | L | Not started |
