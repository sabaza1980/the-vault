/**
 * The feed: shared model and write path.
 *
 * Vercel ignores /api files starting with "_", so this is a module, not a route.
 *
 * One document per card added. The entry carries a snapshot of the card and its
 * owner so a feed page renders from one query with no joins — 60 documents, 60
 * reads, constant at any scale.
 *
 * Three things are deliberately NOT on the entry:
 *
 *   - The estimated value. The feed must not become a leaderboard of what
 *     people's cards are worth. Tapping through to the card shows a value if
 *     that collector has show_values on; the row in the feed never does.
 *   - Whether the owner's profile is public. That is resolved when the feed is
 *     read, so switching a profile off hides the entries immediately instead of
 *     kicking off a write storm across every card they ever added.
 *   - The reaction counts as the source of truth. `reactions/{target}` owns
 *     them; the copies here are denormalised by api/react.js so a feed page
 *     does not need a second read per row.
 */

import { googleToken, fsGet, fsList, fsPatch, fsBase, profilePublicOn, publicDisplayName } from './_fb.js';

/** Deterministic, so publishing twice updates rather than duplicates. */
export function entryId(ownerUid, cardId) {
  return `${ownerUid}_${cardId}`.replace(/[^A-Za-z0-9_-]/g, '');
}

/** The same key api/react.js uses, so the feed and the profile share counts. */
export function reactionTarget(ownerUid, cardId) {
  return `card_${ownerUid}_${cardId}`;
}

/**
 * The kill switch. `config/feed.enabled === false` empties the feed instantly,
 * for everyone, without a deploy.
 *
 * Absent means on: a missing config document should not silently disable a
 * shipped feature. Only an explicit false turns it off.
 */
export async function feedEnabled(token) {
  try {
    const cfg = await fsGet('config/feed', token);
    return !(cfg && cfg.enabled === false);
  } catch {
    return true;
  }
}

const truthy = (v) => v === true || v === 'true';

/** Short flags a collector recognises at a glance. At most four. */
function badgesFor(card) {
  const out = [];
  if (truthy(card.isRookie)) out.push('RC');
  if (truthy(card.hasAutograph)) out.push('AUTO');
  if (card.serialNumber) out.push(String(card.serialNumber).slice(0, 12));
  if (truthy(card.isGraded) && card.grade) out.push(`${card.grader || 'GRADED'} ${card.grade}`.slice(0, 12));
  else if (card.parallel) out.push(String(card.parallel).slice(0, 24));
  else if (card.rarity && card.rarity !== 'Unknown') out.push(String(card.rarity).slice(0, 24));
  return out.slice(0, 4);
}

/** "2025 Topps Chrome Cosmic · Planetary Pursuit" — the caption is the card. */
function metaFor(card) {
  const set = [card.year, card.brand, card.series].filter(x => x && x !== 'Unknown').join(' ');
  const extra = [card.team, card.parallel].filter(x => x && x !== 'Unknown').join(' · ');
  return [set, extra].filter(Boolean).join(' · ').slice(0, 120);
}

/**
 * Whether this card belongs in public at all.
 *
 * Two conditions, and deliberately not a third. The profile has to be switched
 * on, and the card needs a real hosted image — a data URL from an unsigned
 * session is not something to publish.
 *
 * `card_scope: 'favourites'` is NOT one of them. Starring is how a collector
 * curates their own profile page; it says nothing about which cards they want
 * to post. Letting it gate the feed would mean a collector who stars sparingly
 * quietly stops appearing, which is not what they asked for when they starred.
 */
export function cardIsPublic(card, profilePublic) {
  if (!profilePublicOn(profilePublic)) return false;
  return typeof card.imageUrl === 'string' && card.imageUrl.startsWith('https://');
}

/**
 * Build the entry. Exported so the backfill job (step 4) writes exactly the
 * same shape as a live add, rather than a second implementation that drifts.
 */
export function buildEntry({ ownerUid, profilePublic, ownerFallbackName, card }) {
  const p = profilePublic || {};
  return {
    ownerUid,
    ownerHandle: profilePublicOn(p) ? p.handle : null,
    ownerName: publicDisplayName(p.display_name || ownerFallbackName, p.handle),

    cardId: String(card.id),
    cardImage: card.imageUrl,
    cardName: card.playerName || card.fullCardName || 'A card',
    cardMeta: metaFor(card),
    cardCategory: card.cardCategory || 'Other',
    badges: badgesFor(card),

    reactionTarget: reactionTarget(ownerUid, card.id),
    createdAt: card.addedAt || new Date().toISOString(),

    hidden: false,

    // Selling, later. Nullable and unused — a "For sale" badge and filter then
    // need no migration. The entry is a snapshot and never the source of truth
    // for a price; that will be a listings collection of its own.
    forSale: false,
    askingPrice: null,
    currency: null,
  };
}

/**
 * Create or refresh the entry for one card.
 *
 * Idempotent: the id is derived from owner and card, and the counts are only
 * written when the document is new, so a refresh after a rescan corrects the
 * card details without resetting anyone's reactions.
 */
export async function publishCard({ ownerUid, cardId, token, force = false }) {
  token = token || await googleToken();

  if (!force && !(await feedEnabled(token))) return { published: false, reason: 'feed_disabled' };

  const user = await fsGet(`users/${ownerUid}`, token);
  const profilePublic = (user && user.profile_public) || {};

  // The card is written to Firestore by the client, so a publish fired the
  // instant a scan finishes can beat its own card into existence. Give it a
  // moment rather than losing the post.
  let card = null;
  for (let i = 0; i < 4 && !card; i++) {
    if (i) await new Promise(r => setTimeout(r, 500));
    card = await fsGet(`users/${ownerUid}/cards/${cardId}`, token).catch(() => null);
  }
  if (!card) return { published: false, reason: 'card_not_found' };
  card.id = card.id || cardId;

  if (!cardIsPublic(card, profilePublic)) return { published: false, reason: 'not_public' };

  const id = entryId(ownerUid, cardId);
  const existing = await fsGet(`feed/${id}`, token).catch(() => null);

  const entry = buildEntry({
    ownerUid,
    profilePublic,
    ownerFallbackName: user && user.display_name,
    card,
  });

  // Reaction counts and moderation state belong to the entry's life, not to
  // this write. Set them once, on creation.
  if (!existing) {
    // `score` is heart + fire + money, kept by the same transform that keeps
    // the counts. Sorting by "top" needs a single field to order on; adding
    // three columns together is not something Firestore can do at read time.
    Object.assign(entry, { heart: 0, fire: 0, money: 0, commentCount: 0, score: 0 });
  } else {
    delete entry.hidden;
    delete entry.createdAt;
  }

  await fsPatch(`feed/${id}`, entry, token);
  return { published: true, entryId: id, created: !existing };
}

/** Remove an entry — card deleted, post deleted, or moderation. */
export async function removeEntry(id, token) {
  token = token || await googleToken();
  const r = await fetch(`${fsBase()}/feed/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  return r.ok || r.status === 404;
}

/**
 * A cheap brake on one account filling the feed.
 *
 * Bulk scanning is gone, so a collector adds cards one at a time and will not
 * reach this in normal use. It exists so a script cannot.
 */
const POSTS_PER_HOUR = 30;

export async function underPostRate(ownerUid, token) {
  const hour = new Date().toISOString().slice(0, 13);   // 2026-09-18T14
  const user = await fsGet(`users/${ownerUid}`, token).catch(() => null);
  const rate = (user && user.feed_rate) || {};
  const count = rate.hour === hour ? Number(rate.count) || 0 : 0;
  if (count >= POSTS_PER_HOUR) return false;
  await fsPatch(`users/${ownerUid}`, { feed_rate: { hour, count: count + 1 } }, token).catch(() => {});
  return true;
}

/**
 * Backfill one collector, used when a profile is switched on.
 *
 * A collector who goes public and then sees nothing of theirs in the feed until
 * their next scan has no reason to believe the switch did anything. This posts
 * their most recent adds so they exist the moment they opt in.
 *
 * Bounded deliberately: the newest `limit` cards, not the whole vault. Someone
 * with two thousand cards should not flood the feed the instant they go public,
 * and the launch backfill script is the place for a full seed.
 *
 * Best-effort by design. It runs after the profile has already been saved, so a
 * failure here costs the collector some feed presence, never their setting.
 */
export async function backfillOwner({ ownerUid, token, limit = 20 }) {
  token = token || await googleToken();
  if (!(await feedEnabled(token))) return { written: 0, reason: 'feed_disabled' };

  const user = await fsGet(`users/${ownerUid}`, token);
  const p = (user && user.profile_public) || {};
  if (!profilePublicOn(p)) return { written: 0, reason: 'not_public' };

  const all = await fsList(`users/${ownerUid}/cards`, token, 2000);
  const cards = [...all]
    .sort((a, b) => String(b.addedAt || '').localeCompare(String(a.addedAt || '')))
    .slice(0, limit);

  let written = 0;
  for (const card of cards) {
    if (!cardIsPublic(card, p)) continue;
    const id = entryId(ownerUid, card.id);
    const existing = await fsGet(`feed/${id}`, token).catch(() => null);
    const entry = buildEntry({ ownerUid, profilePublic: p, ownerFallbackName: user.display_name, card });
    // Counts, moderation state and the original timestamp belong to the entry's
    // own life. Coming back from a spell of being private must not reset them.
    if (!existing) Object.assign(entry, { heart: 0, fire: 0, money: 0, commentCount: 0, score: 0 });
    else { delete entry.hidden; delete entry.createdAt; }
    try { await fsPatch(`feed/${id}`, entry, token); written++; } catch { /* best effort */ }
  }
  return { written };
}
