/**
 * GET /api/profile-page?handle=sherif
 *
 * The public collector profile, server-rendered as a standalone page.
 *
 * Rendered on the server rather than handed to the SPA for three reasons:
 * link previews in chat apps need real OG tags in the initial HTML, the page
 * should open fast on a phone with no app bundle to download, and the website
 * project proxies /u/<handle> here so the URL stays myvaults.io/u/<handle>.
 */

import { googleToken, fsGet, escHtml } from './_fb.js';
import { loadPublicProfile } from './profile.js';

// How many cards the HTML carries. The rest is fetched.
const FIRST_PAGE = 60;

// BRAND, EMOJI, firebaseConfig, reactionBar, the sign-up sheet and its client
// module now live in _page-kit.js, shared with the feed at /.
import {
  BRAND, EMOJI, firebaseConfig, reactionBar, authSheetHtml, authSheetJs,
  siteHeaderCss, siteHeaderHtml,
} from './_page-kit.js';

async function countsFor(targets, token) {
  const out = {};
  await Promise.all(targets.slice(0, 120).map(async t => {
    try {
      const d = await fsGet(`reactions/${t}`, token);
      out[t] = {
        heart: Math.max(0, Number(d?.heart) || 0),
        fire: Math.max(0, Number(d?.fire) || 0),
        money: Math.max(0, Number(d?.money) || 0),
      };
    } catch { out[t] = { heart: 0, fire: 0, money: 0 }; }
  }));
  return out;
}


function notFoundPage() {
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Vault not found | The Vault</title>
<meta name="robots" content="noindex"/>
<style>
  body{margin:0;background:${BRAND.ink};color:${BRAND.text};min-height:100vh;display:flex;
       align-items:center;justify-content:center;text-align:center;padding:24px;
       font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
  h1{font-size:28px;margin:0 0 10px}
  p{color:${BRAND.muted};max-width:420px;line-height:1.6;margin:0 0 24px}
  a{display:inline-block;background:${BRAND.orange};color:#fff;text-decoration:none;
    padding:13px 28px;border-radius:10px;font-weight:700;letter-spacing:.5px}
</style></head><body><div>
<h1>This vault is private</h1>
<p>Either there is no vault at this address, or the collector has not made theirs public yet.</p>
<a href="https://www.myvaults.io">Start your own vault</a>
</div></body></html>`;
}

export function cardsHtml(cards, uid, showValues, counts) {
  return cards.map(c => {
    const badges = [
      c.isRookie ? '<span class="b b-rc">RC</span>' : '',
      c.hasAutograph ? '<span class="b b-au">AUTO</span>' : '',
      c.serialNumber ? `<span class="b b-sn">${escHtml(c.serialNumber)}</span>` : '',
      c.rarity && c.rarity !== 'Common' ? `<span class="b b-ra">${escHtml(c.rarity)}</span>` : '',
    ].join('');
    const meta = [c.year, c.brand, c.series].filter(Boolean).join(' ') || c.fullCardName || '';
    const val = showValues && c.estimatedValue
      ? `<div class="val">$${Number(c.estimatedValue).toFixed(2)}</div>` : '';
    const img = c.imageUrl
      ? `<img src="${escHtml(c.imageUrl)}" alt="${escHtml(c.playerName)}" loading="lazy"/>`
      : `<div class="noimg">No image</div>`;
    // Everything the filter needs travels with the card, so filtering is a
    // class toggle rather than a round trip. The haystack is lower-cased here
    // so the browser does not redo it on every keystroke.
    const cat = c.cardCategory || 'Other';
    const hay = [
      c.playerName, c.fullCardName, c.brand, c.series, c.parallel, c.team,
      c.year, c.cardNumber, c.serialNumber, cat,
    ].filter(Boolean).join(' ').toLowerCase();
    return `<article class="card" data-cat="${escHtml(cat)}" data-q="${escHtml(hay)}">
      <div class="shot">${img}${c.forSale ? '<span class="sale">For sale</span>' : ''}</div>
      <div class="body">
        <div class="set">${escHtml(meta)}</div>
        <h3>${escHtml(c.playerName || 'Unknown')}</h3>
        ${c.team ? `<div class="team">${escHtml(c.team)}</div>` : ''}
        ${badges ? `<div class="badges">${badges}</div>` : ''}
        ${val}
        ${reactionBar(`card_${uid}_${c.id}`, counts)}
      </div>
    </article>`;
  }).join('\n');
}

function page(p, counts, cfg) {
  const profileTarget = `profile_${p.uid}`;
  const title = `${p.displayName} on The Vault`;
  const desc = p.bio
    ? p.bio
    : `${p.cardCount} card${p.cardCount === 1 ? '' : 's'} in ${p.displayName}'s vault. Take a look.`;
  const ogImage = p.cards.find(c => c.imageUrl)?.imageUrl || 'https://app.myvaults.io/the-vault-icon.png';
  const url = `https://www.myvaults.io/u/${p.handle}`;

  const cards = cardsHtml(p.cards, p.uid, p.showValues, counts);

  // Counts come from the whole collection, computed server-side, so the chips
  // are honest even though only a first page is in the DOM.
  const cats = Array.isArray(p.categories) ? p.categories : [];
  const showTools = p.cardCount > 6 || cats.length > 1;
  const chips = [`<button class="chip on" data-cat="" aria-pressed="true">All <span class="n">${p.cardCount}</span></button>`]
    .concat(cats.map(([k, n]) =>
      `<button class="chip" data-cat="${escHtml(k)}" aria-pressed="false">${escHtml(k)} <span class="n">${n}</span></button>`))
    .join('');

  const tools = showTools ? `
  <section class="tools"><div class="wrap">
    <div class="toolrow">
      <label class="srch">
        <span class="vh">Search this collection</span>
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
        <input id="q" type="search" autocomplete="off" placeholder="Search a player, set or year"/>
        <button id="clr" type="button" aria-label="Clear search" hidden>&times;</button>
      </label>
    </div>
    <div class="chips" id="chips">${chips}</div>
    <div class="shown" id="shown" role="status" aria-live="polite"></div>
  </div></section>` : '';

  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
<title>${escHtml(title)}</title>
<meta name="description" content="${escHtml(desc)}"/>
<link rel="canonical" href="${escHtml(url)}"/>
<meta property="og:type" content="profile"/>
<meta property="og:url" content="${escHtml(url)}"/>
<meta property="og:title" content="${escHtml(title)}"/>
<meta property="og:description" content="${escHtml(desc)}"/>
<meta property="og:image" content="${escHtml(ogImage)}"/>
<meta property="og:site_name" content="The Vault"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${escHtml(title)}"/>
<meta name="twitter:description" content="${escHtml(desc)}"/>
<meta name="twitter:image" content="${escHtml(ogImage)}"/>
<link rel="icon" href="https://app.myvaults.io/the-vault-icon.png"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Playfair+Display:wght@700&family=Barlow+Condensed:wght@600;700&family=Barlow:wght@400;600&display=swap" rel="stylesheet"/>
<style>
  *{box-sizing:border-box}
  body{margin:0;background:${BRAND.ink};color:${BRAND.text};
       font-family:Barlow,system-ui,-apple-system,sans-serif;line-height:1.5}
  a{color:inherit}
  .wrap{max-width:1100px;margin:0 auto;padding:0 20px}
${siteHeaderCss()}
  .hero{padding:44px 0 30px;border-bottom:1px solid ${BRAND.line}}
  .who{display:flex;flex-wrap:wrap;gap:20px;align-items:flex-start;justify-content:space-between}
  h1{font-family:'Barlow Condensed',sans-serif;font-size:clamp(34px,7vw,56px);
     text-transform:uppercase;letter-spacing:1px;margin:0 0 4px;line-height:1}
  .at{color:${BRAND.orange};font-family:'Barlow Condensed',sans-serif;
      font-size:17px;letter-spacing:1.5px;text-transform:lowercase}
  .bio{color:${BRAND.muted};max-width:52ch;margin:14px 0 0}
  .count{color:${BRAND.muted};font-size:14px;margin-top:10px;
         font-family:'Barlow Condensed',sans-serif;letter-spacing:1.5px;text-transform:uppercase}
  .vh{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
  .tools{border-bottom:1px solid ${BRAND.line};padding:18px 0 16px}
  .toolrow{display:flex;gap:12px;flex-wrap:wrap}
  .srch{position:relative;display:flex;align-items:center;flex:1;min-width:240px}
  .srch svg{position:absolute;left:14px;width:17px;height:17px;fill:none;
            stroke:${BRAND.muted};stroke-width:2;stroke-linecap:round;pointer-events:none}
  .srch input{width:100%;background:${BRAND.panel};border:1px solid ${BRAND.line};
              border-radius:12px;padding:12px 40px 12px 40px;color:${BRAND.text};
              font-family:inherit;font-size:15px;outline:none;-webkit-appearance:none}
  .srch input::-webkit-search-cancel-button{display:none}
  .srch input:focus{border-color:rgba(255,107,53,.55)}
  .srch input::placeholder{color:#5a5a69}
  #clr{position:absolute;right:8px;background:none;border:0;color:${BRAND.muted};
       font-size:22px;line-height:1;cursor:pointer;padding:4px 8px}
  .chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
  .chip{font-family:'Barlow Condensed',sans-serif;font-size:13px;font-weight:700;
        letter-spacing:.8px;text-transform:uppercase;cursor:pointer;
        background:${BRAND.panel};color:${BRAND.muted};
        border:1px solid ${BRAND.line};border-radius:999px;padding:7px 14px;
        transition:background .15s,color .15s,border-color .15s}
  .chip:hover{color:${BRAND.text};border-color:rgba(255,255,255,.22)}
  .chip.on{background:${BRAND.orange};color:#fff;border-color:${BRAND.orange}}
  .chip .n{opacity:.7;font-weight:600}
  .shown{color:${BRAND.muted};font-size:13px;margin-top:12px;min-height:18px}
  .card.hide{display:none}
  .more{display:flex;flex-direction:column;align-items:center;gap:8px;padding:26px 0 8px}
  .more-n{color:${BRAND.muted};font-size:12px}
  .more[hidden]{display:none}
  .noresult{color:${BRAND.muted};padding:50px 0;text-align:center}
  @media (prefers-reduced-motion: reduce){ .chip{transition:none} }
  .grid{display:grid;gap:18px;padding:30px 0 10px;
        grid-template-columns:repeat(auto-fill,minmax(230px,1fr))}
  .card{background:${BRAND.panel};border:1px solid ${BRAND.line};border-radius:16px;overflow:hidden;
        display:flex;flex-direction:column}
  .shot{aspect-ratio:5/7;background:#141422;overflow:hidden}
  .shot img{width:100%;height:100%;object-fit:cover;display:block}
  .noimg{width:100%;height:100%;display:flex;align-items:center;justify-content:center;
         color:#3a3a4a;font-size:13px}
  .body{padding:14px 14px 12px;display:flex;flex-direction:column;gap:6px;flex:1}
  .set{font-family:'Barlow Condensed',sans-serif;font-size:12px;letter-spacing:1px;
       text-transform:uppercase;color:${BRAND.orange}}
  .card h3{font-family:'Barlow Condensed',sans-serif;font-size:22px;text-transform:uppercase;
           margin:0;letter-spacing:.5px;line-height:1.1}
  .team{font-size:13px;color:${BRAND.muted}}
  .card .shot{position:relative}
  .sale{position:absolute;left:8px;top:8px;background:rgba(76,175,80,.92);color:#04140a;border-radius:999px;
        padding:4px 10px;font-size:10.5px;font-weight:800;letter-spacing:.4px;text-transform:uppercase}
  .badges{display:flex;flex-wrap:wrap;gap:6px;margin-top:2px}
  .b{font-family:'Barlow Condensed',sans-serif;font-size:11px;font-weight:700;letter-spacing:.8px;
     padding:3px 8px;border-radius:6px;border:1px solid}
  .b-rc{color:${BRAND.orange};border-color:rgba(255,107,53,.35);background:rgba(255,107,53,.12)}
  .b-au{color:${BRAND.gold};border-color:rgba(240,192,64,.35);background:rgba(240,192,64,.12)}
  .b-sn{color:#ce93d8;border-color:rgba(206,147,216,.35);background:rgba(206,147,216,.12)}
  .b-ra{color:#9fb6ff;border-color:rgba(159,182,255,.3);background:rgba(159,182,255,.1)}
  .val{color:${BRAND.green};font-family:'Barlow Condensed',sans-serif;font-size:20px;font-weight:700}
  .rx{display:flex;gap:6px;margin-top:auto;padding-top:10px}
  .rx-btn{display:inline-flex;align-items:center;gap:5px;background:rgba(255,255,255,.05);
          border:1px solid ${BRAND.line};border-radius:999px;padding:6px 11px;cursor:pointer;
          color:${BRAND.text};font:inherit;font-size:13px;
          transition:transform .12s cubic-bezier(.22,1,.36,1),background .16s,border-color .16s}
  .rx-btn:hover{background:rgba(255,255,255,.09);border-color:rgba(255,255,255,.2)}
  .rx-btn:active{transform:scale(.94)}
  .rx-btn.on{background:rgba(255,107,53,.16);border-color:rgba(255,107,53,.45)}
  .rx-btn.pop .rx-glyph{animation:pop .42s cubic-bezier(.22,1,.36,1)}
  @keyframes pop{0%{transform:scale(1)}38%{transform:scale(1.45)}100%{transform:scale(1)}}
  .rx-lg .rx-btn{font-size:16px;padding:10px 18px}
  .rx-n{font-variant-numeric:tabular-nums;color:${BRAND.muted}}
  .rx-btn.on .rx-n{color:${BRAND.text}}
  .cta{margin:26px 0 60px;padding:28px 24px;border:1px solid ${BRAND.line};border-radius:18px;
       background:linear-gradient(180deg,rgba(255,107,53,.08),rgba(255,107,53,0));text-align:center}
  .cta h2{font-family:'Barlow Condensed',sans-serif;text-transform:uppercase;font-size:28px;margin:0 0 6px}
  .cta p{color:${BRAND.muted};margin:0 0 18px}
  .btn{display:inline-block;background:${BRAND.orange};color:#fff;text-decoration:none;padding:13px 30px;
       border-radius:10px;font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:16px;
       letter-spacing:1.5px;text-transform:uppercase;border:none;cursor:pointer}
  .empty{color:${BRAND.muted};padding:50px 0;text-align:center}
  footer.site{border-top:1px solid ${BRAND.line};padding:22px 0 40px;color:#3a3a4a;font-size:13px;
              display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap}
  footer.site a{color:#55556a}
  #sheet{position:fixed;inset:0;background:rgba(0,0,0,.72);display:none;align-items:center;
         justify-content:center;padding:20px;z-index:50}
  #sheet.open{display:flex}
  .sheet-in{background:${BRAND.panel};border:1px solid ${BRAND.line};border-radius:20px;
            padding:28px 24px;max-width:380px;width:100%;text-align:center}
  .sheet-in h3{font-family:'Barlow Condensed',sans-serif;text-transform:uppercase;font-size:24px;margin:0 0 6px}
  .sheet-in p{color:${BRAND.muted};font-size:14px;margin:0 0 20px}
  .sheet-x{background:none;border:none;color:${BRAND.muted};margin-top:14px;cursor:pointer;font:inherit;font-size:13px}
  .seg{display:flex;gap:6px;background:#141422;border:1px solid ${BRAND.line};border-radius:12px;
       padding:4px;margin:0 0 18px}
  .seg-b{flex:1;background:none;border:0;border-radius:9px;padding:9px 8px;cursor:pointer;
         color:${BRAND.muted};font:inherit;font-size:13px;font-weight:700}
  .seg-b.on{background:${BRAND.orange};color:#fff}
  .btn-g{width:100%;display:flex;align-items:center;justify-content:center;gap:10px;
         background:#fff;color:#1f1f1f;border:0;border-radius:12px;padding:13px 16px;
         font:inherit;font-size:15px;font-weight:700;cursor:pointer}
  .or{display:flex;align-items:center;gap:12px;color:#4a4a5c;font-size:12px;margin:16px 0}
  .or::before,.or::after{content:"";flex:1;height:1px;background:${BRAND.line}}
  #sheet-form{display:flex;flex-direction:column;gap:10px;text-align:left}
  #sheet-form input{width:100%;box-sizing:border-box;background:#141422;color:${BRAND.text};
                    border:1px solid ${BRAND.line};border-radius:12px;padding:13px 14px;
                    font:inherit;font-size:15px;outline:none}
  #sheet-form input:focus{border-color:rgba(255,107,53,.55)}
  #sheet-form input::placeholder{color:#4a4a5c}
  .err{color:#ff7a5c;font-size:13px;min-height:0;line-height:1.4}
  .err:empty{display:none}
  .lnk{background:none;border:0;color:${BRAND.muted};font:inherit;font-size:13px;
       cursor:pointer;margin-top:12px;text-decoration:underline}
  .play{display:inline-flex;align-items:center;justify-content:center;gap:8px;width:100%;
        box-sizing:border-box;margin-top:18px;padding:11px 14px;border-radius:12px;
        border:1px solid ${BRAND.line};color:${BRAND.muted};text-decoration:none;font-size:13px;font-weight:600}
  .play:hover{color:${BRAND.text};border-color:rgba(255,255,255,.22)}
  .fyi{color:#6a6a7c;font-size:12px;margin:-12px 0 18px!important;line-height:1.45}
  .toast{position:fixed;left:50%;transform:translateX(-50%);bottom:24px;background:#1a1a28;
         border:1px solid ${BRAND.line};color:${BRAND.text};padding:11px 18px;border-radius:999px;
         font-size:14px;opacity:0;pointer-events:none;transition:opacity .2s;z-index:60}
  .toast.show{opacity:1}
  @media (prefers-reduced-motion: reduce){*{animation:none!important;transition:none!important}}
</style>
</head><body>

${siteHeaderHtml({ active: null, feedHref: 'https://www.myvaults.io/' })}

<section class="hero"><div class="wrap">
  <div class="who">
    <div>
      <h1>${escHtml(p.displayName)}</h1>
      <div class="at">@${escHtml(p.handle)}</div>
      ${p.bio ? `<p class="bio">${escHtml(p.bio)}</p>` : ''}
      <div class="count">${p.cardCount} card${p.cardCount === 1 ? '' : 's'} on show</div>
    </div>
    <div>${reactionBar(profileTarget, counts, 'lg')}</div>
  </div>
</div></section>

${tools}

<div class="wrap">
  <div class="noresult" id="noresult" hidden>No cards match that. <button class="chip" id="reset" type="button">Show everything</button></div>
  ${p.cards.length
    ? `<div class="grid" id="grid">${cards}</div>`
    : `<div class="empty">This collector has not put any cards on show yet.</div>`}
  ${p.hasMore ? `<div class="more" id="more">
    <button class="chip" id="more-btn" type="button">Show more cards</button>
    <div class="more-n" id="more-n">${p.returned} of ${p.cardCount}</div>
  </div>` : ''}

  <section class="cta">
    <h2>Your cards deserve this too</h2>
    <p>Scan a card and it is in your vault in seconds. Free to start.</p>
    <a class="btn" href="https://app.myvaults.io/?ref=${escHtml(p.uid)}">Start your own vault</a>
  </section>
</div>

<footer class="site"><div class="wrap" style="display:flex;justify-content:space-between;width:100%;gap:14px;flex-wrap:wrap">
  <span>&copy; ${new Date().getFullYear()} The Vault</span>
  <span>
    <a href="https://www.myvaults.io/terms">Terms</a> &middot;
    <a href="https://www.myvaults.io/privacy-policy">Privacy</a> &middot;
    <a href="mailto:hello@myvaults.io?subject=Report%20profile%20${escHtml(p.handle)}">Report this profile</a>
  </span>
</div></footer>

${authSheetHtml({
  heading: 'Join The Vault',
  sub: 'Free, and you get your own vault to fill.',
  fyi: 'The collector will see that you reacted.',
})}
<div class="toast" id="toast"></div>


<script>
window.__VAULT_HANDLE = ${JSON.stringify(p.handle)};
window.__VAULT_TOTAL  = ${JSON.stringify(p.cardCount)};
</script>

<script>
(function () {
  var API = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)
    ? location.origin
    : 'https://app.myvaults.io';
  var q = document.getElementById('q');
  if (!q) return;                       // small collections get no filter bar
  var chipBox  = document.getElementById('chips');
  var shown    = document.getElementById('shown');
  var noresult = document.getElementById('noresult');
  var clr      = document.getElementById('clr');
  var reset    = document.getElementById('reset');
  var grid     = document.getElementById('grid');
  var more     = document.getElementById('more');
  var moreBtn  = document.getElementById('more-btn');
  var moreN    = document.getElementById('more-n');
  var cards    = [].slice.call(document.querySelectorAll('.card'));
  var cat = '', term = '';

  // The page ships a first slice. HANDLE/TOTAL are written in by the server.
  var HANDLE   = window.__VAULT_HANDLE;
  var TOTAL    = window.__VAULT_TOTAL;
  var loading  = false;
  var done     = !more;

  function refreshCards() { cards = [].slice.call(document.querySelectorAll('.card')); }

  // Fetch one more page and append the markup the server rendered for it, so
  // the card template lives in one place.
  function loadNext() {
    if (loading || done) return Promise.resolve();
    loading = true;
    if (moreBtn) moreBtn.textContent = 'Loading...';
    return fetch(API + '/api/profile-cards?handle=' + encodeURIComponent(HANDLE) +
                 '&offset=' + cards.length + '&limit=120&format=html')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !j.html) { done = true; return; }
        grid.insertAdjacentHTML('beforeend', j.html);
        refreshCards();
        done = !j.hasMore;
        if (moreN) moreN.textContent = cards.length + ' of ' + TOTAL;
        if (done && more) more.hidden = true;
        // New bars need their counts, their own-reaction state and their taps.
        if (window.__vaultBindReactions) window.__vaultBindReactions();
        apply(false);
      })
      .catch(function () { done = true; })
      .finally(function () {
        loading = false;
        if (moreBtn) moreBtn.textContent = 'Show more cards';
      });
  }

  // Filtering a partly loaded collection would quietly search a subset, so pull
  // everything in first and say so while it happens.
  function loadAll() {
    if (done) return Promise.resolve();
    if (moreN) moreN.textContent = 'Loading the rest of the collection...';
    return loadNext().then(function () { return loadAll(); });
  }

  if (moreBtn) moreBtn.addEventListener('click', function () { loadNext(); });

  // Auto-load as the sentinel comes into view; the button stays as a fallback
  // for browsers without IntersectionObserver.
  if (more && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      if (entries.some(function (e) { return e.isIntersecting; })) loadNext();
    }, { rootMargin: '600px' }).observe(more);
  }

  function apply(push) {
    var needle = term.trim().toLowerCase();
    var n = 0;
    for (var i = 0; i < cards.length; i++) {
      var el = cards[i];
      var ok = (!cat || el.getAttribute('data-cat') === cat) &&
               (!needle || el.getAttribute('data-q').indexOf(needle) !== -1);
      el.classList.toggle('hide', !ok);
      if (ok) n++;
    }
    var filtered = cat || needle;
    shown.textContent = filtered
      ? 'Showing ' + n + ' of ' + TOTAL + ' cards'
      : '';
    noresult.hidden = n !== 0;
    clr.hidden = !term;

    // Keep the address bar in step so a filtered view can be shared as a link.
    if (push) {
      var u = new URL(location.href);
      cat ? u.searchParams.set('cat', cat) : u.searchParams.delete('cat');
      term ? u.searchParams.set('q', term) : u.searchParams.delete('q');
      history.replaceState({}, '', u);
    }
  }

  function setCat(v) {
    cat = v;
    var all = chipBox.querySelectorAll('.chip');
    for (var i = 0; i < all.length; i++) {
      var on = all[i].getAttribute('data-cat') === v;
      all[i].classList.toggle('on', on);
      all[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  chipBox.addEventListener('click', function (e) {
    var b = e.target.closest('.chip');
    if (!b) return;
    setCat(b.getAttribute('data-cat') || '');
    apply(true);
    loadAll().then(function () { apply(false); });
  });

  var t;
  q.addEventListener('input', function () {
    term = q.value;
    clearTimeout(t);
    t = setTimeout(function () {
      apply(true);
      if (term) loadAll().then(function () { apply(false); });
    }, 120);
  });

  clr.addEventListener('click', function () { q.value = ''; term = ''; q.focus(); apply(true); });
  if (reset) reset.addEventListener('click', function () {
    q.value = ''; term = ''; setCat(''); apply(true);
  });

  // Restore a shared link's filters.
  var sp = new URLSearchParams(location.search);
  var c0 = sp.get('cat') || '';
  if (c0 && chipBox.querySelector('.chip[data-cat="' + c0.replace(/"/g, '') + '"]')) setCat(c0);
  term = sp.get('q') || '';
  q.value = term;
  apply(false);
})();
</script>
${authSheetJs({ cfg, owner: p.uid })}
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

  const handle = String(req.query.handle || '').trim().toLowerCase();

  try {
    // Render a first page only. The rest arrives from /api/profile-cards, which
    // keeps the document small and the time-to-first-card flat no matter how
    // large the collection is.
    const p = await loadPublicProfile(handle, {
      // ?limit= is honoured only on localhost, so paging can be exercised
      // against a small collection without exposing a knob that lets anyone
      // ask production for an enormous page.
      limit: (/^(localhost|127\.0\.0\.1)/.test(req.headers.host || '') && Number(req.query.limit))
        || FIRST_PAGE,
    });
    if (!p) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=60');
      return res.status(404).send(notFoundPage());
    }

    const token = await googleToken();
    const targets = [`profile_${p.uid}`, ...p.cards.map(c => `card_${p.uid}_${c.id}`)];
    const counts = await countsFor(targets, token);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    // Short cache: reaction counts are baked into the HTML, so a long TTL would
    // show stale numbers to everyone who is not the person who just tapped.
    res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=300');
    return res.status(200).send(page(p, counts, firebaseConfig()));
  } catch (e) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(500).send(notFoundPage());
  }
}
