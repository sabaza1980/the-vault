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

/**
 * Publish this sign-in so the other origin picks it up.
 * Called whenever Firebase reports a signed-in user.
 */
export async function publishSession(user) {
  if (!shared() || !user) return;
  try {
    const idToken = await user.getIdToken();
    await fetch(`${API_BASE}/api/session`, {
      method: "POST",
      credentials: "include",          // the cookie is the entire point
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
  } catch { /* the session stays local to this origin; nothing else breaks */ }
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
