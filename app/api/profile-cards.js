/**
 * A page of cards from a public profile.
 *
 *   GET /api/profile-cards?handle=sherif&offset=60&limit=120
 *     → { handle, offset, returned, hasMore, cardCount, totalCards, cards: [...] }
 *
 * The profile page server-renders a first slice for fast paint and for the
 * preview cards that social platforms scrape. Everything past that comes from
 * here, so a collector with two thousand cards gets a page that loads rather
 * than an arbitrary 300 and a 4MB document.
 *
 * Same gate as the profile itself: a profile that is not switched on is a 404,
 * never a 403, because a 403 would confirm the handle belongs to somebody.
 */

import { loadPublicProfile } from './profile.js';
import { cardsHtml } from './profile-page.js';
import { cors } from './_fb.js';

const DEFAULT_LIMIT = 120;
const MAX_LIMIT = 300;

export default async function handler(req, res) {
  cors(res, 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const handle = String(req.query.handle || '');
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const limit = Math.max(1, Math.min(MAX_LIMIT, Number(req.query.limit) || DEFAULT_LIMIT));
  // The page appends rendered markup rather than rebuilding cards in JS, so the
  // card template has one definition instead of two that drift apart.
  const asHtml = req.query.format === 'html';

  try {
    const p = await loadPublicProfile(handle, { offset, limit });
    if (!p) return res.status(404).json({ error: 'Not found' });

    // Short cache: the card list changes when the collector adds something, and
    // a stale page of someone's vault is a worse failure than a re-read.
    res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=300');
    return res.status(200).json({
      handle: p.handle,
      offset: p.offset,
      returned: p.returned,
      hasMore: p.hasMore,
      cardCount: p.cardCount,
      totalCards: p.totalCards,
      showValues: p.showValues,
      ...(asHtml
        // Reaction counts are fetched by the page's own batch call once the
        // cards are in the DOM, so they render at zero and are filled in.
        ? { html: cardsHtml(p.cards, p.uid, p.showValues, {}) }
        : { cards: p.cards }),
    });
  } catch {
    return res.status(500).json({ error: 'Could not load cards' });
  }
}
