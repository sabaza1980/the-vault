/**
 * Public collector profiles.
 *
 *   GET  /api/profile?handle=sherif      → public profile JSON (opt-in gated)
 *   GET  /api/profile?check=sherif       → { available: bool }
 *   POST /api/profile                    → claim a handle / update settings
 *        Authorization: Bearer <firebase id token>
 *        { handle?, display_name?, bio?, enabled?, show_values?, card_scope?,
 *          featured_collection_ids? }
 *
 * card_scope is 'all' (default) or 'favourites'.
 *
 * A profile that is not enabled returns 404, never 403. A 403 would confirm
 * that the handle belongs to somebody, which is exactly what we are not
 * willing to leak.
 */

import {
  googleToken, fsGet, fsList, fsPatch, uidFromIdToken, bearer,
  handleError, cors,
} from './_fb.js';
import { backfillOwner } from './_feed.js';
import { profilePublicOn, generateHandle, publicDisplayName } from './_fb.js';

const HANDLE_GRACE_DAYS = 30;

function publicCard(c, showValues) {
  const out = {
    id: c.id,
    playerName: c.playerName || '',
    fullCardName: c.fullCardName || '',
    year: c.year || '',
    brand: c.brand || '',
    series: c.series || '',
    parallel: c.parallel || '',
    team: c.team || '',
    cardCategory: c.cardCategory || '',
    rarity: c.rarity || '',
    condition: c.condition || '',
    serialNumber: c.serialNumber || '',
    isRookie: c.isRookie === true || c.isRookie === 'true',
    hasAutograph: c.hasAutograph === true || c.hasAutograph === 'true',
    imageUrl: typeof c.imageUrl === 'string' && c.imageUrl.startsWith('https://') ? c.imageUrl : '',
    isFavourite: c.isFavourite === true,
  };
  if (showValues && Number(c.estimatedValue) > 0) out.estimatedValue = Number(c.estimatedValue);
  return out;
}

/** Resolve a handle to its owning uid, honouring the release grace period. */
async function uidForHandle(handle, token) {
  const doc = await fsGet(`handles/${handle}`, token);
  if (!doc || !doc.uid) return null;
  if (doc.released_at) {
    const releasedMs = Date.parse(doc.released_at);
    if (Number.isFinite(releasedMs) && Date.now() > releasedMs) return null;
  }
  return doc.uid;
}

/**
 * Give a collector a handle if they have none.
 *
 * Public profiles are opt-out, and a profile with no handle has no URL, so
 * without this a new account would be "public" and unreachable. Assigned at
 * sign-in, changeable any time from profile settings.
 *
 * The handle is neutral and random — never built from a display name or an
 * email, because it becomes a public URL and some display names in this
 * database are email addresses.
 *
 * Returns the existing handle unchanged if there already is one, so calling it
 * on every sign-in is free after the first.
 */
export async function ensureHandle(uid, token) {
  const user = await fsGet(`users/${uid}`, token);
  const p = (user && user.profile_public) || {};
  if (p.handle) return { handle: p.handle, created: false };

  for (let attempt = 0; attempt < 8; attempt++) {
    const h = generateHandle();
    if (handleError(h)) continue;
    if (await uidForHandle(h, token)) continue;      // taken, try another

    await fsPatch(`handles/${h}`, {
      uid,
      created_at: new Date().toISOString(),
      released_at: null,
      auto_assigned: true,
    }, token);
    await fsPatch(`users/${uid}`, {
      profile_public: { ...p, handle: h, updated_at: new Date().toISOString() },
    }, token);
    return { handle: h, created: true };
  }
  // Eight collisions in a row is not bad luck, it is something wrong. Leave the
  // account without a handle, which leaves it private, which is the safe end.
  return { handle: null, created: false };
}

export async function loadPublicProfile(handleRaw, opts = {}) {
  const handle = String(handleRaw || '').trim().toLowerCase();
  if (handleError(handle)) return null;

  const token = await googleToken();
  const uid = await uidForHandle(handle, token);
  if (!uid) return null;

  const user = await fsGet(`users/${uid}`, token);
  const p = (user && user.profile_public) || {};
  // Opt-out: public unless switched off, and only once there is a handle.
  if (!profilePublicOn(p)) return null;

  const all = await fsList(`users/${uid}/cards`, token);

  // A profile shows the whole collection unless the owner narrows it. Showing
  // favourites by default made a profile look broken for anyone who had not
  // starred anything: 34 cards in the vault, one on the page.
  const scope = p.card_scope === 'favourites' ? 'favourites' : 'all';
  let cards = all;

  if (scope === 'favourites') {
    cards = all.filter(c => c.isFavourite === true);
    // Featured collections, when the owner has picked any, widen it.
    const featured = Array.isArray(p.featured_collection_ids) ? p.featured_collection_ids : [];
    if (featured.length) {
      const cols = await fsList(`users/${uid}/collections`, token, 500);
      const wanted = new Set();
      for (const col of cols) {
        if (!featured.includes(col.id)) continue;
        for (const cid of (col.cardIds || col.cards || [])) wanted.add(String(cid));
      }
      const extra = all.filter(c => wanted.has(String(c.id)) && c.isFavourite !== true);
      cards = cards.concat(extra);
    }
    // Narrowing to favourites and having none would publish an empty page, which
    // reads as a broken profile rather than a deliberate one. Fall back.
    if (!cards.length) cards = all;
  }

  // Favourites first either way, so the cards the owner cares about lead.
  cards = [...cards].sort((a, b) => (b.isFavourite === true) - (a.isFavourite === true));

  // The page renders a first slice and the client fetches the rest. Reading
  // every card is cheap; turning thousands of them into HTML in one response is
  // not, and neither is asking a phone to parse it.
  // Category counts are computed over the whole collection, not the slice, so
  // the filter chips tell the truth even when only a first page is rendered.
  const catCounts = new Map();
  for (const c of cards) {
    const k = c.cardCategory || 'Other';
    catCounts.set(k, (catCounts.get(k) || 0) + 1);
  }
  const categories = [...catCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  const total = cards.length;
  const offset = Math.max(0, Number(opts.offset) || 0);
  const limit = opts.limit === undefined
    ? total
    : Math.max(0, Math.min(500, Number(opts.limit) || 0));
  const slice = cards.slice(offset, offset + limit);

  const showValues = p.show_values === true;
  return {
    handle,
    uid,
    displayName: publicDisplayName(p.display_name || user.display_name, handle),
    bio: typeof p.bio === 'string' ? p.bio.slice(0, 160) : '',
    showValues,
    cardScope: scope,
    categories,
    cardCount: total,                       // how many this profile shows
    totalCards: all.length,                 // how many are in the vault
    offset,
    returned: slice.length,
    hasMore: offset + slice.length < total,
    cards: slice.map(c => publicCard(c, showValues)),
  };
}

export default async function handler(req, res) {
  cors(res, 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── Read ───────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { handle, check } = req.query;

    if (check) {
      const h = String(check).trim().toLowerCase();
      const err = handleError(h);
      if (err) return res.status(200).json({ available: false, error: err });
      try {
        const token = await googleToken();
        const taken = await uidForHandle(h, token);
        return res.status(200).json({ available: !taken });
      } catch (e) {
        return res.status(500).json({ available: false, error: 'Lookup failed' });
      }
    }

    try {
      const profile = await loadPublicProfile(handle);
      if (!profile) return res.status(404).json({ error: 'Not found' });
      res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=600');
      return res.status(200).json(profile);
    } catch (e) {
      return res.status(500).json({ error: 'Profile lookup failed' });
    }
  }

  // ── Write ──────────────────────────────────────────────────────────────────
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const uid = await uidFromIdToken(bearer(req));
  if (!uid) return res.status(401).json({ error: 'Sign in required' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const token = await googleToken();

  // Sign-in calls this and nothing else. Idempotent, and it must not be able to
  // change any other setting, so it answers before the edit path is reached.
  if (body.ensure_handle === true && Object.keys(body).length === 1) {
    try {
      const r = await ensureHandle(uid, token);
      const u = await fsGet(`users/${uid}`, token);
      return res.status(200).json({ ok: true, ...r, profile_public: (u && u.profile_public) || {} });
    } catch (e) {
      return res.status(500).json({ error: 'Could not assign a handle' });
    }
  }

  const user = await fsGet(`users/${uid}`, token);
  const current = (user && user.profile_public) || {};
  const next = { ...current };

  // Claiming or changing a handle
  if (typeof body.handle === 'string' && body.handle.trim()) {
    const h = body.handle.trim().toLowerCase();
    const err = handleError(h);
    if (err) return res.status(400).json({ error: err });

    if (h !== current.handle) {
      const owner = await uidForHandle(h, token);
      if (owner && owner !== uid) return res.status(409).json({ error: 'That handle is taken' });

      await fsPatch(`handles/${h}`, {
        uid,
        created_at: new Date().toISOString(),
        released_at: null,
      }, token);

      // The old handle is parked rather than freed, so links keep resolving for
      // a month and nobody can immediately squat a name to inherit its traffic.
      if (current.handle) {
        const releaseAt = new Date(Date.now() + HANDLE_GRACE_DAYS * 864e5).toISOString();
        await fsPatch(`handles/${current.handle}`, { uid, released_at: releaseAt }, token).catch(() => {});
      }
      next.handle = h;
    }
  }

  // A sign-up that started on somebody's profile credits that collector, using
  // the referral field the reward rule in firestore.rules already keys off.
  // Only ever set once, and never to yourself.
  if (typeof body.referral_source_hint === 'string' && body.referral_source_hint) {
    const src = body.referral_source_hint.trim().slice(0, 128);
    if (src && src !== uid && !(user && user.referral_source)) {
      await fsPatch(`users/${uid}`, { referral_source: src }, token).catch(() => {});
    }
    // A hint on its own is not a profile edit, so nothing else changes.
    if (Object.keys(body).length === 1) return res.status(200).json({ ok: true });
  }

  if (typeof body.display_name === 'string') next.display_name = body.display_name.trim().slice(0, 40);
  if (typeof body.bio === 'string') next.bio = body.bio.trim().slice(0, 160);
  if (typeof body.enabled === 'boolean') next.enabled = body.enabled;
  if (typeof body.show_values === 'boolean') next.show_values = body.show_values;
  if (body.card_scope === 'all' || body.card_scope === 'favourites') next.card_scope = body.card_scope;
  if (Array.isArray(body.featured_collection_ids)) {
    next.featured_collection_ids = body.featured_collection_ids.map(String).slice(0, 20);
  }

  // A public profile needs a URL to be public at. Rather than refusing, assign
  // one — the collector can change it whenever they like.
  if (next.enabled !== false && !next.handle) {
    const auto = await ensureHandle(uid, token);
    if (auto.handle) next.handle = auto.handle;
    else if (next.enabled === true) {
      return res.status(500).json({ error: 'Could not assign a handle. Try again.' });
    }
  }

  next.updated_at = new Date().toISOString();

  const justWentPublic = profilePublicOn(next) && !profilePublicOn(current);

  try {
    await fsPatch(`users/${uid}`, { profile_public: next }, token);

    // Switching a profile on should put the collector in the feed straight
    // away, not leave them invisible until their next scan. After the save, so
    // a failure here never costs them the setting they just chose.
    if (justWentPublic) {
      backfillOwner({ ownerUid: uid, token }).catch(() => {});
    }

    return res.status(200).json({ ok: true, profile_public: next });
  } catch (e) {
    return res.status(500).json({ error: 'Could not save profile' });
  }
}
