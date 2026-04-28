import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Emits admin-config.js into dist/ at build time so the admin panel
// can read Firebase config without needing an extra serverless function.
function adminConfigPlugin() {
  return {
    name: 'admin-config',
    generateBundle() {
      const cfg = {
        apiKey:            process.env.VITE_FIREBASE_API_KEY            || '',
        authDomain:        process.env.VITE_FIREBASE_AUTH_DOMAIN        || '',
        projectId:         process.env.VITE_FIREBASE_PROJECT_ID         || '',
        storageBucket:     process.env.VITE_FIREBASE_STORAGE_BUCKET     || '',
        messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
        appId:             process.env.VITE_FIREBASE_APP_ID             || '',
        measurementId:     process.env.VITE_FIREBASE_MEASUREMENT_ID     || '',
      };
      this.emitFile({
        type: 'asset',
        fileName: 'admin-config.js',
        source:
          `const ADMIN_FIREBASE_CONFIG = ${JSON.stringify(cfg)};\n` +
          `const LOOPS_API_KEY = ${JSON.stringify(process.env.LOOPS_API_KEY || '')};\n`,
      });
    },
  };
}

// Dev-only middleware: serves /api/sets-* handlers locally so the checklist
// data is available without deploying.  All other /api/* routes still proxy
// to production (chat, analyze, pricing, etc.)
function devApiPlugin() {
  return {
    name: 'dev-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/sets-')) return next();

        const { pathname, searchParams } = new URL(req.url, 'http://localhost');
        const name = pathname.replace('/api/', ''); // e.g. 'sets-checklist'

        try {
          // Vite copies config to a temp dir, so we must build an absolute path
          // using process.cwd() (the project root) + pathToFileURL for ESM compat.
          const { pathToFileURL } = await import('url');
          const { resolve } = await import('path');
          const fileUrl = pathToFileURL(resolve(process.cwd(), 'api', `${name}.js`)).href;
          const mod = await import(fileUrl);
          const handler = mod.default;

          const mockReq = {
            method: req.method,
            query: Object.fromEntries(searchParams.entries()),
            headers: req.headers,
          };

          const mockRes = {
            _status: 200,
            _headers: {},
            status(code) { this._status = code; return this; },
            setHeader(k, v) { this._headers[k] = v; return this; },
            end() { res.writeHead(this._status, this._headers); res.end(); },
            json(data) {
              this._headers['Content-Type'] = 'application/json';
              res.writeHead(this._status, this._headers);
              res.end(JSON.stringify(data));
            },
          };

          await handler(mockReq, mockRes);
        } catch (err) {
          console.error('[dev-api]', err.message);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), adminConfigPlugin(), devApiPlugin()],
  server: {
    proxy: {
      '/api': {
        target: 'https://app.myvaults.io',
        changeOrigin: true,
        secure: true,
      },
    },
  },
})
