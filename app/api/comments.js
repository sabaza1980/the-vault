/**
 * Comments on a feed post.
 *
 *   GET    /api/comments?entry=<entryId>&limit=              → { comments }
 *   POST   /api/comments   Authorization: Bearer <id token>  → { comment } | 422
 *          { entry, text }
 *   DELETE /api/comments?entry=<entryId>&id=<commentId>      → { ok }
 *
 * The client never writes to Firestore here. Every comment passes the policy
 * check on its way in, the counter is kept by the same request that writes the
 * comment, and a delete has to prove it is the author or the card's owner. A
 * client that could write this collection could put words in anyone's mouth
 * under their own name, so no client can.
 *
 * Reading needs no account. The feed is public and so is the conversation on
 * it; that is the whole point of a public profile.
 */

import {
  googleToken, fsGet, fsPatch, fsList, fsDelete, fsCommitTransform,
  uidFromIdToken, bearer, cors, profilePublicOn, publicDisplayName,
} from './_fb.js';
import { moderate } from './_moderation.js';

const MAX_LEN = 1000;
const PAGE = 100;

// Per-instance, like the reaction throttle: Vercel runs many instances, so
// this is not a security boundary on its own. It takes the hold-down-the-key
// case off the table, and the policy check is what actually costs an attacker.
const recent = new Map();
const RATE = 20;
const WINDOW_MS = 60 * 60 * 1000;

function rateLimited(uid) {
  const now = Date.now();
  const hits = (recent.get(uid) || []).filter(t => now - t < WINDOW_MS);
  hits.push(now);
  recent.set(uid, hits);
  if (recent.size > 5000) recent.clear();
  return hits.length > RATE;
}

const safeId = (s) => String(s || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 128);

function newId() {
  const b = new Uint8Array(12);
  globalThis.crypto.getRandomValues(b);
  return 'c' + Buffer.from(b).toString('base64url');
}

/** A comment as the world sees it. A hidden one keeps its place and loses its words. */
function publicShape(c) {
  if (c.hidden) {
    return { id: c.id, hidden: true, createdAt: c.createdAt, name: null, handle: null, text: null };
  }
  return {
    id: c.id,
    uid: c.uid,
    name: c.name,
    handle: c.handle || null,
    text: c.text,
    createdAt: c.createdAt,
  };
}

/** "<name> commented on your <card>" — the same shelf the reactions land on. */
async function notifyOwner({ token, ownerUid, actorUid, entry, text, commentId }) {
  if (!ownerUid || ownerUid === actorUid) return;
  const actor = await fsGet(`users/${actorUid}`, token).catch(() => null);
  const p = (actor && actor.profile_public) || {};
  const handle = profilePublicOn(p) ? p.handle : null;
  const name = publicDisplayName(p.display_name || (actor && actor.display_name), handle);
  await fsPatch(`users/${ownerUid}/notifications/cm_${commentId}`, {
    type: 'comment',
    target: entry.reactionTarget || null,
    entryId: entry.id || null,
    cardId: entry.cardId || null,
    cardName: entry.cardName || 'your card',
    cardImage: typeof entry.cardImage === 'string' ? entry.cardImage : '',
    actorUid,
    actorName: name,
    actorHandle: handle,
    excerpt: String(text).slice(0, 120),
    createdAt: new Date().toISOString(),
    read: false,
  }, token).catch(() => { /* the comment matters more than the bell */ });
}

export default async function handler(req, res) {
  cors(res, 'GET, POST, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = await googleToken().catch(() => null);
  if (!token) return res.status(500).json({ error: 'Comments are unavailable' });

  const entryId = safeId(req.query?.entry || (req.body && req.body.entry));

  // ── read ──────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    if (!entryId) return res.status(400).json({ error: 'entry is required' });
    try {
      const rows = await fsList(`feed/${entryId}/comments`, token, PAGE);
      const comments = rows
        .map(c => ({ ...c, id: c.id || c.__name }))
        .filter(c => !c.removed)
        .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
        .map(publicShape);
      return res.status(200).json({ comments });
    } catch {
      return res.status(200).json({ comments: [] });
    }
  }

  const uid = await uidFromIdToken(bearer(req));
  if (!uid) return res.status(401).json({ error: 'Sign in to comment' });

  // ── take one down ─────────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const id = safeId(req.query?.id);
    if (!entryId || !id) return res.status(400).json({ error: 'entry and id are required' });

    const entry = await fsGet(`feed/${entryId}`, token).catch(() => null);
    const c = await fsGet(`feed/${entryId}/comments/${id}`, token).catch(() => null);
    if (!entry || !c) return res.status(404).json({ error: 'Not found' });
    // Your own words, or words on your own card. Nobody else.
    if (c.uid !== uid && entry.ownerUid !== uid) return res.status(403).json({ error: 'Not yours to remove' });
    if (c.hidden) return res.status(200).json({ ok: true });

    // Hidden, not erased: the policy keeps the record for twelve months, and a
    // dispute without a record is unwinnable.
    await fsPatch(`feed/${entryId}/comments/${id}`, {
      hidden: true,
      removedBy: uid === c.uid ? 'author' : 'owner',
      removedAt: new Date().toISOString(),
    }, token);
    await fsCommitTransform(`feed/${entryId}`, [{ fieldPath: 'commentCount', increment: -1 }],
      token, { requireExists: true }).catch(() => {});
    return res.status(200).json({ ok: true });
  }

  // ── say something ─────────────────────────────────────────────────────────
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const text = String(body.text || '').trim().slice(0, MAX_LEN);
  if (!entryId) return res.status(400).json({ error: 'entry is required' });
  if (!text) return res.status(400).json({ error: 'Say something first' });
  if (rateLimited(uid)) return res.status(429).json({ error: 'Slow down a moment' });

  const entry = await fsGet(`feed/${entryId}`, token).catch(() => null);
  if (!entry || entry.hidden) return res.status(404).json({ error: 'That post is gone' });
  entry.id = entryId;

  // The policy decides before anyone sees it. Block is narrow on purpose; a
  // check that cannot run returns flag, so an outage never silences anybody.
  const verdict = await moderate({
    text,
    context: `A comment under a photo of "${entry.cardName || 'a card'}" in a collector's vault.`,
  });
  if (verdict.decision === 'unavailable') {
    // Nothing goes up unchecked. The words stay in the box and a retry in a
    // moment usually lands.
    return res.status(503).json({ error: 'Could not check that just now. Try again in a moment.' });
  }
  if (verdict.decision === 'block') {
    return res.status(422).json({
      error: verdict.reason || 'That breaks the house rules.',
      rule: verdict.rule,
    });
  }

  const user = await fsGet(`users/${uid}`, token).catch(() => null);
  const p = (user && user.profile_public) || {};
  const handle = profilePublicOn(p) ? p.handle : null;
  const name = publicDisplayName(p.display_name || (user && user.display_name), handle);

  const id = newId();
  const comment = {
    id,
    uid,
    name,
    handle,
    text,
    createdAt: new Date().toISOString(),
    hidden: false,
    // Replies land later. Reserved now so they need no migration.
    parentId: null,
    // What the daily digest reads.
    flagged: verdict.decision === 'flag',
    flagRule: verdict.decision === 'flag' ? verdict.rule : null,
    flagReason: verdict.decision === 'flag' ? (verdict.reason || verdict.unavailable || '') : null,
  };

  await fsPatch(`feed/${entryId}/comments/${id}`, comment, token);
  await fsCommitTransform(`feed/${entryId}`, [{ fieldPath: 'commentCount', increment: 1 }],
    token, { requireExists: true }).catch(() => {});
  notifyOwner({ token, ownerUid: entry.ownerUid, actorUid: uid, entry, text, commentId: id })
    .catch(() => {});

  return res.status(200).json({ comment: publicShape(comment) });
}
