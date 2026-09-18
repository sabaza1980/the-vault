import { useState, useEffect, useRef, useCallback } from "react";
import { Capacitor } from "@capacitor/core";

/**
 * The feed, inside the app.
 *
 * Same `/api/feed` the website's homepage reads, so there is one feed and one
 * set of rules about who is visible — not an app feed and a web feed that
 * quietly disagree about whose cards appear.
 *
 * What it does NOT do is fetch anything private. Every entry here describes a
 * card in a vault its owner switched on, and the endpoint is the same one a
 * signed-out visitor reads. Being signed in buys two things: reactions that
 * stick, and collectors you have blocked dropping out.
 */

const API_BASE = Capacitor.isNativePlatform() ? "https://app.myvaults.io" : "";
const PAGE = 20;

const EMOJI = [
  { key: "heart", glyph: "❤️", label: "Love it" },
  { key: "fire", glyph: "🔥", label: "Fire" },
  { key: "money", glyph: "💰", label: "Big money" },
];

const CHIPS = ["Basketball", "Pokemon", "Football", "Soccer", "Baseball", "Coins", "Stamps", "Comics"];

function timeAgo(iso) {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (!Number.isFinite(s) || s < 0) return "";
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  const d = Math.floor(s / 86400);
  if (d < 30) return `${d}d`;
  if (d < 365) return `${Math.floor(d / 30)}mo`;
  return `${Math.floor(d / 365)}y`;
}

function Post({ entry, mine, onReact, onOpenCard, onOpenCollector, busy }) {
  const counts = entry.counts || {};
  const handle = entry.ownerHandle;

  return (
    <article style={{
      background: "var(--card)", border: "1px solid var(--b)", borderRadius: 16,
      overflow: "hidden", display: "flex", flexDirection: "column",
    }}>
      <header style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px" }}>
        <span style={{
          width: 30, height: 30, borderRadius: "50%", flexShrink: 0, display: "flex",
          alignItems: "center", justifyContent: "center", background: "var(--deep)",
          color: "var(--ts)", fontSize: 12, fontWeight: 700,
        }}>{(entry.ownerName || handle || "?").trim().charAt(0).toUpperCase()}</span>

        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
          <button
            onClick={() => handle && onOpenCollector(handle)}
            disabled={!handle}
            style={{
              background: "none", border: "none", padding: 0, textAlign: "left",
              font: "inherit", fontSize: 13.5, fontWeight: 700, color: "var(--t)",
              cursor: handle ? "pointer" : "default",
            }}
          >{entry.ownerName}</button>
          <span style={{ fontSize: 11.5, color: "var(--tg)" }}>
            {handle ? `@${handle} · ` : ""}{timeAgo(entry.createdAt)}
            {entry.fromTheVaults ? " · From the vaults" : ""}
          </span>
        </div>
      </header>

      <button
        onClick={() => onOpenCard(entry)}
        aria-label={`Open ${entry.cardName}`}
        style={{
          height: 380, background: "var(--deep)", border: "none", padding: 0, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <img src={entry.cardImage} alt={entry.cardName} loading="lazy"
             style={{ maxWidth: "100%", maxHeight: 380, objectFit: "contain", display: "block" }} />
      </button>

      <div style={{ padding: "12px 14px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {EMOJI.map(e => {
            const on = !!mine?.[e.key];
            return (
              <button
                key={e.key}
                onClick={() => onReact(entry, e.key)}
                disabled={busy}
                aria-label={e.label}
                aria-pressed={on}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  background: on ? "rgba(255,107,53,0.14)" : "transparent",
                  border: `1px solid ${on ? "rgba(255,107,53,0.38)" : "var(--b)"}`,
                  borderRadius: 999, padding: "7px 12px", minHeight: 36,
                  color: on ? "#ff6b35" : "var(--tg)",
                  font: "inherit", fontSize: 13, fontWeight: 700,
                  cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1,
                }}
              >
                <span style={{ fontSize: 14, lineHeight: 1 }}>{e.glyph}</span>
                {counts[e.key] || 0}
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {entry.cardMeta && (
            <div style={{ fontSize: 11.5, color: "var(--tg)" }}>{entry.cardMeta}</div>
          )}
          <div style={{
            fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, letterSpacing: 0.8,
            color: "var(--t)", lineHeight: 1.1,
          }}>{entry.cardName}</div>
        </div>

        {!!(entry.badges || []).length && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {entry.badges.slice(0, 3).map((b, i) => (
              <span key={i} style={{
                fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase",
                color: "var(--ts)", background: "rgba(255,255,255,0.06)",
                border: "1px solid var(--b)", borderRadius: 5, padding: "3px 7px",
              }}>{b}</span>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

export default function FeedView({ user, onOpenCard, onOpenCollector, onSignInNeeded }) {
  const [entries, setEntries] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [cat, setCat] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mine, setMine] = useState({});          // reactionTarget -> { heart, fire, money }
  const [busyTarget, setBusyTarget] = useState(null);
  const sentinel = useRef(null);
  const loadingRef = useRef(false);

  const load = useCallback(async (opts = {}) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    const reset = !!opts.reset;
    if (reset) setLoading(true);
    try {
      const qs = new URLSearchParams({ limit: String(PAGE) });
      if (opts.cat) qs.set("cat", opts.cat);
      if (!reset && cursor) qs.set("cursor", cursor);

      // Signed in, the token buys blocking. Signed out, the feed is still the
      // feed — this is a public endpoint and must never require a token.
      const headers = {};
      if (user) {
        try { headers.Authorization = `Bearer ${await user.getIdToken()}`; } catch { /* read it signed out */ }
      }

      const r = await fetch(`${API_BASE}/api/feed?${qs}`, { headers });
      if (!r.ok) throw new Error(`Feed ${r.status}`);
      const j = await r.json();

      // Never append a card that is already on screen. Paging should not
      // produce a duplicate, but a card added between two requests shifts the
      // window, and one repeated card reads as the feed being broken.
      setEntries(prev => {
        const incoming = j.entries || [];
        if (reset) return incoming;
        const have = new Set(prev.map(e => e.id));
        return prev.concat(incoming.filter(e => e.id && !have.has(e.id)));
      });
      setCursor(j.nextCursor || null);
      setHasMore(!!j.hasMore);
      setError(j.enabled === false ? "The feed is having a moment." : null);
    } catch {
      setError("Could not load the feed.");
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [cursor, user]);

  // First load, and whenever the category changes.
  useEffect(() => { load({ reset: true, cat }); /* eslint-disable-next-line */ }, [cat, user?.uid]);

  // Which reactions are already yours. One batched call for the page rather
  // than one per card.
  useEffect(() => {
    if (!user || !entries.length) return;
    let alive = true;
    (async () => {
      try {
        const targets = entries.map(e => e.reactionTarget).filter(Boolean).slice(0, 120);
        if (!targets.length) return;
        const token = await user.getIdToken();
        const r = await fetch(`${API_BASE}/api/react?targets=${encodeURIComponent(targets.join(","))}`,
          { headers: { Authorization: `Bearer ${token}` } });
        if (!r.ok || !alive) return;
        const j = await r.json();
        if (j.mine) setMine(prev => ({ ...prev, ...j.mine }));
      } catch { /* the feed reads fine without knowing what you already tapped */ }
    })();
    return () => { alive = false; };
  }, [entries, user]);

  // Infinite scroll.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver(
      (es) => { if (es.some(e => e.isIntersecting)) load({ cat }); },
      { rootMargin: "600px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, load, cat]);

  const react = useCallback(async (entry, emoji) => {
    if (!user) { onSignInNeeded?.(); return; }
    const target = entry.reactionTarget;
    if (!target || busyTarget) return;

    const was = !!mine[target]?.[emoji];
    // Optimistic: a reaction has to feel instant or nobody taps a second one.
    setMine(prev => ({ ...prev, [target]: { ...(prev[target] || {}), [emoji]: !was } }));
    setEntries(prev => prev.map(e => e.reactionTarget !== target ? e : {
      ...e,
      counts: { ...e.counts, [emoji]: Math.max(0, (e.counts?.[emoji] || 0) + (was ? -1 : 1)) },
    }));
    setBusyTarget(target);

    try {
      const token = await user.getIdToken();
      const r = await fetch(`${API_BASE}/api/react`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ target, emoji }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not save that");
      // Take the server's word for it — it is the one keeping the count.
      setEntries(prev => prev.map(e => e.reactionTarget !== target ? e : { ...e, counts: j.counts || e.counts }));
      if (j.mine) setMine(prev => ({ ...prev, [target]: j.mine }));
    } catch {
      // Put it back exactly as it was.
      setMine(prev => ({ ...prev, [target]: { ...(prev[target] || {}), [emoji]: was } }));
      setEntries(prev => prev.map(e => e.reactionTarget !== target ? e : {
        ...e,
        counts: { ...e.counts, [emoji]: Math.max(0, (e.counts?.[emoji] || 0) + (was ? 1 : -1)) },
      }));
    } finally {
      setBusyTarget(null);
    }
  }, [user, mine, busyTarget, onSignInNeeded]);

  const chip = (label, value) => {
    const on = cat === value;
    return (
      <button
        key={value || "all"}
        onClick={() => { setCursor(null); setCat(value); }}
        aria-pressed={on}
        style={{
          flexShrink: 0, background: on ? "rgba(255,107,53,0.14)" : "transparent",
          border: `1px solid ${on ? "rgba(255,107,53,0.4)" : "var(--b)"}`,
          color: on ? "#ff6b35" : "var(--ts)", borderRadius: 999,
          padding: "8px 14px", minHeight: 36, font: "inherit",
          fontSize: 12.5, fontWeight: 700, cursor: "pointer",
        }}
      >{label}</button>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2, scrollbarWidth: "none" }}>
        {chip("All", "")}
        {CHIPS.map(c => chip(c, c))}
      </div>

      {loading && entries.length === 0 && (
        <div style={{ padding: "48px 16px", textAlign: "center", color: "var(--tg)", fontSize: 13 }}>
          Loading the feed…
        </div>
      )}

      {error && entries.length === 0 && !loading && (
        <div style={{
          background: "rgba(255,68,68,0.08)", border: "1px solid rgba(255,68,68,0.2)",
          borderRadius: 12, padding: "14px 16px", color: "var(--ts)", fontSize: 13,
        }}>
          {error}
          <button onClick={() => load({ reset: true, cat })}
                  style={{ marginLeft: 10, background: "none", border: "none", color: "#ff6b35",
                           font: "inherit", fontWeight: 700, cursor: "pointer" }}>Try again</button>
        </div>
      )}

      {!loading && !error && entries.length === 0 && (
        <div style={{ padding: "48px 16px", textAlign: "center", color: "var(--tg)", fontSize: 13, lineHeight: 1.7 }}>
          Nothing here in {cat || "the feed"} yet.<br />
          Add a card and yours could be the first.
        </div>
      )}

      {entries.map(e => (
        <Post
          key={e.id}
          entry={e}
          mine={mine[e.reactionTarget]}
          busy={busyTarget === e.reactionTarget}
          onReact={react}
          onOpenCard={onOpenCard}
          onOpenCollector={onOpenCollector}
        />
      ))}

      <div ref={sentinel} style={{ height: 1 }} />

      {hasMore && (
        <div style={{ display: "flex", justifyContent: "center", padding: "4px 0 20px" }}>
          <button onClick={() => load({ cat })}
                  style={{ background: "transparent", border: "1px solid var(--b)", color: "var(--ts)",
                           borderRadius: 11, padding: "12px 24px", font: "inherit",
                           fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            {loadingRef.current ? "Loading…" : "Show more"}
          </button>
        </div>
      )}
    </div>
  );
}
