# Public Profiles & Reactions — build plan

Status: proposed, not started. Written 2026-09-15.

## The idea

A collector gets a page at `myvaults.io/u/<handle>` showing the cards they are proud of. Visitors react with three emoji: ❤️ 🔥 💰. Reactions require an account. There are no dislikes, no downvotes and no comments.

Sherif's reason for gating reactions behind sign-up: the person sharing wants reactions, so they recruit their friends to sign up in order to give them. The share is the acquisition channel. Every design decision below serves that loop.

---

## P0: Lock it down first (must ship in the same release)

Vaults are public today with no opt-in. This has to be fixed before profiles add traffic, not after.

**1. `api/public-card.js` has no visibility gate.** `GET /api/public-card?uid=<uid>` returns a user's entire card collection to any caller, with `Access-Control-Allow-Origin: *`. The uid is the only thing standing in the way, and it appears in every share link ever sent.

Fix: every read path checks `users/{uid}.profile_public.enabled === true` and, per target, that the card or collection is in the published set. Unpublished target returns 404, never 403, so the endpoint cannot be used to confirm a uid exists.

**2. `firestore.rules` exposes every user's collections.**

```
match /{path=**}/collections/{collectionId} {
  allow read: if true;
}
```

That recursive wildcard makes all collections world-readable to anyone with the Firebase client config, which ships in the browser bundle. Public reads should not go through client Firestore at all.

Fix: delete that rule. Public reads move to the service-account API, which can enforce the opt-in. Client rules go back to owner-only.

**3. Existing share links break when the gate lands.** Anyone holding an old link loses access until that user opts in. Acceptable, but it needs a line in the release notes and a friendly "this vault is private" page rather than a raw 404.

---

## P1: Identity

Users have Firebase uids and no names. Profiles need a handle.

**Handle rules:** 3 to 20 characters, `[a-z0-9_]`, lowercase only, cannot start with a digit or underscore. Case-insensitive uniqueness.

**Storage:** a top-level `handles/{handle}` document holding `{ uid, created_at }` is the uniqueness lock, claimed in a transaction. The handle is denormalised onto `users/{uid}.handle` for reads. Never derive a handle from an email address.

**Reserved list, enforced at claim time:** every existing route (`blog`, `admin`, `terms`, `privacy-policy`, `delete-account`, `api`, `u`, `app`, `www`), plus the usual impersonation risks (`support`, `help`, `official`, `thevault`, `myvaults`, `admin`, `mod`, `staff`). Keep it in one exported constant so it stays in sync with routing.

**Changing a handle** releases the old one after 30 days rather than immediately, so links do not get hijacked by the next claimant.

---

## P2: The profile page

**Route:** `myvaults.io/u/<handle>`, via a Vercel rewrite from the website project to the app project. The handle is the only public identifier; uids never appear in a URL again.

**Default contents:** the user's favourites, values hidden. That default is deliberate. The whole repositioning says a collection is the cards you love, so a profile opens as a wall of favourites rather than an inventory with a total at the top.

**Profile settings, per user:**

| Setting | Default |
|---|---|
| `enabled` | off, opt-in |
| `handle` | none until claimed |
| `display_name` | falls back to handle |
| `bio` | empty, 160 chars |
| `show_values` | off |
| `featured_collection_ids` | empty, favourites shown |

**Server-rendered OG tags.** A profile that previews as a blank card in WhatsApp is a dead share. `api/public-card.js` already builds OG titles and images for cards, so extend that pattern: title is the display name, description is card count and the headline sets, image is their top favourite. This is the single highest-leverage detail in the feature and it is easy to leave until last and then skip.

---

## P3: Reactions

**Three emoji, no negatives.** ❤️ 🔥 💰. No dislike, no downvote, no comments. Comments are where the negativity would arrive, and moderating them is a job nobody here wants.

**Data model.** Reactions live outside the owner's subtree so a visitor never needs write access to someone else's vault.

```
reactions/{targetKey}              { heart: 12, fire: 30, money: 4 }
reactions/{targetKey}/by/{uid}     { heart: true, fire: false, money: true, at: <ts> }
```

`targetKey` is `card_{ownerUid}_{cardId}` or `profile_{ownerUid}`. One of each emoji per user per target, toggleable.

**Writes go through the API, not the client.** `POST /api/react` with a Firebase ID token in the Authorization header, body `{ targetKey, emoji }`. The function verifies the token, toggles `by/{uid}` and increments the counter in one transaction. Firestore rules cannot enforce "increment by exactly one and only alongside a matching per-user doc", so the client never writes counters. Rules: `reactions/**` is world-readable, client-writable never.

**Rate limit** per uid per minute in the same function. Cheap insurance.

---

## The loop, in detail

This is the part worth getting right.

A signed-out visitor taps 🔥. They must not lose the tap.

1. Store the intent (`targetKey`, emoji) in `sessionStorage`.
2. Open the auth sheet inline on the profile, not on a separate page. Copy: "Create a free account to react" and, underneath, "You'll also get your own vault."
3. On success, replay the stored reaction, animate it landing, and leave them exactly where they were on the same card.
4. Then, and only then, offer the next step: "Start your own vault."

Losing the reaction across the auth redirect kills the loop, and it is the easiest thing in this build to get wrong.

Supporting pieces:

- **Social proof on the profile.** "37 people reacted to this collection." A profile with no numbers gives a visitor no reason to add to them.
- **Owner-side nudge.** When someone reacts, tell the owner. That is what makes them share again, which is the top of the loop.
- **Attribution.** Since reactions are signed-in, you know who reacted. Showing the avatars of the last few is stronger proof than a number, and it makes the reactor visible to their friends, which recruits the next one.
- **Referral credit.** A sign-up that starts from a profile should credit that profile's owner. `users/{uid}.referral_source` already exists for exactly this and the reward rule is already in `firestore.rules`. Reuse it rather than building a second referral path.

---

## P4: Moderation, non-optional

Public pages carrying user-uploaded photos need a way to deal with what turns up.

- A report control on every profile, writing to a top-level `reports` collection.
- Admin review in the existing admin panel, which already has `isAdmin()` and collection-group reads.
- A kill switch: an admin sets `profile_public.enabled = false` and the page goes dark immediately.
- Handle squatting and impersonation handled by the reserved list plus the report path.

Also: the privacy policy and terms both need a section on what becomes public and how to take it down. Those pages already exist at `website/privacy-policy.html` and `website/terms.html`.

---

## Build order

| | Work | Why here |
|---|---|---|
| P0 | Opt-in flag, gate `public-card.js`, delete the recursive collections rule | Shipping profiles on top of an open API makes the hole worse |
| P1 | Handles, reserved list, claim flow in Profile settings | Nothing is addressable without it |
| P2 | Profile page, favourites default, server-rendered OG | The thing being shared |
| P3 | `POST /api/react`, counters, the signed-out reaction loop | The reason to share it |
| P4 | Reporting, admin kill switch, policy copy | Before it gets real traffic, not after |

P0 to P2 is a coherent first release on its own: people can share a profile and it looks good in a chat. P3 is the growth mechanic and can follow a week later.

---

## Open questions

1. **Is a profile one page or many?** One page per collector is simplest. Per-collection pages (`/u/sherif/rookies`) would be more shareable for a themed set, but multiply the surface area. Recommend one page now, collections as anchors on it.
2. **Does the Android app get profiles in the same release?** Capacitor wraps the same build, so the page comes for free, but deep links and the share sheet need testing on device.
3. **What happens to the existing `?shareCard=` and `?vaultUid=` links** once uids leave the URL scheme. Recommend keeping them working, gated by the same opt-in check, and quietly stopping generating new ones.
