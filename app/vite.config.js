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

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), adminConfigPlugin()],
})
