/**
 * One-time migration: public profiles become opt-out.
 *
 * Public used to mean "switched on by hand". It now means "has a handle and has
 * not been switched off". Existing accounts have no handle, so nothing about
 * them changes when that rule ships — they stay private until this runs.
 *
 * That is deliberate. Making somebody's collection public is not a thing to do
 * as a side effect of a deploy, so it is a separate, explicit step you run
 * knowing whose accounts these are.
 *
 * What it does, per account with at least one card and no handle:
 *   1. assigns a neutral auto handle (never derived from a name or an email)
 *   2. backfills their newest cards into the feed
 *
 * Accounts with no cards are left alone — they get a handle at next sign-in,
 * and an empty public profile helps nobody in the meantime.
 *
 * Usage, from app/:
 *   node scripts/migrate-opt-out.mjs --dry-run
 *   node scripts/migrate-opt-out.mjs
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

const { googleToken, fsList, profilePublicOn } = await import(path.join(APP, 'api', '_fb.js'));
const { ensureHandle } = await import(path.join(APP, 'api', 'profile.js'));
const { backfillOwner } = await import(path.join(APP, 'api', '_feed.js'));

const DRY = process.argv.includes('--dry-run');
const token = await googleToken();

const users = await fsList('users', token, 20000);
console.log(`${users.length} accounts${DRY ? ' — DRY RUN, nothing is written' : ''}\n`);

let assigned = 0, already = 0, empty = 0, posted = 0;

for (const u of users) {
  const p = u.profile_public || {};
  const cards = await fsList(`users/${u.id}/cards`, token, 5000);
  const label = (p.display_name || u.display_name || u.id).slice(0, 28);

  if (!cards.length) { empty++; continue; }

  if (p.enabled === false) { console.log(`  skip   ${label} — switched off by the collector`); continue; }
  if (p.handle) { already++; console.log(`  have   @${p.handle} (${cards.length} cards)`); continue; }

  if (DRY) { assigned++; console.log(`  would  ${label} — ${cards.length} cards, needs a handle`); continue; }

  const r = await ensureHandle(u.id, token);
  if (!r.handle) { console.log(`  FAIL   ${label} — could not assign a handle`); continue; }
  assigned++;
  const b = await backfillOwner({ ownerUid: u.id, token, limit: 50 });
  posted += b.written;
  console.log(`  new    @${r.handle} — ${label}, ${b.written} cards posted`);
}

console.log(`\n${DRY ? 'would assign' : 'assigned'}: ${assigned} handles | already had one: ${already} | no cards, left alone: ${empty} | feed entries written: ${posted}`);
