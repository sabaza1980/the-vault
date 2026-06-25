import { useState, useEffect } from "react";

// Reusable card detail overlay (WP-0 / S1).
//
// Self-contained: depends on nothing inside App.jsx, so it can be opened from the
// Top 10 / Favourites / PC strips (WP-3) or anywhere else. Handler prop signatures
// match CardItem's parent handlers so it is a drop-in:
//   onUpdate(cardId, partial)  · toggle favourite / PC
//   onShare(card)              · open the share modal for this card
//   onSell(card)               · open the sell / eBay listing flow (optional)
//   onClose()                  · dismiss the overlay
//
// This is the focused detail (big image + identity + value + quick actions). The
// full inline editor (rescan, corrections, back-image, notes) still lives in
// CardItem for the main list; this overlay covers the "tap a card to see it" need.

const RARITY_COLORS = {
  Common: "#555", Uncommon: "#4caf50", Rare: "#2196f3",
  "Very Rare": "#9c27b0", "Ultra Rare": "#ff9800", Legendary: "#f44336",
};

function Badge({ label, color }) {
  return (
    <span style={{
      fontSize: 10, padding: "3px 8px", borderRadius: 6,
      background: `${color}18`, color, border: `1px solid ${color}35`,
      fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, whiteSpace: "nowrap",
    }}>{label}</span>
  );
}

export default function CardDetailModal({ card, onUpdate, onShare, onSell, onClose, onRefreshPrice }) {
  const [zoomed, setZoomed] = useState(false);
  const [confirming, setConfirming] = useState(false); // WP-5a L3: confirm unverified cards
  const [draft, setDraft] = useState({});
  const [refreshing, setRefreshing] = useState(false);  // WP-5b: re-pricing in progress

  // Close on Escape.
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { if (zoomed) setZoomed(false); else onClose?.(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomed, onClose]);

  if (!card) return null;

  const rColor = RARITY_COLORS[card.rarity] || "#555";
  const fullCardName = [card.year, card.brand, card.series].filter(Boolean).join(" ")
    || card.fullCardName
    || "Unknown Set";
  const parallelLabel = card.parallel && card.parallel !== "Base" ? card.parallel : null;
  const ev = Number(card.estimatedValue) || 0;
  const canSell = typeof onSell === "function";

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.72)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
    >
      {/* Full-screen zoom of the card image */}
      {zoomed && (
        <div
          onClick={(e) => { e.stopPropagation(); setZoomed(false); }}
          style={{
            position: "fixed", inset: 0, zIndex: 1100, background: "rgba(0,0,0,0.92)",
            display: "flex", alignItems: "center", justifyContent: "center", cursor: "zoom-out",
          }}
        >
          <img src={card.imageUrl} alt={card.playerName}
            style={{ maxWidth: "92%", maxHeight: "92%", borderRadius: 12, objectFit: "contain" }} />
        </div>
      )}

      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 480, maxHeight: "92vh", overflowY: "auto",
          background: "linear-gradient(160deg, var(--card) 0%, var(--card2) 100%)",
          border: `1px solid ${rColor}40`,
          borderRadius: "20px 20px 0 0",
          boxShadow: `0 -10px 50px ${rColor}25`,
          padding: "10px 18px 28px",
        }}
      >
        {/* Grab handle + close */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ width: 38, height: 4, borderRadius: 3, background: "var(--so)", margin: "4px auto 0", flex: "0 0 auto" }} />
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              position: "absolute", right: 16, top: 14,
              background: "var(--gbg)", border: "1px solid var(--gb)", borderRadius: "50%",
              width: 30, height: 30, color: "var(--gc)", fontSize: 15, cursor: "pointer", lineHeight: 1,
            }}
          >✕</button>
        </div>

        {/* Hero image */}
        <div style={{
          background: `linear-gradient(180deg, ${rColor}20 0%, transparent 100%)`,
          padding: "14px 0 18px", display: "flex", justifyContent: "center",
        }}>
          <div
            onClick={() => setZoomed(true)}
            title="Tap to zoom"
            style={{
              width: 190, height: 264, borderRadius: 14, overflow: "hidden",
              border: `2px solid ${rColor}55`,
              boxShadow: `0 12px 44px ${rColor}30, 0 0 0 1px rgba(255,255,255,0.04)`,
              cursor: "zoom-in",
            }}
          >
            <img src={card.imageUrl} alt={card.playerName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
        </div>

        {/* Set line — concise + clamped */}
        <div style={{ fontSize: 11, color: "var(--tl)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4, lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {fullCardName}
          {card.insertName && <span style={{ color: "#64b5f6" }}> · {card.insertName}</span>}
          {parallelLabel && <span style={{ color: "#ff6b3580" }}> · {parallelLabel}</span>}
        </div>

        {/* Player name + rarity */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
          <h2 style={{
            margin: 0, fontSize: 30, fontWeight: 800, color: "var(--t)",
            fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1.5, lineHeight: 1,
          }}>{card.playerName}</h2>
          {card.rarity && card.rarity !== "Common" && (
            <span style={{
              fontSize: 10, padding: "3px 8px", borderRadius: 20, flexShrink: 0, marginTop: 2,
              background: `${rColor}18`, color: rColor, border: `1px solid ${rColor}35`,
              fontWeight: 700, textTransform: "uppercase", letterSpacing: 1,
            }}>{card.rarity}</span>
          )}
        </div>

        {/* Team */}
        {card.team && card.team !== "Unknown" && (
          <div style={{ color: "var(--tm)", fontSize: 13, marginTop: 4 }}>{card.team}</div>
        )}

        {/* Category pill */}
        {card.cardCategory && card.cardCategory !== "Other" && card.cardCategory !== "Unknown" && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 6 }}>
            <span style={{
              fontSize: 10, padding: "2px 8px", borderRadius: 20,
              background: "rgba(240,192,64,0.1)", color: "#c8a020",
              border: "1px solid rgba(240,192,64,0.2)",
              fontWeight: 700, textTransform: "uppercase", letterSpacing: 1,
            }}>{card.cardCategory}</span>
          </div>
        )}

        {/* Badges */}
        <div style={{ display: "flex", gap: 5, marginTop: 10, flexWrap: "wrap" }}>
          {card.isRookie && <Badge label="RC" color="#ff6b35" />}
          {card.hasAutograph && <Badge label="AUTO" color="#f0c040" />}
          {card.hasPatch && <Badge label="PATCH" color="#26c6da" />}
          {card.isInsert && !card.insertName && <Badge label="INSERT" color="#64b5f6" />}
          {card.serialNumber && <Badge label={card.serialNumber} color="#ce93d8" />}
          {card.cardNumber && <Badge label={`#${String(card.cardNumber).replace(/^#+/, "")}`} color="#888" />}
          {card.isPC && <Badge label="PC" color="#2196f3" />}
          {card.ebayListingUrl && <Badge label="Listed on eBay" color="#e53935" />}
        </div>

        {/* Price box (WP-5b): value + source / condition / recency + refresh */}
        {(() => {
          const isEstimate = card.priceSource === "AI estimate";
          const priceColor = ev <= 0 ? "var(--tf)" : isEstimate ? "#f0c040" : "#4caf50";
          const meta = ev <= 0
            ? "No market comp yet — tap refresh"
            : isEstimate
              ? "AI estimate · no market comp"
              : `Market comp · ${card.priceSource || "Ximilar"}${card.priceCondition ? ` · ${card.priceCondition}` : ""}${card.priceVolume ? ` · ${card.priceVolume} sale${card.priceVolume === 1 ? "" : "s"}` : ""}${card.priceAsOf ? ` · ${card.priceAsOf}` : ""}`;
          return (
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--bf)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 38, fontWeight: 800, color: priceColor, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1, lineHeight: 1 }}>
                  {ev > 0 ? `$${ev.toFixed(2)}` : "—"}
                </div>
                <div style={{ fontSize: 10, color: "var(--tg)", letterSpacing: 0.4, marginTop: 4 }}>{refreshing ? "Refreshing price…" : meta}</div>
              </div>
              {onRefreshPrice && (
                <button
                  onClick={async () => { if (refreshing) return; setRefreshing(true); try { await onRefreshPrice(card); } finally { setRefreshing(false); } }}
                  disabled={refreshing}
                  aria-label="Refresh price"
                  title="Refresh price"
                  style={{ flexShrink: 0, width: 36, height: 36, borderRadius: "50%", background: "var(--gbg)", border: "1px solid var(--gb)", color: "var(--gc)", cursor: refreshing ? "default" : "pointer", opacity: refreshing ? 0.5 : 1, display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                    <polyline points="21 3 21 9 15 9" />
                  </svg>
                </button>
              )}
            </div>
          );
        })()}

        {/* Confirm flow — for cards image recognition couldn't verify (WP-5a L3) */}
        {card.confidenceLevel === "Low" && !confirming && (
          <div style={{ marginTop: 16, padding: "11px 13px", borderRadius: 12, background: "rgba(255,107,53,0.08)", border: "1px solid rgba(255,107,53,0.3)" }}>
            <div style={{ fontSize: 12, color: "#ff6b35", fontWeight: 700, marginBottom: 4 }}>⚠ Couldn't verify this card</div>
            <div style={{ fontSize: 11, color: "var(--tm)", lineHeight: 1.4, marginBottom: 9 }}>It may be a new or rare product we don't recognise yet. Confirm the details so the value is accurate.</div>
            <button
              onClick={() => { setDraft({ playerName: card.playerName || "", year: card.year || "", series: card.series || card.brand || "", cardNumber: card.cardNumber || "", parallel: card.parallel || "", serialNumber: card.serialNumber || "" }); setConfirming(true); }}
              style={{ background: "#ff6b35", border: "none", borderRadius: 9, padding: "8px 14px", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
            >Confirm details</button>
          </div>
        )}

        {confirming && (
          <div style={{ marginTop: 16, padding: 13, borderRadius: 12, background: "var(--surface)", border: "1px solid var(--b)" }}>
            <div style={{ fontSize: 11, color: "var(--tg)", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, marginBottom: 10 }}>Confirm card details</div>
            {[
              { k: "playerName", label: "Player / name" },
              { k: "year", label: "Year" },
              { k: "series", label: "Set / series" },
              { k: "cardNumber", label: "Card number" },
              { k: "parallel", label: "Parallel" },
              { k: "serialNumber", label: "Serial (e.g. 5/99)" },
            ].map(({ k, label }) => (
              <div key={k} style={{ marginBottom: 8 }}>
                <label style={{ display: "block", fontSize: 10, color: "var(--tg)", marginBottom: 3 }}>{label}</label>
                <input
                  value={draft[k] ?? ""}
                  onChange={e => setDraft(d => ({ ...d, [k]: e.target.value }))}
                  style={{ width: "100%", padding: "8px 10px", background: "var(--input)", border: "1px solid var(--b)", borderRadius: 8, color: "var(--t)", fontSize: 13, outline: "none" }}
                />
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button
                onClick={() => { onUpdate?.(card.id, { ...draft, confidenceLevel: "Confirmed" }); setConfirming(false); }}
                style={{ flex: 1, background: "linear-gradient(135deg, #ff6b35, #f7931e)", border: "none", borderRadius: 10, padding: 10, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
              >Save</button>
              <button
                onClick={() => setConfirming(false)}
                style={{ flex: "0 0 auto", background: "var(--gbg)", border: "1px solid var(--gb)", borderRadius: 10, padding: "10px 16px", color: "var(--gc)", fontSize: 13, cursor: "pointer" }}
              >Cancel</button>
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, marginTop: 18, flexWrap: "wrap" }}>
          <button
            onClick={() => onUpdate?.(card.id, { isFavourite: !card.isFavourite })}
            style={{
              flex: "1 1 auto", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              background: card.isFavourite ? "rgba(240,192,64,0.14)" : "var(--gbg)",
              border: `1px solid ${card.isFavourite ? "rgba(240,192,64,0.4)" : "var(--gb)"}`,
              borderRadius: 12, padding: "11px 12px", cursor: "pointer",
              color: card.isFavourite ? "#f0c040" : "var(--gc)", fontSize: 12, fontWeight: 700, letterSpacing: 0.3,
            }}
          >{card.isFavourite ? "★ Favourited" : "☆ Favourite"}</button>

          <button
            onClick={() => onUpdate?.(card.id, { isPC: !card.isPC })}
            style={{
              flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              background: card.isPC ? "rgba(33,150,243,0.15)" : "var(--gbg)",
              border: `1px solid ${card.isPC ? "rgba(33,150,243,0.4)" : "var(--gb)"}`,
              borderRadius: 12, padding: "11px 14px", cursor: "pointer",
              color: card.isPC ? "#2196f3" : "var(--gc)", fontSize: 12, fontWeight: 800, letterSpacing: 0.5,
            }}
          >PC</button>

          <button
            onClick={() => onShare?.(card)}
            style={{
              flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              background: "var(--gbg)", border: "1px solid var(--gb)", borderRadius: 12,
              padding: "11px 14px", cursor: "pointer", color: "#ff6b35", fontSize: 12, fontWeight: 700, letterSpacing: 0.3,
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
              <polyline points="16 6 12 2 8 6" />
              <line x1="12" y1="2" x2="12" y2="15" />
            </svg>
            Share
          </button>
        </div>

        {canSell && (
          <button
            onClick={() => onSell(card)}
            style={{
              width: "100%", marginTop: 8,
              background: "linear-gradient(135deg, #ff6b35 0%, #f7931e 100%)",
              border: "none", borderRadius: 12, padding: "12px", cursor: "pointer",
              color: "#fff", fontSize: 13, fontWeight: 800, letterSpacing: 0.5,
            }}
          >{card.ebayListingUrl ? "Manage listing" : "Sell this card"}</button>
        )}
      </div>
    </div>
  );
}
