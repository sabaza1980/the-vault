import { Capacitor } from '@capacitor/core';

// Shared platform detection (WP-0 / S3).
// "Mobile" in The Vault = the native app OR a narrow (phone-width) browser.
// Used to gate the bottom tab bar (show on mobile) and the Breaks section
// (hide on mobile, keep on desktop web) per plan decisions D1 + D2.

const MOBILE_MAX_WIDTH = 768; // px — phones + small tablets in portrait

// True when running inside the Capacitor iOS/Android shell.
export function isNativeApp() {
  return Capacitor.isNativePlatform();
}

// True when the browser viewport is phone-sized. Safe during SSR/no-window.
export function isMobileViewport() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH}px)`).matches;
}

// True for any mobile context: native app or mobile web.
export function isNativeMobile() {
  return isNativeApp() || isMobileViewport();
}

// Convenience inverse: desktop web only (where Breaks stays available).
export function isDesktopWeb() {
  return !isNativeMobile();
}

export { MOBILE_MAX_WIDTH };
