/**
 * The feed: read side.
 *
 * One indexed query per page. The entry carries everything a row renders, so
 * sixty posts cost sixty document reads and nothing else — except the owner
 * check below, which is the one join worth paying for.
 *
 * Why visibility is resolved here rather than stamped on the entry: a collector
 * switching their profile off has to disappear from the feed at once. Stamping
 * it would mean rewriting every card they ever added, twice, every time they
 * change their mind. Instead a page reads the owner document once per distinct
 * collector — a page of sixty posts is rarely more than twenty people — and
 * drops anyone who is no longer public.
 */

import { fsGet, fsQuery } from './_fb.js';

export const PAGE = 30;
const MAX_PAGE = 60;
const FLOOR = 6;          // below this, a page gets topped up. See "From the vaults".

/** Opaque so the shape of the cursor is not an API anybody depends on. */
function encodeCursor(values) {
  return Buffer.from(JSON.stringify(values)).toString('base64url');
}
function decodeCursor(raw) {
  if (!raw) return null;
  try {
    const v = JSON.parse(Buffer.from(String(raw), 'base64url').toString('utf8'));
    return Array.isArray(v) && v.length ? v : null;
  } catch { return null; }
}

/** Entries are public documents, but only these fields are anyone's business. */
function publicEntry(e, extra = {}) {
  return {
    id: e.id,
    ownerHandle: e.ownerHandle || null,
    ownerName: e.ownerName || 'A collector',
    cardId: e.cardId,
    cardImage: e.cardImage,
    cardName: e.cardName,
    cardMeta: e.cardMeta || '',
    cardCategory: e.cardCategory || 'Other',
    badges: Array.isArray(e.badges) ? e.badges : [],
    reactionTarget: e.reactionTarget,
    createdAt: e.createdAt,
    counts: {
      heart: Number(e.heart) || 0,
      fire: Number(e.fire) || 0,
      money: Number(e.money) || 0,
    },
    commentCount: Number(e.commentCount) || 0,
    forSale: e.forSale === true,
    ...extra,
  };
}

/**
 * Is this collector still public?
 *
 * Memoised for the life of one request. Two people on a page with eight posts
 * each is two reads, not sixteen.
 */
function ownerGate(token) {
  const seen = new Map();
  return async (uid) => {
    if (!uid) return false;
    if (seen.has(uid)) return seen.get(uid);
    const user = await fsGet(`users/${uid}`, token).catch(() => null);
    const ok = !!(user && user.profile_public && user.profile_public.enabled === true);
    seen.set(uid, ok);
    return ok;
  };
}

const matchesText = (e, q) =>
  !q || [e.cardName, e.cardMeta, e.ownerName, e.ownerHandle]
    .some(v => String(v || '').toLowerCase().includes(q));

/**
 * One page of the feed.
 *
 * Over-fetches, because hidden entries, entries whose owner has gone private,
 * and free-text matching all thin a page out after the query has run. Without
 * the headroom a page of thirty could come back with four and look broken.
 */
export async function readFeed({
  token, limit = PAGE, cursor = null, categories = [], collector = null,
  q = '', sort = 'new', blocked = [],
}) {
  limit = Math.max(1, Math.min(MAX_PAGE, Number(limit) || PAGE));
  const byTop = sort === 'top';
  const text = String(q || '').trim().toLowerCase().slice(0, 60);
  const blockedSet = new Set(blocked);
  const isPublic = ownerGate(token);

  const where = [];
  // A collector filter and a category filter together would need an index per
  // combination. One collector's posts are few, so filter their categories in
  // code and keep the index list short.
  if (collector) where.push({ field: 'ownerHandle', op: 'EQUAL', value: collector });
  else if (categories.length) {
    where.push({ field: 'cardCategory', op: 'IN', value: categories.slice(0, 10) });
  }

  const orderBy = byTop
    ? [{ field: 'score', dir: 'desc' }, { field: 'createdAt', dir: 'desc' }, { field: '__name__', dir: 'desc' }]
    : [{ field: 'createdAt', dir: 'desc' }, { field: '__name__', dir: 'desc' }];

  const out = [];
  let startAfter = decodeCursor(cursor);
  let exhausted = false;
  let lastRow = null;

  // Up to three rounds. A feed where most owners have gone private should give
  // up and return a short page rather than walk the whole collection.
  for (let round = 0; round < 3 && out.length < limit && !exhausted; round++) {
    const rows = await fsQuery({
      collection: 'feed',
      where,
      orderBy,
      startAfter,
      limit: Math.ceil(limit * 1.6) + 10,
    }, token);

    if (!rows.length) { exhausted = true; break; }
    lastRow = rows[rows.length - 1];
    startAfter = byTop
      ? [Number(lastRow.score) || 0, lastRow.createdAt, lastRow.__name]
      : [lastRow.createdAt, lastRow.__name];

    for (const e of rows) {
      if (out.length >= limit) break;
      if (e.hidden === true) continue;
      if (blockedSet.has(e.ownerUid)) continue;
      if (collector && categories.length && !categories.includes(e.cardCategory || 'Other')) continue;
      if (!matchesText(e, text)) continue;
      if (!(await isPublic(e.ownerUid))) continue;
      out.push(e);
    }
  }

  const nextCursor = out.length >= limit && lastRow
    ? encodeCursor(byTop
        ? [Number(out[out.length - 1].score) || 0, out[out.length - 1].createdAt, out[out.length - 1].__name]
        : [out[out.length - 1].createdAt, out[out.length - 1].__name])
    : null;

  return { entries: out.map(e => publicEntry(e)), nextCursor, hasMore: !!nextCursor };
}

/**
 * From the vaults.
 *
 * A social tab with nothing in it reads as a dead product, and the person most
 * likely to see one is a brand-new user on their first open. When a first,
 * unfiltered page comes back thin, it is topped up with the best-loved older
 * posts, labelled so nobody mistakes them for new activity.
 */
export async function topUp({ token, have, limit, exclude }) {
  if (have.length >= FLOOR) return [];
  const isPublic = ownerGate(token);
  const rows = await fsQuery({
    collection: 'feed',
    where: [],
    orderBy: [{ field: 'score', dir: 'desc' }, { field: 'createdAt', dir: 'desc' }, { field: '__name__', dir: 'desc' }],
    limit: (limit - have.length) * 3 + 6,
  }, token).catch(() => []);

  const seen = new Set(exclude);
  const out = [];
  for (const e of rows) {
    if (out.length >= limit - have.length) break;
    if (seen.has(e.id) || e.hidden === true) continue;
    if (!(await isPublic(e.ownerUid))) continue;
    out.push(publicEntry(e, { fromTheVaults: true }));
  }
  return out;
}
