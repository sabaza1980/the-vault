/**
 * Reactions: ❤️ 🔥 💰. No dislikes, by design.
 *
 *   GET  /api/react?target=profile_UID            → { counts, mine? }
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

export default async function handler(req, res) {
  cors(res, 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── Counts ─────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
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
