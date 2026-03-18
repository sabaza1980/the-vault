import { useState, useCallback } from "react";

const CT_TOKEN_KEY = "cardtrader_token";

const CONDITION_OPTIONS = ["Mint", "Near Mint", "Excellent", "Good", "Fair", "Poor"];

function loadToken() {
  try { return localStorage.getItem(CT_TOKEN_KEY) || ""; } catch { return ""; }
}
function saveToken(t) {
  try { localStorage.setItem(CT_TOKEN_KEY, t); } catch { /* storage unavailable */ }
}

export default function CardtraderModal({ card, blueprintId, blueprintName, onClose, onSuccess }) {
  const [token, setToken]               = useState(loadToken);
  const [tokenInput, setTokenInput]     = useState(loadToken);
  const [tokenSaved, setTokenSaved]     = useState(!!loadToken());
  const [tokenStep, setTokenStep]       = useState(!loadToken()); // show token setup until saved

  const [price, setPrice]               = useState(() =>
    card.estimatedValue ? (card.estimatedValue * 0.9).toFixed(2) : ""
  );
  const [condition, setCondition]       = useState(card.condition || "Near Mint");
  const [description, setDescription]  = useState("");
  const [quantity, setQuantity]         = useState(1);

  const [listing, setListing]           = useState(false);
  const [result, setResult]             = useState(null);
  const [error, setError]               = useState(null);

  // If no blueprint_id, we show a manual entry field
  const [manualBlueprintId, setManualBlueprintId] = useState("");
  const effectiveBlueprintId = blueprintId || manualBlueprintId;

  function handleSaveToken() {
    const t = tokenInput.trim();
    if (!t) return;
    saveToken(t);
    setToken(t);
    setTokenSaved(true);
    setTokenStep(false);
  }

  const handleList = useCallback(async () => {
    if (!effectiveBlueprintId) { setError("Blueprint ID is required. Find it on cardtrader.com/en/cards."); return; }
    if (!price || parseFloat(price) <= 0) { setError("Please enter a valid price."); return; }
    setListing(true);
    setError(null);
    try {
      const res = await fetch("/api/cardtrader-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ctToken: token,
          blueprint_id: effectiveBlueprintId,
          price: parseFloat(price),
          quantity,
          condition,
          description: description || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
      setResult(data);
      onSuccess?.(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setListing(false);
    }
  }, [token, effectiveBlueprintId, price, quantity, condition, description, onSuccess]);

  return (
    <>
      <style>{`
        @keyframes ctSlideUp { from{transform:translateY(30px);opacity:0} to{transform:translateY(0);opacity:1} }
      `}</style>

      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 900,
          background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)",
        }}
      />

      {/* Panel */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
          zIndex: 901, width: "100%", maxWidth: 480,
          background: "#0d0d1a", border: "1px solid #1a1a2e",
          borderRadius: "20px 20px 0 0", padding: "24px 20px 40px",
          animation: "ctSlideUp 0.25s ease",
        }}
      >
        {/* Handle */}
        <div style={{ width: 36, height: 4, borderRadius: 2, background: "#ffffff18", margin: "0 auto 20px" }} />

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8, flexShrink: 0,
            background: "rgba(0,180,120,0.12)", border: "1px solid rgba(0,180,120,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
          }}>🃏</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#f0f0f0", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 1 }}>
              LIST ON CARDTRADER
            </div>
            <div style={{ fontSize: 11, color: "#555", marginTop: 1 }}>{card.playerName}</div>
          </div>
          <button onClick={onClose} style={{ marginLeft: "auto", background: "none", border: "none", color: "#444", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: 4 }}>✕</button>
        </div>

        {/* ── Token setup step ── */}
        {tokenStep ? (
          <div>
            <div style={{ fontSize: 11, color: "var(--ts)", lineHeight: 1.7, marginBottom: 16 }}>
              To list cards you need a CardTrader API token.{" "}
              <a href="https://www.cardtrader.com/en/developers" target="_blank" rel="noopener noreferrer" style={{ color: "#00b478" }}>
                Get one here →
              </a>
            </div>
            <label style={{ fontSize: 10, color: "#666", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 1, textTransform: "uppercase", display: "block", marginBottom: 6 }}>
              Your API Token
            </label>
            <input
              type="password"
              value={tokenInput}
              onChange={e => setTokenInput(e.target.value)}
              placeholder="Paste your CardTrader bearer token…"
              style={{
                width: "100%", background: "#07070f", border: "1px solid #1a1a2e",
                borderRadius: 8, color: "#f0f0f0", fontSize: 12, padding: "10px 12px",
                outline: "none", boxSizing: "border-box",
              }}
            />
            <div style={{ fontSize: 10, color: "#444", marginTop: 6, lineHeight: 1.5 }}>
              Stored locally on this device only — never sent to our servers except to proxy CT API calls.
            </div>
            <button
              onClick={handleSaveToken}
              disabled={!tokenInput.trim()}
              style={{
                marginTop: 14, width: "100%", background: "#00b478", border: "none",
                borderRadius: 10, padding: "12px", color: "#fff", fontSize: 13,
                fontWeight: 700, cursor: tokenInput.trim() ? "pointer" : "not-allowed",
                opacity: tokenInput.trim() ? 1 : 0.5,
              }}
            >Save Token & Continue</button>
            {tokenSaved && (
              <button onClick={() => setTokenStep(false)} style={{ marginTop: 8, width: "100%", background: "none", border: "none", color: "#555", fontSize: 11, cursor: "pointer" }}>
                Cancel — use existing token
              </button>
            )}
          </div>
        ) : result ? (
          /* ── Success ── */
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#00b478", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 1.5 }}>LISTED ON CARDTRADER</div>
            <div style={{ fontSize: 12, color: "#555", marginTop: 6 }}>Product ID: {result.id}</div>
            <a
              href={result.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "inline-block", marginTop: 16, padding: "10px 24px", background: "#00b47820", border: "1px solid #00b47840", borderRadius: 10, color: "#00b478", fontSize: 12, fontWeight: 700, textDecoration: "none" }}
            >View on CardTrader →</a>
            <button onClick={onClose} style={{ display: "block", margin: "12px auto 0", background: "none", border: "none", color: "#555", fontSize: 11, cursor: "pointer" }}>Close</button>
          </div>
        ) : (
          /* ── Listing form ── */
          <div>
            {/* Blueprint info */}
            <div style={{ background: "#07070f", border: "1px solid #1a1a2e", borderRadius: 10, padding: "10px 12px", marginBottom: 16 }}>
              <div style={{ fontSize: 9, color: "#555", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>CardTrader Blueprint</div>
              {blueprintId ? (
                <div style={{ fontSize: 12, color: "#f0f0f0" }}>
                  {blueprintName || `Blueprint #${blueprintId}`}
                  <span style={{ fontSize: 10, color: "#555", marginLeft: 8 }}>ID: {blueprintId}</span>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 11, color: "#888", marginBottom: 6 }}>
                    Blueprint not auto-detected.{" "}
                    <a href={`https://www.cardtrader.com/en/search?q=${encodeURIComponent(card.playerName)}`} target="_blank" rel="noopener noreferrer" style={{ color: "#00b478" }}>
                      Find it on CardTrader →
                    </a>
                  </div>
                  <input
                    type="number"
                    value={manualBlueprintId}
                    onChange={e => setManualBlueprintId(e.target.value)}
                    placeholder="Paste blueprint ID…"
                    style={{
                      width: "100%", background: "#0d0d1a", border: "1px solid #1a1a2e",
                      borderRadius: 6, color: "#f0f0f0", fontSize: 12, padding: "7px 10px",
                      outline: "none", boxSizing: "border-box",
                    }}
                  />
                </div>
              )}
            </div>

            {/* Price */}
            <label style={{ fontSize: 10, color: "#666", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 1, textTransform: "uppercase", display: "block", marginBottom: 6 }}>
              Price (€)
            </label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={price}
              onChange={e => setPrice(e.target.value)}
              style={{
                width: "100%", background: "#07070f", border: "1px solid #1a1a2e",
                borderRadius: 8, color: "#f0f0f0", fontSize: 18, fontWeight: 700,
                padding: "10px 12px", outline: "none", marginBottom: 14, boxSizing: "border-box",
              }}
            />

            {/* Condition */}
            <label style={{ fontSize: 10, color: "#666", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 1, textTransform: "uppercase", display: "block", marginBottom: 6 }}>
              Condition
            </label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
              {CONDITION_OPTIONS.map(c => (
                <button
                  key={c}
                  onClick={() => setCondition(c)}
                  style={{
                    padding: "5px 12px", borderRadius: 8, fontSize: 11, cursor: "pointer",
                    background: condition === c ? "rgba(0,180,120,0.15)" : "#07070f",
                    border: `1px solid ${condition === c ? "rgba(0,180,120,0.4)" : "#1a1a2e"}`,
                    color: condition === c ? "#00b478" : "#666",
                    fontWeight: condition === c ? 700 : 400,
                  }}
                >{c}</button>
              ))}
            </div>

            {/* Quantity */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              <label style={{ fontSize: 10, color: "#666", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 1, textTransform: "uppercase" }}>Quantity</label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button onClick={() => setQuantity(q => Math.max(1, q - 1))} style={{ width: 28, height: 28, borderRadius: 6, background: "#07070f", border: "1px solid #1a1a2e", color: "#888", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>−</button>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#f0f0f0", minWidth: 24, textAlign: "center" }}>{quantity}</span>
                <button onClick={() => setQuantity(q => q + 1)} style={{ width: 28, height: 28, borderRadius: 6, background: "#07070f", border: "1px solid #1a1a2e", color: "#888", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>+</button>
              </div>
            </div>

            {/* Description */}
            <label style={{ fontSize: 10, color: "#666", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 1, textTransform: "uppercase", display: "block", marginBottom: 6 }}>
              Notes (optional)
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Any extra details for buyers…"
              rows={2}
              style={{
                width: "100%", background: "#07070f", border: "1px solid #1a1a2e",
                borderRadius: 8, color: "#888", fontSize: 11, padding: "8px 10px",
                resize: "none", outline: "none", fontFamily: "inherit", lineHeight: 1.5,
                boxSizing: "border-box", marginBottom: 16,
              }}
            />

            {error && (
              <div style={{ background: "rgba(255,68,68,0.1)", border: "1px solid rgba(255,68,68,0.3)", borderRadius: 8, padding: "8px 12px", color: "#ff6666", fontSize: 11, marginBottom: 14 }}>
                {error}
              </div>
            )}

            <button
              onClick={handleList}
              disabled={listing || !effectiveBlueprintId}
              style={{
                width: "100%", background: listing ? "#07070f" : "#00b478", border: "1px solid #00b47840",
                borderRadius: 12, padding: "13px", color: "#fff", fontSize: 13, fontWeight: 700,
                cursor: listing || !effectiveBlueprintId ? "not-allowed" : "pointer",
                opacity: !effectiveBlueprintId ? 0.5 : 1,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}
            >
              {listing ? (
                <>
                  <div style={{ width: 14, height: 14, border: "2px solid #00b478", borderTopColor: "transparent", borderRadius: "50%", animation: "ctSlideUp 0.8s linear infinite" }} />
                  Listing…
                </>
              ) : "List on CardTrader"}
            </button>

            {/* Token link */}
            <div style={{ textAlign: "center", marginTop: 12 }}>
              <button
                onClick={() => setTokenStep(true)}
                style={{ background: "none", border: "none", color: "#333", fontSize: 10, cursor: "pointer" }}
              >Change API token</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
