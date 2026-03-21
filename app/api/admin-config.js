/**
 * /api/admin-config
 * Serves the admin panel's runtime config as a JS file, reading from
 * server-side env vars so nothing sensitive is committed to git.
 *
 * Required Vercel env vars (VITE_FIREBASE_* are already set):
 *   LOOPS_API_KEY — Loops.so API key for the email feature
 */
export default function handler(req, res) {
  const firebaseConfig = {
    apiKey:            process.env.VITE_FIREBASE_API_KEY,
    authDomain:        process.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId:         process.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket:     process.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId:             process.env.VITE_FIREBASE_APP_ID,
    measurementId:     process.env.VITE_FIREBASE_MEASUREMENT_ID,
  };

  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache');
  res.status(200).send(
    `const ADMIN_FIREBASE_CONFIG = ${JSON.stringify(firebaseConfig)};\n` +
    `const LOOPS_API_KEY = ${JSON.stringify(process.env.LOOPS_API_KEY || '')};\n`,
  );
}
