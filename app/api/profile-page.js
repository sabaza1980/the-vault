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

function page(p, counts, cfg) {
  const profileTarget = `profile_${p.uid}`;
  const title = `${p.displayName} on The Vault`;
  const desc = p.bio
    ? p.bio
    : `${p.cardCount} card${p.cardCount === 1 ? '' : 's'} in ${p.displayName}'s vault. Take a look.`;
  const ogImage = p.cards.find(c => c.imageUrl)?.imageUrl || 'https://app.myvaults.io/the-vault-icon.png';
  const url = `https://www.myvaults.io/u/${p.handle}`;

  const cards = p.cards.map(c => {
    const badges = [
      c.isRookie ? '<span class="b b-rc">RC</span>' : '',
      c.hasAutograph ? '<span class="b b-au">AUTO</span>' : '',
      c.serialNumber ? `<span class="b b-sn">${escHtml(c.serialNumber)}</span>` : '',
      c.rarity && c.rarity !== 'Common' ? `<span class="b b-ra">${escHtml(c.rarity)}</span>` : '',
    ].join('');
    const meta = [c.year, c.brand, c.series].filter(Boolean).join(' ') || c.fullCardName || '';
    const val = p.showValues && c.estimatedValue
      ? `<div class="val">$${Number(c.estimatedValue).toFixed(2)}</div>` : '';
    const img = c.imageUrl
      ? `<img src="${escHtml(c.imageUrl)}" alt="${escHtml(c.playerName)}" loading="lazy"/>`
      : `<div class="noimg">No image</div>`;
    return `<article class="card">
      <div class="shot">${img}</div>
      <div class="body">
        <div class="set">${escHtml(meta)}</div>
        <h3>${escHtml(c.playerName || 'Unknown')}</h3>
        ${c.team ? `<div class="team">${escHtml(c.team)}</div>` : ''}
        ${badges ? `<div class="badges">${badges}</div>` : ''}
        ${val}
        ${reactionBar(`card_${p.uid}_${c.id}`, counts)}
      </div>
    </article>`;
  }).join('\n');

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

<div class="wrap">
  ${p.cards.length
    ? `<div class="grid">${cards}</div>`
    : `<div class="empty">This collector has not put any cards on show yet.</div>`}

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
    <h3 id="sheet-h">Create a free account to react</h3>
    <p>You will also get your own vault to fill.</p>
    <button class="btn" id="sheet-go" type="button">Continue with Google</button>
    <button class="sheet-x" id="sheet-cancel" type="button">Not now</button>
  </div>
</div>
<div class="toast" id="toast"></div>

<script type="module">
const CFG = ${cfg ? JSON.stringify(cfg) : 'null'};
const API = 'https://app.myvaults.io';
const OWNER = ${JSON.stringify(p.uid)};
const PENDING = 'vault.pendingReaction';
const MINE = 'vault.myReactions';

const toast = (msg) => {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2600);
};

// The server renders counts but cannot know what this viewer already gave, so
// their own toggles are remembered per device. The server stays authoritative
// for the numbers.
const mine = (() => { try { return JSON.parse(localStorage.getItem(MINE) || '{}'); } catch { return {}; } })();
const saveMine = () => { try { localStorage.setItem(MINE, JSON.stringify(mine)); } catch {} };
const markMine = (target, emoji, on) => {
  mine[target] = mine[target] || {}; mine[target][emoji] = on; saveMine();
};

document.querySelectorAll('.rx').forEach(bar => {
  const target = bar.dataset.target;
  bar.querySelectorAll('.rx-btn').forEach(btn => {
    if (mine[target] && mine[target][btn.dataset.emoji]) btn.classList.add('on');
    btn.addEventListener('click', () => react(target, btn));
  });
});

let auth = null, signIn = null;
async function firebase() {
  if (auth || !CFG) return auth;
  const [{ initializeApp }, fbAuth] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js'),
  ]);
  const app = initializeApp(CFG);
  auth = fbAuth.getAuth(app);
  signIn = () => fbAuth.signInWithPopup(auth, new fbAuth.GoogleAuthProvider());
  return auth;
}

async function token() {
  const a = await firebase();
  return a && a.currentUser ? a.currentUser.getIdToken() : null;
}

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

document.getElementById('sheet-cancel').addEventListener('click', () => {
  sessionStorage.removeItem(PENDING);
  document.getElementById('sheet').classList.remove('open');
});

document.getElementById('sheet-go').addEventListener('click', async () => {
  try {
    await firebase();
    const cred = await signIn();
    // Credit the collector whose profile brought this person in.
    try {
      await fetch(API + '/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (await cred.user.getIdToken()) },
        body: JSON.stringify({ referral_source_hint: OWNER }),
      });
    } catch {}
    document.getElementById('sheet').classList.remove('open');
    await replayPending();
  } catch {
    toast('Sign in did not complete');
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
    const p = await loadPublicProfile(handle);
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
