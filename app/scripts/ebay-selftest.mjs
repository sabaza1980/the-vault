#!/usr/bin/env node
/**
 * Self-test for The Vault's eBay valuation integration.
 *
 *   node scripts/ebay-selftest.mjs
 *
 * Live checks hit eBay production with the app's client-credentials keys.
 * Offline checks exercise the valuation rules with fixtures, so the pass/fail
 * of the pricing logic does not depend on Marketplace Insights approval.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, '..');

// .env files here come from Windows / the Vercel CLI: CRLF endings and wrapping
// quotes both silently break eBay Basic auth, so strip them.
for (const f of ['.env.production', '.env.local', '.env']) {
  const p = path.join(appRoot, f);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i.exec(line);
    if (!m) continue;
    const key = m[1];
    const val = m[2].trim().replace(/^["']|["']$/g, '');
    if (!process.env[key] && val) process.env[key] = val;
  }
}

const { getAppToken, SCOPE_BASE, SCOPE_MARKETPLACE_INSIGHTS, EbayScopeError } =
  await import('../api/_ebay/token.js');
const { getConditionPolicy, getCardConditionOptions, buildConditionDescriptors, buildConditionDescriptorsXml } =
  await import('../api/_ebay/conditions.js');
const { valueFromComps, filterComps, buildQueryTiers, valueCard } =
  await import('../api/_ebay/soldComps.js');

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
};
const section = (t) => console.log(`\n${t}\n${'-'.repeat(t.length)}`);

// ── Offline: the valuation rule ────────────────────────────────────────────
section('Valuation rule (offline fixtures)');

const comp = (price, daysAgo, extra = {}) => ({
  itemId: `v1|${Math.round(price * 1000)}|0`,
  legacyItemId: String(Math.round(price * 1000)),
  title: 'Test Card',
  price,
  currency: 'USD',
  soldDate: new Date(Date.now() - daysAgo * 864e5).toISOString(),
  ...extra,
});

{
  const r = valueFromComps([comp(10, 1), comp(20, 2), comp(30, 3), comp(40, 4), comp(50, 5), comp(999, 60)]);
  ok('>=5 comps averages the 5 most recent', r.value === 30 && r.method === 'average_of_5',
     `value=${r.value} method=${r.method}`);
  ok('>=5 comps ignores the older 6th sale', !r.used.some(c => c.price === 999));
  ok('>=5 comps reports 5 item IDs', r.used.length === 5);
}
{
  const r = valueFromComps([comp(12.5, 1), comp(99, 9), comp(80, 20)]);
  ok('<5 comps uses the most recent sale only', r.value === 12.5 && r.method === 'most_recent',
     `value=${r.value} method=${r.method}`);
  ok('<5 comps returns exactly one item ID', r.used.length === 1);
}
{
  const r = valueFromComps([comp(42, 3)]);
  ok('single comp uses that sale', r.value === 42 && r.method === 'most_recent');
}
{
  const r = valueFromComps([]);
  ok('zero comps -> null, never 0', r.value === null && r.method === null, `value=${JSON.stringify(r.value)}`);
}
{
  const mixed = [comp(10, 1), { ...comp(500, 2), currency: 'GBP' }, comp(20, 3), comp(30, 4), comp(40, 5), comp(50, 6)];
  const r = valueFromComps(mixed);
  ok('mixed currencies never averaged together', r.currency === 'USD' && r.value === 30 && r.droppedForCurrency === 1,
     `value=${r.value} dropped=${r.droppedForCurrency}`);
}
{
  const r = valueFromComps([comp(10.005, 1)]);
  ok('prices round to 2dp', r.value === 10.01, `value=${r.value}`);
}
{
  // Determinism: identical timestamps must not produce a random winner.
  const a = { ...comp(11, 1), itemId: 'v1|a|0', soldDate: '2026-08-01T00:00:00Z' };
  const b = { ...comp(22, 1), itemId: 'v1|b|0', soldDate: '2026-08-01T00:00:00Z' };
  const r1 = valueFromComps([a, b]), r2 = valueFromComps([b, a]);
  ok('ties broken deterministically', r1.value === r2.value, `${r1.value} vs ${r2.value}`);
}

// ── Offline: comp filtering ────────────────────────────────────────────────
section('Comp filtering (offline fixtures)');

const titled = (title, extra = {}) => ({ ...comp(10, 1), title, ...extra });
{
  const card = { playerName: 'Julio Rodriguez', graded: false };
  const { kept, rejected } = filterComps([
    titled('2023 Topps Chrome Julio Rodriguez #200'),
    titled('2023 Topps Chrome Julio Rodriguez #200 PSA 10'),
    titled('2023 Topps Chrome Julio Rodriguez LOT of 5 cards'),
    titled('2023 Topps Chrome Corbin Carroll #201'),
    titled('Julio Rodriguez custom art card'),
  ], card);
  ok('raw card excludes graded comps', !kept.some(c => /PSA/.test(c.title)));
  ok('raw card excludes lots', !kept.some(c => /LOT/i.test(c.title)));
  ok('raw card excludes customs', !kept.some(c => /custom/i.test(c.title)));
  ok('raw card excludes a different player', !kept.some(c => /Corbin/.test(c.title)));
  ok('raw card keeps the plain single', kept.length === 1, `kept=${kept.length} rejected=${rejected.length}`);
}
{
  const card = { playerName: 'Julio Rodriguez', graded: true, grader: 'PSA', grade: '10' };
  const { kept } = filterComps([
    titled('2023 Topps Chrome Julio Rodriguez PSA 10'),
    titled('2023 Topps Chrome Julio Rodriguez PSA 9'),
    titled('2023 Topps Chrome Julio Rodriguez BGS 10'),
    titled('2023 Topps Chrome Julio Rodriguez raw'),
  ], card);
  ok('PSA 10 keeps only PSA 10', kept.length === 1 && /PSA 10/.test(kept[0].title),
     kept.map(c => c.title).join(' | ') || '(none)');
}

// ── Offline: query building ────────────────────────────────────────────────
section('Query building (offline)');
{
  const tiers = buildQueryTiers({
    playerName: 'Julio Rodriguez', year: '2023', brand: 'Topps Chrome',
    series: 'Sepia Refractor', parallel: 'Sepia', cardNumber: '200',
    graded: true, grader: 'PSA', grade: '10',
  });
  ok('tier 0 is the most specific', tiers[0].q.includes('#200') && tiers[0].q.includes('PSA 10'), tiers[0].q);
  ok('tiers get progressively looser', tiers.length >= 3 && !tiers[tiers.length - 1].q.includes('#200'),
     tiers[tiers.length - 1].q);
  ok('"Base" parallel is not searched', !buildQueryTiers({ playerName: 'X', parallel: 'Base' })[0].q.includes('Base'));
  ok('no card detail -> no tiers', buildQueryTiers({}).length === 0);
}

// ── Live: eBay production ──────────────────────────────────────────────────
section('Live eBay calls');

let baseToken = null;
try {
  baseToken = await getAppToken(SCOPE_BASE);
  ok('app token (base scope)', Boolean(baseToken), `len ${baseToken.length}`);
} catch (e) {
  ok('app token (base scope)', false, e.message);
}

if (baseToken) {
  try {
    const policy = await getConditionPolicy('183050', 'EBAY_US');
    const ids = (policy?.itemConditions || []).map(c => c.conditionId).join('/');
    ok('getItemConditionPolicies for 183050', ids === '2750/3000/4000', `conditionIds=${ids}`);
  } catch (e) { ok('getItemConditionPolicies for 183050', false, e.message); }

  try {
    const opts = await getCardConditionOptions('183050', 'EBAY_US');
    ok('graders list populated', opts.graders.length > 10, `${opts.graders.length} graders`);
    ok('grades list populated', opts.grades.length > 10, `${opts.grades.length} grades`);
    ok('PSA resolves via abbreviation', opts.graders.some(g => g.abbrev === 'PSA'));
  } catch (e) { ok('getCardConditionOptions', false, e.message); }

  try {
    const r = await buildConditionDescriptors(
      { graded: true, grader: 'PSA', grade: '10', certNumber: '87654321' }, '183050', 'EBAY_US');
    const xml = buildConditionDescriptorsXml(r.descriptors);
    ok('graded card -> ConditionID 2750', r.conditionId === '2750');
    ok('grader 27501 resolved', r.descriptors.some(d => d.name === '27501' && d.values[0] === '275010'),
       JSON.stringify(r.descriptors.find(d => d.name === '27501')));
    ok('grade 27502 resolved', r.descriptors.some(d => d.name === '27502' && d.values[0] === '275020'),
       JSON.stringify(r.descriptors.find(d => d.name === '27502')));
    ok('cert number goes in AdditionalInfo, not Value',
       r.descriptors.some(d => d.name === '27503' && d.additionalInfo === '87654321' && d.values.length === 0));
    ok('no unresolved-descriptor warnings', r.warnings.length === 0, r.warnings.join('; '));
    ok('XML well formed', xml.includes('<ConditionDescriptors>') && xml.includes('<AdditionalInfo>87654321</AdditionalInfo>'));
    console.log('\n' + xml + '\n');
  } catch (e) { ok('buildConditionDescriptors (graded)', false, e.message); }

  try {
    const r = await buildConditionDescriptors({ graded: false, condition: 'Near Mint' }, '183050', 'EBAY_US');
    ok('ungraded card -> ConditionID 4000', r.conditionId === '4000');
    ok('card condition 40001 resolved', r.descriptors.some(d => d.name === '40001' && d.values[0] === '400010'),
       JSON.stringify(r.descriptors[0]));
  } catch (e) { ok('buildConditionDescriptors (ungraded)', false, e.message); }

  try {
    const r = await buildConditionDescriptors({ graded: true, grader: 'Beckett', grade: '9.5' }, '183050', 'EBAY_US');
    ok('"Beckett" maps to BGS not BVG', r.descriptors.find(d => d.name === '27501')?.values[0] === '275013',
       JSON.stringify(r.descriptors.find(d => d.name === '27501')));
  } catch (e) { ok('grader fuzzy match', false, e.message); }
}

// Marketplace Insights: proves the access state, whichever way it goes.
let miGranted = false;
try {
  await getAppToken(SCOPE_MARKETPLACE_INSIGHTS);
  miGranted = true;
  ok('Marketplace Insights scope granted', true, 'sold-price lookup is LIVE');
} catch (e) {
  ok('Marketplace Insights scope state known', e instanceof EbayScopeError,
     e instanceof EbayScopeError ? 'NOT granted (expected until eBay approves)' : e.message);
}

section('End-to-end valuation');
{
  const r = await valueCard({
    playerName: 'Julio Rodriguez', year: '2023', brand: 'Topps Chrome',
    parallel: 'Sepia Refractor', cardNumber: '200',
  }, { marketplaceId: 'EBAY_US', categoryIds: '261328' });

  if (miGranted) {
    ok('valuation returns a number or a clean null', r.value === null || r.value > 0, JSON.stringify({ value: r.value, method: r.method, n: r.sampleSize }));
    ok('item IDs returned when a value was produced', r.value === null || r.itemIds.length > 0, `itemIds=${r.itemIds.length}`);
  } else {
    ok('no access degrades gracefully, never throws',
       r.value === null && r.unavailable === 'NO_MARKETPLACE_INSIGHTS_ACCESS', `unavailable=${r.unavailable}`);
    ok('value is null, not 0', r.value === null && r.value !== 0);
    ok('reason is explained to the caller', Boolean(r.note), r.note);
  }
}

console.log(`\n${'='.repeat(50)}\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
