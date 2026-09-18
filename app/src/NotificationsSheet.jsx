import { useState, useEffect, useCallback } from "react";
import { collection, doc, onSnapshot, orderBy, query, limit, updateDoc, writeBatch } from "firebase/firestore";
import { db } from "./firebase";

const EMOJI = { heart: "❤️", fire: "🔥", money: "💰" };
const VERB  = { heart: "loved", fire: "is fired up about", money: "rates" };

/**
 * Who reacted to your cards.
 *
 * Reaction counts on a profile stay anonymous to the public; this is the one
 * place the owner sees a name, and only for reactions given after the feature
 * shipped. The notification carries the actor's name and card details
 * snapshotted at write time, so nothing here joins across collections.
 */
export function useNotifications(user) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (!user?.uid) { setItems([]); return; }
    const q = query(
      collection(db, "users", user.uid, "notifications"),
      orderBy("createdAt", "desc"),
      limit(100),
    );
    return onSnapshot(
      q,
      snap => setItems(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      // An index or rules hiccup should leave the app usable, not blank.
      err => console.warn("[notifications]", err?.code || err),
    );
  }, [user?.uid]);

  // The gift toast owns credit_gift and marks those read itself.
  const social = items.filter(n => n.type === "reaction");
  const unread = social.filter(n => !n.read).length;
  return { items: social, unread };
}

function timeAgo(iso) {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (!Number.isFinite(s)) return "";
  if (s < 60) return "just now";
  const m = s / 60;
  if (m < 60) return `${Math.floor(m)}m`;
  const h = m / 60;
  if (h < 24) return `${Math.floor(h)}h`;
  const d = h / 24;
  if (d < 7) return `${Math.floor(d)}d`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export default function NotificationsSheet({ user, items, onClose, onOpenCard }) {
  const [busy, setBusy] = useState(false);

  // Opening the list is the read. Do it once, in a batch, and only for the
  // ones actually unread so we are not rewriting the whole collection.
  const markAllRead = useCallback(async () => {
    const unread = items.filter(n => !n.read);
    if (!unread.length || !user?.uid) return;
    setBusy(true);
    try {
      const batch = writeBatch(db);
      for (const n of unread.slice(0, 400)) {
        batch.update(doc(db, "users", user.uid, "notifications", n.id), { read: true });
      }
      await batch.commit();
    } catch (e) {
      console.warn("[notifications] mark read", e?.code || e);
    } finally {
      setBusy(false);
    }
  }, [items, user?.uid]);

  useEffect(() => { markAllRead(); /* on open only */ }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 760,
        background: "rgba(0,0,0,0.62)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "var(--card)", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 520,
          maxHeight: "88vh", display: "flex", flexDirection: "column",
          border: "1px solid var(--b)", borderBottom: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px 10px" }}>
          <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: 0.3 }}>Reactions</div>
          <button onClick={onClose} aria-label="Close"
                  style={{ background: "none", border: "none", color: "var(--tg)", fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>

        <div style={{ overflowY: "auto", padding: "0 12px calc(20px + env(safe-area-inset-bottom, 0px))" }}>
          {items.length === 0 ? (
            <div style={{ color: "var(--tg)", fontSize: 14, lineHeight: 1.6, padding: "36px 20px 48px", textAlign: "center" }}>
              Nothing yet.<br />
              When someone reacts to a card on your public profile, it shows up here.
            </div>
          ) : items.map(n => (
            <Row key={n.id} n={n} onOpenCard={onOpenCard} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Row({ n, onOpenCard }) {
  const profileUrl = n.actorHandle ? `https://www.myvaults.io/u/${n.actorHandle}` : null;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12, padding: "12px 10px",
      borderBottom: "1px solid var(--b)",
      background: n.read ? "transparent" : "rgba(255,107,53,0.06)",
      borderRadius: 12,
    }}>
      <div style={{ fontSize: 22, flexShrink: 0, width: 28, textAlign: "center" }}>{EMOJI[n.emoji] || "⭐"}</div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, lineHeight: 1.45, color: "var(--t)" }}>
          {profileUrl ? (
            <a href={profileUrl} target="_blank" rel="noopener noreferrer"
               style={{ color: "#ff6b35", fontWeight: 700, textDecoration: "none" }}>
              {n.actorName}
            </a>
          ) : (
            // No public profile, so the name is not a link to anywhere.
            <span style={{ fontWeight: 700 }}>{n.actorName}</span>
          )}
          {" "}{VERB[n.emoji] || "reacted to"}{" "}
          <span style={{ color: "var(--ts)" }}>{n.cardId ? n.cardName : "your profile"}</span>
        </div>
        <div style={{ fontSize: 11, color: "var(--tg)", marginTop: 2 }}>{timeAgo(n.createdAt)}</div>
      </div>

      {n.cardImage && (
        <button
          onClick={() => n.cardId && onOpenCard?.(n.cardId)}
          title={n.cardId ? "Open this card" : undefined}
          style={{
            width: 38, height: 53, borderRadius: 6, overflow: "hidden", flexShrink: 0,
            border: "1px solid var(--b)", background: "var(--deep)", padding: 0,
            cursor: n.cardId ? "pointer" : "default",
          }}>
          <img src={n.cardImage} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        </button>
      )}
    </div>
  );
}
