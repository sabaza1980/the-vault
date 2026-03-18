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
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#07070f',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
  ios: {
    contentInset: 'automatic',
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
