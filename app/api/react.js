/**
 * Reactions: ❤️ 🔥 💰. No dislikes, by design.
 *
 *   GET  /api/react?target=profile_UID            → { counts, mine? }
 *   GET  /api/react?targets=a,b,c                 → { counts: {t:…}, mine: {t:…} }
 *   POST /api/react                               → toggle one reaction
 *        Authorization: Bearer <firebase id token>
 *        { target: "card_UID_CARDID", emoji: "fire" }
 *
 * Counters are written here rather than from the client. Firestore rules cannot
 * express "increment this by exactly one, and only together with a matching
 * per-user document", so the client never touches the counter at all.
 *
 * Data:
 *   reactions/{target}            { heart: n, fire: n, money: n }
 *   reactions/{target}/by/{uid}   { heart: bool, fire: bool, money: bool, at }
 */

import {
  googleToken, fsGet, fsPatch, fsCommitTransform, uidFromIdToken, bearer, cors,
} from './_fb.js';
import { entryId } from './_feed.js';

// Reactions were anonymous until this shipped, and everything tapped before it
// was tapped under that promise. Only reactions from here on notify anybody;
// nothing is backfilled.
const NOTIFY_FROM = '2026-09-17';

const EMOJI = ['heart', 'fire', 'money'];
const TARGET_RE = /^(card_[A-Za-z0-9_-]{1,128}_[A-Za-z0-9_-]{1,128}|profile_[A-Za-z0-9_-]{1,128})$/;

// Per-instance throttle. Not a security boundary on its own (Vercel runs many
// instances) but it takes the trivial hold-down-the-button case off the table.
const recent = new Map();
const RATE_LIMIT = 30;          // toggles
const RATE_WINDOW_MS = 60_000;

function rateLimited(uid) {
  const now = Date.now();
  const hits = (recent.get(uid) || []).filter(t => now - t < RATE_WINDOW_MS);
  hits.push(now);
  recent.set(uid, hits);
  if (recent.size > 5000) recent.clear();
  return hits.length > RATE_LIMIT;
}

function countsOf(doc) {
  return {
    heart: Math.max(0, Number(doc?.heart) || 0),
    fire: Math.max(0, Number(doc?.fire) || 0),
    money: Math.max(0, Number(doc?.money) || 0),
  };
}


/**
 * Drop a "<name> loved your <card>" notification on the owner.
 *
 * The document id is derived from actor + target + emoji, so someone tapping a
 * heart on and off ten times leaves one notification rather than ten. The actor
 * name and card details are snapshotted in, so rendering the list needs no
 * joins and a later rename does not rewrite history.
 */
async function notifyOwner({ token, ownerUid, actorUid, target, emoji }) {
  if (new Date().toISOString().slice(0, 10) < NOTIFY_FROM) return;

  const actor = await fsGet(`users/${actorUid}`, token);
  const p = (actor && actor.profile_public) || {};
  // A handle is only worth showing when the profile it points at is live.
  const handle = p.enabled === true && p.handle ? p.handle : null;
  const name = p.display_name || (actor && actor.display_name) || 'A collector';

  let cardName = 'your vault';
  let cardImage = '';
  let cardId = null;
  if (target.startsWith('card_')) {
    cardId = target.slice('card_'.length).slice(ownerUid.length + 1);
    const card = await fsGet(`users/${ownerUid}/cards/${cardId}`, token).catch(() => null);
    if (card) {
      cardName = card.playerName || card.fullCardName || 'your card';
      if (typeof card.imageUrl === 'string' && card.imageUrl.startsWith('https://')) {
        cardImage = card.imageUrl;
      }
    }
  }

  const id = `rx_${target}_${actorUid}_${emoji}`.replace(/[^A-Za-z0-9_-]/g, '');
  await fsPatch(`users/${ownerUid}/notifications/${id}`, {
    type: 'reaction',
    emoji,
    target,
    cardId,
    cardName,
    cardImage,
    actorUid,
    actorName: name,
    actorHandle: handle,
    createdAt: new Date().toISOString(),
    read: false,
  }, token);
}

export default async function handler(req, res) {
  cors(res, 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── Counts ─────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    // Batch form. A profile page has one target per card plus the profile
    // itself, and asking for them one at a time would be 30+ round trips.
    if (req.query.targets) {
      const targets = String(req.query.targets).split(',').map(t => t.trim())
        .filter(t => TARGET_RE.test(t)).slice(0, 120);
      if (!targets.length) return res.status(400).json({ error: 'Bad targets' });
      try {
        const token = await googleToken();
        const idToken = bearer(req);
        const uid = idToken ? await uidFromIdToken(idToken) : null;
        const counts = {}, mine = {};
        await Promise.all(targets.map(async t => {
          const [doc, own] = await Promise.all([
            fsGet(`reactions/${t}`, token).catch(() => null),
            uid ? fsGet(`reactions/${t}/by/${uid}`, token).catch(() => null) : null,
          ]);
          counts[t] = countsOf(doc);
          if (uid) {
            mine[t] = {
              heart: own?.heart === true,
              fire: own?.fire === true,
              money: own?.money === true,
            };
          }
        }));
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).json(uid ? { counts, mine } : { counts });
      } catch {
        return res.status(500).json({ error: 'Could not read reactions' });
      }
    }

    const target = String(req.query.target || '');
    if (!TARGET_RE.test(target)) return res.status(400).json({ error: 'Bad target' });
    try {
      const token = await googleToken();
      const doc = await fsGet(`reactions/${target}`, token);
      const out = { target, counts: countsOf(doc) };

      // If the caller happens to be signed in, tell them what they already gave
      // so the buttons render in the right state on first paint.
      const idToken = bearer(req);
      if (idToken) {
        const uid = await uidFromIdToken(idToken);
        if (uid) {
          const mine = await fsGet(`reactions/${target}/by/${uid}`, token);
          out.mine = {
            heart: mine?.heart === true,
            fire: mine?.fire === true,
            money: mine?.money === true,
          };
        }
      }
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json(out);
    } catch {
      return res.status(500).json({ error: 'Could not read reactions' });
    }
  }

  // ── Toggle ─────────────────────────────────────────────────────────────────
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const uid = await uidFromIdToken(bearer(req));
  if (!uid) return res.status(401).json({ error: 'Sign in to react' });
  if (rateLimited(uid)) return res.status(429).json({ error: 'Slow down a moment' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const target = String(body.target || '');
  const emoji = String(body.emoji || '');

  if (!TARGET_RE.test(target)) return res.status(400).json({ error: 'Bad target' });
  if (!EMOJI.includes(emoji)) return res.status(400).json({ error: 'Unknown reaction' });

  try {
    const token = await googleToken();

    // Reacting to your own cards would make the counts meaningless.
    const ownerUid = target.startsWith('profile_')
      ? target.slice('profile_'.length)
      : target.slice('card_'.length).split('_')[0];
    if (ownerUid === uid) return res.status(400).json({ error: 'You cannot react to your own cards' });

    const mineRef = `reactions/${target}/by/${uid}`;
    const mine = await fsGet(mineRef, token);
    const was = mine?.[emoji] === true;
    const now = !was;

    // Per-user record first. If the counter transform then fails, the worst
    // outcome is a count that is one behind, which self-corrects on the next
    // toggle. The reverse order could double-count.
    await fsPatch(mineRef, { [emoji]: now, at: new Date().toISOString() }, token);
    await fsCommitTransform(`reactions/${target}`, [{ fieldPath: emoji, increment: now ? 1 : -1 }], token);

    // Mirror onto the feed entry, if this card has one. `reactions/{target}` is
    // still the source of truth; this copy is what lets a feed page render 60
    // rows from one query instead of 60 extra reads. requireExists matters: a
    // card that was never posted must not get a feed entry conjured out of a
    // reaction on its profile.
    if (target.startsWith('card_')) {
      const cardId = target.slice('card_'.length).slice(ownerUid.length + 1);
      fsCommitTransform(
        `feed/${entryId(ownerUid, cardId)}`,
        [
          { fieldPath: emoji, increment: now ? 1 : -1 },
          { fieldPath: 'score', increment: now ? 1 : -1 },
        ],
        token,
        { requireExists: true },
      ).catch(() => {});   // no entry, or the feed is off: not this request's problem
    }

    // Tell the owner who reacted. Best effort: a failure here must not cost the
    // collector their reaction, so it never throws into the response.
    if (now) {
      notifyOwner({ token, ownerUid, actorUid: uid, target, emoji }).catch(() => {});
    }

    const doc = await fsGet(`reactions/${target}`, token);
    return res.status(200).json({
      ok: true,
      target,
      counts: countsOf(doc),
      mine: {
        heart: emoji === 'heart' ? now : mine?.heart === true,
        fire: emoji === 'fire' ? now : mine?.fire === true,
        money: emoji === 'money' ? now : mine?.money === true,
      },
    });
  } catch (e) {
    return res.status(500).json({ error: 'Could not save that reaction' });
  }
}
