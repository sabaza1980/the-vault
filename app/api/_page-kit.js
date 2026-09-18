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
window.__vaultBindReactions = () => { bindReactions(); syncReactions(); };
// Any page can raise the sheet from its own button — the feed's header
// 'Sign in' and 'Start free' both do. No pending reaction to replay, so it
// just opens.
window.__vaultOpenSheet = () => { document.getElementById('sheet').classList.add('open'); };

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
  // Publish the shared session so the app knows about this sign-in too. The
  // page that wants it sets this up; a page that does not simply has no hook.
  if (window.__vaultAfterSignIn) { try { await window.__vaultAfterSignIn(user); } catch {} }

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
}`;
