import { useState, useCallback } from "react";
import { useEbayAuth } from "./useEbayAuth.js";

// ─── helpers ──────────────────────────────────────────────────────────────────

const CONDITION_OPTIONS = ["Mint", "Near Mint", "Excellent", "Good", "Fair", "Poor", "Unknown"];

const EBAY_POLICIES_URL = "https://www.ebay.com/sh/pol/overview";
const EBAY_POLICY_DEEP_LINKS = {
  "shipping policy":  "https://www.ebay.com/sh/pol/create?policyType=SHIPPING",
  "payment policy":  "https://www.ebay.com/sh/pol/create?policyType=PAYMENT",
  "return policy":   "https://www.ebay.com/sh/pol/create?policyType=RETURN",
};

function buildTitle(cards) {
  if (cards.length === 1) {
    const c = cards[0];
    const parts = [
      c.playerName,
      c.year,
      c.brand,
      c.series,
      c.parallel && c.parallel !== "Base" ? c.parallel : null,
      c.isRookie      ? "RC"   : null,
      c.hasAutograph  ? "Auto" : null,
      c.serialNumber  || null,
    ].filter(Boolean).join(" ");
    return parts.slice(0, 80);
  }
  const players = [...new Set(cards.map((c) => c.playerName))].slice(0, 3).join(", ");
  const extra   = cards.length > 3 ? ` +${cards.length - 3} more` : "";
  return `Basketball Card Bundle: ${players}${extra} (${cards.length} cards)`.slice(0, 80);
}

function buildDefaultPrice(cards) {
  const valued = cards.filter((c) => c.estimatedValue > 0);
  if (valued.length === 0) return "";
  const total = valued.reduce((s, c) => s + c.estimatedValue, 0);
  return (total * 0.9).toFixed(2); // suggest 90% of estimated for a quicker sale
}

function worstCondition(cards) {
  const order = ["Mint", "Near Mint", "Excellent", "Good", "Fair", "Poor", "Unknown"];
  return cards.reduce((worst, c) => {
    const ci = order.indexOf(c.condition);
    const wi = order.indexOf(worst);
    return ci > wi ? c.condition : worst;
  }, cards[0]?.condition || "Unknown");
}

// ─── sub-components ───────────────────────────────────────────────────────────

function Step({ n, label, active, done }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{
        width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 10, fontWeight: 700,
        background: done ? "#4caf5020" : active ? "#ff6b3520" : "var(--deep)",
        border: `1px solid ${done ? "#4caf5060" : active ? "#ff6b3560" : "var(--b)"}`,
        color:  done ? "#4caf50"  : active ? "#ff6b35"  : "var(--tm)",
      }}>
        {done ? "✓" : n}
      </div>
      <span style={{
        fontSize: 11,
        color: done ? "#4caf50" : active ? "#ff6b35" : "var(--tg)",
        fontWeight: active || done ? 600 : 400,
      }}>{label}</span>
    </div>
  );
}

function CardThumbnail({ card }) {
  const rarityColors = {
    Common: "#555", Uncommon: "#4caf50", Rare: "#2196f3",
    "Very Rare": "#9c27b0", "Ultra Rare": "#ff9800", Legendary: "#ff6b35",
  };
  const rc = rarityColors[card.rarity] || "#555";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--bf)" }}>
      <div style={{ width: 38, height: 52, borderRadius: 6, overflow: "hidden", flexShrink: 0, border: `1px solid ${rc}40` }}>
        <img src={card.imageUrl} alt={card.playerName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t)" }}>{card.playerName}</div>
        <div style={{ fontSize: 10, color: "var(--ts)", marginTop: 1 }}>
          {card.fullCardName || `${card.year} ${card.brand} ${card.series}`.trim()}
          {card.parallel && card.parallel !== "Base" && <span style={{ color: "#ff6b3580" }}> · {card.parallel}</span>}
        </div>
        <div style={{ display: "flex", gap: 4, marginTop: 3, flexWrap: "wrap" }}>
          {card.isRookie      && <span style={{ fontSize: 9, background: "#ff6b3520", color: "#ff6b35", border: "1px solid #ff6b3540", borderRadius: 4, padding: "1px 5px", fontWeight: 700 }}>RC</span>}
          {card.hasAutograph  && <span style={{ fontSize: 9, background: "#f0c04020", color: "#f0c040", border: "1px solid #f0c04040", borderRadius: 4, padding: "1px 5px", fontWeight: 700 }}>AUTO</span>}
          {card.serialNumber  && <span style={{ fontSize: 9, background: "#ce93d820", color: "#ce93d8", border: "1px solid #ce93d840", borderRadius: 4, padding: "1px 5px", fontWeight: 700 }}>{card.serialNumber}</span>}
          {card.estimatedValue > 0 && <span style={{ fontSize: 9, color: "#4caf50", fontWeight: 600 }}>~${card.estimatedValue.toFixed(2)}</span>}
        </div>
      </div>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function EbayListingModal({ cards, user, onClose, onSuccess }) {
  const {
    ebayConnected, hasPolicies, hasLocation, missingPolicies, refreshPolicies,
    authLoading, connecting, connectError,
    connect, disconnect, getValidToken, ebayAuth,
  } = useEbayAuth(user);

  const isBundle = cards.length > 1;

  // Form state (initialised once; not reactive to prop changes)
  const [title,      setTitle]      = useState(() => buildTitle(cards));
  const [price,      setPrice]      = useState(() => buildDefaultPrice(cards));
  const [condition,  setCondition]  = useState(() => isBundle ? worstCondition(cards) : (cards[0]?.condition || "Unknown"));
  const [extraNotes, setExtraNotes] = useState("");

  // Listing progress state
  const [listing,  setListing]  = useState(false);
  const [stepText, setStepText] = useState(""); // live progress label
  const [result,   setResult]   = useState(null); // { listingUrl }
  const [error,    setError]    = useState(null);

  const titleLeft = 80 - title.length;

  const handleList = useCallback(async () => {
    if (!price || parseFloat(price) <= 0) { setError("Please enter a valid price."); return; }
    if (!title.trim())                     { setError("Please enter a title."); return; }

    setListing(true);
    setError(null);

    try {
      setStepText("Authorising…");
      const accessToken = await getValidToken();

      setStepText("Creating listing…");
      const res = await fetch("/api/ebay-list", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cards,
          title:                title.trim(),
          price:                parseFloat(price),
          condition:            condition,
          conditionDescription: extraNotes || null,
          accessToken,
          fulfillmentPolicyId:  ebayAuth.fulfillmentPolicyId,
          paymentPolicyId:      ebayAuth.paymentPolicyId,
          returnPolicyId:       ebayAuth.returnPolicyId,
          merchantLocationKey:  ebayAuth.merchantLocationKey || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        console.error('eBay list error - sent body:', data.sentBody);
        throw new Error(data.error || `Listing failed (${res.status})`);
      }

      setResult(data);
      setStepText("");
      onSuccess(cards.map((c) => c.id), data.listingUrl);
    } catch (err) {
      console.error("EbayListingModal error:", err);
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setListing(false);
    }
  }, [cards, title, price, condition, extraNotes, getValidToken, ebayAuth, onSuccess]);

  // ── render ──────────────────────────────────────────────────────────────────
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,0,0,0.72)", backdropFilter: "blur(10px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
        animation: "fadeIn 0.18s ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 500, maxHeight: "90vh",
          background: "var(--surface)", border: "1px solid var(--b)",
          borderRadius: 20, overflow: "hidden",
          display: "flex", flexDirection: "column",
          boxShadow: "0 24px 80px rgba(0,0,0,0.5)",
          animation: "chatSlideUp 0.2s ease",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "16px 18px 14px",
          borderBottom: "1px solid var(--bf)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <div>
            <div style={{
              fontSize: 14, fontWeight: 800, color: "var(--t)",
              fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1.5,
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <span style={{ fontSize: 18 }}>🏷️</span>
              {isBundle ? `Sell Bundle (${cards.length} cards)` : "Sell on eBay"}
            </div>
            {isBundle && (
              <div style={{ fontSize: 10, color: "var(--tg)", marginTop: 1 }}>
                These cards will be grouped into one eBay listing
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            style={{ background: "var(--gbg)", border: "1px solid var(--gb)", borderRadius: 8, padding: "4px 10px", color: "var(--gc)", cursor: "pointer", fontSize: 14, lineHeight: 1 }}
          >✕</button>
        </div>

        {/* Body — scroll */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px" }}>

          {/* Loading auth */}
          {authLoading && (
            <div style={{ textAlign: "center", padding: "32px 0", color: "var(--tg)", fontSize: 12 }}>Checking eBay status…</div>
          )}

          {/* Not signed in */}
          {!authLoading && !user && (
            <div style={{ textAlign: "center", padding: "32px 0" }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>🔒</div>
              <div style={{ fontSize: 13, color: "var(--ts)", marginBottom: 6 }}>Sign in to The Vault first</div>
              <div style={{ fontSize: 11, color: "var(--tg)" }}>You need a Vault account to link your eBay seller account.</div>
            </div>
          )}

          {/* Not connected to eBay */}
          {!authLoading && user && !ebayConnected && (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <div style={{ fontSize: 40, marginBottom: 14 }}>
                <img src="https://upload.wikimedia.org/wikipedia/commons/1/1b/EBay_logo.svg" alt="eBay" style={{ height: 32, display: "block", margin: "0 auto 10px", opacity: 0.8 }} />
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--t)", marginBottom: 8 }}>Connect your eBay account</div>
              <div style={{ fontSize: 12, color: "var(--ts)", lineHeight: 1.6, marginBottom: 20, maxWidth: 320, margin: "0 auto 20px" }}>
                You'll be redirected to eBay to authorise The Vault to list cards on your behalf. You can disconnect at any time.
              </div>
              {connectError && (
                <div style={{ fontSize: 11, color: "#ff6666", background: "#ff444412", border: "1px solid #ff444430", borderRadius: 8, padding: "8px 12px", marginBottom: 14 }}>
                  {connectError}
                </div>
              )}
              <button
                onClick={connect}
                disabled={connecting}
                style={{
                  background: connecting ? "var(--deep)" : "#e53935",
                  border: "none", borderRadius: 10,
                  padding: "11px 28px", color: "#fff",
                  fontSize: 13, fontWeight: 700, cursor: connecting ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", gap: 8, margin: "0 auto",
                }}
              >
                {connecting ? (
                  <>
                    <div style={{ width: 14, height: 14, border: "2px solid #fff", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                    Waiting for eBay…
                  </>
                ) : "Connect eBay Seller Account"}
              </button>
            </div>
          )}

          {/* Connected but missing policies */}
          {!authLoading && user && ebayConnected && !hasPolicies && (
            <div style={{ padding: "16px 0" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--t)", marginBottom: 10 }}>
                eBay seller policies needed
              </div>
              <div style={{ fontSize: 12, color: "var(--ts)", lineHeight: 1.65, marginBottom: 14 }}>
                Before listing, your eBay account needs at least one each of: shipping, payment, and return policies.
                {missingPolicies && (
                  <span style={{ color: "#ff9800" }}> Missing: {missingPolicies.join(", ")}.</span>
                )}
              </div>
              {/* Deep-link to create each missing policy directly */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
                {(missingPolicies && missingPolicies.length > 0 ? missingPolicies : Object.keys(EBAY_POLICY_DEEP_LINKS)).map(p => (
                  <a
                    key={p}
                    href={EBAY_POLICY_DEEP_LINKS[p] || EBAY_POLICIES_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: "inline-block", background: "#e53935", color: "#fff", fontWeight: 700, fontSize: 12, padding: "9px 18px", borderRadius: 8, textDecoration: "none", textTransform: "capitalize" }}
                  >
                    Create {p} on eBay →
                  </a>
                ))}
              </div>
              <a
                href={EBAY_POLICIES_URL}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 11, color: "var(--tm)", textDecoration: "underline" }}
              >
                Or view all policies in eBay Seller Hub
              </a>
              <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
                <button
                  onClick={refreshPolicies}
                  disabled={connecting}
                  style={{ fontSize: 11, color: "#ff6b35", background: "transparent", border: "1px solid #ff6b3540", borderRadius: 8, padding: "6px 14px", cursor: "pointer" }}
                >
                  {connecting ? "Re-checking…" : "Re-check policies"}
                </button>
                <button
                  onClick={disconnect}
                  style={{ fontSize: 11, color: "var(--tm)", background: "transparent", border: "1px solid var(--b)", borderRadius: 8, padding: "6px 14px", cursor: "pointer" }}
                >
                  Disconnect eBay
                </button>
              </div>
            </div>
          )}

          {/* Missing ship-from location */}
          {!authLoading && user && ebayConnected && hasPolicies && !hasLocation && !result && (
            <div style={{ padding: "16px 0" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--t)", marginBottom: 10 }}>
                Setting up ship-from location
              </div>
              <div style={{ fontSize: 12, color: "var(--ts)", lineHeight: 1.65, marginBottom: 14 }}>
                eBay needs a ship-from location to determine your listing&apos;s country. Click <strong>Retry</strong> and the app will set this up automatically.
              </div>
              {ebayAuth?.locationError && (
                <div style={{ fontSize: 10, color: "#ff9800", lineHeight: 1.5, marginBottom: 14, padding: "8px 12px", background: "rgba(255,152,0,0.08)", borderRadius: 8, fontFamily: "monospace", wordBreak: "break-all" }}>
                  eBay error ({ebayAuth.locationError.status}): {JSON.stringify(ebayAuth.locationError.body)}
                </div>
              )}
              <div style={{ fontSize: 11, color: "var(--tg)", lineHeight: 1.6, marginBottom: 14, padding: "10px 12px", background: "var(--deep)", borderRadius: 8 }}>
                If this keeps failing, your eBay account may not support this feature. Try disconnecting and reconnecting, or contact{" "}
                <a href="https://www.ebay.com/help/selling" target="_blank" rel="noopener noreferrer" style={{ color: "var(--tm)", textDecoration: "underline" }}>eBay seller support</a>.
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={refreshPolicies}
                  disabled={connecting}
                  style={{ fontSize: 11, color: "#ff6b35", background: "transparent", border: "1px solid #ff6b3540", borderRadius: 8, padding: "6px 14px", cursor: "pointer" }}
                >
                  {connecting ? "Setting up…" : "Retry"}
                </button>
                <button
                  onClick={disconnect}
                  style={{ fontSize: 11, color: "var(--tm)", background: "transparent", border: "1px solid var(--b)", borderRadius: 8, padding: "6px 14px", cursor: "pointer" }}
                >
                  Disconnect eBay
                </button>
              </div>
            </div>
          )}

          {/* Ready to list */}
          {!authLoading && user && ebayConnected && hasPolicies && hasLocation && !result && (
            <>
              {/* Card(s) preview */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 9, color: "var(--tg)", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, marginBottom: 8 }}>
                  {isBundle ? "Cards in this bundle" : "Card"}
                </div>
                <div style={{ maxHeight: isBundle ? 180 : "none", overflowY: isBundle ? "auto" : "visible" }}>
                  {cards.map((c) => <CardThumbnail key={c.id} card={c} />)}
                </div>
              </div>

              {/* Title */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                  <label style={{ fontSize: 9, color: "var(--tg)", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>Listing Title</label>
                  <span style={{ fontSize: 9, color: titleLeft < 10 ? "#ff6666" : "var(--tm)" }}>{titleLeft} chars left</span>
                </div>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value.slice(0, 80))}
                  style={{
                    width: "100%", background: "var(--input)", border: "1px solid var(--b)",
                    borderRadius: 8, color: "var(--t)", fontSize: 12, padding: "8px 10px", outline: "none",
                  }}
                />
              </div>

              {/* Price + Condition (side by side) */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={{ display: "block", fontSize: 9, color: "var(--tg)", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, marginBottom: 5 }}>
                    Buy It Now Price (USD)
                  </label>
                  <div style={{ position: "relative" }}>
                    <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--td)", fontSize: 12 }}>$</span>
                    <input
                      type="number"
                      min="0.99"
                      step="0.01"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder="0.00"
                      style={{
                        width: "100%", background: "var(--input)", border: "1px solid var(--b)",
                        borderRadius: 8, color: "var(--t)", fontSize: 12, padding: "8px 10px 8px 22px", outline: "none",
                      }}
                    />
                  </div>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 9, color: "var(--tg)", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, marginBottom: 5 }}>
                    {isBundle ? "Overall Condition" : "Condition"}
                  </label>
                  <select
                    value={condition}
                    onChange={(e) => setCondition(e.target.value)}
                    style={{
                      width: "100%", background: "var(--deep)", border: "1px solid var(--b)",
                      borderRadius: 8, color: "var(--ts)", fontSize: 12, padding: "8px 10px", outline: "none", cursor: "pointer",
                    }}
                  >
                    {CONDITION_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {/* Extra notes */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 9, color: "var(--tg)", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, marginBottom: 5 }}>
                  Additional Notes (optional)
                </label>
                <textarea
                  value={extraNotes}
                  onChange={(e) => setExtraNotes(e.target.value)}
                  placeholder="Any condition details, print quirks, storage notes…"
                  rows={2}
                  style={{
                    width: "100%", background: "var(--input)", border: "1px solid var(--b)",
                    borderRadius: 8, color: "var(--ts)", fontSize: 12, padding: "8px 10px",
                    resize: "vertical", outline: "none", fontFamily: "inherit", lineHeight: 1.5,
                  }}
                />
              </div>

              {/* Progress steps */}
              {listing && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16, padding: "12px 14px", background: "var(--card)", border: "1px solid var(--b)", borderRadius: 10 }}>
                  <Step n={1} label="Authorising with eBay"     done active={stepText.includes("Authoris")} />
                  <Step n={2} label="Creating listing"           done={false} active={stepText.includes("Creating")} />
                  <Step n={3} label="Publishing — going live"    done={false} active={stepText.includes("Publish")} />
                </div>
              )}

              {/* Error */}
              {error && (
                <div style={{ fontSize: 12, color: "#ff6666", background: "#ff444412", border: "1px solid #ff444430", borderRadius: 8, padding: "10px 12px", marginBottom: 14, lineHeight: 1.6 }}>
                  {error}
                </div>
              )}

              {/* Account status */}
              <div style={{ fontSize: 10, color: "var(--tg)", marginBottom: 16, display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ color: "#4caf50" }}>●</span> eBay seller account connected ·
                <button onClick={disconnect} style={{ background: "none", border: "none", color: "var(--tm)", cursor: "pointer", fontSize: 10, padding: 0, textDecoration: "underline" }}>disconnect</button>
              </div>
            </>
          )}

          {/* Success */}
          {result && (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <div style={{ fontSize: 44, marginBottom: 12 }}>🎉</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "var(--t)", fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1.5, marginBottom: 8 }}>
                {isBundle ? "Bundle listed on eBay!" : "Card listed on eBay!"}
              </div>
              <div style={{ fontSize: 12, color: "var(--ts)", marginBottom: 20, lineHeight: 1.6 }}>
                Your listing is live. eBay buyers can find it right now.
              </div>
              <a
                href={result.listingUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  background: "#e53935", color: "#fff", fontWeight: 700, fontSize: 12,
                  padding: "10px 22px", borderRadius: 10, textDecoration: "none",
                }}
              >
                View listing on eBay →
              </a>
            </div>
          )}
        </div>

        {/* Footer CTA */}
        {!authLoading && user && ebayConnected && hasPolicies && hasLocation && !result && (
          <div style={{
            padding: "12px 18px 16px",
            borderTop: "1px solid var(--bf)",
            flexShrink: 0,
            display: "flex", gap: 10,
          }}>
            <button
              onClick={onClose}
              style={{
                flex: 1, background: "transparent", border: "1px solid var(--b)",
                color: "var(--ts)", borderRadius: 10, padding: "11px 0",
                fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}
            >Cancel</button>
            <button
              onClick={handleList}
              disabled={listing || !price}
              style={{
                flex: 2,
                background: listing || !price ? "var(--deep)" : "#e53935",
                border:  listing || !price ? "1px solid var(--b)" : "none",
                color:   listing || !price ? "var(--td)" : "#fff",
                borderRadius: 10, padding: "11px 0",
                fontSize: 13, fontWeight: 700,
                cursor: listing || !price ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}
            >
              {listing ? (
                <>
                  <div style={{ width: 13, height: 13, border: "2px solid #fff", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                  {stepText || "Listing…"}
                </>
              ) : (
                isBundle ? `List ${cards.length} cards on eBay` : "List on eBay"
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
