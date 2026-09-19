/**
 * The feed.
 *
 *   POST /api/feed            Authorization: Bearer <firebase id token>
 *     { cardId, action?: 'publish' | 'remove' }
 *
 * Publishing is server-side on purpose. `feed` is world-readable, so letting a
 * browser write to it would let anyone post anything under anyone's name. The
 * client says only "this card of mine is worth posting"; everything on the
 * entry is read from Firestore here.
 *
 * And the read path.
 *
 *   GET  /api/feed?limit=30&cursor=&cat=Basketball,Pokemon&collector=&q=&sort=new
 *     → { entries: [...], nextCursor, hasMore, enabled }
 *
 * The GET is open — the feed is public by definition. A Bearer token is
 * optional and only buys one thing: the people you have blocked drop out.
 */

import { googleToken, fsGet, uidFromIdToken, bearer, cors } from './_fb.js';
import { publishCard, removeEntry, entryId, feedEnabled, underPostRate } from './_feed.js';
import { readFeed, topUp, PAGE } from './_feed-read.js';

const list = (v) => String(v || '')
  .split(',').map(s => s.trim()).filter(Boolean).slice(0, 10);

async function handleGet(req, res) {
  const token = await googleToken();

  // The kill switch answers before anything else is read, so turning the feed
  // off costs one document read rather than a page of them.
  if (!(await feedEnabled(token))) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ enabled: false, entries: [], nextCursor: null, hasMore: false });
  }

  const categories = list(req.query.cat);
  const collector = String(req.query.collector || '').trim().toLowerCase().slice(0, 20) || null;
  const q = String(req.query.q || '');
  const sort = req.query.sort === 'top' ? 'top' : 'new';
  const limit = Number(req.query.limit) || PAGE;
  const cursor = req.query.cursor || null;

  // Blocking, when the caller is signed in. Anonymous readers get the feed as
  // it is; there is nothing to personalise for someone with no account.
  let blocked = [];
  const idToken = bearer(req);
  if (idToken) {
    const uid = await uidFromIdToken(idToken);
    if (uid) {
      const me = await fsGet(`users/${uid}`, token).catch(() => null);
      if (me && Array.isArray(me.blocked)) blocked = me.blocked.slice(0, 500);
    }
  }

  const page = await readFeed({ token, limit, cursor, categories, collector, q, sort, blocked });

  // Only a first page with nothing filtering it gets topped up. A search that
  // legitimately finds two cards should show two, not two plus a consolation.
  let extra = [];
  if (!cursor && !categories.length && !collector && !q.trim()) {
    extra = await topUp({
      token,
      have: page.entries,
      limit,
      exclude: page.entries.map(e => e.id),
    }).catch(() => []);
  }

  // A short cache: the feed gaining a post thirty seconds late is invisible,
  // and it keeps a pull-to-refresh loop from costing a query every time.
  res.setHeader('Cache-Control', 'public, max-age=20, stale-while-revalidate=120');
  return res.status(200).json({
    enabled: true,
    entries: page.entries.concat(extra),
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
  });
}

export default async function handler(req, res) {
  cors(res, 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    try {
      return await handleGet(req, res);
    } catch (e) {
      console.error('[feed GET]', e);
      return res.status(500).json({ error: 'Could not load the feed' });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const uid = await uidFromIdToken(bearer(req));
  if (!uid) return res.status(401).json({ error: 'Sign in required' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const cardId = String(body.cardId || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
  const action = body.action === 'remove' ? 'remove'
    : body.action === 'refresh' ? 'refresh'
    : 'publish';
  if (!cardId) return res.status(400).json({ error: 'cardId is required' });

  try {
    const token = await googleToken();

    // Removing is always allowed, kill switch or not: someone deleting a card
    // should not have it linger in public because the feed happens to be off.
    if (action === 'remove') {
      await removeEntry(entryId(uid, cardId), token);
      return res.status(200).json({ ok: true, removed: true });
    }

    if (!(await feedEnabled(token))) {
      return res.status(200).json({ ok: true, published: false, reason: 'feed_disabled' });
    }
    // A refresh is a card that already has a post and changed — its for-sale
    // flag flipped, or a rescan corrected it. It never creates a post and it
    // never counts against the posting rate, so flipping a toggle a few times
    // cannot lock somebody out of adding cards.
    if (action === 'refresh') {
      const existing = await fsGet(`feed/${entryId(uid, cardId)}`, token).catch(() => null);
      if (!existing) return res.status(200).json({ ok: true, published: false, reason: 'not_posted' });
    } else if (!(await underPostRate(uid, token))) {
      return res.status(200).json({ ok: true, published: false, reason: 'rate_limited' });
    }

    const result = await publishCard({ ownerUid: uid, cardId, token });
    return res.status(200).json({ ok: true, ...result });
  } catch (e) {
    console.error('[feed]', e);
    return res.status(500).json({ error: 'Could not post that card' });
  }
}
