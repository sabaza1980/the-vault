import { useState, useEffect, useCallback, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";

const API_BASE = Capacitor.isNativePlatform() ? "https://app.myvaults.io" : "";
const PROFILE_BASE = "https://www.myvaults.io/u/";

/**
 * Public profile settings: change your handle, write a bio, choose whether values
 * show, and switch the profile on.
 *
 * The profile is off until the collector turns it on, and it cannot be turned
 * on before a handle exists, because without one there is no address to reach
 * it at.
 */
export default function PublicProfileSettings({ user, onClose }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);

  const [handle, setHandle] = useState("");
  const [savedHandle, setSavedHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  // Opt-out: public unless the collector switched it off. Starts true so the
  // switch never flickers from off to on while settings load.
  const [enabled, setEnabled] = useState(true);
  const [showValues, setShowValues] = useState(false);
  const [cardScope, setCardScope] = useState("all");

  const [check, setCheck] = useState(null); // null | 'checking' | 'free' | 'taken' | error string
  const checkTimer = useRef(null);

  const authHeader = useCallback(async () => {
    const token = await user.getIdToken();
    return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  }, [user]);

  // Load whatever the user already has. The profile doc lives on the user
  // record, so this reads through the same API that writes it.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        const p = (snap.exists() && snap.data().profile_public) || {};
        if (!alive) return;
        setHandle(p.handle || "");
        setSavedHandle(p.handle || "");
        setDisplayName(p.display_name || user.displayName || "");
        setBio(p.bio || "");
        setEnabled(p.enabled !== false);
        setShowValues(p.show_values === true);
        setCardScope(p.card_scope === "favourites" ? "favourites" : "all");
      } catch {
        if (alive) setErr("Could not load your profile settings");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [user]);

  // Availability check, debounced so it does not fire on every keystroke.
  useEffect(() => {
    const h = handle.trim().toLowerCase();
    clearTimeout(checkTimer.current);
    if (!h || h === savedHandle) { setCheck(null); return; }
    setCheck("checking");
    checkTimer.current = setTimeout(async () => {
      try {
        const r = await fetch(`${API_BASE}/api/profile?check=${encodeURIComponent(h)}`);
        const j = await r.json();
        setCheck(j.available ? "free" : (j.error || "taken"));
      } catch { setCheck(null); }
    }, 400);
    return () => clearTimeout(checkTimer.current);
  }, [handle, savedHandle]);

  const save = async (patch) => {
    setSaving(true); setErr("");
    try {
      const r = await fetch(`${API_BASE}/api/profile`, {
        method: "POST",
        headers: await authHeader(),
        body: JSON.stringify(patch),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not save");
      const p = j.profile_public || {};
      if (p.handle) { setSavedHandle(p.handle); setHandle(p.handle); }
      if (typeof p.enabled === "boolean") setEnabled(p.enabled);
      if (typeof p.show_values === "boolean") setShowValues(p.show_values);
      if (p.card_scope) setCardScope(p.card_scope);
      setCheck(null);
      return true;
    } catch (e) {
      setErr(e.message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const url = savedHandle ? PROFILE_BASE + savedHandle : "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true); setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard blocked, the text is on screen anyway */ }
  };

  const L = { fontSize: 11, fontWeight: 700, letterSpacing: 0.6, color: "var(--tg)", textTransform: "uppercase", marginBottom: 6 };
  const I = {
    width: "100%", background: "var(--gbg)", border: "1px solid var(--gb)", borderRadius: 10,
    padding: "10px 12px", color: "var(--t)", fontSize: 14, fontFamily: "inherit", outline: "none",
  };

  return (
    <div style={{
           position: "fixed", inset: 0, zIndex: 760,
           background: "rgba(0,0,0,0.62)", backdropFilter: "blur(4px)",
           display: "flex", alignItems: "flex-end", justifyContent: "center",
         }}
         onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
           style={{
             background: "var(--card)", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 520,
             maxHeight: "92vh", overflowY: "auto", padding: "20px 20px calc(28px + env(safe-area-inset-bottom, 0px))",
             border: "1px solid var(--b)", borderBottom: "none",
           }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: 0.3 }}>Public profile</div>
          <button onClick={onClose} aria-label="Close"
                  style={{ background: "none", border: "none", color: "var(--tg)", fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>
        <div style={{ fontSize: 13, color: "var(--tg)", marginBottom: 18, lineHeight: 1.5 }}>
          A page for the cards you are proud of. Your whole collection shows by default.
        </div>

        {loading ? (
          <div style={{ color: "var(--tg)", padding: "30px 0", textAlign: "center" }}>Loading…</div>
        ) : (
          <>
            <div style={{ marginBottom: 16 }}>
              <div style={L}>Your handle</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: "var(--tg)", fontSize: 13, flexShrink: 0 }}>myvaults.io/u/</span>
                <input
                  value={handle}
                  onChange={e => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20))}
                  placeholder="yourname"
                  autoCapitalize="none" autoCorrect="off" spellCheck={false}
                  style={{ ...I, flex: 1 }}
                />
              </div>
              <div style={{ fontSize: 12, marginTop: 6, minHeight: 16, color: check === "free" ? "#4caf50" : check && check !== "checking" ? "#ff6b35" : "var(--tg)" }}>
                {check === "checking" && "Checking…"}
                {check === "free" && "That one is free"}
                {check && check !== "checking" && check !== "free" && check}
                {!check && savedHandle && `Saved as @${savedHandle}`}
              </div>
              {handle.trim() && handle.trim() !== savedHandle && check === "free" && (
                <button onClick={() => save({ handle: handle.trim() })} disabled={saving}
                        style={{ marginTop: 6, background: "#ff6b35", color: "#fff", border: "none", borderRadius: 10, padding: "9px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                  {saving ? "Saving…" : savedHandle ? "Change handle" : "Claim handle"}
                </button>
              )}
              {savedHandle && handle.trim() !== savedHandle && (
                <div style={{ fontSize: 11, color: "var(--tg)", marginTop: 6, lineHeight: 1.5 }}>
                  Your old handle keeps working for 30 days so shared links do not die.
                </div>
              )}
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={L}>Display name</div>
              <input value={displayName} maxLength={40}
                     onChange={e => setDisplayName(e.target.value)}
                     onBlur={() => displayName.trim() && save({ display_name: displayName })}
                     placeholder="What people call you" style={I} />
            </div>

            <div style={{ marginBottom: 18 }}>
              <div style={L}>Bio</div>
              <textarea value={bio} maxLength={160} rows={2}
                        onChange={e => setBio(e.target.value)}
                        onBlur={() => save({ bio })}
                        placeholder="What you collect, and why"
                        style={{ ...I, resize: "vertical" }} />
              <div style={{ fontSize: 11, color: "var(--tg)", marginTop: 4 }}>{bio.length}/160</div>
            </div>

            <div style={{ padding: "13px 0", borderTop: "1px solid var(--b)" }}>
              <div style={L}>What to show</div>
              <div style={{ display: "flex", gap: 8 }}>
                {[
                  { k: "all",        label: "Whole collection" },
                  { k: "favourites", label: "Favourites only" },
                ].map(o => (
                  <button
                    key={o.k}
                    onClick={() => { setCardScope(o.k); save({ card_scope: o.k }); }}
                    style={{
                      flex: 1, borderRadius: 10, padding: "9px 10px", fontSize: 13, fontWeight: 700,
                      cursor: "pointer", fontFamily: "inherit",
                      background: cardScope === o.k ? "#ff6b35" : "var(--gbg)",
                      color: cardScope === o.k ? "#fff" : "var(--t)",
                      border: `1px solid ${cardScope === o.k ? "#ff6b35" : "var(--gb)"}`,
                    }}>
                    {o.label}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 12, color: "var(--tg)", marginTop: 6, lineHeight: 1.45 }}>
                {cardScope === "all"
                  ? "Everything in your vault, favourites first."
                  : "Only your starred cards. If you have not starred any, your whole collection shows instead."}
              </div>
            </div>

            <Row
              title="Show estimated values"
              sub="Off by default. Your cards, not your balance sheet."
              on={showValues}
              onChange={v => { setShowValues(v); save({ show_values: v }); }}
            />

            <Row
              title="Profile is public"
              sub={enabled
                ? "On by default. Your collection is visible to anyone with the link — switch this off to take it down."
                : "Your collection is private. Nobody can open your profile and none of your cards appear in the feed."}
              on={enabled}
              onChange={v => { setEnabled(v); save({ enabled: v }); }}
            />

            {/* Publishing is the one thing here that leaves the app, so say what
                that means at the moment the switch is thrown rather than burying
                it in the policy. */}
            <div style={{ fontSize: 11, color: "var(--tg)", lineHeight: 1.6, marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--b)" }}>
              Profiles are public by default. Yours can be opened by anyone with the link, without an
              account, and may be cached or screenshotted. Your cards appear in the collectors' feed.
              Your email address is never shown — not on your profile, not in the feed, and not in your
              handle. What a card is worth stays hidden unless you turn values on above. Switching this
              off takes the page down and removes your cards from the feed.{" "}
              <a href="https://myvaults.io/privacy-policy" target="_blank" rel="noopener noreferrer"
                 style={{ color: "#ff6b35", textDecoration: "none", fontWeight: 600 }}>
                How we handle your data
              </a>
            </div>

            {err && <div style={{ color: "#ff6b35", fontSize: 13, marginTop: 12 }}>{err}</div>}

            {enabled && url && (
              <div style={{ marginTop: 18, padding: 14, background: "var(--gbg)", border: "1px solid var(--gb)", borderRadius: 12 }}>
                <div style={{ ...L, marginBottom: 8 }}>Your profile link</div>
                <div style={{ fontSize: 14, color: "#ff6b35", wordBreak: "break-all", marginBottom: 12 }}>{url}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button onClick={copy}
                          style={{ background: "#ff6b35", color: "#fff", border: "none", borderRadius: 10, padding: "10px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                    {copied ? "Copied" : "Copy link"}
                  </button>
                  <button onClick={() => window.open(url, "_blank", "noopener")}
                          style={{ background: "var(--gbg)", color: "var(--t)", border: "1px solid var(--gb)", borderRadius: 10, padding: "10px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                    View it
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Row({ title, sub, on, onChange, disabled }) {
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14,
      padding: "13px 0", borderTop: "1px solid var(--b)", opacity: disabled ? 0.5 : 1,
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: 12, color: "var(--tg)", marginTop: 2, lineHeight: 1.45 }}>{sub}</div>
      </div>
      <button
        role="switch" aria-checked={on} aria-label={title} disabled={disabled}
        onClick={() => !disabled && onChange(!on)}
        style={{
          width: 46, height: 27, borderRadius: 999, flexShrink: 0, marginTop: 2,
          background: on ? "#ff6b35" : "var(--gb)", border: "none",
          cursor: disabled ? "not-allowed" : "pointer", position: "relative",
          transition: "background .18s cubic-bezier(.22,1,.36,1)",
        }}>
        <span style={{
          position: "absolute", top: 3, left: on ? 22 : 3, width: 21, height: 21,
          borderRadius: "50%", background: "#fff",
          transition: "left .18s cubic-bezier(.22,1,.36,1)",
        }} />
      </button>
    </div>
  );
}
