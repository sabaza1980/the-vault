/**
 * Feed backfill — the launch seed.
 *
 * Writes a feed entry for every card already sitting in a public vault. Without
 * it the feed starts empty, and an empty social tab reads as a dead product to
 * the one person most likely to see it: a brand-new user on their first open.
 *
 * What it will and will not touch:
 *   - Only collectors whose profile is switched on. A private vault is skipped
 *     entirely; nothing about it is written anywhere public.
 *   - Only cards with a real hosted image.
 *   - `createdAt` is the card's own `addedAt`, so the backfilled feed reads in
 *     the order things actually happened rather than the order of this run.
 *   - An entry that already exists is refreshed, never reset: reaction counts,
 *     comment counts, moderation state and the original timestamp are left
 *     alone. Safe to run twice.
 *
 * Usage, from app/:
 *   node scripts/feed-backfill.mjs --dry-run      # count only, writes nothing
 *   node scripts/feed-backfill.mjs                # write
 *   node scripts/feed-backfill.mjs --handle=x     # one collector
 *   node scripts/feed-backfill.mjs --limit=20     # newest N per collector
 *
 * Credentials come from app/.secrets/service-account.json, or
 * FIREBASE_SERVICE_ACCOUNT_JSON if that file is absent. Never print either.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KEY = path.join(APP, '.secrets', 'service-account.json');
if (fs.existsSync(KEY)) process.env.FIREBASE_SERVICE_ACCOUNT_JSON = fs.readFileSync(KEY, 'utf8');
if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  console.error('No service account. Expected app/.secrets/service-account.json');
  process.exit(1);
}

const { googleToken, fsGet, fsList, fsPatch, profilePublicOn } = await import(path.join(APP, 'api', '_fb.js'));
const { buildEntry, entryId, cardIsPublic, feedEnabled } = await import(path.join(APP, 'api', '_feed.js'));

const arg = (n, d = null) => {
  const m = process.argv.find(a => a.startsWith(`--${n}=`));
  return m ? m.split('=').slice(1).join('=') : d;
};
const DRY = process.argv.includes('--dry-run');
const ONLY = arg('handle');
const LIMIT = Number(arg('limit')) || Infinity;

const token = await googleToken();
if (!(await feedEnabled(token))) {
  console.log('config/feed.enabled is false — the feed is switched off. Nothing written.');
  process.exit(0);
}

const handles = await fsList('handles', token, 5000);
console.log(`${handles.length} handle${handles.length === 1 ? '' : 's'} claimed${ONLY ? `, filtering to @${ONLY}` : ''}${DRY ? ' — DRY RUN' : ''}\n`);

let created = 0, refreshed = 0, skipped = 0, failed = 0;

for (const h of handles) {
  if (ONLY && h.id !== ONLY) continue;

  // A released handle inside its grace period still resolves; past it, it does
  // not belong to anyone and must not publish anything.
  if (h.released_at && Date.parse(h.released_at) < Date.now()) continue;

  const user = await fsGet(`users/${h.uid}`, token).catch(() => null);
  const p = (user && user.profile_public) || {};
  // The shared gate, not a second copy of the rule: public unless switched off.
  if (!profilePublicOn(p)) { console.log(`@${h.id} — profile off, skipped`); continue; }

  const all = await fsList(`users/${h.uid}/cards`, token, 5000);
  const cards = [...all]
    .sort((a, b) => String(b.addedAt || '').localeCompare(String(a.addedAt || '')))
    .slice(0, LIMIT);

  let c = 0, r = 0, s = 0;
  for (const card of cards) {
    if (!cardIsPublic(card, p)) { s++; continue; }
    const id = entryId(h.uid, card.id);
    const existing = await fsGet(`feed/${id}`, token).catch(() => null);

    const entry = buildEntry({ ownerUid: h.uid, profilePublic: p, ownerFallbackName: user.display_name, card });
    if (!existing) Object.assign(entry, { heart: 0, fire: 0, money: 0, commentCount: 0, score: 0 });
    else { delete entry.hidden; delete entry.createdAt; }   // theirs to keep

    if (DRY) { existing ? r++ : c++; continue; }
    try {
      await fsPatch(`feed/${id}`, entry, token);
      existing ? r++ : c++;
    } catch (e) {
      failed++;
      console.warn(`  ! ${card.id}: ${e.message.slice(0, 80)}`);
    }
  }
  created += c; refreshed += r; skipped += s;
  console.log(`@${h.id} — ${c} new, ${r} refreshed, ${s} skipped of ${all.length} cards`);
}

console.log(`\n${DRY ? 'would write' : 'wrote'}: ${created} new, ${refreshed} refreshed, ${skipped} not publishable, ${failed} failed`);
