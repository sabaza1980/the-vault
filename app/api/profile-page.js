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

const BRAND = {
  ink: '#07070f', panel: '#0d0d1a', line: 'rgba(255,255,255,0.10)',
  orange: '#FF6B35', gold: '#F0C040', green: '#4CAF50',
  text: '#f0f0f0', muted: '#8a8a99',
};

const EMOJI = [
  { key: 'heart', glyph: '❤️', label: 'Love it' },
  { key: 'fire',  glyph: '🔥', label: 'Fire' },
  { key: 'money', glyph: '💰', label: 'Big money' },
];

function firebaseConfig() {
  const cfg = {
    apiKey: process.env.VITE_FIREBASE_API_KEY || '',
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || '',
    projectId: process.env.VITE_FIREBASE_PROJECT_ID || '',
    appId: process.env.VITE_FIREBASE_APP_ID || '',
  };
  return cfg.apiKey && cfg.authDomain ? cfg : null;
}

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

function reactionBar(target, counts, size) {
  const c = counts[target] || { heart: 0, fire: 0, money: 0 };
  const cls = size === 'lg' ? 'rx rx-lg' : 'rx';
  return `<div class="${cls}" data-target="${escHtml(target)}">` + EMOJI.map(e =>
    `<button type="button" class="rx-btn" data-emoji="${e.key}" aria-label="${e.label}">` +
    `<span class="rx-glyph">${e.glyph}</span>` +
    `<span class="rx-n" data-n="${e.key}">${c[e.key]}</span>` +
    `</button>`
  ).join('') + `</div>`;
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
      <div class="shot">${img}</div>
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
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Barlow+Condensed:wght@600;700&family=Barlow:wght@400;600&display=swap" rel="stylesheet"/>
<style>
  *{box-sizing:border-box}
  body{margin:0;background:${BRAND.ink};color:${BRAND.text};
       font-family:Barlow,system-ui,-apple-system,sans-serif;line-height:1.5}
  a{color:inherit}
  .wrap{max-width:1100px;margin:0 auto;padding:0 20px}
  header.site{border-bottom:1px solid ${BRAND.line};padding:18px 0}
  .brand{font-family:'Playfair Display',Georgia,serif;font-size:26px;text-decoration:none;letter-spacing:.5px}
  .brand .o{color:${BRAND.orange}}
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

<header class="site"><div class="wrap">
  <a class="brand" href="https://www.myvaults.io">The <span class="o">Vault</span></a>
</div></header>

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

<div id="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-h">
  <div class="sheet-in">
    <h3 id="sheet-h">Join The Vault</h3>
    <p id="sheet-sub">Free, and you get your own vault to fill.</p>
    <p class="fyi">The collector will see that you reacted.</p>

    <div class="seg" role="tablist">
      <button class="seg-b on" id="tab-new"  type="button" role="tab" aria-selected="true">Create account</button>
      <button class="seg-b"    id="tab-back" type="button" role="tab" aria-selected="false">I have one</button>
    </div>

    <button class="btn-g" id="sheet-go" type="button">
      <svg viewBox="0 0 48 48" aria-hidden="true" width="18" height="18">
        <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.2-.4-4.7H24v8.9h11.8c-.5 2.7-2 5-4.4 6.6v5.5h7.1c4.2-3.8 6.6-9.5 6.6-16.3z"/>
        <path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.2l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.5v5.7C8.1 41.3 15.5 46 24 46z"/>
        <path fill="#FBBC05" d="M11.8 28.4c-.4-1.3-.7-2.700-.7-4.4s.3-3.1.7-4.4v-5.7H4.5C2.9 17.1 2 20.4 2 24s.9 6.9 2.5 10.1l7.3-5.7z"/>
        <path fill="#EA4335" d="M24 10.8c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.3 29.9 2 24 2 15.5 2 8.1 6.7 4.5 13.9l7.3 5.7c1.7-5.2 6.5-9 12.2-9z"/>
      </svg>
      Continue with Google
    </button>

    <div class="or"><span>or</span></div>

    <form id="sheet-form" novalidate>
      <label class="vh" for="em">Email</label>
      <input id="em" type="email" inputmode="email" autocomplete="email" placeholder="you@email.com" required/>
      <label class="vh" for="pw">Password</label>
      <input id="pw" type="password" autocomplete="current-password" placeholder="Password" minlength="6" required/>
      <div class="err" id="sheet-err" role="alert"></div>
      <button class="btn" id="sheet-submit" type="submit">Create account</button>
    </form>

    <button class="lnk" id="sheet-forgot" type="button" hidden>Forgot your password?</button>

    <a class="play" href="https://play.google.com/store/apps/details?id=com.thevault.app" target="_blank" rel="noopener">
      <svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16"><path fill="#00D4FF" d="M3.6 1.8 13 11.2l-9.4 9.4a2 2 0 0 1-.6-1.4V3.2c0-.5.2-1 .6-1.4z"/><path fill="#FFCE00" d="m17.3 7.5 3.3 1.8c1.2.7 1.2 2.7 0 3.4l-3.3 1.8-3.4-3.3z"/><path fill="#00F076" d="M3.6 1.8c.5-.4 1.2-.5 1.8-.2l11.9 5.9-3.4 3.7z"/><path fill="#F63448" d="m13.9 12.8 3.4 3.7-11.9 5.9c-.6.3-1.3.2-1.8-.2z"/></svg>
      Get it on Google Play
    </a>

    <button class="sheet-x" id="sheet-cancel" type="button">Not now</button>
  </div>
</div>
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
<script type="module">
const CFG = ${cfg ? JSON.stringify(cfg) : 'null'};
// In production this page is served from www.myvaults.io while the functions
// live on app.myvaults.io, so the API host has to be absolute. Running locally,
// the dev server serves both, and pointing at production would test the
// deployed code rather than the code being edited.
const API = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)
  ? location.origin
  : 'https://app.myvaults.io';
const OWNER = ${JSON.stringify(p.uid)};
const PENDING = 'vault.pendingReaction';
const MINE = 'vault.myReactions';

const toast = (msg) => {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2600);
};

// localStorage gives an instant first paint, but it is per device and per
// origin, so it is only a hint. Once auth resolves we ask the server which
// reactions this account actually gave and reconcile. The server is the truth.
const mine = (() => { try { return JSON.parse(localStorage.getItem(MINE) || '{}'); } catch { return {}; } })();
const saveMine = () => { try { localStorage.setItem(MINE, JSON.stringify(mine)); } catch {} };
const markMine = (target, emoji, on) => {
  mine[target] = mine[target] || {}; mine[target][emoji] = on; saveMine();
};

function bindReactions() {
  document.querySelectorAll('.rx').forEach(bar => {
    if (bar.dataset.bound === '1') return;      // appended pages re-run this
    bar.dataset.bound = '1';
    const target = bar.dataset.target;
    bar.querySelectorAll('.rx-btn').forEach(btn => {
      if (mine[target] && mine[target][btn.dataset.emoji]) btn.classList.add('on');
      btn.addEventListener('click', () => react(target, btn));
    });
  });
}
bindReactions();
// The filter script appends cards after first paint and calls this to wire them.
window.__vaultBindReactions = () => { bindReactions(); syncReactions(); };

let auth = null, signIn = null, authReady = null, fb = null;
async function firebase() {
  if (auth || !CFG) return auth;
  const [{ initializeApp }, fbAuth] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js'),
  ]);
  const app = initializeApp(CFG);
  auth = fbAuth.getAuth(app);
  fb = fbAuth;
  signIn = () => fbAuth.signInWithPopup(auth, new fbAuth.GoogleAuthProvider());
  return auth;
}

// currentUser is null for a moment after getAuth() while the SDK restores the
// session from storage, so waiting on the first auth callback is the difference
// between "signed out" and "not resolved yet".
function whenAuthReady(a) {
  if (authReady) return authReady;
  authReady = new Promise(resolve => {
    let done = false;
    const stop = a.onAuthStateChanged(u => {
      if (done) return;
      done = true;
      try { stop(); } catch {}
      resolve(u || null);
    });
    setTimeout(() => { if (!done) { done = true; resolve(a.currentUser || null); } }, 6000);
  });
  return authReady;
}

async function token() {
  const a = await firebase();
  if (!a) return null;
  if (a.currentUser) return a.currentUser.getIdToken();
  const u = await whenAuthReady(a);
  return u ? u.getIdToken() : null;
}

// Pull the real counts and this viewer's own reactions, then repaint. Runs on
// load so a like survives a refresh, another device, or a cleared cache.
async function syncReactions() {
  const bars = [...document.querySelectorAll('.rx')];
  if (!bars.length) return;
  const targets = bars.map(b => b.dataset.target);
  let t = null;
  try { t = await token(); } catch {}
  try {
    const r = await fetch(API + '/api/react?targets=' + encodeURIComponent(targets.join(',')),
      t ? { headers: { Authorization: 'Bearer ' + t } } : undefined);
    if (!r.ok) return;
    const j = await r.json();
    for (const bar of bars) {
      const target = bar.dataset.target;
      const c = j.counts && j.counts[target];
      const m = j.mine && j.mine[target];
      for (const k of ['heart', 'fire', 'money']) {
        if (c) {
          const el = bar.querySelector('[data-n="' + k + '"]');
          if (el) el.textContent = c[k];
        }
        if (m) {
          const b = bar.querySelector('[data-emoji="' + k + '"]');
          if (b) b.classList.toggle('on', !!m[k]);
          markMine(target, k, !!m[k]);
        }
      }
    }
  } catch {}
}

if (CFG) syncReactions();

async function react(target, btn) {
  const emoji = btn.dataset.emoji;
  if (!CFG) { location.href = 'https://app.myvaults.io'; return; }

  const t = await token();
  if (!t) {
    // Hold the tap across sign-in. Losing it here would waste the whole point
    // of asking someone to make an account.
    sessionStorage.setItem(PENDING, JSON.stringify({ target, emoji }));
    document.getElementById('sheet').classList.add('open');
    return;
  }
  await send(target, emoji, btn, t);
}

async function send(target, emoji, btn, t) {
  // Optimistic: reactions have to feel instant or nobody taps a second one.
  const n = btn.querySelector('.rx-n');
  const turningOn = !btn.classList.contains('on');
  btn.classList.toggle('on', turningOn);
  btn.classList.remove('pop'); void btn.offsetWidth; if (turningOn) btn.classList.add('pop');
  n.textContent = Math.max(0, Number(n.textContent || 0) + (turningOn ? 1 : -1));

  try {
    const r = await fetch(API + '/api/react', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
      body: JSON.stringify({ target, emoji }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Failed');
    const bar = btn.closest('.rx');
    for (const k of ['heart', 'fire', 'money']) {
      const el = bar.querySelector('[data-n="' + k + '"]');
      if (el) el.textContent = j.counts[k];
      const b = bar.querySelector('[data-emoji="' + k + '"]');
      if (b) b.classList.toggle('on', !!(j.mine && j.mine[k]));
      markMine(target, k, !!(j.mine && j.mine[k]));
    }
  } catch (e) {
    btn.classList.toggle('on', !turningOn);
    n.textContent = Math.max(0, Number(n.textContent || 0) + (turningOn ? -1 : 1));
    toast(e.message === 'You cannot react to your own cards' ? e.message : 'Could not save that, try again');
  }
}

const sheet = document.getElementById('sheet');
const errBox = document.getElementById('sheet-err');
const emailEl = document.getElementById('em');
const pwEl = document.getElementById('pw');
const submitEl = document.getElementById('sheet-submit');
const forgotEl = document.getElementById('sheet-forgot');
const tabNew = document.getElementById('tab-new');
const tabBack = document.getElementById('tab-back');
let returning = false;

function setMode(back) {
  returning = back;
  tabBack.classList.toggle('on', back);
  tabNew.classList.toggle('on', !back);
  tabBack.setAttribute('aria-selected', back ? 'true' : 'false');
  tabNew.setAttribute('aria-selected', back ? 'false' : 'true');
  document.getElementById('sheet-h').textContent = back ? 'Welcome back' : 'Join The Vault';
  document.getElementById('sheet-sub').textContent = back
    ? 'Sign in and your reaction goes through.'
    : 'Free, and you get your own vault to fill.';
  submitEl.textContent = back ? 'Sign in' : 'Create account';
  pwEl.setAttribute('autocomplete', back ? 'current-password' : 'new-password');
  forgotEl.hidden = !back;
  errBox.textContent = '';
}
tabNew.addEventListener('click', () => setMode(false));
tabBack.addEventListener('click', () => setMode(true));
// Run once so the markup and the mode agree from the start; without this the
// password field asks browsers to autofill an existing password on the
// create-account tab.
setMode(false);

document.getElementById('sheet-cancel').addEventListener('click', () => {
  sessionStorage.removeItem(PENDING);
  sheet.classList.remove('open');
});

// Firebase error codes are not for reading aloud.
function humanError(code, msg) {
  const m = {
    'auth/invalid-email': 'That email does not look right.',
    'auth/missing-password': 'Enter a password.',
    'auth/weak-password': 'Use at least six characters.',
    'auth/email-already-in-use': 'That email already has a vault. Switch to "I have one".',
    'auth/invalid-credential': 'That email and password do not match.',
    'auth/wrong-password': 'That email and password do not match.',
    'auth/user-not-found': 'No vault with that email yet. Create one instead.',
    'auth/too-many-requests': 'Too many tries. Wait a moment and try again.',
    'auth/popup-closed-by-user': 'Sign in did not complete.',
    'auth/popup-blocked': 'Your browser blocked the popup. Allow it, or use email instead.',
    'auth/operation-not-allowed': 'Email sign-in is not enabled for this project yet.',
  };
  return m[code] || msg || 'Something went wrong. Try again.';
}

// Everything that has to happen once someone is actually signed in.
async function afterAuth(user, isNew) {
  if (isNew) {
    // Credit the collector whose profile brought this person in.
    try {
      await fetch(API + '/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (await user.getIdToken()) },
        body: JSON.stringify({ referral_source_hint: OWNER }),
      });
    } catch {}
  }
  sheet.classList.remove('open');
  await replayPending();
  syncReactions();
}

document.getElementById('sheet-go').addEventListener('click', async () => {
  errBox.textContent = '';
  try {
    await firebase();
    const cred = await signIn();
    const isNew = !!(cred._tokenResponse && cred._tokenResponse.isNewUser);
    await afterAuth(cred.user, isNew);
  } catch (e) {
    errBox.textContent = humanError(e && e.code, e && e.message);
  }
});

document.getElementById('sheet-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  errBox.textContent = '';
  const email = emailEl.value.trim();
  const pw = pwEl.value;
  if (!email || !pw) { errBox.textContent = 'Enter your email and a password.'; return; }
  if (!returning && pw.length < 6) { errBox.textContent = 'Use at least six characters.'; return; }

  submitEl.disabled = true;
  const label = submitEl.textContent;
  submitEl.textContent = returning ? 'Signing in...' : 'Creating...';
  try {
    await firebase();
    const cred = returning
      ? await fb.signInWithEmailAndPassword(auth, email, pw)
      : await fb.createUserWithEmailAndPassword(auth, email, pw);
    await afterAuth(cred.user, !returning);
  } catch (e) {
    const code = e && e.code;
    // Firebase collapses "wrong password" and "no such user" into one code, so
    // point people at the other tab when that is the likely cause.
    if (!returning && code === 'auth/email-already-in-use') setMode(true);
    errBox.textContent = humanError(code, e && e.message);
  } finally {
    submitEl.disabled = false;
    submitEl.textContent = label;
  }
});

forgotEl.addEventListener('click', async () => {
  const email = emailEl.value.trim();
  if (!email) { errBox.textContent = 'Enter your email first, then tap this again.'; return; }
  try {
    await firebase();
    await fb.sendPasswordResetEmail(auth, email);
    errBox.textContent = '';
    toast('Reset link sent. Check your email.');
  } catch (e) {
    errBox.textContent = humanError(e && e.code, e && e.message);
  }
});

async function replayPending() {
  let pending = null;
  try { pending = JSON.parse(sessionStorage.getItem(PENDING) || 'null'); } catch {}
  if (!pending) return;
  sessionStorage.removeItem(PENDING);
  const bar = document.querySelector('.rx[data-target="' + CSS.escape(pending.target) + '"]');
  const btn = bar && bar.querySelector('[data-emoji="' + pending.emoji + '"]');
  const t = await token();
  if (btn && t) {
    btn.scrollIntoView({ block: 'center', behavior: 'smooth' });
    await send(pending.target, pending.emoji, btn, t);
    toast('Reaction saved');
  }
}

// Somebody may land back here already signed in, e.g. after a redirect.
if (CFG) {
  firebase().then(a => {
    if (!a) return;
    import('https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js').then(({ onAuthStateChanged }) => {
      onAuthStateChanged(a, u => { if (u) replayPending(); });
    });
  }).catch(() => {});
}
</script>
</body></html>`;
}

export default async function handler(req, res) {
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
