/**
 * Local dev server: the SPA *and* the /api functions, with production routing.
 *
 * `vite` alone only serves the React app. Everything under /api is a Vercel
 * serverless function, and /u/<handle> is a rewrite to one of them, so the
 * public profile page simply does not exist locally. That makes profiles,
 * reactions and the auth modal untestable without deploying.
 *
 * This runs both:
 *   - /api/<name>            → api/<name>.js default export
 *   - /u/<handle>            → api/profile-page.js?handle=<handle>
 *   - /privacy-policy, /terms, /delete-account, /blog → ../website/*.html
 *   - everything else        → proxied to Vite
 *
 * Start it with:  npm run dev:full      then open http://localhost:3000
 *
 * The route table below mirrors the root vercel.json. If you add a rewrite
 * there, add it here too, or local and production will disagree.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));      // app/scripts
const APP = path.resolve(ROOT, '..');                            // app
const WEBSITE = path.resolve(APP, '..', 'website');
const PORT = Number(process.env.PORT || 3000);
const VITE_PORT = Number(process.env.VITE_PORT || 5173);

// ── env ──────────────────────────────────────────────────────────────────────
// Use Node's own .env parser. Hand-rolled line-by-line parsing breaks on the
// service-account JSON, which is a multi-line quoted value: anything that reads
// the file a line at a time silently truncates the private key.
function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  try {
    process.loadEnvFile(file);              // Node >= 20.12
  } catch (e) {
    if (e && e.code === 'ERR_INVALID_ARG_TYPE') throw e;
    console.warn(`  Could not parse ${path.basename(file)}: ${e.message}`);
  }
}
loadEnv(path.join(APP, '.env.local'));
loadEnv(path.join(APP, '.env'));

// A service-account JSON does not survive a .env file. It is multi-line and full
// of double quotes, so `vercel env pull` writes it wrapped in quotes without
// escaping the inner ones and every parser stops at the first "type". Read it
// from a file instead, and only fall back to the env var.
//
// Put the JSON you download from the Firebase console at:
//   app/.secrets/service-account.json        (gitignored, local only)
// Production is unaffected: Vercel holds the value correctly in its own store.
const SA_FILE = path.join(APP, '.secrets', 'service-account.json');
if (fs.existsSync(SA_FILE)) {
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON = fs.readFileSync(SA_FILE, 'utf8');
}

try {
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '{}');
  if (!sa.client_email || !sa.private_key) throw new Error('missing client_email or private_key');
  if (!String(sa.private_key).includes('BEGIN PRIVATE KEY')) throw new Error('private_key is not a PEM key');
  console.log(`  service account: ${sa.project_id} (${fs.existsSync(SA_FILE) ? '.secrets/service-account.json' : 'env var'})`);
} catch (e) {
  console.error('\n  No usable Firebase service account. ' + e.message);
  console.error('  Anything touching Firestore (profiles, reactions) will return 500.');
  console.error('  Fix: download a service-account key from the Firebase console and save it as');
  console.error('       app/.secrets/service-account.json');
  console.error('  Do NOT use `vercel env pull` for this value; the .env format mangles it.\n');
}

// ── the Vercel request/response shim ────────────────────────────────────────
function makeRes(res) {
  let code = 200;
  return {
    setHeader: (k, v) => res.setHeader(k, v),
    status(c) { code = c; return this; },
    json(o) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(o)); return this; },
    send(b) {
      if (!res.getHeader('Content-Type')) {
        res.setHeader('Content-Type', typeof b === 'string' && b.startsWith('<')
          ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8');
      }
      res.writeHead(code); res.end(b); return this;
    },
    end() { res.writeHead(code); res.end(); return this; },
  };
}

const readBody = (req) => new Promise(resolve => {
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
});

async function runFunction(name, req, res, url, extraQuery = {}) {
  const file = path.join(APP, 'api', name + '.js');
  if (!fs.existsSync(file)) { res.writeHead(404); res.end('No such function: ' + name); return; }

  // Cache-bust so edits are picked up without restarting the server.
  const mod = await import(pathToFileURL(file).href + '?t=' + fs.statSync(file).mtimeMs);
  const handler = mod.default;
  if (typeof handler !== 'function') { res.writeHead(500); res.end('No default export in ' + name); return; }

  const query = { ...Object.fromEntries(url.searchParams), ...extraQuery };
  const raw = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req) : '';
  let body = raw;
  if (raw && (req.headers['content-type'] || '').includes('application/json')) {
    try { body = JSON.parse(raw); } catch { /* handlers cope with strings */ }
  }

  try {
    await handler({ method: req.method, query, body, headers: req.headers, url: req.url }, makeRes(res));
  } catch (e) {
    console.error(`[api/${name}]`, e);
    if (!res.headersSent) { res.writeHead(500, { 'Content-Type': 'application/json' }); }
    res.end(JSON.stringify({ error: e.message }));
  }
}

function serveFile(file, res) {
  if (!fs.existsSync(file)) { res.writeHead(404); res.end('Not found'); return; }
  const ext = path.extname(file);
  const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png',
    '.svg': 'image/svg+xml', '.txt': 'text/plain', '.xml': 'application/xml' }[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type + (type.startsWith('text/') ? '; charset=utf-8' : '') });
  fs.createReadStream(file).pipe(res);
}

// Mirrors the root vercel.json.
const WEBSITE_ROUTES = {
  '/privacy-policy': 'privacy-policy.html', '/privacy-policy.html': 'privacy-policy.html',
  '/terms': 'terms.html', '/terms.html': 'terms.html',
  '/delete-account': 'delete-account.html', '/delete-account.html': 'delete-account.html',
  '/blog': 'blog.html', '/blog.html': 'blog.html',
  '/about': 'index.html', '/about.html': 'index.html',
  '/admin': 'admin.html', '/admin.html': 'admin.html',
  '/home': 'index.html',
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;

  if (p.startsWith('/api/')) return runFunction(p.slice(5).replace(/\/$/, ''), req, res, url);

  const u = p.match(/^\/u\/([A-Za-z0-9_]{1,40})\/?$/);
  if (u) return runFunction('profile-page', req, res, url, { handle: u[1] });

  // The homepage is the feed; the marketing page moved to /about.
  if (p === '/' || p === '/index.html') return runFunction('feed-page', req, res, url);

  if (WEBSITE_ROUTES[p]) return serveFile(path.join(WEBSITE, WEBSITE_ROUTES[p]), res);
  if (p.startsWith('/screens/') || p.startsWith('/categories/')) {
    return serveFile(path.join(WEBSITE, p.replace(/^\//, '')), res);
  }

  // Everything else belongs to the app: hand it to Vite.
  const proxy = http.request(
    { hostname: 'localhost', port: VITE_PORT, path: req.url, method: req.method, headers: req.headers },
    (up) => { res.writeHead(up.statusCode, up.headers); up.pipe(res); }
  );
  proxy.on('error', () => {
    res.writeHead(502, { 'Content-Type': 'text/html' });
    res.end('<h1>Vite is not running</h1><p>Start it with <code>npm run dev</code>, or use <code>npm run dev:full</code>.</p>');
  });
  req.pipe(proxy);
});

// ── start ────────────────────────────────────────────────────────────────────
// Bind the port BEFORE starting Vite. Spawning Vite first meant a port clash
// killed this process and left an orphan Vite holding 5173, which then made the
// next attempt fail differently.
let vite = null;

function startVite() {
  if (process.env.NO_VITE === '1') return;
  const viteCli = path.join(APP, 'node_modules', 'vite', 'bin', 'vite.js');
  vite = spawn(process.execPath, [viteCli, '--port', String(VITE_PORT)],
    { cwd: APP, stdio: 'inherit' });
  vite.on('error', (e) => console.error('  Could not start Vite: ' + e.message));
}

const shutdown = () => { try { vite && vite.kill(); } catch {} process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.on('error', (e) => {
  if (e.code !== 'EADDRINUSE') throw e;
  console.error(`\n  Port ${PORT} is already in use.`);
  console.error('  Another dev server is probably still running in a different terminal.');
  console.error('  Close it, or free the port:');
  console.error(process.platform === 'win32'
    ? `    Stop-Process -Id (Get-NetTCPConnection -LocalPort ${PORT} -State Listen).OwningProcess -Force`
    : `    lsof -ti:${PORT} | xargs kill`);
  console.error(`  Or run this one on another port:   $env:PORT=3001; npm run dev:full\n`);
  process.exit(1);
});

server.listen(PORT, () => {
  startVite();
  // Vite prints its own banner a beat later. Print ours after it so the correct
  // URL is the last thing on screen: opening Vite's port directly bypasses this
  // server, and /u/<handle> then falls through to the SPA and renders the app
  // home page, which looks like a broken profile rather than a wrong port.
  setTimeout(() => {
    console.log(`\n  ────────────────────────────────────────────────`);
    console.log(`  The Vault, running locally`);
    console.log(``);
    console.log(`  USE THIS       http://localhost:${PORT}`);
    console.log(`  profile        http://localhost:${PORT}/u/<handle>`);
    console.log(`  api            http://localhost:${PORT}/api/<name>`);
    console.log(``);
    console.log(`  Ignore Vite's http://localhost:${VITE_PORT} above. It has no`);
    console.log(`  API server, so /u/<handle> there shows the app home page.`);
    console.log(`  ────────────────────────────────────────────────\n`);
  }, 1200);
});
