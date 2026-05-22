# Feature Build Prompt — Break Hit Tracker (Set Checklists)

> Paste this entire document into Cursor / Claude Code / Copilot Chat in VS Code.
> Companion file: `2025-26-bowman-basketball-checklist.json` (the seed data — keep it next to this prompt).

---

## 0. Read this first — what we're building

The Vault (myvaults.io) is an app for collectors of trading cards, stamps, and coins. We're adding a **Break Hit Tracker** — a per-set checklist that lets a user pre-select players or teams they're chasing in a Whatnot/breaker live break, and then mark cards as **Targeted**, **Pending Arrival**, or **In Vault (Owned)** as the break runs and cards ship.

### This is an anonymous-first growth surface, not a gated app feature

The tracker is **fully usable without signing in**. No paywall, no "create an account to continue." That's deliberate — we want this to be the cleanest, fastest break-tracking tool on the internet, freely shareable, indexable by Google, and viral inside Whatnot/breaker Discord servers. We'll convert anonymous users to accounts at moments where signing up is obviously valuable to *them*: when they hit a card and want it in their permanent Vault, when their break ends and they want to keep the session, or when they want to access it on another device. **Default to "no login required" for every interaction** — the login prompt is opt-in friction we earn by delivering value first. See §7 for full anonymous architecture.

A live break works like this: a breaker rips packs on stream, every card pulled is assigned to whichever buyer "owns" that team or player slot. The buyer sees the card on stream **immediately**, but the physical card doesn't arrive for days or weeks. Today our users have no good way to (a) plan what they're chasing, (b) capture hits the moment they're pulled on stream, or (c) keep tabs on what's still in transit. This feature solves all three.

The first set we're shipping support for is **2025-26 Bowman Basketball**. The data layer must be set-agnostic so we can drop in 2026-27 Topps Chrome, 2026 Bowman Baseball, 2025 Topps Chrome F1, etc. with no code changes.

### Three statuses, in order

1. **Targeted** — user is bidding on / wants this card from a break. Soft commit.
2. **Pending Arrival** — user has won the card on stream but it hasn't arrived yet. Hard commit, in transit.
3. **In Vault (Owned)** — physical card is in hand, lives in the user's actual collection.

A user can transition: `none → Targeted → Pending → In Vault`. They can also skip steps (e.g. add directly to Vault after buying a single from a dealer). They can also drop a status (e.g. unmark a Target if they don't win).

### Two views, toggleable

- **By Player** — the user's primary mental model when bidding "I want all the Cooper Flagg hits." Expand a player to see every card they appear on and every parallel of each card.
- **By Team** — the user's primary mental model when buying a team slot in a break ("I have the Mavericks in this break"). Expand a team to see every player on that team and all their cards.

The user must be able to flip between these without losing scroll position or filter state.

---

## 1. User stories

1. **Pre-break planning.** As a user about to enter a Mavericks team break for 2025-26 Bowman Basketball, I open the set checklist, switch to **By Team**, expand Dallas Mavericks, and bulk-mark every Cooper Flagg card as **Targeted**. I close the page; targets persist.

2. **Live break, card pulled.** A break is going. Cooper Flagg Chrome Refractor /499 #BCV-1 just got ripped and assigned to me. I open the tracker, find Cooper Flagg in my Targeted list, expand his cards, and mark that exact parallel as **Pending Arrival** in two taps. Total elapsed time: under 5 seconds. The break is still going — I shouldn't have to leave the page or wait for anything.

3. **Card arrives.** Two weeks later, the Flagg Refractor lands in my mailbox. I open the tracker, find anything still in **Pending Arrival**, mark it **In Vault**. The card is now part of my real collection, removed from the "chase" surfaces but still visible in the checklist as completed.

4. **Progress at a glance.** I want to see, per set: "23 Targeted, 4 Pending, 1 In Vault, 56 / 200 base set complete." Per player: same breakdown. Per team: same breakdown.

5. **Variant precision.** Cooper Flagg's Chrome Refractor /499 and his Chrome Refractor /150 (Blue) are different cards with different print runs and different prices. The tracker treats every parallel as its own trackable variant, with its own status.

6. **Search and filter.** I should be able to search the checklist by player name (debounced), and filter by status (show only my Targets), subset (only Chrome Autographs), parallel rarity (only /5 or rarer), or team.

7. **Quick-filter to one player.** I see a player's name on stream — I tap their name (or a "Filter to player" pill on their card) and the entire tracker collapses to just that player's variants across every subset. Above the list I see their hit odds: "1 in 24 packs for any auto, 1 in 312 for a Chrome Refractor /499." From here I can ask the AI assistant questions in plain English (see §9).

8. **AI assistant ("Ask the AI").** Without leaving the tracker, I can ask:
   - "What are my odds of pulling a Cooper Flagg auto from one Hobby box?"
   - "Do I already have a Cooper Flagg Refractor?"
   - "Which Cooper Flagg cards are still missing from my collection in this set?"
   - "What's the rarest Flagg variant under /50 I haven't pulled?"
   The AI answers using the set's odds data, my current tracker state, and the parallel print runs — fast, conversational, no need to dig through filters.

9. **Anonymous → account upgrade.** I've been tracking 12 hits across an hour-long break without an account. I want to add my Cooper Flagg auto to my permanent Vault. I tap the ✅ button → a soft prompt appears: "Save this hit to your Vault forever. Create a free account in 10 seconds (or skip, and we'll keep it locally for now)." If I sign up, every status I marked while anonymous transfers seamlessly into my account. If I skip, my data stays in localStorage and I can keep going.

---

## 2. Data model

### 2.1 Set checklist (universal, read-only seed data)

Seed from `2025-26-bowman-basketball-checklist.json`. The JSON has this shape (already validated, 37 subsets, 1,495 unique cards, ~31,942 trackable variants once parallels are exploded):

```jsonc
{
  "set": {
    "id": "2025-26-bowman-basketball",
    "name": "2025-26 Bowman Basketball",
    "manufacturer": "Topps",
    "sport": "Basketball",
    "season": "2025-26",
    "releaseDate": "2026-04-22",
    "configurations": ["Hobby", "Jumbo", "Mega", "Value", "Breaker's Delight"]
  },
  "parallelLibrary": {
    "chrome-refractor": { "name": "Refractor", "printRun": 499, "exclusive": null },
    "chrome-superfractor": { "name": "Superfractor", "printRun": 1, "exclusive": "Hobby" },
    // ...~70 parallel definitions referenced by id
  },
  "subsets": [
    {
      "id": "base-chrome",
      "name": "Base — Chrome",
      "cardPrefix": "BCV-",
      "cardCount": 200,
      "type": "chrome",
      "isAuto": false,
      "isInsert": false,
      "league": "NBA",
      "parallels": ["chrome-refractor", "chrome-purple", /* ... */],
      "cards": [
        { "number": "BCV-1", "player": "Cooper Flagg", "team": "Dallas Mavericks", "isRC": true },
        // ...
      ]
    }
    // ...37 subsets total
  ]
}
```

### 2.2 Trackable variants — the unit of tracking

A **variant** is the atomic thing a user marks. It is `(card, parallel | base)`:

- Cooper Flagg base #1 → 1 variant (the card itself) + 12 paper parallels = **13 variants**
- Cooper Flagg Chrome BCV-1 → 1 base Chrome variant + 55 chrome parallels = **56 variants**
- ...summed across all subsets, Cooper Flagg has hundreds of trackable variants in this one set

Don't pre-explode the variants in the database. Generate them on demand from `(subset, card.number, parallelId | null)`. Store user state keyed by that triple — that gives you a tiny user-state footprint.

### 2.3 User state (the new tables)

The tracker has a **dual-store model**: anonymous users live in `localStorage`, authenticated users live in the DB. The shape is identical so we can sync one to the other on signup.

```
user_set_progress
  owner_id         string         -- fk to user_id, OR an anonymous_session_id (UUID v4 minted in localStorage)
  owner_type       enum('user','anonymous')
  set_id           string
  PRIMARY KEY (owner_id, owner_type, set_id)
  targeted_count   int
  pending_count    int
  owned_count      int
  last_activity_at timestamptz

user_card_status
  owner_id         string
  owner_type       enum('user','anonymous')
  set_id           string         -- "2025-26-bowman-basketball"
  subset_id        string         -- "base-chrome"
  card_number      string         -- "BCV-1"
  parallel_id      string | null  -- "chrome-refractor", or null for base
  status           enum('targeted','pending','owned')
  notes            text  nullable
  acquired_at      timestamptz nullable  -- set when status moves to 'owned'
  break_id         string nullable       -- optional FK to a Break record (future)
  serial_number    string nullable       -- e.g. "23/499" once card is in hand
  vault_item_id    fk    nullable        -- link to the existing "Vault" / collection record
  created_at, updated_at
  PRIMARY KEY (owner_id, owner_type, set_id, subset_id, card_number, parallel_id)
```

Notes:

- `parallel_id` nullable encodes "the base/no-parallel version of the card."
- The unique key is `(owner, variant)`. Status is one row per owner per variant.
- **Anonymous storage:** for `owner_type='anonymous'`, the canonical store is the user's `localStorage` (key: `vault.tracker.<setId>.status`). The DB-side anonymous rows exist only when the user does something that requires a server round-trip (e.g. AI question, share link). Most reads/writes for anonymous users never hit the DB.
- **On signup or login:** atomically migrate every localStorage entry into DB rows under the new `user_id`, then clear localStorage. If the user was already logged in on another device, MERGE — server wins on conflict, but show a "merged X new statuses from this device" toast.
- When `status` transitions to `owned` **and the user is authenticated**, also create a row in the existing Vault/collection table and link via `vault_item_id`. For anonymous users, transitioning to `owned` is what triggers the **soft signup prompt** (§7.3) — the row stays in localStorage as `owned` until they sign up, at which point the Vault row is created.
- Status `pending` does **not** create a Vault row yet — pending cards are tracked separately so they don't pollute the user's "real" collection until they arrive.
- `serial_number` is null until the user enters the actual numbered serial after the card arrives.

### 2.4 Per-player and per-team materialized aggregates (optional, recommended)

For fast `By Player` / `By Team` rollups across a 1,495-card set, either:

- (preferred) build per-player and per-team aggregations at query time using indexed joins on the seed checklist
- or maintain `user_player_progress(user_id, set_id, player_name, targeted, pending, owned)` and `user_team_progress(...)` updated by a trigger / domain event.

Pick whichever fits the existing architecture. Don't ship N+1 queries on the list page.

---

## 3. Database / migration plan

1. Create a `card_sets` table seeded from the JSON's `set` block. (id, name, sport, manufacturer, season, release_date, configurations[])
2. Create a `card_subsets` table (id, set_id, name, card_prefix, type, is_auto, is_insert, league, exclusive).
3. Create a `parallels` table (id, name, print_run, exclusive). Seed once from `parallelLibrary`.
4. Create `subset_parallels` (subset_id, parallel_id) — many-to-many join.
5. Create `cards` table (id, subset_id, number, player_name, team_name, is_rc). One row per `card`, NOT per variant.
6. Create `user_card_status` and `user_set_progress` per the schema in §2.3.

Write an idempotent seeder: `seed:checklist 2025-26-bowman-basketball`. Re-running it should `upsert` and never duplicate. The seeder reads the JSON file, walks `subsets[].cards[]`, and inserts.

If your stack already has a migration framework (Prisma, Drizzle, ActiveRecord, Alembic, etc.), use it. Don't introduce a new one.

---

## 4. API endpoints

REST routes (adapt naming to your existing convention — REST/GraphQL/tRPC, plural/singular, etc.). **All `GET` routes are public.** Mutation routes accept either an authenticated session or an anonymous session header `X-Anon-Session: <uuid>`. Anonymous mutation routes are rate-limited per IP (cheap protection against abuse).

```
GET  /api/sets                                    -> list available sets (paginated)
GET  /api/sets/:setId                             -> set metadata + subset summaries
GET  /api/sets/:setId/checklist                   -> full checklist tree + user's status overlay
                                                     query: ?view=player|team&status=targeted|pending|owned&q=search&subset=base-chrome
GET  /api/sets/:setId/players/:playerSlug         -> all variants for one player + status + computed odds
GET  /api/sets/:setId/teams/:teamSlug             -> all players on a team + nested variants
GET  /api/sets/:setId/odds                        -> per-parallel odds table (see §8)
POST /api/sets/:setId/status                      -> upsert one variant's status (anon-allowed)
     body: { subsetId, cardNumber, parallelId|null, status, notes? }
POST /api/sets/:setId/status/bulk                 -> bulk upsert (anon-allowed)
     body: { variants: [...], status }
DELETE /api/sets/:setId/status                    -> clear status for a variant (anon-allowed)
GET  /api/sets/:setId/progress                    -> per-set rollup counters

POST /api/ai/ask                                  -> "Ask the AI" Q&A endpoint (anon-allowed, rate-limited)
     body: { setId, question, context: { activePlayerSlug?, activeTeamSlug? } }
     returns: { answer: string, sourceFacts: [...], suggestedActions?: [...] }

POST /api/auth/upgrade-anonymous                  -> migrate an anonymous session to a new account
     body: { anonSessionId, signupPayload }
     returns: { user, migratedStatusCount }
POST /api/auth/merge-anonymous                    -> merge an anonymous session into an existing logged-in account
     body: { anonSessionId }
     returns: { mergedStatusCount, conflictsResolved }
```

The list endpoint must support pagination — don't return 31k variants in one payload. The default page on the **By Player** view returns players (with summary counts), and only fetches a player's full variant list when expanded. Same pattern for **By Team**.

For anonymous users, the `/checklist` and `/players/:slug` responses don't include a status overlay — the client merges its localStorage state in. This keeps the public CDN cache hot.

`/checklist` should return the data in a shape that lets the client render either view without re-fetching. Roughly:

```jsonc
{
  "set": { ... },
  "subsets": [ { id, name, cardCount, parallels: [...] } ],
  "players": [
    {
      "name": "Cooper Flagg",
      "team": "Dallas Mavericks",
      "isRC": true,
      "summary": { "targeted": 4, "pending": 1, "owned": 0, "totalVariants": 247 },
      // variants are lazy-loaded via /players/:slug
    }
  ],
  "teams": [
    {
      "name": "Dallas Mavericks",
      "league": "NBA",
      "summary": { "targeted": 12, "pending": 1, "owned": 0, "totalVariants": 1240 },
      "playerCount": 6
    }
  ]
}
```

---

## 5. UI requirements

### 5.1 Page: `/sets/2025-26-bowman-basketball/tracker`

Top bar:

- Set name + small "Released Apr 22, 2026" eyebrow.
- **Three rollup pills** — `🎯 Targeted (n)`, `📦 Pending (n)`, `✅ In Vault (n/total)`. Clicking a pill filters the list to that status.
- Search input (debounced 250ms, searches player and card number).
- **Player quick-filter chip.** When the user taps a player anywhere in the UI, a "Filter: Cooper Flagg ✕" chip pins to the top bar and the entire list collapses to just that player. Tapping the ✕ clears it. This is the single most-used flow during a live break, so it must be one tap to enter and one tap to exit.
- **View toggle: `By Player ⇄ By Team`** — sticky; preserve filters/scroll across toggle.
- Subset filter (multi-select dropdown), Parallel rarity filter (slider or chips: All / ≤ /150 / ≤ /50 / ≤ /10 / 1/1).
- **"Ask AI" button** — opens the AI assistant drawer (§9). When a player filter is active, the assistant pre-loads with that player as context.

List body (virtualized — react-window / TanStack Virtual / equivalent. There are 365 unique players in this one set; future sets may go higher):

**By Player view** — each row is a player:
- Player photo (placeholder if missing), name, team chip, RC chip if applicable.
- Inline progress: `4 🎯 · 1 📦 · 0 ✅` next to the name.
- **Headline odds line** — small subtext under the name: e.g. `1 in 24 packs · any auto` or `3 hit-eligible variants under /50`. Sourced from the odds table (§8). For players without auto/numbered hits, show `Base + chrome only` instead.
- Expand → tree of subsets the player appears in, each subset expandable to a parallel grid.
- Each parallel cell shows: parallel name, **print run** (e.g. `/499`), **per-pack odds** (e.g. `1:312 packs`), exclusivity chip, and three status buttons (`🎯 📦 ✅`). Active status is filled. Tap to toggle.
- A "Target all" button per player chip-fills every variant with Targeted (skips Pending/Owned).
- A "Filter to player" pill (or tapping the player's name) pins the top-bar quick-filter to this player.

**By Team view** — each row is a team:
- Team logo (placeholder), team name, league chip (NBA/NCAA).
- Inline aggregate: total targeted/pending/owned across all players on the team.
- Expand → list of players on that team (same rendering as the By Player rows from the previous view), each expandable.

### 5.2 Quick-mark mode (break mode)

Behind a toggle in the top bar, "🔴 Break Mode." When on:

- Defaults the search bar to focus on every page load.
- Single-tap (not double) marks Pending Arrival.
- Shows a recent-actions strip at the bottom: last 5 cards marked, with one-tap undo.
- Persists between sessions (localStorage) so the user doesn't have to re-enable mid-break.

### 5.3 Detail surface (optional but useful)

`/sets/.../players/cooper-flagg` — full variant list for one player across the entire set, grouped by subset, with all parallels. This is a nice deep-link to share, and it's the "everything I'm chasing for this guy" view.

### 5.4 Empty / loading / error states

- First load on a brand-new user: hero copy "Plan your break. Track every hit. Add cards to your Vault before they even ship." with a "Pick a Set" CTA if you support multiple sets, or jumps straight in if Bowman is the only one.
- Network error: keep prior data on screen, toast the error, retry button.
- Optimistic updates on status changes — flip the UI immediately, reconcile on server confirm, roll back on failure.

---

## 6. Important edge cases — DO NOT skip

1. **Same player, same number, different parallels are different variants.** Cooper Flagg Chrome BCV-1 base Chrome and Cooper Flagg Chrome BCV-1 Refractor /499 are TWO rows in `user_card_status`. Don't collapse them.

2. **Same player can appear in multiple subsets.** Cooper Flagg appears in: Base (#1), Base Chrome (BCV-1), Red Rookie Variations (BRR-1), Etched In Glass (NBE-1), Chrome Auto (BCA-CF), Paper R/V Auto (RVA-CF), Rockstar Rookies (RR-1), Greatness Loading (GL-1), Mega Rookies (MR-1), ROY Favorites (RY-1), Hobby Stars (HS-3), Spotlights NBA (BNB-1), Crystallized NBA (CNB-1), Anime NBA (NBA-A19), Bowman GPK NBA (BGP-1), and Bowman Dual Autographs (in BDA-AY, BDA-CW, BDA-AD, BDA-JD). Each appearance is its own card, with its own parallels, with its own variants. The By Player view must aggregate all of them.

3. **Dual autographs feature two players on one card.** `BDA-AD` is "Darryn Peterson / AJ Dybantsa." The seed file lists both as the `player` string with " / " separator. For By Player rollups, **count this card under BOTH players' totals** (parse on " / "). Marking the card as Owned should reflect under both players.

4. **Some subsets are exclusive to a configuration.** Mega Rookies and Mega Prospects only exist in Mega boxes. Geometric parallels are Breaker's Delight only. The seed file flags these via `subset.exclusive` and `parallel.exclusive`. Surface this in the UI as a chip ("Mega exclusive", "Breaker exclusive") so users don't waste time chasing a card they can't pull from a Hobby box.

5. **Variations vs. parallels.** "Red Rookie Variations" and "Etched In Glass Variations" are NOT parallels of the base card — they're separate cards with their own numbering scheme (BRR-1, NBE-1). Treat them as their own subsets, which the seed already does.

6. **Print run = 1 cards (Superfractor, Platinum) are inherently uncheckable from a chase view but checkable from the Vault view.** A user only marks a 1/1 as Owned when they actually have it. Don't allow "Targeted" on 1/1s? Actually do allow it — collectors target 1/1s constantly. Ship as-is.

7. **Schools have abbreviation / name normalization.** "South Carolina" appears as the team for several prospects (it's "University of South Carolina" in the source article). Use a canonical short form in the data layer (`"South Carolina"`) but accept variants on search ("usc", "south carolina", "gamecocks" — bonus points for nicknames).

8. **Player name normalization.** "Bronny James Jr." vs. "Bronny James" — pick one and stick with it. The seed file uses "Bronny James Jr." Same with `Tyler Smith` (could be confused with another Tyler Smith in another set down the road) — namespace player IDs by `(set_id, name)` for now; we'll do proper cross-set player linking in a later milestone.

9. **The `/checklist` payload is huge.** Compress (gzip is enough), paginate the player list, and only return the user's status overlay where it exists (don't return null entries for every variant). For 31k+ variants, the overlay is on the order of "however many statuses the user has set" — usually under 100.

10. **Set-agnosticism.** Nothing in the data model, schema, or UI should hardcode "Bowman" or "Basketball." A future migration drops in `2026-bowman-baseball-checklist.json` and the same UI works.

---

## 7. Anonymous mode & signup-prompt moments

### 7.1 Architecture summary

- On first visit, the client mints an `anon_session_id` (UUID v4) and stashes it in `localStorage`.
- All status data, recent-actions list, Break Mode preference, and view-toggle state live in `localStorage` under namespaced keys (`vault.tracker.<setId>.status`, `vault.tracker.preferences`, etc.).
- The client never blocks on a login. Reads happen against the public `/checklist` and `/odds` endpoints (cacheable on a CDN); mutations either run locally only, or POST to anon-allowed endpoints with the `X-Anon-Session` header.
- Each anonymous mutation is an upsert keyed by `(anon_session_id, set_id, subset_id, card_number, parallel_id)`. The DB-side anon row exists if and only if a server roundtrip happened (e.g. the user asked the AI a question and we needed to know their state). Otherwise it lives only in localStorage.
- AI Q&A (§9) **does not require login** but is rate-limited per `anon_session_id` + IP.

### 7.2 The signup moments — when (and ONLY when) we prompt

We prompt at four moments. Each has a soft, dismissible UI — never modal, never a hard wall.

| Moment | Trigger | Pitch |
|---|---|---|
| **Vault save** | User flips a status to ✅ Owned for the first time in a session | "Lock this hit in your Vault forever — sync across devices, attach grading info, view market value. Free account, 10 seconds." |
| **End of break** | Heuristic: 3+ status changes in the last 30 minutes, then 5 minutes idle, OR user taps "End break" if we surface the action | "Save your break recap. Keep this list across devices. See your stats grow over time." |
| **Cross-device intent** | User taps a "Send to my phone" / "Share" / "Email me this list" affordance | "Sign in to text yourself the link" |
| **High-value AI ask** | User asks the AI a question that returns Vault-state-dependent results (e.g. "what am I missing") AND has 5+ statuses already set | Inline subtle CTA at the end of the answer: "Want this list saved for next time? Free account →" |

Do NOT prompt at:
- Page load
- First status change
- Search or filter actions
- Switching views
- Any time the user dismissed the same prompt in the last 24 hours

### 7.3 Sign-up flow

- Default to **email + magic link** (passwordless) — fewest fields, fastest path.
- Optional: Google/Apple SSO buttons above email.
- One field, one button, done. No "What's your favorite team" onboarding upsell post-signup; we already know — they were tracking Cooper Flagg.
- Immediately on success, call `POST /api/auth/upgrade-anonymous` with the `anon_session_id`, migrate every localStorage entry into the new `user_id`'s rows, then **clear localStorage**. Show a confirmation toast: "Welcome — 14 hits saved to your Vault."
- If the email matches an existing account, treat as login → `POST /api/auth/merge-anonymous` instead. Resolve conflicts by keeping the most progressed status (owned > pending > targeted > none). Toast the merge count.

### 7.4 SEO and shareability (anonymous as a feature, not a fallback)

- The `/sets/2025-26-bowman-basketball/tracker` page is server-rendered and indexable.
- Each player's deep page (`/sets/.../players/cooper-flagg`) is its own indexable URL with structured data (`Product` schema for cards). This is how people googling "Cooper Flagg rookie card checklist" find us.
- Share button on every player and team page generates a shareable URL with the user's targets encoded in a short URL parameter (or, if logged in, a permanent share link).
- Open Graph image generated per page — for player pages, "Cooper Flagg — 247 cards in 2025-26 Bowman Basketball" with a card mosaic. This is what shows when shared in Discord/Twitter.

---

## 8. Odds calculation & display

### 8.1 Two sources of truth

- **Print run** — already in the seed data (`parallelLibrary.<id>.printRun`). For numbered parallels this is authoritative.
- **Topps-published per-pack/per-box odds** — Topps publishes an odds PDF for every release ([example link from Beckett](https://img.beckett.com/news/news-content/uploads/2026/04/2025-26_Bowman_Basketball_Odds.pdf)). These are the OFFICIAL odds we want to display when available. They live in a sibling file `2025-26-bowman-basketball-odds.json` (see attached sample). When this file is missing or incomplete for a parallel, fall back to derived odds (§8.2).

### 8.2 Derived odds (fallback)

When Topps odds aren't available for a specific parallel, we estimate using:

```
total_parallel_cards = printRun × cards_in_subset
estimated_packs_to_pull = total_packs_produced / total_parallel_cards
```

We don't know `total_packs_produced` exactly — display derived odds as `~1 in N packs (estimated from print run)` with a tooltip explaining the estimate. Mark them as estimated visually so users don't conflate them with official odds.

### 8.3 The odds data file shape

```jsonc
{
  "setId": "2025-26-bowman-basketball",
  "source": "Topps published odds (April 2026)",
  "configurations": {
    "Hobby": {
      "packsPerBox": 20,
      "cardsPerPack": 8,
      "guarantees": { "nbaAutos": 1, "ncaaAutos": 1 }
    }
    // ...Jumbo, Mega, Value, Breaker's Delight
  },
  "perParallel": {
    // keyed by parallel id from the main checklist's parallelLibrary
    "chrome-refractor": {
      "configurations": {
        "Hobby": { "oddsPer": "pack", "ratio": "1:312" },
        "Jumbo": { "oddsPer": "pack", "ratio": "1:104" }
      }
    },
    "chrome-superfractor": {
      "configurations": {
        "Hobby": { "oddsPer": "case", "ratio": "1:48" }
      }
    }
    // ...
  },
  "perInsert": {
    "talent-tracker": {
      "Hobby": { "oddsPer": "pack", "ratio": "1:8" }
    }
    // ...
  }
}
```

### 8.4 Surfacing odds in UI

- Per-parallel cell: show the "best" available odds for the user's selected box configuration (default Hobby, switchable in settings or the player drawer).
- Player headline: show the rarest meaningful target. "1 in 312 packs · Refractor /499" or "1 in case · Superfractor 1/1."
- Compute and show "expected hits per box" for the player's full parallel rainbow: `Σ (1 / odds_ratio_per_pack) × packs_per_box`. Display as e.g. "≈ 0.4 expected hits/box."
- Highlight the chase ladder visually — gradient or rarity tier chips: Common / Limited (/199–/499) / Rare (/50–/150) / Ultra (/5–/25) / Mythic (1/1).

### 8.5 Edge cases

- Mega Mojo parallels are ONLY in Mega boxes — the Hobby configuration shows `Not in this configuration` instead of phantom odds.
- Breaker's Delight Geometric parallels are ONLY in that SKU; same treatment.
- For Retail Exclusive parallels, surface them only when the user has Retail toggled, otherwise gray out.

---

## 9. "Ask the AI" assistant

### 9.1 What it answers

The AI assistant answers three classes of question, all conversational and short:

1. **Odds questions** — "What are the odds of pulling a Cooper Flagg auto?" "Which player has the best odds of giving me a 1/1?" "How many boxes would I need to open to expect one Refractor?"
2. **Collection-state questions** (auth or anon, scoped to current device for anon) — "Do I have a Cooper Flagg Refractor?" "What Cooper Flagg cards am I missing?" "Show me my targets that are still pending."
3. **Set-knowledge questions** — "Who's the #1 rookie in this set?" "What's a Retrofractor?" "Which players appear in the Crystallized insert?"

### 9.2 How it works

- Endpoint: `POST /api/ai/ask` with `{ setId, question, context: { activePlayerSlug?, activeTeamSlug?, anonSessionId? } }`.
- Server assembles a **structured fact pack** before calling the LLM:
  - The set metadata, subset list, parallel library, and odds table for `setId`.
  - The user's tracker state for that set (DB if logged in; client passes the localStorage state in the body if anon).
  - A focused subset of facts based on the active context (e.g. if `activePlayerSlug=cooper-flagg`, include only Flagg's variants and odds).
- Prompt the LLM with: the question + the fact pack + a strict instruction to answer ONLY from facts in the pack. Refuse / hedge if data is missing rather than hallucinate.
- The LLM returns: `{ answer, sourceFacts: [list of fact-pack ids it used], suggestedActions?: [{label, intent, payload}] }`.
- Suggested actions render as tappable chips below the answer: e.g. "Mark all 5 as Targeted" or "View these on the checklist" or "Filter to Cooper Flagg." Tapping invokes the same client-side actions the user could do manually.

### 9.3 UI

- A right-side drawer triggered by the "Ask AI" button. Mobile-friendly (bottom sheet on small screens).
- Single text input + send button. Starter chips above the input: "Show me my missing hits", "Best odds for autos", "What's the rarest variant?" — pre-fill the input and submit.
- Conversation is per-session (not stored long-term for v1). For logged-in users, optionally persist the last 20 questions for "recently asked."
- Show a small `Powered by AI · uses your tracker state` badge so users understand the AI knows their data.

### 9.4 Guardrails

- Rate-limit anon: 10 questions per session, 50 per IP per day. Authenticated users: 100/day on free tier.
- Never invent print runs or odds — if the fact pack doesn't have them, the answer says "I don't have official odds for that parallel."
- Don't expose other users' data, ever. The fact pack only contains the asker's own state.
- For "do I have X" questions, definitively answer based on the user's `owned` rows. Be precise about the variant: "You have a Cooper Flagg Chrome Refractor /499, but not the /150 Blue Refractor."

### 9.5 Anonymous AI is a growth lever

Anonymous AI Q&A is the most magical thing a first-time visitor can experience. Don't gate it. Use it. After ~5 turns of conversation, gently surface the "Save this conversation to your account" CTA — but only once.

---

## 10. Acceptance criteria

A change is done when ALL of the following are true:

1. Seeder runs cleanly on a fresh DB. `seed:checklist 2025-26-bowman-basketball` produces 1 set, 37 subsets, ~70 parallels, 1,495 cards. Re-running is a no-op.
2. A new user's `user_card_status` is empty; their `user_set_progress` returns zeroes.
3. POSTing `{subsetId: "base-chrome", cardNumber: "BCV-1", parallelId: "chrome-refractor", status: "targeted"}` upserts one row, increments the user's `targeted_count` for the set.
4. POSTing the same row with `status: "pending"` updates in place — does NOT create a duplicate. Counters move from targeted → pending.
5. POSTing with `status: "owned"` creates the corresponding Vault item, links it back via `vault_item_id`, sets `acquired_at`.
6. DELETE clears the row and adjusts counters down.
7. Bulk endpoint accepts up to 200 variants per call; all-or-nothing transaction.
8. Checklist endpoint returns ≤ 200KB on the wire (gzipped) for the player-summary view.
9. Switching By Player ⇄ By Team round-trips without losing search query, status filter, or scroll position.
10. Break Mode toggle persists across reloads via localStorage.
11. Status changes are optimistic. Network failure → toast + revert. No half-applied UI.
12. The list is virtualized; scrolling 365 players stays at 60fps.
13. Searching for "flagg" finds Cooper Flagg AND Ace Flagg (both exist in this set).
14. Marking the Bowman Dual Autograph BDA-AD as Owned increments BOTH the Darryn Peterson and the AJ Dybantsa player rollups.
15. Tracker page loads, allows full status manipulation, and runs AI queries with NO logged-in user. Anonymous mutations persist across hard refresh via localStorage.
16. After signup, the new user account contains every status from the prior anonymous session. localStorage is cleared. A toast confirms the migration count.
17. Signing into an existing account from anonymous mode merges the two states without losing any rows. Conflicts resolve "highest status wins" (owned > pending > targeted).
18. The "Save to Vault" signup prompt fires on the first-ever flip to ✅ Owned for an anonymous user. It does NOT fire on subsequent ✅ flips within the same session if dismissed.
19. Tapping a player anywhere in the tracker pins the player quick-filter chip in the top bar; tapping the ✕ on the chip clears it instantly. Filter survives view-toggle.
20. Each parallel cell shows print run AND per-pack odds. Odds source is the published odds JSON when present; falls back to a clearly-labeled estimate when not.
21. Mega-exclusive parallels show "Not in Hobby" when the user's box configuration is Hobby. Switching configuration updates all odds in place.
22. The AI assistant correctly answers: "Do I have a Cooper Flagg Refractor?" → returns based on the user's owned set (or correctly says "no" for an empty anon session). The answer cites the exact variant, never a different parallel.
23. The AI refuses to invent odds. For a parallel without published odds, the answer explicitly states "official odds not published; estimate based on print run is …".
24. AI rate-limits enforced per anon session and per IP. After hitting the limit, a friendly 429 fires.
25. The player deep page (`/sets/.../players/cooper-flagg`) is server-rendered, indexable, has a unique title and Open Graph image, and works without any client JS for the read-only path.

---

## 11. Implementation notes for the agent

1. **Start by exploring the existing codebase.** Don't assume framework. Look at:
   - How are existing pages structured? (`app/`? `pages/`? `src/routes/`?)
   - What's the styling system? (Tailwind? CSS modules? shadcn/ui?)
   - What's the existing Vault / collection model called? Reuse its types and components.
   - What's the auth / user context lookup pattern?
   - What's the API conventions? REST? tRPC? GraphQL?
   - Where do migrations live?
2. **Match existing patterns.** Don't introduce a new ORM, state manager, or data-fetching library. If the app uses TanStack Query, use that. If it uses SWR, use that. If it uses Redux, … you get the idea.
3. **Ship in vertical slices.** Order: (a) DB schema + seeder, (b) read-only checklist endpoint, (c) By Player view, (d) status mutations, (e) By Team view + toggle, (f) Break Mode, (g) Vault integration on `owned` transition. Don't try to land it all in one PR.
4. **Test the data layer first.** Write a snapshot test that, given the seed JSON, the seeder produces exactly 1,495 cards across 37 subsets. If the test fails, the data is wrong — don't paper over it.
5. **Don't pre-explode parallels into rows.** It's 31k rows just for one set. Generate variants on the fly from `(card, parallel)`. The user_card_status table only has rows the user has touched.
6. **Image handling is out of scope for v1.** Use placeholders for player and team logos. Wire up a `playerImageUrl` / `teamLogoUrl` field for v2.
7. **Player slugs.** Generate slugs as `kebab-case(player.name)`. Disambiguate within a set if collisions occur.
8. **Performance budget.** Initial checklist page interactive in under 1.5s on a mid-tier mobile device over 4G. Status mutation latency <200ms perceived (optimistic).
9. **Accessibility.** All status buttons are keyboard-reachable, have aria-labels (`Mark Cooper Flagg Refractor /499 as Targeted`), and the view toggle is a real radiogroup. Focus order respects the visual order.

---

## 12. Out of scope (for this PR)

- Image hosting / Topps imagery licensing
- Cross-set player aggregation ("show me every Cooper Flagg card across every set I track")
- Trade / sell flows
- Pricing / market value (we have a separate price-guide integration roadmap)
- Push notifications when a targeted card hits a marketplace
- Sharing wishlists publicly
- Breaker integrations (Whatnot/Fanatics Live API hookups) — separate project

These are all on the roadmap; scoping creep here will tank the launch.

---

## 13. Files in this drop

- `BREAK_TRACKER_PROMPT.md` — this file.
- `2025-26-bowman-basketball-checklist.json` — the seed data. Read it, parse it, seed it.
- `2025-26-bowman-basketball-odds.json` — sample odds data structure. Replace the values with the official Topps odds when scraping/transcribing the published odds PDF.
- `build_checklist.py` — the script that produced the JSON. Keep it; future sets get added by extending it.

---

**Begin by reading the existing repository structure**, then propose a 4-step implementation plan ordered by vertical slice (per §11.3) before writing any code. Wait for confirmation on the plan before scaffolding the migration.

Suggested vertical-slice order, refined for the anonymous-first model:

1. **Data layer + read-only public checklist endpoint** (no auth needed). Seeder runs, GET /checklist returns server-rendered HTML with subsets, players, teams. SEO-friendly out of the gate.
2. **By Player view + status mutations (localStorage only first)**. No DB writes for status yet — pure client-side optimistic state. Ships a useful tool day one.
3. **Server-side anonymous mutations + the merge endpoints**. Now state can roundtrip the server (needed for AI Q&A). Auth flows still optional.
4. **Authenticated upgrade path + Vault integration**. Signup migrates anon → user; ✅ Owned creates Vault rows for logged-in users.
5. **Odds layer + odds JSON loader + UI surfacing**. Print runs are already in checklist data; this step adds the per-configuration odds table and renders ratios in cells.
6. **AI assistant**. Uses everything above. Ship behind a feature flag first if your stack supports it.
7. **By Team view + view-toggle polish**. Smaller scope; can ship anytime after slice 2.
8. **Break Mode + signup-prompt moments**. Final polish before public launch.
