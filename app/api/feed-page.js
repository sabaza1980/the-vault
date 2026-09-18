/**
 * myvaults.io — the homepage, which is the feed.
 *
 * The site used to open on a page describing an app. A place that calls itself
 * the home of collectors should open on collectors, so this is what `/` serves
 * and the old marketing page moved to /about.
 *
 * Server-rendered on purpose: the first cards are in the HTML, so a visitor on
 * a phone sees real collections before any JavaScript runs, and a crawler sees
 * them at all. Everything after the first page comes from /api/feed.
 *
 * Signed out, a band above the feed says what this is and offers two ways in.
 * Signed in, that band is replaced — you already know what it is — and the
 * space goes to adding a card. The swap happens in the browser once Firebase
 * has resolved the session, so the served HTML is the same for everyone and
 * stays cacheable.
 */

import { googleToken, cors, escHtml } from './_fb.js';
import { readFeed, topUp } from './_feed-read.js';
import { feedEnabled } from './_feed.js';
import { BRAND, EMOJI, firebaseConfig, reactionBar, authSheetHtml, authSheetJs } from './_page-kit.js';

const FIRST_PAGE = 24;
const SITE = 'https://www.myvaults.io';

/** Categories worth a chip. Kept short: a phone shows about five. */
const CHIPS = ['Basketball', 'Pokemon', 'Football', 'Soccer', 'Baseball', 'Coins', 'Stamps', 'Comics'];

function timeAgo(iso) {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (!Number.isFinite(s) || s < 0) return '';
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  const d = Math.floor(s / 86400);
  if (d < 30) return `${d}d`;
  if (d < 365) return `${Math.floor(d / 30)}mo`;
  return `${Math.floor(d / 365)}y`;
}

/**
 * One post.
 *
 * Exported so /api/feed-cards renders later pages with the same markup rather
 * than a second template that drifts from this one.
 */
export function postHtml(e) {
  const handle = e.ownerHandle || '';
  const initial = escHtml((e.ownerName || handle || '?').trim().charAt(0).toUpperCase());
  const badges = (e.badges || []).slice(0, 3)
    .map(b => `<span class="bdg">${escHtml(b)}</span>`).join('');
  const counts = { [e.reactionTarget]: e.counts || {} };
  const profile = handle ? `/u/${encodeURIComponent(handle)}` : null;
  const who = profile
    ? `<a class="who-n" href="${profile}">${escHtml(e.ownerName)}</a>`
    : `<span class="who-n">${escHtml(e.ownerName)}</span>`;

  return `<article class="post"${e.fromTheVaults ? ' data-vaults="1"' : ''}>
  <header class="who">
    <span class="av" aria-hidden="true">${initial}</span>
    <span class="who-t">${who}<span class="who-h">${handle ? '@' + escHtml(handle) + ' · ' : ''}${timeAgo(e.createdAt)}</span></span>
    ${e.fromTheVaults ? '<span class="vaults">From the vaults</span>' : ''}
  </header>
  <div class="shot">
    <img src="${escHtml(e.cardImage)}" alt="${escHtml(e.cardName)}" loading="lazy" decoding="async"/>
  </div>
  <div class="body">
    <div class="acts">
      ${reactionBar(e.reactionTarget, counts, 'sm')}
    </div>
    <div class="cap">
      ${e.cardMeta ? `<span class="meta">${escHtml(e.cardMeta)}</span>` : ''}
      <h2 class="name">${escHtml(e.cardName)}</h2>
      ${badges ? `<div class="bdgs">${badges}</div>` : ''}
    </div>
  </div>
</article>`;
}

function offlinePage(msg) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>The Vault</title><meta name="robots" content="noindex">
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:${BRAND.ink};color:${BRAND.text};font-family:system-ui,sans-serif;text-align:center;padding:24px}a{color:${BRAND.orange}}</style>
</head><body><div><h1 style="font-size:20px;margin:0 0 10px">${escHtml(msg)}</h1>
<p style="color:${BRAND.muted};font-size:14px;margin:0">Try again in a moment, or <a href="/about">read about The Vault</a>.</p></div></body></html>`;
}

function page({ entries, cfg }) {
  const title = 'The Vault — the home of collectors';
  const desc = 'Real collections from real collectors. Trading cards, coins, stamps and comics, catalogued and shown off by the people who own them. Free to start.';
  const ogImage = entries.find(e => e.cardImage)?.cardImage || `${SITE}/og-image.jpg`;

  const posts = entries.map(postHtml).join('\n');
  const chips = ['<button class="chip on" data-cat="" aria-pressed="true">All</button>']
    .concat(CHIPS.map(c => `<button class="chip" data-cat="${escHtml(c)}" aria-pressed="false">${escHtml(c)}</button>`))
    .join('');

  // Structured data. ItemList of the visible cards, so a search result can show
  // what is actually on the page rather than a guess at it.
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: title,
    description: desc,
    url: SITE,
    isPartOf: { '@type': 'WebSite', name: 'The Vault', url: SITE },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: entries.length,
      itemListElement: entries.slice(0, 20).map((e, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        item: {
          '@type': 'VisualArtwork',
          name: e.cardName,
          image: e.cardImage,
          ...(e.ownerHandle ? { creator: { '@type': 'Person', name: e.ownerName, url: `${SITE}/u/${e.ownerHandle}` } } : {}),
        },
      })),
    },
  };

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${escHtml(title)}</title>
<meta name="description" content="${escHtml(desc)}"/>
<link rel="canonical" href="${SITE}/"/>
<meta name="robots" content="index, follow, max-image-preview:large"/>
<meta property="og:type" content="website"/>
<meta property="og:site_name" content="The Vault"/>
<meta property="og:title" content="${escHtml(title)}"/>
<meta property="og:description" content="${escHtml(desc)}"/>
<meta property="og:url" content="${SITE}/"/>
<meta property="og:image" content="${escHtml(ogImage)}"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${escHtml(title)}"/>
<meta name="twitter:description" content="${escHtml(desc)}"/>
<meta name="twitter:image" content="${escHtml(ogImage)}"/>
<meta name="theme-color" content="${BRAND.ink}"/>
<link rel="icon" href="/brand/vault-mark_fullcolour_transparent.svg"/>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Barlow:wght@400;500;600;700&display=swap" rel="stylesheet">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<style>
:root{--ink:${BRAND.ink};--panel:${BRAND.panel};--line:${BRAND.line};--or:${BRAND.orange};--t:${BRAND.text};--m:${BRAND.muted}}
*{box-sizing:border-box}
body{margin:0;background:var(--ink);color:var(--t);font-family:'Barlow',system-ui,sans-serif;-webkit-font-smoothing:antialiased}
a{color:var(--or)}
.vh{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.wrap{max-width:1240px;margin:0 auto;padding:0 16px}

header.top{position:sticky;top:0;z-index:20;background:rgba(13,13,26,.92);backdrop-filter:blur(14px);border-bottom:1px solid var(--line)}
.top .wrap{display:flex;align-items:center;gap:10px;height:58px}
.logo{display:flex;align-items:center;gap:9px;text-decoration:none}
.logo img{width:22px;height:24px;display:block}
.wm{font-family:'Bebas Neue',sans-serif;font-size:18px;letter-spacing:1.6px;color:var(--t)}
.wm b{color:var(--or);font-weight:400}
.top nav{display:none;gap:22px;margin-left:30px}
.top nav a{font-size:14px;font-weight:600;color:#c2c2cd;text-decoration:none}
.top nav a:hover{color:var(--t)}
.spacer{flex:1}
.ghost{font-size:13px;font-weight:600;color:#c2c2cd;text-decoration:none;padding:9px 6px}
.cta{background:var(--or);color:#fff;font-size:12.5px;font-weight:700;text-decoration:none;border-radius:999px;padding:9px 15px;border:none;cursor:pointer;font-family:inherit}
.cta:hover{background:#ff8353}

.band{border-bottom:1px solid var(--line);background:linear-gradient(180deg,#141420 0%,var(--ink) 100%)}
.band .wrap{padding-top:26px;padding-bottom:24px;display:flex;flex-direction:column;gap:14px}
.band h1{margin:0;font-family:'Bebas Neue',sans-serif;font-size:44px;line-height:.94;letter-spacing:1px}
.band h1 span{color:var(--or)}
.band p{margin:0;font-size:15px;line-height:1.55;color:#c2c2cd;max-width:620px}
.band .btns{display:flex;gap:10px;flex-wrap:wrap}
.band .b1{flex:1;min-width:160px;text-align:center;background:var(--or);color:#fff;font-size:14px;font-weight:700;text-decoration:none;border-radius:11px;padding:13px 18px;border:none;cursor:pointer;font-family:inherit}
.band .b2{text-align:center;border:1px solid var(--line);color:#c2c2cd;font-size:14px;font-weight:600;text-decoration:none;border-radius:11px;padding:13px 18px}
.band .fine{font-size:12px;color:var(--m)}

/* Two header states. The signed-in one was missing, so a signed-in visitor
   was told to sign in by a page that already knew who they were. */
.out-only{display:flex;align-items:center;gap:4px}
.in-only{display:none;align-items:center;gap:8px}
body.in .out-only{display:none}
body.in .in-only{display:flex}
.me{display:flex;text-decoration:none}
.mine{display:none;border-bottom:1px solid var(--line)}
.mine .wrap{display:flex;align-items:center;gap:10px;padding-top:12px;padding-bottom:12px}
.mine .add{flex:1;display:flex;align-items:center;gap:8px;background:#1a1a23;border:1px solid var(--line);border-radius:999px;padding:10px 14px;color:var(--m);font-size:13.5px;text-decoration:none}
body.in .mine{display:block}
body.in .band{display:none}

.tools{border-bottom:1px solid var(--line);position:sticky;top:58px;z-index:15;background:rgba(13,13,26,.92);backdrop-filter:blur(14px)}
.tools .wrap{display:flex;gap:8px;overflow-x:auto;padding-top:11px;padding-bottom:11px;scrollbar-width:none}
.tools .wrap::-webkit-scrollbar{display:none}
.chip{flex:0 0 auto;background:transparent;border:1px solid var(--line);color:#c2c2cd;border-radius:999px;padding:8px 14px;min-height:36px;font-family:inherit;font-size:12.5px;font-weight:700;cursor:pointer}
.chip.on{background:rgba(255,107,53,.14);border-color:rgba(255,107,53,.4);color:var(--or)}

#feed{display:grid;grid-template-columns:1fr;gap:16px;padding:18px 0 40px}
.post{background:#1a1a23;border:1px solid var(--line);border-radius:16px;overflow:hidden;display:flex;flex-direction:column}
.who{display:flex;align-items:center;gap:10px;padding:12px 14px}
.av{width:30px;height:30px;border-radius:50%;flex:0 0 auto;display:flex;align-items:center;justify-content:center;background:#2a2a36;color:#c2c2cd;font-size:12px;font-weight:700}
.who-t{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
.who-n{font-size:13.5px;font-weight:700;color:var(--t);text-decoration:none}
.who-n:hover{color:var(--or)}
.who-h{font-size:11.5px;color:var(--m)}
.vaults{font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--m);border:1px solid var(--line);border-radius:5px;padding:3px 7px}
.shot{background:#08080c;display:flex;align-items:center;justify-content:center;height:420px}
.shot img{max-width:100%;max-height:420px;object-fit:contain;display:block}
.body{padding:12px 14px 14px;display:flex;flex-direction:column;gap:10px}
.cap{display:flex;flex-direction:column;gap:5px}
.meta{font-size:11.5px;color:var(--m)}
.name{margin:0;font-family:'Bebas Neue',sans-serif;font-size:22px;letter-spacing:.8px;line-height:1.1;font-weight:400}
.bdgs{display:flex;gap:6px;flex-wrap:wrap}
.bdg{font-size:10px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:#c2c2cd;background:rgba(255,255,255,.07);border:1px solid var(--line);border-radius:5px;padding:3px 7px}

.rx{display:flex;align-items:center;gap:8px}
.rx-btn{display:flex;align-items:center;gap:6px;background:transparent;border:1px solid var(--line);border-radius:999px;padding:7px 12px;min-height:36px;cursor:pointer;color:var(--m);font-family:inherit;font-size:13px;font-weight:700}
.rx-btn:hover{border-color:rgba(255,107,53,.35);color:#c2c2cd}
.rx-btn.on{background:rgba(255,107,53,.14);border-color:rgba(255,107,53,.38);color:var(--or)}
.rx-glyph{font-size:14px;line-height:1}

#more{display:flex;justify-content:center;padding:0 0 48px}
#more-btn{background:transparent;border:1px solid var(--line);color:#c2c2cd;border-radius:11px;padding:13px 26px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer}
#empty{padding:60px 16px;text-align:center;color:var(--m);font-size:14px;line-height:1.6}

footer.foot{border-top:1px solid var(--line);background:var(--panel)}
.foot .wrap{padding:26px 16px;display:flex;flex-wrap:wrap;gap:14px 22px;align-items:center}
.foot a{font-size:12.5px;color:#8a8a99;text-decoration:none}
.foot a:hover{color:var(--or)}

@media(min-width:760px){
  .top nav{display:flex}
  .band h1{font-size:68px}
  .band p{font-size:17px}
  .band .b1{flex:0 0 auto}
  #feed{grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}
}
@media(min-width:1100px){#feed{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(prefers-reduced-motion:no-preference){.post{transition:border-color .15s}.post:hover{border-color:rgba(255,255,255,.18)}}
</style>
</head>
<body>

<header class="top"><div class="wrap">
  <a class="logo" href="/"><img src="/brand/vault-mark_fullcolour_transparent.svg" alt=""/><span class="wm">THE <b>VAULT</b></span></a>
  <nav>
    <a href="/about">How it works</a>
    <a href="/blog">Blog</a>
  </nav>
  <span class="spacer"></span>
  <span class="out-only">
    <a class="ghost" href="#" id="signin">Sign in</a>
    <a class="cta" href="#" id="start">Start free</a>
  </span>
  <span class="in-only">
    <a class="ghost" href="https://app.myvaults.io/">Your vault</a>
    <a class="me" id="me-link" href="#" title="Your profile"><span class="av" id="me-av2" aria-hidden="true">·</span></a>
  </span>
</div></header>

<section class="band"><div class="wrap">
  <h1>THE HOME OF <span>COLLECTORS</span></h1>
  <p>Everything below is somebody&#39;s actual collection. Scan a card with your phone and it&#39;s catalogued in seconds — set, parallel, serial number and all. Then it&#39;s yours to show off.</p>
  <div class="btns">
    <a class="b1" href="#" id="start2">Start your vault</a>
    <a class="b2" href="/about">How it works</a>
  </div>
  <div class="fine">Free. Web or Android, iOS coming soon.</div>
</div></section>

<section class="mine"><div class="wrap">
  <span class="av" id="me-av" aria-hidden="true">·</span>
  <a class="add" href="https://app.myvaults.io/">+ Add a card to your vault</a>
</div></section>

<section class="tools"><div class="wrap" id="chips">${chips}</div></section>

<main class="wrap">
  <h2 class="vh">Cards collectors have added</h2>
  <div id="feed">${posts}</div>
  <div id="empty" hidden>Nothing here yet. <a href="/about">Start a vault</a> and yours will be the first.</div>
  <div id="more"${entries.length < FIRST_PAGE ? ' hidden' : ''}><button id="more-btn" type="button">Show more</button></div>
</main>

<footer class="foot"><div class="wrap">
  <span class="wm" style="font-size:15px">THE <b>VAULT</b></span>
  <span class="spacer"></span>
  <a href="/about">How it works</a>
  <a href="/blog">Blog</a>
  <a href="/privacy-policy">Privacy</a>
  <a href="/terms">Terms</a>
  <a href="/delete-account">Delete account</a>
</div></footer>

${authSheetHtml({
  heading: 'Join the collectors',
  sub: 'Free, and you get a vault of your own to fill.',
  fyi: 'Your collection is public by default. What your cards are worth stays private, and your email is never shown.',
})}
<div class="toast" id="toast"></div>
<style>
.toast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%) translateY(20px);background:#1a1a23;border:1px solid var(--line);color:var(--t);font-size:13px;padding:11px 18px;border-radius:11px;opacity:0;pointer-events:none;transition:opacity .2s,transform .2s;z-index:80}
.toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
#sheet{position:fixed;inset:0;z-index:90;background:rgba(6,6,10,.72);backdrop-filter:blur(5px);display:none;align-items:flex-end;justify-content:center}
#sheet.open{display:flex}
.sheet-in{width:100%;max-width:460px;background:${BRAND.panel};border:1px solid var(--line);border-bottom:none;border-radius:20px 20px 0 0;padding:22px 20px calc(26px + env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;gap:12px;max-height:92vh;overflow-y:auto}
.sheet-in h3{margin:0;font-family:'Bebas Neue',sans-serif;font-size:27px;letter-spacing:.8px;font-weight:400}
#sheet-sub{margin:0;font-size:14px;color:#c2c2cd;line-height:1.5}
.fyi{margin:0;font-size:12px;color:var(--m);line-height:1.6;border-top:1px solid var(--line);padding-top:11px}
.seg{display:flex;gap:6px;background:#15151c;border:1px solid var(--line);border-radius:10px;padding:4px}
.seg-b{flex:1;background:none;border:none;color:var(--m);font-family:inherit;font-size:13px;font-weight:700;padding:9px;border-radius:7px;cursor:pointer}
.seg-b.on{background:#252531;color:var(--t)}
.btn-g{display:flex;align-items:center;justify-content:center;gap:9px;background:#fff;color:#1a1a1a;border:none;border-radius:11px;padding:13px;font-family:inherit;font-size:14.5px;font-weight:700;cursor:pointer}
.or{display:flex;align-items:center;gap:10px;color:var(--m);font-size:12px}
.or:before,.or:after{content:"";flex:1;height:1px;background:var(--line)}
#sheet-form{display:flex;flex-direction:column;gap:9px}
#sheet-form input{background:#15151c;border:1px solid var(--line);border-radius:10px;padding:13px;color:var(--t);font-family:inherit;font-size:15px}
#sheet-form input:focus{outline:2px solid rgba(255,107,53,.5);outline-offset:1px}
.btn{background:var(--or);color:#fff;border:none;border-radius:11px;padding:13px;font-family:inherit;font-size:14.5px;font-weight:700;cursor:pointer}
.err{color:#ff8a70;font-size:12.5px;min-height:1px}
.lnk{background:none;border:none;color:var(--or);font-family:inherit;font-size:12.5px;font-weight:700;cursor:pointer;padding:2px}
.play{display:flex;align-items:center;justify-content:center;gap:8px;border:1px solid var(--line);border-radius:11px;padding:11px;color:#c2c2cd;font-size:13px;font-weight:600;text-decoration:none}
.sheet-x{background:none;border:none;color:var(--m);font-family:inherit;font-size:13px;cursor:pointer;padding:6px}
</style>

<script>
window.__VAULT_FEED = 1;
// The sign-up sheet publishes the shared session after it signs somebody in,
// so the app knows about it too.
window.__vaultAfterSignIn = (u) => {
  if (!u || !window.__vaultPublishSession) return;
  return window.__vaultPublishSession(u);
};
</script>
${authSheetJs({ cfg, owner: null })}
<script type="module">
// Signed in, the band comes off and the add-a-card row takes its place. Done in
// the browser so the served HTML is identical for everyone and stays cacheable.
import { getAuth, onAuthStateChanged, signInWithCustomToken, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
const CFG2 = ${cfg ? JSON.stringify(cfg) : 'null'};
const API_BASE = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)
  ? location.origin : 'https://app.myvaults.io';
if (CFG2) {
  const app = getApps().length ? getApps()[0] : initializeApp(CFG2);
  const fbAuth = getAuth(app);

  // One sign-in covers this site and the app. Signing in here publishes the
  // session; arriving here already signed in on app.myvaults.io adopts it.
  // A 204 is the ordinary answer for a visitor who is not signed in — the feed
  // is public and none of this gates reading it.
  // Called when someone signs in through the sheet on this page. The listener
  // only verifies, so publishing and verifying never fight over the cookie.
  const publish = (u) => u.getIdToken()
    .then(idToken => fetch(API_BASE + '/api/session', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    }))
    .catch(() => {});

  window.__vaultPublishSession = publish;

  const adopt = () => fetch(API_BASE + '/api/session', { credentials: 'include' })
    .then(r => r.status === 200 ? r.json() : null)
    .then(j => j && j.customToken ? signInWithCustomToken(fbAuth, j.customToken) : null)
    .catch(() => {});

  // The shared cookie is the authority. Firebase keeps a refresh token per
  // origin, so signing out in the app never touched the copy this site holds —
  // you logged out and the feed carried on greeting you by name. Now this page
  // checks on load and lets go when the shared session has ended. Only a
  // definite 204 counts; a network wobble means unknown, and unknown must never
  // sign anybody out.
  const verify = () => fetch(API_BASE + '/api/session', { credentials: 'include' })
    .then(r => { if (r.status === 204) signOut(fbAuth); })
    .catch(() => {});

  onAuthStateChanged(fbAuth, (u) => {
    document.body.classList.toggle('in', !!u);
    if (u) verify(); else adopt();
    if (u) {
      const n = (u.displayName || u.email || '?').trim().charAt(0).toUpperCase();
      for (const id of ['me-av', 'me-av2']) {
        const av = document.getElementById(id);
        if (av) av.textContent = n;
      }
      // Their own profile, if they have a handle. Asking the API for it also
      // assigns one to an account that has none, which is what makes a brand
      // new collector reachable at a URL.
      u.getIdToken().then(t => fetch(API_BASE + '/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
        body: JSON.stringify({ ensure_handle: true }),
      })).then(r => r && r.ok ? r.json() : null).then(j => {
        const link = document.getElementById('me-link');
        if (j && j.handle && link) link.href = '/u/' + encodeURIComponent(j.handle);
      }).catch(() => {});
    }
  });
}
</script>
<script type="module">
// Paging and the category chips. The first page is already in the document;
// everything after it comes from /api/feed.
const API = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)
  ? location.origin : 'https://app.myvaults.io';
const feed = document.getElementById('feed');
const moreWrap = document.getElementById('more');
const moreBtn = document.getElementById('more-btn');
const empty = document.getElementById('empty');
const chipBox = document.getElementById('chips');
let cursor = null, cat = '', busy = false, first = true;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function ago(iso) {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (!Number.isFinite(s) || s < 0) return '';
  if (s < 3600) return Math.max(1, Math.floor(s / 60)) + 'm';
  if (s < 86400) return Math.floor(s / 3600) + 'h';
  const d = Math.floor(s / 86400);
  if (d < 30) return d + 'd';
  if (d < 365) return Math.floor(d / 30) + 'mo';
  return Math.floor(d / 365) + 'y';
}

function render(e) {
  const h = e.ownerHandle || '';
  const init = esc((e.ownerName || h || '?').trim().charAt(0).toUpperCase());
  const c = e.counts || {};
  const rx = ['heart', 'fire', 'money'].map((k, i) =>
    '<button type="button" class="rx-btn" data-emoji="' + k + '" aria-label="React">' +
    '<span class="rx-glyph">' + ['❤️', '🔥', '💰'][i] + '</span>' +
    '<span class="rx-n" data-n="' + k + '">' + (c[k] || 0) + '</span></button>').join('');
  const badges = (e.badges || []).slice(0, 3).map(b => '<span class="bdg">' + esc(b) + '</span>').join('');
  const who = h ? '<a class="who-n" href="/u/' + encodeURIComponent(h) + '">' + esc(e.ownerName) + '</a>'
                : '<span class="who-n">' + esc(e.ownerName) + '</span>';
  return '<article class="post">' +
    '<header class="who"><span class="av" aria-hidden="true">' + init + '</span>' +
    '<span class="who-t">' + who + '<span class="who-h">' + (h ? '@' + esc(h) + ' · ' : '') + ago(e.createdAt) + '</span></span>' +
    (e.fromTheVaults ? '<span class="vaults">From the vaults</span>' : '') + '</header>' +
    '<div class="shot"><img src="' + esc(e.cardImage) + '" alt="' + esc(e.cardName) + '" loading="lazy" decoding="async"/></div>' +
    '<div class="body"><div class="acts"><div class="rx" data-target="' + esc(e.reactionTarget) + '">' + rx + '</div></div>' +
    '<div class="cap">' + (e.cardMeta ? '<span class="meta">' + esc(e.cardMeta) + '</span>' : '') +
    '<h2 class="name">' + esc(e.cardName) + '</h2>' +
    (badges ? '<div class="bdgs">' + badges + '</div>' : '') + '</div></div></article>';
}

async function load(reset) {
  if (busy) return;
  busy = true;
  moreBtn.textContent = 'Loading…';
  try {
    const qs = new URLSearchParams({ limit: '24' });
    if (cat) qs.set('cat', cat);
    if (cursor && !reset) qs.set('cursor', cursor);
    const r = await fetch(API + '/api/feed?' + qs);
    const j = await r.json();
    const list = j.entries || [];
    if (reset) feed.innerHTML = '';
    feed.insertAdjacentHTML('beforeend', list.map(render).join(''));
    cursor = j.nextCursor;
    moreWrap.hidden = !j.hasMore;
    empty.hidden = !(feed.children.length === 0);
    if (window.__vaultBindReactions) window.__vaultBindReactions();
  } catch {
    moreWrap.hidden = false;
  } finally {
    moreBtn.textContent = 'Show more';
    busy = false;
  }
}

moreBtn.addEventListener('click', () => load(false));

chipBox.addEventListener('click', (ev) => {
  const b = ev.target.closest('.chip');
  if (!b) return;
  for (const c of chipBox.querySelectorAll('.chip')) {
    const on = c === b;
    c.classList.toggle('on', on);
    c.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  cat = b.dataset.cat || '';
  cursor = null;
  load(true);
});

// The header buttons open the same sheet a reaction does.
for (const id of ['signin', 'start', 'start2']) {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', (ev) => {
    ev.preventDefault();
    if (window.__vaultOpenSheet) window.__vaultOpenSheet();
    else location.href = 'https://app.myvaults.io/';
  });
}
</script>
</body></html>`;
}

export default async function handler(req, res) {
  if (req.method === 'HEAD') {
    // Link checkers and uptime monitors ask with HEAD. The headers are the
    // whole answer, so nothing is rendered for one.
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).end();
  }
  if (req.method !== 'GET') return res.status(405).send('Method not allowed');

  try {
    const token = await googleToken();

    if (!(await feedEnabled(token))) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).send(offlinePage('The feed is having a moment.'));
    }

    const page1 = await readFeed({ token, limit: FIRST_PAGE });
    let entries = page1.entries;
    if (entries.length < FIRST_PAGE) {
      const extra = await topUp({ token, have: entries, limit: FIRST_PAGE, exclude: entries.map(e => e.id) }).catch(() => []);
      entries = entries.concat(extra);
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    // The homepage is dynamic now, so every visit is a Firestore read including
    // every crawler. A visitor seeing the feed a minute stale costs nothing;
    // paying for a read per bot does.
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=600');
    return res.status(200).send(page({ entries, cfg: firebaseConfig() }));
  } catch (e) {
    console.error('[feed-page]', e);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).send(offlinePage('The feed could not load.'));
  }
}
