import { Capacitor } from "@capacitor/core";
import { signInWithCustomToken } from "firebase/auth";
import { auth } from "./firebase";

/**
 * One sign-in across myvaults.io and app.myvaults.io.
 *
 * Firebase stores its session per origin, so the app and the feed each kept
 * their own. A cookie on the parent domain carries a random session id that
 * `/api/session` trades for a custom token, and whichever surface you land on
 * signs you in with it.
 *
 * Everything here is best-effort and silent. A failure means you are signed out
 * on this surface, which is the state you were already in; it never blocks the
 * page, and it never affects reading the public feed.
 */

const API_BASE = Capacitor.isNativePlatform() ? "https://app.myvaults.io" : "";

/** The native app has no shared-cookie problem: it is one origin, always. */
const shared = () => !Capacitor.isNativePlatform();

/** Set while a publish is in flight, so a verify does not race a fresh sign-in. */
let publishing = null;

/**
 * Publish this sign-in so the other origin picks it up.
 * Called from the interactive sign-in paths, not from the auth-state listener —
 * the listener verifies instead, and the two must not fight.
 */
export async function publishSession(user) {
  if (!shared() || !user) return;
  publishing = (async () => {
    const idToken = await user.getIdToken();
    await fetch(`${API_BASE}/api/session`, {
      method: "POST",
      credentials: "include",          // the cookie is the entire point
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
  })();
  try { await publishing; }
  catch { /* the session stays local to this origin; nothing else breaks */ }
  finally { publishing = null; }
}

/**
 * The shared cookie is the authority on whether you are signed in.
 *
 * Firebase keeps a refresh token per origin, so signing out in the app did not
 * touch the copy this site was holding — you logged out and the feed carried on
 * greeting you by name. Deleting the shared session is now what ends it: every
 * surface checks on load, and a surface whose shared session has gone signs
 * itself out.
 *
 * Only a definite 204 counts. A network wobble means unknown, and unknown must
 * never sign anybody out.
 */
export async function verifySession(user, onGone) {
  if (!shared() || !user) return;
  if (publishing) { try { await publishing; } catch { /* keep going */ } }
  try {
    const r = await fetch(`${API_BASE}/api/session`, { credentials: "include" });
    if (r.status === 204) onGone();
  } catch { /* unknown, so leave the session alone */ }
}

/**
 * Adopt a session started on the other origin.
 *
 * Returns true if it signed someone in. A 204 — no cookie, or an expired one —
 * is the ordinary answer for a visitor who is simply not signed in.
 */
export async function adoptSession() {
  if (!shared() || auth.currentUser) return false;
  try {
    const r = await fetch(`${API_BASE}/api/session`, { credentials: "include" });
    if (r.status !== 200) return false;
    const { customToken } = await r.json();
    if (!customToken) return false;
    await signInWithCustomToken(auth, customToken);
    return true;
  } catch {
    return false;
  }
}

/** Sign out everywhere, not just here. */
export async function endSession() {
  if (!shared()) return;
  try {
    await fetch(`${API_BASE}/api/session`, { method: "DELETE", credentials: "include" });
  } catch { /* the local sign-out still happens */ }
}
