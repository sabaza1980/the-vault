# The Vault — Social Layer Project Plan

> Owner: Sherif · Drafted: 2026-06-25 · Status: Planning (no code yet)
> Scope: friends, friend collection viewing, trades, comparisons, and a PC (Personal
> Collection) onboarding flow that auto-tags scanned cards by collected player.

Companion to `MOBILE_REVAMP_PLAN.md`. This layer is largely **independent** of the
pricing/Ximilar work and can proceed in parallel; it reuses the unified `CardDetailModal`
for browsing friends' cards.

---

## 1. Architecture snapshot (what we're building on)

- **Auth/data:** Firebase Auth + Firestore. Profile lives at `users/{uid}` (snake_case
  fields). Cards live in a subcollection (`users/{uid}/cards`). Card images in Firebase
  Storage at `users/{uid}/cards/...`.
- **Already exists and is reusable:**
  - **Profile doc** (`useRewardProfile`) with `display_name`, `referral_code` (= uid),
    `referral_count`, tier, etc.
  - **Referral / invite system** (`ReferralModal`, invite links, +20-slot bonus) — the
    backbone for **email/link invites to non-users**.
  - **Public sharing** (`PublicShareView` + `api/public-card.js`, `?shareVault=uid` etc.) —
    public, link-based reads of a vault/collection. We formalize this into friend-gated reads.
  - **PC concept** (`isPC` flag, PC strip, PC filter) — today a manual toggle. We make it
    auto-populate from a player watchlist.
  - **Unified card detail** (`CardDetailModal`) — reuse for viewing a friend's card.
- **Missing (net-new):** usernames/handles, friendships + requests, trades, comparisons,
  an onboarding flow, a public profile surface, blocking/safety, and the friend-read
  security model.

> Note on reads: friend collection viewing can be done two ways — (a) **Firestore security
> rules** that let a friend read another user's cards, or (b) a **server API** (like
> `public-card.js`) that checks friendship and returns the data. The plan defaults to (a)
> rules-based for live data, with (b) as a fallback if rules get unwieldy. `firebase-admin`
> is not yet in the codebase; if we go API-heavy we add it.

---

## 2. Data model (new Firestore shapes)

- **`users/{uid}`** (extend, private): add `username`, `avatar_url`,
  `visibility: { vault: 'friends'|'link'|'private', showValue: bool }`, `blocked: uid[]`,
  and the **Collector Profile** (see below):
  - `collecting_categories: string[]` — e.g. `['Basketball','Pokemon','Coins']`.
  - `pc_interests` — a **structured, per-category** watchlist (replaces the flat
    `pc_players`), so auto-tagging works across card types, stamps and coins:
    ```
    pc_interests: {
      sports:  { players: [], teams: [], leagues: [] },
      tcg:     { characters: [], sets: [], games: [] },   // Pokémon/MTG/etc.
      stamps:  { countries: [], themes: [], eras: [] },
      coins:   { countries: [], eras: [], metals: [], denominations: [] },
      comics:  { characters: [], titles: [], publishers: [] }
    }
    ```
  - `collector_type` — optional self-label: `investor` | `pc/sentimental` | `set_builder` |
    `mixed` (tunes whether the app leads with value or with collection/sentiment).
  - `goals: string[]` — optional: `track_value` | `build_sets` | `trade` | `sell`.
- **`usernames/{usernameLower}` → `{ uid }`** (public, uniqueness index). Claimed atomically
  in a transaction so handles are unique and reservable.
- **`publicProfiles/{uid}`** (public-readable, no private reward data):
  `{ username, displayName, avatarUrl, collects: string[] (categories), highlights:
  string[] (a curated, public-safe subset of pc_interests — e.g. "Curry", "Charizard",
  "Pre-1950 GB stamps"), stats?: { cardCount, pcCount, totalValue? (only if showValue) },
  updatedAt }`. This is the "what I collect / chase" surface friends and search see.
- **`users/{uid}/friends/{friendUid}` → `{ since, status: 'accepted' }`** — mirrored on both
  sides at accept time. Drives both the friends list and read permissions.
- **`friendRequests/{requestId}` → `{ from, to, status: 'pending'|'accepted'|'declined',
  createdAt }`** (or `users/{uid}/incomingRequests` subcollection for easy per-user queries).
- **`trades/{tradeId}`** `{ from, to, offered: CardSnapshot[], requested: CardSnapshot[],
  status: 'pending'|'countered'|'accepted'|'declined'|'cancelled', history[], updatedAt }`.
  `CardSnapshot` = `{ cardId, ownerUid, playerName, image, set, value }` captured at offer
  time so the trade survives later edits/deletes.

**Security rules (the crux):**
- `usernames/*`: read public; create only if unclaimed and `request.auth.uid` matches the
  value being written.
- `publicProfiles/{uid}`: read public (or read-if-friend, per the user's visibility setting);
  write only by owner.
- `users/{uid}/cards`: read if `uid == requester` OR requester is in `users/{uid}/friends`
  AND owner's `visibility.vault != 'private'` (and value fields gated by `showValue`).
- `trades/{id}`: read/write only by `from`/`to`.
- Blocking: a blocked uid can't send requests/trades or read your profile.

---

## 3. Product decisions to lock (with my recommendations)

- **D1 — Trade depth.** *Facilitation only (recommended)*: the app lets two friends agree on
  a swap in-app (offer → counter → accept) and tracks status; the actual shipping/payment
  happens off-platform. NOT escrow/shipping/payments in v1 (huge scope + liability).
- **D2 — Default visibility.** *Friends-only (recommended)* with opt-in link/public. New
  users aren't exposed by default.
- **D3 — Value visibility to friends.** A `showValue` toggle (some collectors don't want
  $$ public). *Default: hidden from friends, owner always sees it.*
- **D4 — What friends see.** Per-user choice: whole vault, **PC only**, or private. PC-only
  is a friendly middle ground and ties to the PC story.
- **D5 — Adding friends.** Support **username search + email/link invite (reuse referral) +
  QR/share link**. Username is the public handle.
- **D6 — Safety (required for social).** Blocking + reporting from day one; usernames
  moderated (no impersonation/slurs); be mindful the hobby includes **minors** — keep
  profiles minimal (no precise location, no DOB), and gate any free-text (trade messages)
  with basic safeguards. This isn't optional for a social product.

---

## 4. Phases (each independently shippable)

Ordered so value lands early and each phase de-risks the next. Effort: S ≤ ½ day, M ≈ 1–2
days, L ≈ 3–5 days.

### Phase S0 · Identity foundations — Est: M
- **Goal:** usernames, public profiles, visibility settings, security-rule baseline.
- **Build:** username claim (transaction on `usernames/*`); `publicProfiles/{uid}` writer
  (kept in sync on card/profile changes); a Settings → Privacy panel (vault visibility,
  show-value, username, avatar); first cut of `firestore.rules` for the above.
- **AC:** a user can set a unique handle; their `publicProfiles` doc reflects opt-in stats;
  visibility settings persist; rules deny reads that violate visibility.
- **Decisions:** D2, D3, D4. **Safety:** D6 (blocking scaffold).

### Phase S1 · Collector Profile (KYC) onboarding + PC auto-tag — Est: M–L  *(high value)*
- **Goal:** a richer "know your collector" opening flow that works across **all** Vault
  categories (sports, Pokémon/TCG, MTG, stamps, coins, comics) — not just sports players —
  and uses it to auto-populate PC and personalize the app.

- **Adaptive onboarding flow** (new; runs after account creation, fully skippable, resumable):
  1. **Welcome + username** (from S0).
  2. **"What do you collect?"** — multi-select categories → `collecting_categories`. This
     branches the rest of the flow so a coin collector never sees "favorite player."
  3. **Category-specific interest steps** (only for chosen categories) → `pc_interests`:
     - **Sports:** players, teams, leagues. (Typeahead seeded from common names.)
     - **TCG (Pokémon/MTG/One Piece/…):** characters/Pokémon, sets/eras, which games.
     - **Stamps:** countries, themes, eras.
     - **Coins:** countries, eras, metals, denominations.
     - **Comics:** characters, titles, publishers.
     Each step: chips + free-type add, "skip" always available.
  4. **Collector type & goals** (optional, one tap each) → `collector_type`, `goals` —
     tunes whether the home leads with value (investor) or the collection itself (PC).
  5. **Done** → land on a home that already reflects their interests.

- **Generalized auto-tag (PC):** in the analyze/identify pipeline, after identity is known
  (ideally from Ximilar's structured fields), match the card's key entity **against the
  matching category bucket** — e.g. a Basketball card's `player`/`team` vs
  `pc_interests.sports`; a Pokémon card's `name`/`set` vs `pc_interests.tcg`; a coin's
  country/era vs `pc_interests.coins`. On match → `isPC = true` + a subtle "Added to PC"
  toast. Normalized + fuzzy matching; conservative to avoid false PC tags.

- **Manage + public surface:** edit the Collector Profile anytime in Settings; a curated,
  public-safe subset becomes `publicProfiles.highlights` / `collects` so friends see what you
  collect and chase (feeds S4 comparisons + S5 trade targeting).

- **AC:** onboarding adapts to chosen categories; interests persist per category; scanning a
  card that matches any interest auto-flags PC across card types/stamps/coins; profile shows
  what you collect; flow is skippable/resumable.
- **Depends on:** S0 (profile/username). Strong synergy with WP-5a — Ximilar's clean
  `name`/`set`/`subcategory` is what makes cross-category matching reliable (raw OCR isn't).
- **Decision:** **D7 — KYC depth.** How far the opening flow probes: *Light* (categories +
  a few interests) vs *Deep (recommended)* (categories → per-category interests → collector
  type/goals), with everything skippable so depth never blocks. Recommend Deep-but-skippable.

### Phase S2 · Friends — Est: L
- **Goal:** add/accept friends via the industry-standard paths.
- **Build:** username search; send/accept/decline requests (`friendRequests` +
  `users/{uid}/friends` mirror on accept); **email/link invite** reusing the referral system
  (invite a non-user → they sign up → auto-friend + both get the referral bonus); QR/share
  link; friends list UI; request notifications; **block/report**.
- **AC:** two users can become friends by handle or invite; requests are notified; blocking
  prevents contact; friends list is queryable.
- **Decisions:** D5, D6.

### Phase S3 · View friends' collections — Est: M
- **Goal:** browse a friend's vault/PC respecting their visibility.
- **Build:** friend profile screen (avatar, username, PC players, stats); their collection
  grid honoring `visibility` + `showValue`; reuse `CardDetailModal` (read-only variant — no
  edit/sell); rules/API for the friend read.
- **AC:** you can open a friend and browse exactly what they've allowed; value hidden if they
  opted out; private vaults blocked.
- **Depends on:** S0 rules, S2 friendship.

### Phase S4 · Comparisons — Est: M
- **Goal:** compare your collection with a friend's.
- **Build:** a compare view: counts, total value (if both show value), category split,
  **overlap** (cards you both have), **gaps** ("they have, you don't" / "you have, they
  don't"), and **PC-match highlights** (their cards matching your PC players, and vice
  versa) — the natural trade-targeting signal.
- **AC:** side-by-side stats + the four overlap/gap lists; PC matches surfaced.
- **Depends on:** S3 read access.

### Phase S5 · Trades — Est: L
- **Goal:** propose and negotiate swaps (facilitation, per D1).
- **Build:** trade builder (pick your cards + their cards from the compare/profile views →
  send `trades/{id}` with snapshots); trade inbox (pending/countered/accepted/declined);
  counter-offer, accept/decline; lightweight per-trade messaging (with the D6 safeguards);
  status + history; notifications. Clear "this arranges the swap; shipping/payment is between
  you two" framing.
- **AC:** a full offer → counter → accept loop works between two friends; both see status;
  snapshots keep the trade stable if a card later changes.
- **Decisions:** D1, D6.

### Phase S6 · Growth & polish — Est: M (later)
- Activity feed (friend added a card / new PC pickup / completed a trade), trade history,
  collection-vs-friends leaderboards, push notifications (Capacitor), and a "people you may
  know / collectors of your PC players" discovery surface.

---

## 5. Sequencing & dependencies

```
S0 Identity ─┬─> S1 PC onboarding (also leans on WP-5a Ximilar for clean player match)
             └─> S2 Friends ─> S3 View collections ─> S4 Compare ─> S5 Trades ─> S6 Growth
```
- **Recommended first ship:** S0 + S1 together — they're self-contained, deliver the PC
  onboarding you asked for, and don't need the full friend graph. S2→S5 is the social core,
  built in order. S6 is post-launch.
- Parallelism: S0/S1 can run alongside the pricing/Ximilar work; S2+ is best after S0.

## 6. Cross-cutting

- **Safety/moderation (D6):** blocking, reporting, username rules, minimal profiles, message
  safeguards. Treat as first-class, not an afterthought.
- **Notifications:** in-app first (Firestore listeners); push via Capacitor in S6.
- **Privacy & rules testing:** every phase ships with `firestore.rules` updates + a manual
  matrix of "owner / friend / stranger / blocked" read-write checks.
- **Reuse:** referral system (invites), public-card path (reads), `CardDetailModal` (viewing),
  `HScroll`/tab bar (UI). Minimize net-new surface.

## 7. Open decisions for Sherif
D1 trade depth · D2 default visibility · D3 value-to-friends · D4 vault vs PC-only ·
D5 friend-add methods · D6 safety scope (§3) · D7 KYC depth (§S1, recommend deep-but-skippable).

## 8. Status tracker

| Phase | Title | Est | Status |
|-------|-------|-----|--------|
| S0 | Identity foundations (username, profiles, rules) | M | Not started |
| S1 | Collector Profile (KYC) onboarding + PC auto-tag | M–L | Not started |
| S2 | Friends (requests, invites, blocking) | L | Not started |
| S3 | View friends' collections | M | Not started |
| S4 | Comparisons | M | Not started |
| S5 | Trades (facilitation) | L | Not started |
| S6 | Growth & polish | M | Not started |
