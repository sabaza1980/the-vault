import { Capacitor } from "@capacitor/core";
import { auth } from "./firebase";

/**
 * Posting a card to the feed.
 *
 * The client never writes to the `feed` collection — it only says "this card of
 * mine is worth posting" and the API reads the card, the owner's profile and
 * the kill switch for itself. So there is nothing here to tamper with.
 *
 * Every call is best-effort and silent. A card that fails to reach the feed is
 * still in the collector's vault, which is the part that matters; the launch
 * backfill sweeps up anything that was missed.
 */

const API_BASE = Capacitor.isNativePlatform() ? "https://app.myvaults.io" : "";

async function call(cardId, action) {
  const user = auth.currentUser;
  if (!user || !cardId) return null;
  try {
    const token = await user.getIdToken();
    const r = await fetch(`${API_BASE}/api/feed`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ cardId: String(cardId), action }),
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

/**
 * Post a newly added card.
 *
 * Nothing is published for a collector whose profile is switched off, or for a
 * card outside what their profile shows — the API decides that, not this.
 */
export function publishToFeed(cardId) {
  return call(cardId, "publish");
}

/**
 * Take a card's post down.
 *
 * Deleting a card from a vault has to delete it from the feed, and that has to
 * work even when the feed is switched off, or a deleted card would sit in
 * public until someone noticed.
 */
export function removeFromFeed(cardId) {
  return call(cardId, "remove");
}
