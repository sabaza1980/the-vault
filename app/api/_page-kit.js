/**
 * Shared furniture for the two server-rendered public pages: a collector's
 * profile at /u/<handle>, and the feed at /.
 *
 * Vercel ignores /api files starting with "_", so this is a module, not a route.
 *
 * Both need the same three reactions, the same sign-up sheet when a signed-out
 * visitor taps one, and the same replay that applies the reaction once the
 * account exists. One copy, because a second copy of a sign-up flow drifts and
 * the half that drifts is the one nobody is looking at.
 *
 * Each page supplies its own sheet copy: "react to this card" and "join the
 * collectors below" are different invitations.
 */

export const BRAND = {
  ink: '#07070f', panel: '#0d0d1a', line: 'rgba(255,255,255,0.10)',
  orange: '#FF6B35', gold: '#F0C040', green: '#4CAF50',
  text: '#f0f0f0', muted: '#8a8a99',
};

export const EMOJI = [
  { key: 'heart', glyph: '\u2764\uFE0F', label: 'Love it' },
  { key: 'fire',  glyph: '\uD83D\uDD25', label: 'Fire' },
  { key: 'money', glyph: '\uD83D\uDCB0', label: 'Big money' },
];

export function firebaseConfig() {
  const cfg = {
    apiKey: process.env.VITE_FIREBASE_API_KEY || '',
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || '',
    projectId: process.env.VITE_FIREBASE_PROJECT_ID || '',
    appId: process.env.VITE_FIREBASE_APP_ID || '',
  };
  return cfg.apiKey && cfg.authDomain ? cfg : null;
}

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * The header, and it is the same one everywhere.
 *
 * The app, the feed and a public profile each grew their own: an emoji and a
 * gradient wordmark here, a logo and a marketing nav there, a bare text link on
 * a profile. Nothing carried you between them, so from inside the app there was
 * no way back to the feed at all.
 *
 * One bar now, in two states. Signed out it is the marketing header, because a
 * switch between places you do not have yet points at nothing. Signed in it is
 * a three-way switch — Feed, My Vault, My Profile — in the same order on every
 * surface. Inside the app the first two change the view in place; here they are
 * links. Same control, same order, wherever you are.
 */
export function siteHeaderCss() {
  return `
header.top{position:sticky;top:0;z-index:20;background:var(--head);backdrop-filter:blur(14px);border-bottom:1px solid var(--line)}
.top .wrap{display:flex;align-items:center;gap:12px;height:58px}
.logo{display:flex;align-items:center;gap:9px;text-decoration:none;flex:0 0 auto}
.logo img{width:22px;height:24px;display:block}
.wm{font-family:'Bebas Neue',sans-serif;font-size:18px;letter-spacing:1.6px;color:var(--t)}
.wm b{color:var(--or);font-weight:400}
.nav-out{display:none;gap:2px;flex:0 0 auto}
.nav-out a{font-size:13.5px;font-weight:600;color:var(--dim);text-decoration:none;padding:9px 7px}
.nav-out a:hover{color:var(--t)}
.spacer{flex:1}
.ghost{font-size:13px;font-weight:600;color:var(--dim);text-decoration:none;padding:9px 6px}
.cta{background:var(--or);color:#fff;font-size:12.5px;font-weight:700;text-decoration:none;border-radius:999px;padding:9px 15px;border:none;cursor:pointer;font-family:inherit}
.cta:hover{background:#ff8353}

/* The switch. One control, three destinations, same order on every surface. */
.sw{display:flex;gap:3px;background:var(--chip);border:1px solid var(--line);border-radius:999px;padding:3px;flex:0 0 auto}
.sw-b{display:flex;align-items:center;gap:6px;border:1px solid transparent;border-radius:999px;padding:7px 13px;color:var(--m);font-size:12px;font-weight:700;letter-spacing:.3px;text-decoration:none;white-space:nowrap}
.sw-b:hover{color:var(--t)}
.sw-b.on{background:rgba(255,107,53,.14);border-color:rgba(255,107,53,.38);color:var(--or)}
.sw-b svg{width:15px;height:15px;flex:0 0 auto}
.sw-b .short{display:none}
.bell{display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:999px;background:var(--chip);border:1px solid var(--line);color:var(--dim);flex:0 0 auto;text-decoration:none}
.bell:hover{color:var(--t)}
.me{display:flex;text-decoration:none;flex:0 0 auto}

/* Signed in, you should be able to see it — your own picture when Google gave
   us one, the first letter of your name when it did not. */
.av{width:30px;height:30px;border-radius:50%;flex:0 0 auto;display:flex;align-items:center;justify-content:center;background:var(--av);color:var(--dim);font-size:12px;font-weight:700;overflow:hidden}
.av img{width:100%;height:100%;object-fit:cover;display:block}

/* The account menu. An avatar you can click is what people expect; one that
   does nothing reads as broken. Same contents as the app's, minus the things
   that only make sense inside it. */
.me-box{position:relative;flex:0 0 auto}
.me-btn{background:none;border:none;padding:0;cursor:pointer;display:flex}
.me-scrim{position:fixed;inset:0;z-index:30}
.me-menu{position:absolute;top:calc(100% + 9px);right:0;min-width:218px;background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:6px;box-shadow:var(--shadow);z-index:40}
.me-menu[hidden],.me-scrim[hidden]{display:none}
.me-who{padding:8px 10px;border-bottom:1px solid var(--line);margin-bottom:4px}
.me-n{font-size:12.5px;font-weight:700;color:var(--t);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.me-e{font-size:10.5px;color:var(--m);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.me-menu a,.me-menu button{display:block;width:100%;box-sizing:border-box;text-align:left;background:none;border:none;border-radius:8px;padding:9px 10px;color:var(--dim);font-family:inherit;font-size:12.5px;font-weight:600;text-decoration:none;cursor:pointer}
.me-menu a:hover,.me-menu button:hover{background:var(--wash);color:var(--t)}
.me-sep{height:1px;background:var(--line);margin:5px 2px}
#me-out{color:var(--or)}

.out-only{display:flex;align-items:center;gap:4px}
.in-only{display:none;align-items:center;gap:8px}
body.in .out-only{display:none}
body.in .in-only{display:flex}

@media(min-width:900px){.nav-out{display:flex}}
@media(max-width:680px){
  .wm{display:none}
  .top .wrap{gap:8px}
  .sw-b{padding:7px 10px;font-size:11px}
  .sw-b .full{display:none}
  .sw-b .short{display:inline}
}`;
}

const SW_ICONS = {
  feed: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"></rect><path d="M6 20h12"></path><path d="M8.5 9.5h7"></path></svg>',
  vault: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.5 20.5 6.5v6.8c0 4.3-3.4 7.3-8.5 8.6-5.1-1.3-8.5-4.3-8.5-8.6V6.5z"></path><path d="M12 9v4"></path><circle cx="12" cy="16.2" r="0.6"></circle></svg>',
  me: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="3.6"></circle><path d="M4.8 20a7.4 7.4 0 0 1 14.4 0"></path></svg>',
};

const BELL_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7"></path><path d="M13.7 20a2 2 0 0 1-3.4 0"></path></svg>';

/**
 * `active` is 'feed', 'vault', 'me', or null when the page cannot know — a
 * profile you are only visiting is nobody's section. The client lights up
 * 'me' once it finds the handle belongs to the signed-in account.
 */
export function siteHeaderHtml({ active = null, feedHref = '/' } = {}) {
  const item = (key, href, full, short, id) =>
    `<a class="sw-b${active === key ? ' on' : ''}" href="${href}"${id ? ` id="${id}"` : ''}` +
    `${active === key ? ' aria-current="page"' : ''} aria-label="${full}">` +
    `${SW_ICONS[key]}<span class="full">${full}</span><span class="short">${short}</span></a>`;

  return `<header class="top"><div class="wrap">
  <a class="logo" href="${feedHref}"><img src="https://www.myvaults.io/brand/vault-mark_fullcolour_transparent.svg" alt=""/><span class="wm">THE <b>VAULT</b></span></a>
  <nav class="nav-out out-only" aria-label="About">
    <a href="https://www.myvaults.io/about">How it works</a>
    <a href="https://www.myvaults.io/blog">Blog</a>
  </nav>
  <nav class="sw in-only" aria-label="Sections">
    ${item('feed', feedHref, 'Feed', 'Feed')}
    ${item('vault', 'https://app.myvaults.io/?view=vault', 'My Vault', 'Vault')}
    ${item('me', '#', 'My Profile', 'Profile', 'sw-me')}
  </nav>
  <span class="spacer"></span>
  <span class="out-only">
    <a class="ghost" href="#" id="signin">Sign in</a>
    <a class="cta" href="#" id="start">Start free</a>
  </span>
  <span class="in-only">
    <a class="bell" href="https://app.myvaults.io/?notifications=1" aria-label="Your reactions">${BELL_ICON}</a>
    <span class="me-box">
      <button type="button" class="me-btn" id="me-btn" aria-haspopup="menu" aria-expanded="false" aria-label="Your account">
        <span class="av" id="me-av2" aria-hidden="true">·</span>
      </button>
      <div class="me-menu" id="me-menu" role="menu" hidden>
        <div class="me-who">
          <div class="me-n" id="me-name">Signed in</div>
          <div class="me-e" id="me-email"></div>
        </div>
        <a role="menuitem" id="me-link" href="#">View my profile</a>
        <a role="menuitem" href="https://app.myvaults.io/?view=vault">My vault</a>
        <a role="menuitem" href="https://app.myvaults.io/?profile=1">Public profile settings</a>
        <a role="menuitem" href="https://app.myvaults.io/?referral=1">Invite friends</a>
        <button type="button" role="menuitem" id="me-theme">Light mode</button>
        <div class="me-sep"></div>
        <a role="menuitem" href="https://www.myvaults.io/privacy-policy">Privacy policy</a>
        <a role="menuitem" href="https://www.myvaults.io/terms">Terms</a>
        <div class="me-sep"></div>
        <button type="button" role="menuitem" id="me-out">Sign out</button>
      </div>
    </span>
  </span>
  <div class="me-scrim" id="me-scrim" hidden></div>
</div></header>`;
}

export function reactionBar(target, counts, size) {
  const c = counts[target] || { heart: 0, fire: 0, money: 0 };
  const cls = size === 'lg' ? 'rx rx-lg' : 'rx';
  return `<div class="${cls}" data-target="${esc(target)}">` + EMOJI.map(e =>
    `<button type="button" class="rx-btn" data-emoji="${e.key}" aria-label="${e.label}">` +
    `<span class="rx-glyph">${e.glyph}</span>` +
    `<span class="rx-n" data-n="${e.key}">${c[e.key]}</span>` +
    `</button>`
  ).join('') + `</div>`;
}

/**
 * The sign-up sheet.
 *
 *   heading  what they are joining
 *   sub      why it is worth a minute
 *   fyi      the consequence of what they just tapped; omit for none
 */
export function authSheetHtml(copy = {}) {
  const heading = esc(copy.heading || 'Join The Vault');
  const sub = esc(copy.sub || 'Free, and you get your own vault to fill.');
  const fyiLine = copy.fyi === null ? '' : `<p class="fyi">${esc(copy.fyi || 'The collector will see that you reacted.')}</p>`;
  return `<div id="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-h">
  <div class="sheet-in">
    <h3 id="sheet-h">${heading}</h3>
    <p id="sheet-sub">${sub}</p>
    ${fyiLine}

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
</div>`;
}

/**
 * The client module: reactions, sign-in, and replaying a reaction tapped before
 * the account existed.
 *
 * `owner` is the uid whose cards these are, or null for a feed whose cards
 * belong to many people. The "you cannot react to your own cards" rule is
 * enforced server-side either way; this only saves a round trip.
 */
export function authSheetJs({ cfg, owner = null }) {
  const preamble = [
    'const CFG = ' + (cfg ? JSON.stringify(cfg) : 'null') + ';',
    '// In production these pages are served from www.myvaults.io while the',
    '// functions live on app.myvaults.io, so the API host has to be absolute.',
    '// Locally the dev server serves both, and pointing at production would',
    '// test the deployed code rather than the code being edited.',
    'const API = /^(localhost|127\\.0\\.0\\.1|\\[::1\\])$/.test(location.hostname)',
    "  ? location.origin",
    "  : 'https://app.myvaults.io';",
    'const OWNER = ' + JSON.stringify(owner) + ';',
  ].join('\n');
  return '<script type="module">\n' + preamble + '\n' + CLIENT_BODY + '\n</script>';
}

const CLIENT_BODY = `const PENDING = 'vault.pendingReaction';
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
window.__vaultBindReactions = () => { bindReactions(); syncReactions(); bindComments(); };
// Any page can raise the sheet from its own button — the feed's header
// 'Sign in' and 'Start free' both do. No pending reaction to replay, so it
// just opens.
window.__vaultOpenSheet = () => { document.getElementById('sheet').classList.add('open'); };

// A sign-in started on this page leaves the shared cookie stale for a moment:
// Firebase fires its auth listener the instant the credential lands, before the
// session has been published. A page that checks the cookie in that window
// reads "no session" and signs the person straight back out — the bug where a
// fresh login looked like it had not happened until you refreshed. Open the
// gate before signing in, wait on it before trusting the cookie.
let signInGate = null;
window.__vaultGateOpen = () => {
  if (signInGate) return;
  let release;
  const promise = new Promise(r => { release = r; });
  const g = { promise: promise, release: release };
  signInGate = g;
  // A gate that never closes would stop the cookie check working at all.
  setTimeout(() => { if (signInGate === g) window.__vaultGateClose(); }, 15000);
};
window.__vaultGateClose = () => {
  const g = signInGate; signInGate = null; if (g) g.release();
};
window.__vaultGateWait = () => (signInGate ? signInGate.promise : Promise.resolve());

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
  if (u) return u.getIdToken();
  // Firebase says nobody, but a session may still be arriving from the other
  // origin. Concluding "signed out" before that lands is what let a member tap
  // a reaction and get handed a sign-up sheet.
  if (window.__vaultAdopting) { try { await window.__vaultAdopting; } catch (e) {} }
  return a.currentUser ? a.currentUser.getIdToken() : null;
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
  // Publish the shared session so the app knows about this sign-in too. The
  // page that wants it sets this up; a page that does not simply has no hook.
  if (window.__vaultAfterSignIn) { try { await window.__vaultAfterSignIn(user); } catch {} }
  window.__vaultGateClose();

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
  window.__vaultGateOpen();
  try {
    await firebase();
    const cred = await signIn();
    const isNew = !!(cred._tokenResponse && cred._tokenResponse.isNewUser);
    await afterAuth(cred.user, isNew);
  } catch (e) {
    window.__vaultGateClose();
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
  window.__vaultGateOpen();
  try {
    await firebase();
    const cred = returning
      ? await fb.signInWithEmailAndPassword(auth, email, pw)
      : await fb.createUserWithEmailAndPassword(auth, email, pw);
    await afterAuth(cred.user, !returning);
  } catch (e) {
    window.__vaultGateClose();
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

// Paint the signed-in header. Your own picture when Google gave us one, the
// first letter of your name when it did not, and the link to your own public
// page. Every surface calls this with the same user, so the header can never
// disagree with itself about who you are.
window.__vaultPaintUser = (u) => {
  document.body.classList.toggle('in', !!u);
  myUid = u ? u.uid : null;
  if (!u) return;
  const letter = String(u.displayName || u.email || '?').trim().charAt(0).toUpperCase() || '?';
  const photo = typeof u.photoURL === 'string' && u.photoURL.indexOf('https://') === 0 ? u.photoURL : '';
  for (const id of ['me-av', 'me-av2']) {
    const el = document.getElementById(id);
    if (!el) continue;
    if (!photo) { el.textContent = letter; continue; }
    const img = document.createElement('img');
    img.alt = '';
    // Google's avatar host refuses a request that carries a referrer.
    img.referrerPolicy = 'no-referrer';
    // A picture that will not load must not leave an empty circle behind.
    img.addEventListener('error', () => { el.textContent = letter; });
    img.src = photo;
    el.textContent = '';
    el.appendChild(img);
  }
  const nameEl = document.getElementById('me-name');
  if (nameEl) nameEl.textContent = u.displayName || 'Signed in';
  const mailEl = document.getElementById('me-email');
  if (mailEl) mailEl.textContent = u.email || '';
  // Their own public page. Asking for it also assigns a handle to an account
  // that has none, which is what makes a new collector reachable at a URL.
  u.getIdToken().then(t => fetch(API + '/api/profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
    body: JSON.stringify({ ensure_handle: true }),
  })).then(r => (r && r.ok ? r.json() : null)).then(j => {
    if (!j || !j.handle) return;
    const href = 'https://www.myvaults.io/u/' + encodeURIComponent(j.handle);
    for (const id of ['me-link', 'sw-me']) {
      const a = document.getElementById(id);
      if (a) a.href = href;
    }
    // Standing on your own profile, the switch should say so.
    const me = document.getElementById('sw-me');
    if (me && location.pathname.toLowerCase() === '/u/' + String(j.handle).toLowerCase()) {
      me.classList.add('on');
      me.setAttribute('aria-current', 'page');
    }
  }).catch(() => {});
};

// Comments, folded away until asked for. The card is what people came for;
// a page of open threads is a wall of text.
const cesc = (t) => { const d = document.createElement('div'); d.textContent = String(t == null ? '' : t); return d.innerHTML; };

const cAgo = (iso) => {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (!isFinite(s) || s < 0) return '';
  if (s < 3600) return Math.max(1, Math.floor(s / 60)) + 'm';
  if (s < 86400) return Math.floor(s / 3600) + 'h';
  const d = Math.floor(s / 86400);
  if (d < 30) return d + 'd';
  if (d < 365) return Math.floor(d / 30) + 'mo';
  return Math.floor(d / 365) + 'y';
};

let myUid = null;
const ownerOf = (box) => {
  const art = box.closest('.post');
  return art ? art.getAttribute('data-owner') : null;
};

function cRow(c, box) {
  const gone = !!c.hidden;
  const canRemove = !gone && myUid && (c.uid === myUid || ownerOf(box) === myUid);
  return '<div class="cm' + (gone ? ' cm-gone' : '') + '" data-id="' + cesc(c.id) + '">' +
    '<span class="av" aria-hidden="true">' + (gone ? '·' : cesc(String(c.name || '?').trim().charAt(0).toUpperCase())) + '</span>' +
    '<div class="cm-b"><div class="cm-h">' + (gone ? 'Removed' : cesc(c.name)) +
    (!gone && c.handle ? '<span> @' + cesc(c.handle) + '</span>' : '') +
    '<span> · ' + cAgo(c.createdAt) + '</span></div>' +
    '<div class="cm-t">' + (gone ? 'This comment was removed.' : cesc(c.text)) + '</div></div>' +
    (canRemove ? '<button type="button" class="cm-x" aria-label="Remove this comment">Remove</button>' : '') +
    '</div>';
}

function cPaint(box, rows) {
  const list = rows.length
    ? rows.map(c => cRow(c, box)).join('')
    : '<div class="cnote">Nothing yet. Say the first thing.</div>';
  box.innerHTML = list +
    '<form class="cform"><input maxlength="1000" placeholder="Say something" aria-label="Your comment"/>' +
    '<button type="submit">Post</button></form><div class="cerr"></div>';
}

function cLabel(btn, n) {
  btn.textContent = n ? n + ' comment' + (n === 1 ? '' : 's') : 'Comment';
}

function bindComments() {
  document.querySelectorAll('.cbtn').forEach(btn => {
    if (btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    const box = btn.nextElementSibling;
    const entry = btn.dataset.entry;
    let rows = null;

    const refresh = () => {
      cPaint(box, rows || []);
      box.querySelector('.cform').addEventListener('submit', send);
      box.querySelectorAll('.cm-x').forEach(x =>
        x.addEventListener('click', () => remove(x.closest('.cm').dataset.id)));
    };

    async function load() {
      try {
        const r = await fetch(API + '/api/comments?entry=' + encodeURIComponent(entry));
        const j = await r.json();
        rows = Array.isArray(j.comments) ? j.comments : [];
      } catch { rows = []; }
      refresh();
    }

    async function send(ev) {
      ev.preventDefault();
      const input = box.querySelector('.cform input');
      const submit = box.querySelector('.cform button');
      const err = box.querySelector('.cerr');
      const text = input.value.trim();
      if (!text) return;
      err.textContent = '';
      const t = await token();
      if (!t) { window.__vaultOpenSheet(); return; }
      submit.disabled = true;
      try {
        const r = await fetch(API + '/api/comments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
          body: JSON.stringify({ entry: entry, text: text }),
        });
        const j = await r.json();
        // A 422 is the house rules answering, not a failure. It says which rule
        // and why, and the words stay in the box.
        if (!r.ok) { err.textContent = j.error || 'Could not post that'; return; }
        rows = (rows || []).concat([j.comment]);
        input.value = '';
        refresh();
        cLabel(btn, rows.filter(c => !c.hidden).length);
      } catch {
        err.textContent = 'Could not post that';
      } finally { submit.disabled = false; }
    }

    async function remove(id) {
      const t = await token();
      if (!t) return;
      try {
        await fetch(API + '/api/comments?entry=' + encodeURIComponent(entry) + '&id=' + encodeURIComponent(id),
          { method: 'DELETE', headers: { Authorization: 'Bearer ' + t } });
        rows = (rows || []).filter(c => c.id !== id);
        refresh();
        cLabel(btn, rows.length);
      } catch {}
    }

    btn.addEventListener('click', async () => {
      const opening = box.hidden;
      box.hidden = !opening;
      btn.setAttribute('aria-expanded', opening ? 'true' : 'false');
      if (opening && rows === null) { box.innerHTML = '<div class="cnote">Loading…</div>'; await load(); }
    });
  });
}
bindComments();
// The filter and the paging append posts after first paint.
window.__vaultBindComments = bindComments;

// Dark and light, kept in a cookie on the parent domain so the app and this
// site agree. The app writes the same cookie when you flip it there.
(function theme() {
  const btn = document.getElementById('me-theme');
  const current = () => document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  const label = () => { if (btn) btn.textContent = current() === 'light' ? 'Dark mode' : 'Light mode'; };
  label();
  if (!btn) return;
  btn.addEventListener('click', () => {
    const next = current() === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    try {
      const bits = ['__vault_theme=' + next, 'Path=/', 'SameSite=Lax', 'Max-Age=31536000'];
      if (location.hostname.indexOf('myvaults.io') >= 0) bits.push('Domain=.myvaults.io', 'Secure');
      document.cookie = bits.join('; ');
    } catch (e) {}
    label();
  });
})();

// The avatar opens the account menu.
(function accountMenu() {
  const btn = document.getElementById('me-btn');
  const menu = document.getElementById('me-menu');
  const scrim = document.getElementById('me-scrim');
  if (!btn || !menu) return;

  const close = () => {
    menu.hidden = true;
    if (scrim) scrim.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
  };
  const open = () => {
    menu.hidden = false;
    if (scrim) scrim.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
  };

  btn.addEventListener('click', (ev) => { ev.stopPropagation(); if (menu.hidden) open(); else close(); });
  if (scrim) scrim.addEventListener('click', close);
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') close(); });

  const out = document.getElementById('me-out');
  if (out) out.addEventListener('click', async () => {
    close();
    // Ending the shared session is what actually signs you out. Without it the
    // other origin hands this browser straight back in on the next page load.
    try { await fetch(API + '/api/session', { method: 'DELETE', credentials: 'include' }); } catch {}
    try {
      document.cookie = '__vault_in=; Path=/; Max-Age=0';
      document.cookie = '__vault_in=; Path=/; Max-Age=0; Domain=.myvaults.io';
    } catch {}
    try { const a = await firebase(); if (a && fb) await fb.signOut(a); } catch {}
    location.reload();
  });
})();

// Somebody may land back here already signed in, e.g. after a redirect.
if (CFG) {
  firebase().then(a => {
    if (!a) return;
    import('https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js').then(({ onAuthStateChanged }) => {
      onAuthStateChanged(a, u => { if (u) replayPending(); });
    });
  }).catch(() => {});
}

// A page that runs its own auth listener (the feed, which also adopts and
// verifies the shared session) paints the header itself. A page without one
// gets it here, so no surface has to repeat this.
if (CFG && !window.__VAULT_OWN_AUTH) {
  firebase().then(a => { if (a) whenAuthReady(a).then(u => window.__vaultPaintUser(u)); }).catch(() => {});
}`;
