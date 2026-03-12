import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.thevault.app',
  appName: 'The Vault',
  webDir: 'dist',
  server: {
    // Remove this block after confirming native builds work.
    // Only used for live-reload during development:
    // url: 'http://192.168.x.x:5173',
    // cleartext: true,
  },
  ios: {
    contentInset: 'automatic',
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
