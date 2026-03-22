import { useState, useRef, useCallback, useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { useAuth } from "./AuthContext";
import LandingPage from "./LandingPage";
import { useFirestoreSync } from "./useFirestoreSync";
import { useRewardProfile } from "./useRewardProfile";
import AuthModal from "./AuthModal";
import VaultChat from "./VaultChat";
import EbayListingModal from "./EbayListingModal";
import ShareModal from "./ShareModal";
import AdGateModal from "./AdGateModal";
import { storage, db } from "./firebase";
import { ref, uploadString, getDownloadURL } from "firebase/storage";
import { collection, doc, query, orderBy, limit, onSnapshot, updateDoc, setDoc, increment } from "firebase/firestore";

const ANTHROPIC_MODEL = "claude-sonnet-4-20250514";
const API_BASE = Capacitor.isNativePlatform() ? "https://app.myvaults.io" : "";

function resizeImageFile(file) {
  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const MAX = 800;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
        else { width = Math.round(width * MAX / height); height = MAX; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.80);
      resolve({ base64: dataUrl.split(",")[1], mediaType: "image/jpeg", previewSrc: dataUrl });
    };
    img.src = objectUrl;
  });
}

async function fetchCardHedgePricing(cardInfo) {
  const CARDHEDGE_API_KEY = import.meta.env.VITE_CARDHEDGE_API_KEY;
  const CARDHEDGE_BASE = 'https://api.cardhedger.com';

  const categoryMap = {
    'Panini': 'Basketball', 'Topps': 'Baseball', 'Bowman': 'Baseball',
    'Upper Deck': 'Hockey', 'Pokemon': 'Pokemon', 'Pokémon': 'Pokemon',
    'Magic': 'Magic The Gathering', 'Yu-Gi-Oh': 'Yu-Gi-Oh', 'One Piece': 'One Piece'
  };

  const category = cardInfo.cardCategory || categoryMap[cardInfo.brand] || 'Basketball';

  // Build a rich search query: full card name + player name
  const searchQuery = [
    cardInfo.playerName,
    cardInfo.year,
    cardInfo.brand,
    cardInfo.series,
    cardInfo.parallel && cardInfo.parallel !== 'Base' ? cardInfo.parallel : null
  ].filter(Boolean).join(' ');

  try {
    const searchRes = await fetch(`${CARDHEDGE_BASE}/v1/cards/card-search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': CARDHEDGE_API_KEY },
      body: JSON.stringify({
        search: searchQuery,
        category: category,
        rookie: cardInfo.isRookie || false,
        page: 1,
        page_size: 5
      })
    });
    console.log('[CardHedge] search status:', searchRes.status, 'query:', searchQuery, 'category:', category);
    if (!searchRes.ok) {
      console.error('[CardHedge] search failed:', await searchRes.text());
      return null;
    }
    const searchData = await searchRes.json();
    console.log('[CardHedge] search response:', JSON.stringify(searchData).slice(0, 500));

    // Handle various response shapes
    const results = searchData?.results || searchData?.data || searchData?.cards || [];
    if (!results.length) return null;

    const topCard = results[0];
    const cardId = topCard.id || topCard.card_id;
    console.log('[CardHedge] matched card:', topCard, 'cardId:', cardId);

    const priceRes = await fetch(`${CARDHEDGE_BASE}/v1/cards/${cardId}/price-history`, {
      headers: { 'X-API-Key': CARDHEDGE_API_KEY }
    });
    console.log('[CardHedge] price status:', priceRes.status);
    if (!priceRes.ok) {
      console.error('[CardHedge] price failed:', await priceRes.text());
      return null;
    }
    const priceData = await priceRes.json();
    console.log('[CardHedge] price response:', JSON.stringify(priceData).slice(0, 500));

    return {
      matchedCard: topCard.name || topCard.card_name || topCard.title,
      matchedImage: topCard.image_url || topCard.image,
      rawPrice: priceData.raw_price ?? priceData.prices?.raw ?? priceData.ungraded ?? null,
      psa9Price: priceData.psa9_price ?? priceData.prices?.psa9 ?? priceData.psa_9 ?? null,
      psa10Price: priceData.psa10_price ?? priceData.prices?.psa10 ?? priceData.psa_10 ?? null,
      sevenDaySales: priceData.seven_day_sales ?? priceData.sales_velocity?.seven_day ?? priceData.sales_7d ?? null,
      thirtyDaySales: priceData.thirty_day_sales ?? priceData.sales_velocity?.thirty_day ?? priceData.sales_30d ?? null,
      gain: priceData.weekly_gain ?? priceData.price_trend?.weekly ?? priceData.gain_7d ?? null,
      allPrices: priceData,
      cardId: cardId,
      isRookie: topCard.is_rookie || topCard.rookie,
      priceSource: 'Card Hedge'
    };
  } catch (e) {
    console.error('[CardHedge] fetch error:', e);
    return null;
  }
}

async function fetchTopMovers(category = 'Basketball') {
  const CARDHEDGE_API_KEY = import.meta.env.VITE_CARDHEDGE_API_KEY;
  const CARDHEDGE_BASE = 'https://api.cardhedger.com';
  try {
    const res = await fetch(`${CARDHEDGE_BASE}/v1/cards/top-movers?category=${encodeURIComponent(category)}`, {
      headers: { 'X-API-Key': CARDHEDGE_API_KEY }
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.error('Card Hedge top movers error:', e);
    return null;
  }
}

function Lightbox({ imageUrl, playerName, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.93)",
        display: "flex", alignItems: "center", justifyContent: "center",
        backdropFilter: "blur(16px)",
        animation: "fadeIn 0.2s ease"
      }}
    >
      <div onClick={e => e.stopPropagation()} style={{
        position: "relative", maxWidth: "92vw", maxHeight: "92vh",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 20
      }}>
        <img
          src={imageUrl}
          alt={playerName}
          style={{
            maxWidth: "85vw", maxHeight: "78vh",
            borderRadius: 18,
            boxShadow: "0 0 80px rgba(255,107,53,0.25), 0 0 0 1px rgba(255,255,255,0.08)",
            objectFit: "contain"
          }}
        />
        <button onClick={onClose} style={{
          background: "#ffffff12", border: "1px solid #ffffff18",
          color: "#ccc", borderRadius: 10, padding: "9px 28px",
          cursor: "pointer", fontSize: 13, fontWeight: 600, letterSpacing: 0.5
        }}>✕  Close</button>
      </div>
    </div>
  );
}

function CardSkeleton() {
  return (
    <div style={{
      background: "var(--card)", border: "1px solid var(--b)",
      borderRadius: 16, padding: 16, display: "flex", gap: 14,
      animation: "pulse 1.5s ease-in-out infinite"
    }}>
      <div style={{ width: 80, height: 110, borderRadius: 8, background: "var(--sk)", flexShrink: 0 }} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, paddingTop: 4 }}>
        <div style={{ height: 10, width: "40%", borderRadius: 4, background: "var(--sk)" }} />
        <div style={{ height: 22, width: "65%", borderRadius: 4, background: "var(--sk)" }} />
        <div style={{ height: 12, width: "50%", borderRadius: 4, background: "var(--sk)" }} />
        <div style={{ height: 10, width: "35%", borderRadius: 4, background: "var(--sk)" }} />
      </div>
    </div>
  );
}

function StatBadge({ label, value, color }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      background: `${color}12`, border: `1px solid ${color}35`,
      borderRadius: 10, padding: "8px 16px", minWidth: 72
    }}>
      <span style={{ fontSize: 18, fontWeight: 800, color, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1 }}>{value}</span>
      <span style={{ fontSize: 10, color: "var(--tm)", textTransform: "uppercase", letterSpacing: 1 }}>{label}</span>
    </div>
  );
}

function DetailRow({ label, value, color }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <span style={{ fontSize: 10, color: "var(--tg)", textTransform: "uppercase", letterSpacing: 1 }}>{label}</span>
      <span style={{ fontSize: 13, color: color || "var(--ts)", fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function CardItem({ card, onDelete, onUpdate, user, bundleMode, inBundle, onToggleBundle, onSell, onShare }) {
  const [expanded, setExpanded] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState(null);
  const [pricingData, setPricingData] = useState(null);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [pricingFetched, setPricingFetched] = useState(false);
  const [localNotes, setLocalNotes] = useState(card.userNotes || "");
  const [backAnalyzing, setBackAnalyzing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const backFileRef = useRef();

  const handleExpand = useCallback(async () => {
    const next = !expanded;
    setExpanded(next);
    if (next && !pricingFetched) {
      setPricingLoading(true);
      setPricingFetched(true);
      const pricingResult = await fetchCardHedgePricing(card);
      setPricingData(pricingResult);
      if (pricingResult?.rawPrice) onUpdate(card.id, { estimatedValue: pricingResult.rawPrice });
      setPricingLoading(false);
    }
  }, [expanded, pricingFetched, card, onUpdate]);

  const handleBackFile = async (file) => {
    if (!file) return;
    setBackAnalyzing(true);
    try {
      const { base64: backBase64, mediaType: backMediaType } = await resizeImageFile(file);

      // Upload back image to Firebase Storage (fall back to data URL if not signed in)
      let backImageUrl = `data:${backMediaType};base64,${backBase64}`;
      if (user) {
        try {
          const storageRef = ref(storage, `users/${user.uid}/cards/${card.id}_back.jpg`);
          await uploadString(storageRef, backBase64, "base64", { contentType: "image/jpeg" });
          backImageUrl = await getDownloadURL(storageRef);
        } catch (e) {
          console.warn("Back image storage upload failed", e);
        }
      }

      // Build message content — try to include the front image for better accuracy
      const content = [];
      let hasFrontImage = false;
      try {
        const resp = await fetch(card.imageUrl);
        const blob = await resp.blob();
        const frontBase64 = await new Promise((res, rej) => {
          const reader = new FileReader();
          reader.onload = () => res(reader.result.split(",")[1]);
          reader.onerror = rej;
          reader.readAsDataURL(blob);
        });
        content.push({ type: "image", source: { type: "base64", media_type: blob.type || "image/jpeg", data: frontBase64 } });
        content.push({ type: "text", text: "FRONT of card." });
        hasFrontImage = true;
      } catch (e) {
        console.warn("Could not include front image in re-analysis", e);
      }

      content.push({ type: "image", source: { type: "base64", media_type: backMediaType, data: backBase64 } });
      const sideNote = hasFrontImage
        ? "You have both the FRONT (above) and BACK (this image) of the same card."
        : "You have the BACK of this card.";
      content.push({
        type: "text",
        text: `${sideNote}

Focus ONLY on what the back of the card reveals that the front may not have shown. Look carefully for:
- SERIAL NUMBER: Any "X/Y" stamp (e.g. 45/99, 1/1) — check all edges, corners, and printed text
- AUTOGRAPH: Any ink signature, sticker auto, or hologram certification confirming an autograph
- PARALLEL: Any foil, color, or finish details confirming the specific parallel variant
- CARD NUMBER: The card number printed on the back (e.g. #278)
- CONDITION: Any damage, scratches, or print defects visible on this side

Output ONLY a valid JSON object — no markdown, no extra text — with these fields (omit any field you are not updating, use null if unsure):
{
  "serialNumber": "exact X/Y stamp as printed, or null",
  "hasAutograph": true or false,
  "autographType": "On-Card" | "Sticker" | null,
  "parallel": "confirmed parallel name or null",
  "cardNumber": "card number as printed, or null",
  "rarity": "Common | Uncommon | Rare | Very Rare | Ultra Rare | Legendary",
  "condition": "Mint | Near Mint | Excellent | Good | Fair | Poor | Unknown",
  "conditionDetail": "1-2 sentences on what this side of the card shows about condition, or null",
  "confidenceLevel": "High | Medium | Low",
  "notes": "any additional observations from the back, or null"
}`
      });

      const response = await fetch(`${API_BASE}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 600, messages: [{ role: "user", content }] })
      });
      if (!response.ok) throw new Error(`API ${response.status}`);
      const data = await response.json();
      const rawText = data.content.filter(b => b.type === "text").map(b => b.text).join("");
      let newInfo = {};
      try { newInfo = JSON.parse(rawText.replace(/```json|```/g, "").trim()); } catch { /* keep existing data */ }

      // Only apply card-authentication fields — never overwrite player identity/context
      const CARD_FIELDS = ["cardCategory", "serialNumber", "hasAutograph", "autographType", "parallel", "cardNumber", "rarity", "condition", "conditionDetail", "confidenceLevel", "notes"];
      const filtered = Object.fromEntries(
        Object.entries(newInfo).filter(([k, v]) => CARD_FIELDS.includes(k) && v !== null && v !== undefined)
      );

      onUpdate(card.id, { backImageUrl, ...filtered });
    } catch (err) {
      console.error("Back image analysis error:", err);
    } finally {
      setBackAnalyzing(false);
    }
  };

  const rarityColors = {
    "Common": "#555", "Uncommon": "#4caf50", "Rare": "#2196f3",
    "Very Rare": "#9c27b0", "Ultra Rare": "#ff9800", "Legendary": "#f44336", "Unknown": "#444"
  };
  const rColor = rarityColors[card.rarity] || "#555";

  // Build the full card label e.g. "2023-24 Panini Prizm"
  const fullCardName = card.fullCardName || [card.year, card.brand, card.series].filter(Boolean).join(" ") || "Unknown Set";
  const parallelLabel = card.parallel && card.parallel !== "Base" ? card.parallel : null;

  return (
    <>
      {lightboxSrc && <Lightbox imageUrl={lightboxSrc} playerName={card.playerName} onClose={() => setLightboxSrc(null)} />}

      <div style={{
        background: `linear-gradient(160deg, var(--card) 0%, var(--card2) 100%)`,
        border: `1px solid ${expanded ? rColor + "40" : "var(--bs)"}`,
        borderRadius: 16, overflow: "hidden",
        transition: "border-color 0.2s, box-shadow 0.2s, transform 0.15s",
        boxShadow: expanded ? `0 6px 28px ${rColor}15` : "none"
      }}
        onMouseEnter={e => e.currentTarget.style.transform = "translateY(-1px)"}
        onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}
      >
        <div style={{ display: "flex", gap: 14, padding: 14 }}>

          {/* Thumbnail — click = lightbox or bundle toggle */}
          <div
            onClick={() => bundleMode ? onToggleBundle(String(card.id)) : setLightboxSrc(card.imageUrl)}
            title={bundleMode ? (inBundle ? "Remove from bundle" : "Add to bundle") : "Click to zoom"}
            style={{
              width: 90, height: 124, borderRadius: 9, overflow: "hidden", flexShrink: 0,
              border: bundleMode ? `2px solid ${inBundle ? "#e53935" : "var(--b)"}` : `2px solid ${rColor}40`,
              boxShadow: bundleMode ? (inBundle ? "0 0 14px #e5393540" : "none") : `0 0 14px ${rColor}18`,
              cursor: bundleMode ? "pointer" : "zoom-in", position: "relative", display: "flex", alignItems: "center", justifyContent: "center",
              transition: "border-color 0.15s, box-shadow 0.15s"
            }}
          >
            <img src={card.imageUrl} alt={card.playerName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            {bundleMode ? (
              <div style={{
                position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
                background: inBundle ? "rgba(229,57,53,0.55)" : "rgba(0,0,0,0.35)",
                fontSize: 28, color: "#fff", fontWeight: 700
              }}>{inBundle ? "✓" : "○"}</div>
            ) : (
              <div style={{
                position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
                background: "rgba(0,0,0,0)", transition: "background 0.15s",
                fontSize: 20, color: "#fff", opacity: 0
              }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(0,0,0,0.5)"; e.currentTarget.style.opacity = 1; }}
                onMouseLeave={e => { e.currentTarget.style.background = "rgba(0,0,0,0)"; e.currentTarget.style.opacity = 0; }}
              >🔍</div>
            )}
          </div>

          {/* Info — click = expand */}
          <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={handleExpand}>

            {/* Set name — top line */}
            <div style={{ fontSize: 11, color: "var(--tl)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3, lineHeight: 1.3 }}>
              {fullCardName}
              {parallelLabel && <span style={{ color: "#ff6b3580" }}> · {parallelLabel}</span>}
              {card.pack && <span style={{ color: "var(--tg)" }}> · {card.pack}</span>}
            </div>

            {/* Player name + rarity badge */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
              <h3 style={{
                margin: 0, fontSize: 22, fontWeight: 800, color: "var(--t)",
                fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1.5, lineHeight: 1
              }}>{card.playerName}</h3>
              {card.rarity !== "Common" && (
                <span style={{
                  fontSize: 10, padding: "3px 8px", borderRadius: 20, flexShrink: 0, marginTop: 1,
                  background: `${rColor}18`, color: rColor, border: `1px solid ${rColor}35`,
                  fontWeight: 700, textTransform: "uppercase", letterSpacing: 1
                }}>{card.rarity}</span>
              )}
            </div>

            {/* Team */}
            {card.team && card.team !== "Unknown" && (
              <div style={{ color: "var(--tm)", fontSize: 13, marginTop: 3 }}>{card.team}</div>
            )}

            {/* Category pill */}
            {card.cardCategory && card.cardCategory !== "Other" && card.cardCategory !== "Unknown" && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 5 }}>
                <span style={{
                  fontSize: 10, padding: "2px 8px", borderRadius: 20,
                  background: "rgba(240,192,64,0.1)", color: "#c8a020",
                  border: "1px solid rgba(240,192,64,0.2)",
                  fontWeight: 700, textTransform: "uppercase", letterSpacing: 1
                }}>{card.cardCategory}</span>
              </div>
            )}

            {/* Badges */}
            <div style={{ display: "flex", gap: 5, marginTop: 8, flexWrap: "wrap" }}>
              {card.isRookie && <Badge label="RC" color="#ff6b35" />}
              {card.hasAutograph && <Badge label="AUTO" color="#f0c040" />}
              {card.serialNumber && <Badge label={card.serialNumber} color="#ce93d8" />}
              {card.cardNumber && <Badge label={`#${card.cardNumber}`} color="#555" />}
              {card.confidenceLevel === "Low" && <Badge label="⚠ Low Confidence" color="#ff6666" />}
              {card.ebayListingUrl && <Badge label="Listed on eBay" color="#e53935" />}
            </div>
          </div>

          {/* Star + Share column */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, alignSelf: "flex-start", marginTop: 10 }}>
            <button
              onClick={e => { e.stopPropagation(); onUpdate(card.id, { isFavourite: !card.isFavourite }); }}
              title={card.isFavourite ? "Remove from favourites" : "Add to favourites"}
              style={{
                background: "none", border: "none", cursor: "pointer",
                fontSize: 20, lineHeight: 1, padding: "2px 4px",
                color: card.isFavourite ? "#f0c040" : "var(--so)",
                transition: "color 0.15s"
              }}
              onMouseEnter={e => e.currentTarget.style.color = card.isFavourite ? "#f0c040" : "var(--sh)"}
              onMouseLeave={e => e.currentTarget.style.color = card.isFavourite ? "#f0c040" : "var(--so)"}
            >{card.isFavourite ? "★" : "☆"}</button>
            <button
              onClick={e => { e.stopPropagation(); onShare?.(card); }}
              title="Share this card"
              style={{
                background: "none", border: "none", cursor: "pointer",
                padding: "2px 4px", color: "rgba(255,107,53,0.45)",
                transition: "color 0.15s", lineHeight: 1
              }}
              onMouseEnter={e => e.currentTarget.style.color = "#ff6b35"}
              onMouseLeave={e => e.currentTarget.style.color = "rgba(255,107,53,0.45)"}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>
            </button>
          </div>
        </div>

        {/* Expanded panel */}
        {expanded && (
          <div style={{ borderTop: "1px solid var(--bf)", padding: "14px 14px 14px" }}>

            {/* Back of Card */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 9, color: "var(--tg)", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                Back of Card
                {backAnalyzing && (
                  <span style={{ display: "flex", alignItems: "center", gap: 4, color: "#ff6b35", fontSize: 8, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
                    <div style={{ width: 8, height: 8, border: "2px solid #ff6b35", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                    Re-analyzing…
                  </span>
                )}
              </div>
              <input ref={backFileRef} type="file" accept="image/*" style={{ display: "none" }}
                onChange={e => { handleBackFile(e.target.files[0]); e.target.value = ""; }} />
              {card.backImageUrl ? (
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <div
                    onClick={() => setLightboxSrc(card.backImageUrl)}
                    title="Click to zoom"
                    style={{ width: 90, height: 124, borderRadius: 9, overflow: "hidden", flexShrink: 0, border: "1px solid var(--bs)", cursor: "zoom-in" }}
                  >
                    <img src={card.backImageUrl} alt="back" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 2 }}>
                    <span style={{ fontSize: 11, color: "#4caf50" }}>✓ Analysis updated with back</span>
                    <button
                      onClick={() => backFileRef.current?.click()}
                      disabled={backAnalyzing}
                      style={{ background: "transparent", border: "1px solid var(--bs)", color: "var(--tm)", borderRadius: 8, padding: "4px 12px", cursor: "pointer", fontSize: 11 }}
                    >Replace</button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => backFileRef.current?.click()}
                  disabled={backAnalyzing}
                  style={{
                    display: "flex", alignItems: "center", gap: 7, width: "100%",
                    background: "var(--deep)", border: "1px dashed var(--bs)",
                    color: backAnalyzing ? "var(--tf)" : "var(--tm)", borderRadius: 10,
                    padding: "10px 16px", cursor: backAnalyzing ? "not-allowed" : "pointer",
                    fontSize: 12, fontWeight: 500
                  }}
                >
                  <span style={{ fontSize: 16 }}>📷</span>
                  Upload back of card — AI will re-analyze with both sides
                </button>
              )}
            </div>

            {/* Player context */}
            {card.playerContext && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                  <div style={{ fontSize: 9, color: "var(--tg)", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>About This Card</div>
                  {card.playerContextSearched && (
                    <span style={{
                      fontSize: 9, padding: "2px 7px", borderRadius: 6, fontWeight: 700,
                      background: "rgba(76,175,80,0.1)", color: "#4caf50",
                      border: "1px solid rgba(76,175,80,0.25)",
                      fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 0.5
                    }}>🔍 Live data</span>
                  )}
                </div>
                <p style={{ margin: 0, fontSize: 12, color: "var(--ts)", lineHeight: 1.7 }}>{card.playerContext}</p>
              </div>
            )}

            {/* Condition detail */}
            {card.conditionDetail && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                  <div style={{ fontSize: 9, color: "var(--tg)", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>Condition Assessment</div>
                  {card.condition && (
                    <span style={{
                      fontSize: 9, padding: "2px 7px", borderRadius: 6, fontWeight: 700,
                      background: card.condition === "Mint" ? "#4caf5020" : card.condition === "Near Mint" ? "#8bc34a20" : card.condition === "Excellent" ? "#ff980020" : "#88888820",
                      color: card.condition === "Mint" ? "#4caf50" : card.condition === "Near Mint" ? "#8bc34a" : card.condition === "Excellent" ? "#ff9800" : "#888",
                      border: `1px solid ${card.condition === "Mint" ? "#4caf5040" : card.condition === "Near Mint" ? "#8bc34a40" : card.condition === "Excellent" ? "#ff980040" : "#88888840"}`
                    }}>{card.condition}</span>
                  )}
                </div>
                <p style={{ margin: 0, fontSize: 12, color: "var(--ts)", lineHeight: 1.7 }}>{card.conditionDetail}</p>
              </div>
            )}

            {/* Meta grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px 16px", marginBottom: 12 }}>
              {card.parallel && <DetailRow label="Parallel" value={card.parallel} />}
              {card.cardNumber && <DetailRow label="Card #" value={card.cardNumber} />}
              {card.confidenceLevel && <DetailRow label="AI Confidence" value={card.confidenceLevel} color={
                card.confidenceLevel === "High" ? "#4caf50" : card.confidenceLevel === "Medium" ? "#ff9800" : "#ff4444"
              } />}
            </div>

            {card.notes && (
              <p style={{ margin: "0 0 12px", fontSize: 11, color: "var(--tg)", lineHeight: 1.6, fontStyle: "italic" }}>{card.notes}</p>
            )}

            {/* Pricing Data */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 9, color: "var(--tg)", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                Pricing Data
                <span style={{
                  fontSize: 8, fontWeight: 700, textTransform: "none", letterSpacing: 0, padding: "1px 5px", borderRadius: 4,
                  background: "rgba(255,107,53,0.12)", color: "#ff6b35", border: "1px solid rgba(255,107,53,0.25)"
                }}>Card Hedge</span>
              </div>
              {pricingLoading && (
                <div style={{ fontSize: 12, color: "var(--tg)", display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 10, height: 10, border: "2px solid #ff6b35", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                  Fetching pricing data...
                </div>
              )}
              {!pricingLoading && pricingData && (
                <>
                  {pricingData.matchedCard && (
                    <div style={{ fontSize: 10, color: "var(--tg)", marginBottom: 8, fontStyle: "italic" }}>
                      Matched: {pricingData.matchedCard}
                    </div>
                  )}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 10 }}>
                    {pricingData.rawPrice != null && (
                      <div style={{ background: "var(--deep)", border: "1px solid var(--b)", borderRadius: 10, padding: "10px 8px", textAlign: "center" }}>
                        <div style={{ fontSize: 9, color: "var(--tg)", textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600, marginBottom: 4 }}>Raw</div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: "#4caf50", fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1 }}>${pricingData.rawPrice.toFixed(2)}</div>
                      </div>
                    )}
                    {pricingData.psa9Price != null && (
                      <div style={{ background: "var(--deep)", border: "1px solid var(--b)", borderRadius: 10, padding: "10px 8px", textAlign: "center" }}>
                        <div style={{ fontSize: 9, color: "var(--tg)", textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600, marginBottom: 4 }}>PSA 9</div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: "#f0c040", fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1 }}>${pricingData.psa9Price.toFixed(2)}</div>
                      </div>
                    )}
                    {pricingData.psa10Price != null && (
                      <div style={{ background: "var(--deep)", border: "1px solid var(--b)", borderRadius: 10, padding: "10px 8px", textAlign: "center" }}>
                        <div style={{ fontSize: 9, color: "var(--tg)", textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600, marginBottom: 4 }}>PSA 10</div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: "#ff6b35", fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1 }}>${pricingData.psa10Price.toFixed(2)}</div>
                      </div>
                    )}
                  </div>
                  {(pricingData.sevenDaySales != null || pricingData.thirtyDaySales != null) && (
                    <div style={{ fontSize: 11, color: "var(--tm)", marginBottom: 6 }}>
                      {pricingData.sevenDaySales != null && <span>{pricingData.sevenDaySales} sold in 7 days</span>}
                      {pricingData.sevenDaySales != null && pricingData.thirtyDaySales != null && <span style={{ color: "var(--tg)" }}> · </span>}
                      {pricingData.thirtyDaySales != null && <span>{pricingData.thirtyDaySales} sold in 30 days</span>}
                    </div>
                  )}
                  {pricingData.gain != null && (
                    <div style={{
                      display: "inline-flex", alignItems: "center", gap: 4,
                      padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                      background: pricingData.gain >= 0 ? "rgba(76,175,80,0.12)" : "rgba(255,68,68,0.12)",
                      color: pricingData.gain >= 0 ? "#4caf50" : "#ff4444",
                      border: `1px solid ${pricingData.gain >= 0 ? "rgba(76,175,80,0.25)" : "rgba(255,68,68,0.25)"}`
                    }}>
                      {pricingData.gain >= 0 ? "+" : ""}{pricingData.gain}% this week
                    </div>
                  )}
                </>
              )}
              {!pricingLoading && !pricingData && pricingFetched && (
                <div style={{ fontSize: 12, color: "var(--tg)", fontStyle: "italic" }}>No pricing data found for this card.</div>
              )}
            </div>


            {/* My Notes */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 9, color: "var(--tg)", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600, marginBottom: 6 }}>My Notes</div>
              <textarea
                value={localNotes}
                onChange={e => setLocalNotes(e.target.value)}
                onBlur={() => { if (localNotes !== (card.userNotes || "")) onUpdate(card.id, { userNotes: localNotes }); }}
                placeholder="Add your own notes about this card…"
                rows={3}
                style={{
                  width: "100%", background: "var(--deep)", border: "1px solid var(--b)",
                  borderRadius: 8, color: "var(--ts)", fontSize: 12, padding: "8px 10px",
                  resize: "vertical", outline: "none", fontFamily: "inherit", lineHeight: 1.6
                }}
              />
            </div>

            {/* Sell */}
            {!bundleMode && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 9, color: "var(--tg)", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600, marginBottom: 8 }}>Sell</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <button
                    onClick={() => onSell(card)}
                    style={{
                      background: "#e53935", border: "none", color: "#fff",
                      borderRadius: 8, padding: "6px 16px", cursor: "pointer", fontSize: 12, fontWeight: 700
                    }}
                  >{card.ebayListingUrl ? "Re-list on eBay" : "Sell on eBay"}</button>
                  {card.ebayListingUrl && (
                    <a href={card.ebayListingUrl} target="_blank" rel="noopener noreferrer" style={{
                      fontSize: 11, color: "#e53935", textDecoration: "none", fontWeight: 600
                    }}>↗ View listing</a>
                  )}

                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button
                onClick={() => onShare?.(card)}
                style={{
                  background: "rgba(255,107,53,0.1)", border: "1px solid rgba(255,107,53,0.25)",
                  color: "#ff6b35", borderRadius: 8, padding: "5px 14px",
                  cursor: "pointer", fontSize: 11, fontWeight: 600,
                  fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 0.5,
                  display: "flex", alignItems: "center", gap: 5
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                  <polyline points="16 6 12 2 8 6" />
                  <line x1="12" y1="2" x2="12" y2="15" />
                </svg>
                Share
              </button>
              {confirmingDelete ? (
                <>
                  <span style={{ fontSize: 11, color: "#ff6b6b" }}>Remove this card?</span>
                  <button
                    onClick={() => onDelete(card.id)}
                    style={{
                      background: "#ff444420", border: "1px solid #ff444460", color: "#ff4444",
                      borderRadius: 8, padding: "5px 12px", cursor: "pointer", fontSize: 11, fontWeight: 700
                    }}
                  >Yes, remove</button>
                  <button
                    onClick={() => setConfirmingDelete(false)}
                    style={{
                      background: "transparent", border: "1px solid #ffffff20", color: "var(--ts)",
                      borderRadius: 8, padding: "5px 12px", cursor: "pointer", fontSize: 11, fontWeight: 600
                    }}
                  >Cancel</button>
                </>
              ) : (
                <button
                  onClick={() => setConfirmingDelete(true)}
                  style={{
                    background: "transparent", border: "1px solid #ff444428", color: "#ff444488",
                    borderRadius: 8, padding: "5px 14px", cursor: "pointer", fontSize: 11, fontWeight: 600
                  }}
                >Remove</button>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function Badge({ label, color }) {
  return (
    <span style={{
      fontSize: 11, padding: "2px 8px", borderRadius: 10,
      background: `${color}15`, color, border: `1px solid ${color}35`, fontWeight: 700
    }}>{label}</span>
  );
}

// ── Public share view (shown when URL params are present — no auth needed) ────
const RARITY_COLORS_PUB = {
  Common: '#555', Uncommon: '#4caf50', Rare: '#2196f3',
  'Very Rare': '#9c27b0', 'Ultra Rare': '#ff9800', Legendary: '#f44336',
};

function PublicShareView({ mode, card, cards, filterLabel, onClose }) {
  const RARITY_ORDER = { Legendary: 0, 'Ultra Rare': 1, 'Very Rare': 2, Rare: 3, Uncommon: 4, Common: 5 };
  const sorted = cards ? [...cards].sort((a, b) => (RARITY_ORDER[a.rarity] ?? 6) - (RARITY_ORDER[b.rarity] ?? 6)) : [];
  const rarePlus = sorted.filter(c => ['Rare', 'Very Rare', 'Ultra Rare', 'Legendary'].includes(c.rarity)).length;
  const totalValue = sorted.reduce((s, c) => s + (c.estimatedValue || 0), 0);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2000,
      background: '#07070f', color: '#f0f0f0',
      display: 'flex', flexDirection: 'column', overflowY: 'auto',
      fontFamily: "'Inter', sans-serif",
    }}>
      {/* Header bar */}
      <div style={{
        padding: '18px 20px', borderBottom: '1px solid #1a1a2e',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(20px)',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22 }}>🏀</span>
          <span style={{
            fontSize: 22, fontWeight: 400, color: '#ff6b35',
            fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 3,
          }}>THE VAULT</span>
        </div>
        <button onClick={onClose} style={{
          background: 'var(--gbg, rgba(255,255,255,0.05))',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 20, padding: '5px 14px',
          color: '#888', fontSize: 11, cursor: 'pointer', fontWeight: 600,
        }}>✕ Close</button>
      </div>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 20px 48px', width: '100%' }}>

        {/* Single card view */}
        {mode === 'card' && card && (() => {
          const rc = RARITY_COLORS_PUB[card.rarity] || '#555';
          const fullName = card.fullCardName || [card.year, card.brand, card.series].filter(Boolean).join(' ') || 'Unknown Set';
          return (
            <div>
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 24 }}>
                <div style={{
                  width: 180, height: 250, borderRadius: 14, overflow: 'hidden', flexShrink: 0,
                  border: `2px solid ${rc}50`,
                  boxShadow: `0 0 40px ${rc}20`,
                }}>
                  <img src={card.imageUrl} alt={card.playerName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <div style={{ flex: 1, minWidth: 200, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontSize: 11, color: '#ff6b35', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>{fullName}</div>
                  <div style={{ fontSize: 38, fontWeight: 400, color: '#f0f0f0', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 2, lineHeight: 1 }}>{card.playerName}</div>
                  {card.team && card.team !== 'Unknown' && <div style={{ fontSize: 13, color: '#666' }}>{card.team}</div>}
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 4 }}>
                    {card.isRookie && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'rgba(255,107,53,0.15)', color: '#ff6b35', border: '1px solid rgba(255,107,53,0.3)', fontWeight: 700 }}>RC</span>}
                    {card.hasAutograph && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'rgba(240,192,64,0.15)', color: '#f0c040', border: '1px solid rgba(240,192,64,0.3)', fontWeight: 700 }}>AUTO</span>}
                    {card.serialNumber && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'rgba(206,147,216,0.15)', color: '#ce93d8', border: '1px solid rgba(206,147,216,0.3)', fontWeight: 700 }}>{card.serialNumber}</span>}
                    {card.rarity && card.rarity !== 'Common' && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: rc + '18', color: rc, border: `1px solid ${rc}35`, fontWeight: 700 }}>{card.rarity}</span>}
                  </div>
                  {card.estimatedValue > 0 && (
                    <div style={{ fontSize: 28, fontWeight: 400, color: '#4caf50', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1, marginTop: 4 }}>
                      ${card.estimatedValue.toFixed(2)} <span style={{ fontSize: 11, color: '#3a6a3a', fontFamily: "'Inter', sans-serif", fontWeight: 600 }}>EST. VALUE</span>
                    </div>
                  )}
                </div>
              </div>
              {card.playerContext && (
                <div style={{ marginBottom: 20, background: '#0e0e1c', border: '1px solid #1a1a2e', borderRadius: 12, padding: '14px 16px' }}>
                  <div style={{ fontSize: 9, color: '#555', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginBottom: 6 }}>About This Card</div>
                  <p style={{ margin: 0, fontSize: 13, color: '#888', lineHeight: 1.7 }}>{card.playerContext}</p>
                </div>
              )}
            </div>
          );
        })()}

        {/* Collection / set view */}
        {mode !== 'card' && sorted.length > 0 && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: 'rgba(255,107,53,0.55)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 4 }}>SHARED</div>
              <div style={{ fontSize: 42, fontWeight: 400, color: '#ff6b35', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 3, lineHeight: 1 }}>
                {filterLabel ? `${filterLabel.toUpperCase()} COLLECTION` : 'VAULT'}
              </div>
              <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
                <div><span style={{ fontSize: 24, fontWeight: 400, color: '#ff6b35', fontFamily: "'Bebas Neue', sans-serif" }}>{sorted.length}</span> <span style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: 1 }}>cards</span></div>
                {rarePlus > 0 && <div><span style={{ fontSize: 24, fontWeight: 400, color: '#9c27b0', fontFamily: "'Bebas Neue', sans-serif" }}>{rarePlus}</span> <span style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: 1 }}>rare+</span></div>}
                {totalValue > 0 && <div><span style={{ fontSize: 24, fontWeight: 400, color: '#4caf50', fontFamily: "'Bebas Neue', sans-serif" }}>${totalValue.toFixed(0)}</span> <span style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: 1 }}>est. value</span></div>}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10 }}>
              {sorted.map(c => {
                const rc = RARITY_COLORS_PUB[c.rarity] || '#333';
                return (
                  <div key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <div style={{ aspectRatio: '3/4', borderRadius: 10, overflow: 'hidden', border: `1.5px solid ${rc}45`, boxShadow: `0 0 12px ${rc}12` }}>
                      <img src={c.imageUrl} alt={c.playerName || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#888', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{c.playerName}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* CTA */}
        <div style={{ marginTop: 36, textAlign: 'center', padding: '24px 0', borderTop: '1px solid #1a1a2e' }}>
          <div style={{ fontSize: 28, fontWeight: 400, color: '#f0f0f0', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 2, marginBottom: 6 }}>TRACK YOUR OWN COLLECTION</div>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: '#555' }}>AI card identification · live eBay pricing · instant share</p>
          <a
            href="https://app.myvaults.io"
            style={{
              display: 'inline-block',
              background: 'linear-gradient(135deg, #ff6b35 0%, #f7c59f 100%)',
              color: '#07070f', borderRadius: 12, padding: '12px 28px',
              fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, letterSpacing: 2,
              textDecoration: 'none', fontWeight: 400,
            }}
          >START YOUR VAULT →</a>
        </div>
      </div>
    </div>
  );
}

// ── Category cover images (files in /public) ─────────────────────────────────
const CATEGORY_IMAGES = {
  "Pokemon":          "/pokemon1.png",
  "Basketball":       "/basketball.png",
  "Soccer":           "/fifa.png",
  "American Football":"/football.png",
  "Baseball":         "/MLB.png",
  "MTG":              "/mtg.png",
  "Yu-Gi-Oh":         "/1p.png",
  "Other TCG":        "/1p.png",
  "Stamps":           "/stamps.png",
  "Coins":            "/coins.png",
};
const CATEGORY_EMOJI = {
  "Hockey": "🏒", "Non-Sports": "🎭", "Stamps": "📬", "Coins": "🪙", "Other": "🃏", "Favourites": "★",
};

// ── Pro — Coming Soon Modal ───────────────────────────────────────────────────
// ── Referral Modal ────────────────────────────────────────────────────────────
function ReferralModal({ user, profile, onClose }) {
  const [copied, setCopied] = useState(false);
  const referralLink = `https://app.myvaults.io/?ref=${user.uid}`;

  const handleCopy = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(referralLink).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }).catch(() => fallbackCopy());
    } else {
      fallbackCopy();
    }
  };

  const fallbackCopy = () => {
    const el = document.createElement('textarea');
    el.value = referralLink;
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.focus();
    el.select();
    try { document.execCommand('copy'); } catch (_) {}
    document.body.removeChild(el);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: 'Join The Vault — AI card tracking',
        text: 'I use The Vault to track and value my card collection. Use my link to get 20 free card slots when you sign up!',
        url: referralLink,
      }).catch(() => {});
    } else {
      handleCopy();
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 600,
        background: "rgba(0,0,0,0.9)",
        backdropFilter: "blur(18px)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
        animation: "fadeIn 0.2s ease",
        padding: "20px 0 0",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "#0e0e1c",
          border: "1px solid #1a1a2e",
          borderRadius: "22px 22px 0 0",
          width: "100%", maxWidth: 480,
          maxHeight: "88vh", overflowY: "auto",
          padding: "28px 24px 40px",
          display: "flex", flexDirection: "column", gap: 20,
        }}
      >
        {/* Header */}
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🎁</div>
          <div style={{ fontSize: 24, fontWeight: 400, color: "#f0f0f0", fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 2, marginBottom: 10 }}>
            Invite Friends · Earn Cards
          </div>
          <div style={{ fontSize: 13, color: "#666", lineHeight: 1.7 }}>
            Share your link. Your friend gets{" "}
            <span style={{ color: "#ff6b35", fontWeight: 700 }}>+20 card slots</span>{" "}
            the moment they sign up — and you earn{" "}
            <span style={{ color: "#ff6b35", fontWeight: 700 }}>+20 more</span>{" "}
            when they add their 10th card.
          </div>
        </div>

        {/* Steps */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            { step: "1", text: "Share your referral link below" },
            { step: "2", text: "Friend signs up — they get +20 card slots instantly" },
            { step: "3", text: "They add their 10th card — you earn +20 slots too" },
          ].map(item => (
            <div key={item.step} style={{
              display: "flex", gap: 12, alignItems: "center",
              background: "rgba(255,255,255,0.02)",
              border: "1px solid #1a1a2e",
              borderRadius: 12, padding: "10px 14px",
            }}>
              <div style={{
                width: 22, height: 22, borderRadius: "50%",
                background: "rgba(255,107,53,0.12)",
                border: "1px solid rgba(255,107,53,0.3)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 800, color: "#ff6b35", flexShrink: 0,
              }}>{item.step}</div>
              <div style={{ fontSize: 12, color: "#888" }}>{item.text}</div>
            </div>
          ))}
        </div>

        {/* Referral link box */}
        <div style={{
          background: "rgba(255,107,53,0.05)",
          border: "1px solid rgba(255,107,53,0.2)",
          borderRadius: 14, padding: "14px 16px",
        }}>
          <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8, fontWeight: 600 }}>
            Your referral link
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{
              flex: 1, fontSize: 11, color: "#888",
              background: "#0a0a14", borderRadius: 8, padding: "8px 10px",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              border: "1px solid #1a1a2e", fontFamily: "monospace",
            }}>
              {referralLink}
            </div>
            <button
              onClick={handleCopy}
              style={{
                flexShrink: 0,
                background: copied ? "rgba(76,175,80,0.15)" : "rgba(255,107,53,0.12)",
                border: copied ? "1px solid rgba(76,175,80,0.4)" : "1px solid rgba(255,107,53,0.3)",
                borderRadius: 8, padding: "8px 14px",
                color: copied ? "#4caf50" : "#ff6b35",
                fontSize: 12, fontWeight: 700, cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              {copied ? "✓ Copied!" : "Copy"}
            </button>
          </div>
        </div>

        {/* Share button */}
        <button
          onClick={handleShare}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            background: "linear-gradient(135deg, #ff6b35 0%, #f7931a 100%)",
            border: "none", borderRadius: 14, padding: "13px 20px",
            color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", letterSpacing: 0.3,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
            <polyline points="16 6 12 2 8 6" />
            <line x1="12" y1="2" x2="12" y2="15" />
          </svg>
          Share Your Referral Link
        </button>

        {/* Referral count badge */}
        {(profile?.referralCount ?? 0) > 0 && (
          <div style={{
            textAlign: "center",
            background: "rgba(76,175,80,0.05)",
            border: "1px solid rgba(76,175,80,0.15)",
            borderRadius: 12, padding: "14px",
          }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#4caf50", fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1 }}>
              {profile.referralCount}
            </div>
            <div style={{ fontSize: 11, color: "#555" }}>
              {profile.referralCount === 1 ? "friend" : "friends"} completed their vault
              &nbsp;·&nbsp;
              <span style={{ color: "#4caf50" }}>+{profile.referralCount * 20} bonus slots earned</span>
            </div>
          </div>
        )}

        <button
          onClick={onClose}
          style={{
            background: "transparent", border: "none",
            color: "#444", cursor: "pointer", fontSize: 12,
            padding: "4px", alignSelf: "center",
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}

function ProComingSoonModal({ onClose }) {
  const features = [
    { icon: "♾️", title: "Unlimited Card Storage", desc: "Add as many cards as you want with no limits and no ads." },
    { icon: "📊", title: "Full Collection Analytics", desc: "Live value tracking, category breakdowns, and trend charts — always on." },
    { icon: "🤖", title: "Unlimited AI Sessions", desc: "Chat with your vault AI as much as you like, any time." },
    { icon: "📤", title: "Priority eBay Listing", desc: "One-tap bulk listing with pre-filled card data and smart pricing." },
    { icon: "🏷️", title: "Advanced Card Identification", desc: "Deeper parallel, grading, and serial number detection." },
    { icon: "☁️", title: "Cloud Backup & Sync", desc: "Your collection automatically backed up and synced across all your devices." },
  ];

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 600,
        background: "rgba(0,0,0,0.9)",
        backdropFilter: "blur(18px)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
        animation: "fadeIn 0.2s ease",
        padding: "20px 0 0",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "#0e0e1c",
          border: "1px solid #1a1a2e",
          borderRadius: "22px 22px 0 0",
          width: "100%", maxWidth: 480,
          maxHeight: "88vh", overflowY: "auto",
          padding: "28px 24px 40px",
          display: "flex", flexDirection: "column", gap: 24,
        }}
      >
        {/* Header */}
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#ff6b35", textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>
            Coming Soon
          </div>
          <div style={{ fontSize: 28, fontWeight: 400, color: "#f0f0f0", fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 2, marginBottom: 10 }}>
            The Vault Pro
          </div>
          <div style={{ fontSize: 13, color: "#555", lineHeight: 1.6 }}>
            We're building a premium experience for serious collectors. Here's what's coming.
          </div>
        </div>

        {/* Feature list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {features.map((f) => (
            <div key={f.title} style={{
              display: "flex", gap: 14, alignItems: "flex-start",
              background: "rgba(255,255,255,0.03)",
              border: "1px solid #1a1a2e",
              borderRadius: 14, padding: "14px 16px",
            }}>
              <span style={{ fontSize: 22, flexShrink: 0, marginTop: 1 }}>{f.icon}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#e0e0e0", marginBottom: 3 }}>{f.title}</div>
                <div style={{ fontSize: 12, color: "#555", lineHeight: 1.5 }}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Notify CTA */}
        <div style={{
          background: "rgba(255,107,53,0.07)",
          border: "1px solid rgba(255,107,53,0.2)",
          borderRadius: 16, padding: "18px 20px", textAlign: "center",
        }}>
          <div style={{ fontSize: 13, color: "#ff6b35", fontWeight: 700, marginBottom: 6 }}>
            Be the first to know
          </div>
          <div style={{ fontSize: 12, color: "#555", marginBottom: 14, lineHeight: 1.5 }}>
            Pro is launching soon. Early supporters get a special introductory price.
          </div>
          <a
            href="mailto:cards@myvaults.io?subject=Notify me about The Vault Pro&body=I'm interested in The Vault Pro — please let me know when it launches."
            style={{
              display: "inline-block",
              background: "linear-gradient(135deg, #ff6b35 0%, #f7931a 100%)",
              border: "none", borderRadius: 12, padding: "11px 28px",
              color: "#fff", fontWeight: 700, fontSize: 13,
              textDecoration: "none", letterSpacing: 0.3,
            }}
          >
            ✉️ Notify Me at Launch
          </a>
        </div>

        <button
          onClick={onClose}
          style={{
            background: "transparent", border: "none",
            color: "#333", cursor: "pointer", fontSize: 12,
            padding: "4px", alignSelf: "center",
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}

// ── Collection Value Breakdown Modal ─────────────────────────────────────────
function ValueBreakdownModal({ cards, totalValue, onClose }) {
  const sorted = [...cards]
    .filter(c => c.estimatedValue > 0)
    .sort((a, b) => b.estimatedValue - a.estimatedValue);

  const byCategory = cards.reduce((acc, c) => {
    if (!c.estimatedValue) return acc;
    const cat = c.cardCategory || "Other";
    acc[cat] = (acc[cat] || 0) + c.estimatedValue;
    return acc;
  }, {});

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 400,
        background: "rgba(0,0,0,0.85)",
        backdropFilter: "blur(16px)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
        animation: "fadeIn 0.2s ease",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "var(--card)",
          border: "1px solid var(--b)",
          borderRadius: "20px 20px 0 0",
          width: "100%", maxWidth: 680,
          maxHeight: "80vh",
          display: "flex", flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 -20px 60px rgba(0,0,0,0.4)",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "16px 20px 14px",
          borderBottom: "1px solid var(--b)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 9, color: "var(--tg)", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600, marginBottom: 3 }}>Collection Value</div>
            <div style={{ fontSize: 28, fontWeight: 400, color: "#f0c040", fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 2 }}>
              {totalValue >= 1000 ? `$${(totalValue / 1000).toFixed(2)}k` : `$${totalValue.toFixed(2)}`}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: "var(--gbg)", border: "1px solid var(--b)",
            borderRadius: 20, padding: "6px 16px",
            color: "var(--ts)", fontSize: 11, fontWeight: 600, cursor: "pointer",
          }}>✕ Close</button>
        </div>

        <div style={{ overflowY: "auto", flex: 1, padding: "16px 20px 32px" }}>
          {/* Category breakdown */}
          {Object.keys(byCategory).length > 1 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 9, color: "var(--tg)", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600, marginBottom: 10 }}>By Category</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {Object.entries(byCategory).sort((a, b) => b[1] - a[1]).map(([cat, val]) => {
                  const pct = Math.round((val / totalValue) * 100);
                  return (
                    <div key={cat} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 90, fontSize: 11, color: "var(--ts)", flexShrink: 0 }}>{cat}</div>
                      <div style={{ flex: 1, height: 5, background: "var(--deep)", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg, #f0c040, #ff6b35)", borderRadius: 3 }} />
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#f0c040", width: 55, textAlign: "right", flexShrink: 0 }}>
                        ${val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val.toFixed(0)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Per-card list */}
          <div style={{ fontSize: 9, color: "var(--tg)", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600, marginBottom: 10 }}>
            Cards by Value ({sorted.length} with eBay data)
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {sorted.map((card, i) => {
              const rarityColors = { Common: "#555", Uncommon: "#4caf50", Rare: "#2196f3", "Very Rare": "#9c27b0", "Ultra Rare": "#ff9800", Legendary: "#f44336" };
              const rc = rarityColors[card.rarity] || "#555";
              return (
                <div key={card.id} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  background: "var(--deep)", border: "1px solid var(--b)",
                  borderRadius: 10, padding: "8px 12px",
                }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "var(--tg)", width: 20, textAlign: "right", flexShrink: 0 }}>#{i + 1}</div>
                  <div style={{ width: 36, height: 49, borderRadius: 5, overflow: "hidden", flexShrink: 0, border: `1px solid ${rc}30` }}>
                    <img src={card.imageUrl} alt={card.playerName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--t)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{card.playerName}</div>
                    <div style={{ fontSize: 10, color: "var(--tg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{card.fullCardName}</div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#4caf50", flexShrink: 0, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 0.5 }}>
                    ${card.estimatedValue.toFixed(2)}
                  </div>
                </div>
              );
            })}
            {sorted.length === 0 && (
              <div style={{ textAlign: "center", padding: "30px 0", color: "var(--tg)", fontSize: 12 }}>
                No eBay price data yet — expand cards to fetch pricing.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const { user, signOut } = useAuth();
  const { profile, effectiveLimit, isPro, isValueUnlocked, updateProfile, awardCredits, startAISession, endAISession, unlockValueView, applyReferral, triggerReferralMilestone } = useRewardProfile(user ?? null);
  const [showAuth, setShowAuth] = useState(false);
  const [cards, setCards] = useState([]);
  const [queue, setQueue] = useState([]); // [{id, file, previewBase64, status}]
  const [dragOver, setDragOver] = useState(false);
  const [filter, setFilter] = useState("All");
  const [sortBy, setSortBy] = useState("newest");
  const [search, setSearch] = useState("");
  const [view, setView] = useState("cards"); // "cards" | "table"
  const [theme, setTheme] = useState(() => localStorage.getItem("vault-theme") || "dark");
  const [showChat, setShowChat] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [shareModal, setShareModal] = useState(null); // null | { mode, card, cards, filterLabel }
  const [publicView, setPublicView] = useState(null); // null | { mode, card?, cards?, filterLabel? }
  const [bundleMode, setBundleMode] = useState(false);
  const [bundleCardIds, setBundleCardIds] = useState(new Set());
  const [sellModalCards, setSellModalCards] = useState(null);
  const [showValueBreakdown, setShowValueBreakdown] = useState(false);
  const [showProComingSoon, setShowProComingSoon] = useState(false);
  const [showReferral, setShowReferral] = useState(false);
  const [referralNotification, setReferralNotification] = useState(null);
  const [adminGiftNotification, setAdminGiftNotification] = useState(null);
  const globalGiftClaimedRef = useRef(false);
  // adGate: null | { type: 'upload' | 'daily' | 'streak10' | 'value' }
  const [adGate, setAdGate] = useState(null);
  // Non-blocking daily / streak bonus notification (set instead of auto-opening gate)
  const [dailyBonusReady, setDailyBonusReady] = useState(null);
  const pendingFilesRef = useRef(null);
  const loginBonusChecked = useRef(false);

  // Always-current refs so handleFiles never captures stale closure values.
  // Assigned every render so any call to handleFiles reads the latest state.
  const userRef = useRef(user);
  userRef.current = user;
  const cardsRef = useRef(cards);
  cardsRef.current = cards;
  const effectiveLimitRef = useRef(effectiveLimit);
  effectiveLimitRef.current = effectiveLimit;
  const isProRef = useRef(isPro);
  isProRef.current = isPro;
  const profileRef = useRef(profile);
  profileRef.current = profile;

  const toggleTheme = () => setTheme(t => {
    const next = t === "dark" ? "light" : "dark";
    localStorage.setItem("vault-theme", next);
    return next;
  });
  const fileRef = useRef();
  const cameraRef = useRef();
  const isProcessing = useRef(false);
  const pendingQueue = useRef([]);

  // Capture referral code from URL param — store before auth so it survives sign-in
  useEffect(() => {
    const refCode = new URLSearchParams(window.location.search).get('ref');
    if (refCode) localStorage.setItem('vault-ref-code', refCode);
  }, []);

  // Detect share URL params — show public view without requiring auth
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shareCard = params.get('shareCard');
    const shareVault = params.get('shareVault');
    const shareSet = params.get('shareSet');
    const uid = params.get('uid');
    if (!uid) return;

    if (shareCard) {
      fetch(`${API_BASE}/api/public-card?uid=${encodeURIComponent(uid)}&cardId=${encodeURIComponent(shareCard)}`)
        .then(r => r.ok ? r.json() : null)
        .then(card => { if (card && !card.error) setPublicView({ mode: 'card', card }); })
        .catch(() => {});
    } else if (shareSet) {
      fetch(`${API_BASE}/api/public-card?uid=${encodeURIComponent(uid)}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          const all = data?.cards || [];
          const label = decodeURIComponent(shareSet);
          const filtered = all.filter(c => c.cardCategory === label || c.team === label);
          if (filtered.length > 0) setPublicView({ mode: 'set', cards: filtered, filterLabel: label });
        })
        .catch(() => {});
    } else if (shareVault) {
      fetch(`${API_BASE}/api/public-card?uid=${encodeURIComponent(uid)}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          const all = data?.cards || [];
          if (all.length > 0) setPublicView({ mode: 'collection', cards: all });
        })
        .catch(() => {});
    }
  }, []);

  // Sync cards to/from Firestore when the user is signed in.
  useFirestoreSync(user ?? null, cards, setCards);

  // ── Daily login bonus & streak check ──────────────────────────────────────
  // Runs once per session after the user profile loads.
  // The streak counter is always incremented on login; the ad gate grants the credit reward.
  useEffect(() => {
    if (!user || !profile || isPro || loginBonusChecked.current) return;
    loginBonusChecked.current = true;

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    if (profile.lastLoginDate === today) return; // already logged in today

    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const isConsecutive = profile.lastLoginDate === yesterday;
    const newStreak = isConsecutive ? profile.currentStreak + 1 : 1;
    const newLongest = Math.max(newStreak, profile.longestStreak);

    // Update the streak in Firestore regardless of whether the user watches the ad
    updateProfile({
      last_login_date: today,
      current_streak: newStreak,
      longest_streak: newLongest,
    });

    // Don't auto-open a blocking modal — store as a claimable notification
    // so the gate only appears when the user intentionally taps "Daily Bonus".
    setDailyBonusReady({ type: newStreak === 10 ? 'streak10' : 'daily', streak: newStreak });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, profile?.lastLoginDate]);

  // ── Referral: apply stored ref code for new users ─────────────────────────
  // Runs once the profile loads for the first time (no referral_source set yet).
  useEffect(() => {
    if (!user || !profile || profile.referralSource) return;
    const storedRef = localStorage.getItem('vault-ref-code');
    if (!storedRef || storedRef === user.uid) {
      if (storedRef) localStorage.removeItem('vault-ref-code'); // clear self-referral
      return;
    }
    localStorage.removeItem('vault-ref-code');
    applyReferral(storedRef).then(() => {
      setReferralNotification('🎁 Welcome bonus! +20 card slots added from your invite link.');
      setTimeout(() => setReferralNotification(null), 6000);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, profile?._uid]);

  // ── Referral milestone: award referrer when invitee hits 10 cards ──────────
  useEffect(() => {
    if (!user || !profile?.referralSource || profile?.referralRewarded) return;
    if (cards.length >= 10) {
      triggerReferralMilestone(profile.referralSource);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards.length, user?.uid, profile?.referralSource, profile?.referralRewarded]);

  // ── Referral notification: tell the referrer when they earn bonus credits ──
  const prevReferralCountRef = useRef(null);
  useEffect(() => {
    if (!profile) return;
    const count = profile.referralCount ?? 0;
    if (prevReferralCountRef.current !== null && count > prevReferralCountRef.current) {
      setReferralNotification('🎉 A friend reached 10 cards — you earned 20 card slots!');
      setTimeout(() => setReferralNotification(null), 6000);
    }
    prevReferralCountRef.current = count;
  }, [profile?.referralCount]);

  // ── Per-user credit gift notifications (admin → specific user) ──
  const shownNotifIds = useRef(new Set());
  useEffect(() => {
    if (!user?.uid) return;
    shownNotifIds.current.clear();
    // Listen to the whole subcollection — no where() clause avoids
    // any query-permission edge cases on subcollections.
    return onSnapshot(
      collection(db, 'users', user.uid, 'notifications'),
      snap => {
        snap.docChanges()
          .filter(c => c.type === 'added')
          .forEach(change => {
            const d = change.doc.data();
            if (d.read) return;                           // already read
            if (d.type !== 'credit_gift') return;         // wrong type
            if (shownNotifIds.current.has(change.doc.id)) return; // already shown this session
            shownNotifIds.current.add(change.doc.id);
            const msg = d.message || `You received +${d.amount} card credits! 🎁`;
            setAdminGiftNotification(msg);
            setTimeout(() => setAdminGiftNotification(null), 7000);
            updateDoc(change.doc.ref, { read: true }).catch(() => {});
          });
      },
      err => console.error('[notifications listener]', err),
    );
  }, [user?.uid]);

  // ── Global credit gift notifications (admin → all users) ──
  useEffect(() => {
    if (!user?.uid || !profile) return;
    const q = query(
      collection(db, 'global_gifts'),
      orderBy('createdAt', 'desc'),
      limit(1),
    );
    return onSnapshot(q, snap => {
      if (snap.empty) return;
      const gift     = snap.docs[0].data();
      const giftTime = gift.createdAt?.toMillis?.() ?? 0;
      const lastTime = profile.lastGiftClaimedAt
        ? new Date(profile.lastGiftClaimedAt).getTime()
        : 0;
      if (giftTime > lastTime && !globalGiftClaimedRef.current) {
        globalGiftClaimedRef.current = true;
        setDoc(
          doc(db, 'users', user.uid),
          {
            card_credits:         increment(gift.amount),
            last_gift_claimed_at: gift.createdAt.toDate().toISOString(),
          },
          { merge: true },
        ).catch(() => {});
        const msg = gift.message || `Everyone received +${gift.amount} card credits! 🎁`;
        setAdminGiftNotification(msg);
        setTimeout(() => setAdminGiftNotification(null), 7000);
      }
    }, () => {});
  }, [user?.uid, profile?._uid]);

  const analyzeCard = useCallback(async (item) => {
    try {
      const base64 = item.base64;
      const mediaType = item.mediaType;
      const imageUrl = `data:${mediaType};base64,${base64}`;

      const response = await fetch(`${API_BASE}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: ANTHROPIC_MODEL,
          max_tokens: 3000,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          tool_choice: { type: "auto" },
          messages: [{
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
              {
                type: "text",
                text: `You are an expert collectibles authenticator and cataloguer with deep knowledge of trading cards, stamps, and coins. Your expertise covers every major card brand and format (Pokémon, Magic: The Gathering, Yu-Gi-Oh!, sports cards), philately (postage stamps from all nations and eras), and numismatics (coins, currency, and medals from all nations and eras). Analyse this image with extreme care.

STEP 1 — VISUAL SCAN (do this mentally before filling the JSON):
- ITEM CATEGORY: First, determine the item type — is it a trading card (Pokémon, MTG, Yu-Gi-Oh!, sports card), a postage stamp, a coin/medal, or something else?
- For STAMPS: Read the country, denomination, year of issue, and any visible catalogue reference (Scott, Stanley Gibbons, Michel). Note perforations, watermarks if visible, cancellation status (mint/used), and any overprints. Use "playerName" for the stamp's main subject/theme (e.g. "Queen Elizabeth II", "Apollo 11", "1d Red"). Use "series" for the stamp series or definitive set name.
- For COINS: Read the country, denomination, year, and mint mark if visible. Note the obverse (heads) subject and reverse (tails) design. Assess strike quality and any mint errors. Use "playerName" for the coin's main obverse subject (e.g. "Queen Elizabeth II", "Abraham Lincoln", "Walking Liberty"). Use "series" for the coin series (e.g. "Morgan Dollar", "50 State Quarters", "Pre-decimal Florin").
- For CARDS — PLAYER / CHARACTER & CARD ID: Read the player name, character name, team, year, brand, and set name directly from the card.
- AUTOGRAPH CHECK (cards only): Carefully scan the ENTIRE surface — front AND back. Look for ink signatures, sticker autographs, hard-signed on-card autographs. hasAutograph = true if ANY signature is present.
- SERIAL NUMBER CHECK (cards and coins): For cards, scan all four corners, borders, and back for stamps/foil as "X/Y". For coins, note any mintage-limit numbering on collector issues.
- PARALLEL / FINISH (cards) or GRADE / STRIKE (stamps & coins): For cards, identify specific parallel by border color, foil type, finish. For stamps: Mint NH, Mint Hinged, Fine Used, CTO, etc. For coins: Uncirculated (MS), About Uncirculated (AU), Fine (F), Very Fine (VF), etc.
- RARITY INDICATORS: For stamps — key value drivers include mint-never-hinged status, low print run, errors (inverted, missing color), high-value denominations, and classic/vintage issues. For coins — key drivers include low mintage, proof/specimen strikes, first-year issues, and error coins.

STEP 2 — RARITY (assign based on the item's specific category conventions):
Sports cards: "Common" = Base; "Uncommon" = Colored parallel; "Rare" = Refractor/Chrome/Prizm; "Very Rare" = Serial /100–/299; "Ultra Rare" = Serial /10–/99; "Legendary" = 1/1, logoman, or on-card auto + serial /10 or lower
Pokémon: "Common" = Common/Uncommon; "Uncommon" = Reverse Holo; "Rare" = Holo Rare; "Very Rare" = Ultra Rare/Full Art/V; "Ultra Rare" = Secret Rare/Alt Art/Special Illustration Rare; "Legendary" = Trophy card/1st Ed Base Charizard/Gold Pikachu promo
MTG: "Common" = Common; "Uncommon" = Uncommon; "Rare" = Rare; "Very Rare" = Non-foil Mythic/Extended Art; "Ultra Rare" = Foil or Borderless/Showcase Mythic; "Legendary" = Reserved List card, serialised, or Power Nine
Yu-Gi-Oh!: "Common" = Common; "Uncommon" = Rare; "Rare" = Super/Ultra Rare; "Very Rare" = Secret Rare; "Ultra Rare" = Starlight/Ghost Rare; "Legendary" = Prize card / Championship promo
Stamps: "Common" = Modern commemorative, high print run; "Uncommon" = Older definitive or lightly used classic; "Rare" = Pre-1950 mint, low print run modern; "Very Rare" = Pre-1900 or key scarce variety; "Ultra Rare" = Major rarity, classic inverted or error; "Legendary" = World-class rarity (e.g. Penny Black, Inverted Jenny)
Coins: "Common" = High-mintage modern circulation; "Uncommon" = Semi-key date or low-mintage modern; "Rare" = Key date, proof issue, or pre-1900 type coin; "Very Rare" = Significant key date, low-mintage proof/specimen; "Ultra Rare" = Major rarity or error coin; "Legendary" = World-class rarity (e.g. 1804 Dollar, 1933 Double Eagle)

STEP 3 — OUTPUT a single valid JSON object. No markdown, no backticks, no text outside the JSON.

{
  "cardCategory": "Pokemon | MTG | Yu-Gi-Oh | Basketball | American Football | Soccer | Baseball | Hockey | Other TCG | Non-Sports | Stamps | Coins | Other",
  "playerName": "Exact player/character name for cards; main subject/theme for stamps (e.g. 'Queen Elizabeth II', 'Apollo 11'); obverse subject for coins (e.g. 'Morgan Dollar Obverse', 'Lincoln Cent')",
  "fullCardName": "For cards: Year + Brand + Series. For stamps: Country + denomination + year e.g. 'Australia 5c 1966'. For coins: Country + denomination + year e.g. 'USA 1 Dollar 1921'",
  "pack": "Product/pack type if identifiable, or null",
  "team": "Team name for sports cards; country of issue for stamps/coins; game/format for TCG cards; or 'Unknown'",
  "year": "Year of issue or season e.g. '2023-24', '2024', '1921'",
  "brand": "For cards: Panini | Topps | Upper Deck | Fleer | Bowman | Donruss | Score | Nintendo | Wizards of the Coast | Konami | other. For stamps: issuing postal authority e.g. 'Royal Mail' | 'USPS' | 'Australia Post'. For coins: mint name e.g. 'US Mint' | 'Royal Mint' | 'Perth Mint'",
  "series": "For cards: exact set name. For stamps: definitive series or commemorative set name. For coins: coin series e.g. 'Morgan Dollar' | '50 State Quarters' | 'Florin'",
  "parallel": "For cards: exact parallel/finish. For stamps: 'Mint NH' | 'Mint Hinged' | 'Fine Used' | 'CTO' | other. For coins: 'Proof' | 'Specimen' | 'Uncirculated' | 'Circulated' | other",
  "cardNumber": "Card/catalogue number e.g. '#278', Scott catalogue number for stamps, or null",
  "serialNumber": "Serial stamp as printed e.g. '45/99' | '1/1' for cards; mint error number or null for stamps/coins",
  "isRookie": false,
  "hasAutograph": false,
  "autographType": "'On-Card' | 'Sticker' | null — only if hasAutograph is true",
  "rarity": "Common | Uncommon | Rare | Very Rare | Ultra Rare | Legendary",
  "condition": "Mint | Near Mint | Excellent | Good | Fair | Poor | Unknown",
  "conditionDetail": "1-2 sentences: for cards describe corners, surface, centering; for stamps describe gum status, perforations, cancellation; for coins describe strike quality, luster, wear. Only describe what is visible.",
  "playerContext": "IMPORTANT: Before writing this field, use the web_search tool to search for the item — e.g. '[playerName] basketball player career', '[stamp name] stamp catalogue value', '[coin name] mintage value' — to get current accurate information. Then write 2-3 sentences describing: what this item is, its significance in its collecting category, and why this specific example is or isn't particularly collectible. Base this on current search results. If not found, write what you can observe and note that information is limited.",
  "playerContextSearched": true,
  "confidenceLevel": "High | Medium | Low",
  "notes": "Any other observations: print defects, surface damage, foil scratches, staining, mint errors, perforation faults, etc. or null"
}`
              }
            ]
          }]
        })
      });

      if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        throw new Error(`API ${response.status}: ${errBody.slice(0, 200)}`);
      }
      const data = await response.json();
      const text = data.content.filter(b => b.type === "text").map(b => b.text).join("");

      let cardInfo;
      try {
        // Find the outermost JSON object in the response — handles cases where Claude
        // wraps the JSON with explanatory text (e.g. after a web search)
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        if (start === -1 || end === -1) throw new Error('No JSON object found');
        const clean = text.slice(start, end + 1);
        cardInfo = JSON.parse(clean);
        // Strip <cite ...>...</cite> tags injected by the web search tool into string fields
        for (const key of Object.keys(cardInfo)) {
          if (typeof cardInfo[key] === "string") {
            cardInfo[key] = cardInfo[key].replace(/<cite[^>]*>|<\/cite>/g, "").replace(/\s{2,}/g, " ").trim();
          }
        }
      } catch {
        cardInfo = { playerName: "Unknown Player", fullCardName: "Unknown Card", team: "Unknown", year: "Unknown", brand: "Unknown", rarity: "Unknown", condition: "Unknown", confidenceLevel: "Low" };
      }

      const cardId = Date.now();

      // Upload image to Firebase Storage so it persists; fall back to data URL if not signed in.
      let persistedImageUrl = imageUrl;
      if (user) {
        try {
          const storageRef = ref(storage, `users/${user.uid}/cards/${cardId}.jpg`);
          await uploadString(storageRef, base64, "base64", { contentType: "image/jpeg" });
          persistedImageUrl = await getDownloadURL(storageRef);
        } catch (e) {
          console.warn("Storage upload failed, using data URL", e);
        }
      }

      setCards(prev => [{ id: cardId, imageUrl: persistedImageUrl, ...cardInfo, addedAt: new Date().toISOString() }, ...prev]);
      setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: "done" } : q));
    } catch (err) {
      setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: "error", errorMsg: err.message } : q));
      console.error(err);
    }
  }, [user]);

  const runQueue = useCallback(async () => {
    if (isProcessing.current) return;
    isProcessing.current = true;
    while (pendingQueue.current.length > 0) {
      const item = pendingQueue.current.shift();
      setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: "processing" } : q));
      await analyzeCard(item);
    }
    isProcessing.current = false;
    setTimeout(() => setQueue([]), 2500);
  }, [analyzeCard]);

  const handleUpdate = useCallback((id, updates) => {
    setCards(prev => prev.map(c => String(c.id) === String(id) ? { ...c, ...updates } : c));
  }, []);

  const handleSellCard = useCallback((card) => setSellModalCards([card]), []);
  const handleBundleToggle = useCallback((id) => setBundleCardIds(prev => {
    const next = new Set(prev);
    next.has(String(id)) ? next.delete(String(id)) : next.add(String(id));
    return next;
  }), []);
  const cancelBundleMode = useCallback(() => { setBundleMode(false); setBundleCardIds(new Set()); }, []);
  const openBundleSell = useCallback(() => {
    setSellModalCards(cards.filter(c => bundleCardIds.has(String(c.id))));
  }, [cards, bundleCardIds]);
  const handleSellSuccess = useCallback((cardIds, listingUrl) => {
    cardIds.forEach(id => handleUpdate(id, { ebayListingUrl: listingUrl, listedAt: new Date().toISOString() }));
    cancelBundleMode();
  }, [handleUpdate, cancelBundleMode]);

  // handleFiles reads live values via refs so it never uses stale closure data.
  // Keeping [runQueue] as the only dep means the function reference is stable
  // and won't cause unnecessary re-creation on every card/profile change.
  const handleFiles = useCallback(async (files) => {
    const imageFiles = Array.from(files).filter(f => f.type.startsWith("image/"));
    if (!imageFiles.length) return;

    // Read current values from refs — always fresh, never stale.
    const currentUser = userRef.current;
    const currentCards = cardsRef.current;
    const currentEffectiveLimit = effectiveLimitRef.current;
    const currentIsPro = isProRef.current;
    const currentProfile = profileRef.current;

    // ── Upload gate logic ──────────────────────────────────────────────────
    // Unsigned users: gate at 3 cards total (prompt to sign in)
    if (currentUser === null && currentCards.length >= 3) {
      setShowAuth(true);
      return;
    }

    // Free-tier signed-in users: split the batch at the effective limit.
    // Cards up to the limit are processed immediately; the excess is held
    // behind the ad gate.
    let filesToProcess = imageFiles;
    if (currentUser && !currentIsPro) {
      // Use FREE_LIMIT (3) as a safe floor if the profile hasn't loaded yet.
      const limit = currentProfile ? currentEffectiveLimit : 3;
      const slotsAvailable = Math.max(0, limit - currentCards.length);
      if (slotsAvailable < imageFiles.length) {
        pendingFilesRef.current = imageFiles.slice(slotsAvailable);
        filesToProcess = imageFiles.slice(0, slotsAvailable);
        setAdGate({ type: 'upload' });
        if (filesToProcess.length === 0) return; // already at limit — gate only
      }
    }

    const newItems = await Promise.all(filesToProcess.map(async (file) => {
      const { base64, mediaType, previewSrc } = await resizeImageFile(file);
      return {
        id: Date.now() + Math.random(),
        file,
        base64,
        mediaType,
        previewSrc,
        name: file.name,
        status: "pending"
      };
    }));

    setQueue(prev => [...prev, ...newItems]);
    pendingQueue.current = [...pendingQueue.current, ...newItems];
    runQueue();
  }, [runQueue]);

  // ── Ad gate resolution ─────────────────────────────────────────────────────
  // Keep a ref to adGate so handleAdWatched always reads the live value without
  // needing adGate in its dep array (which would cause it to be recreated on
  // every state change and confuse AdGateModal's onWatched useEffect).
  const adGateRef = useRef(adGate);
  adGateRef.current = adGate;

  const handleAdWatched = useCallback(async () => {
    const gate = adGateRef.current;
    setAdGate(null); // close the modal immediately

    if (gate?.type === 'upload') {
      const allPending = pendingFilesRef.current ? Array.from(pendingFilesRef.current) : [];
      pendingFilesRef.current = null;

      // Award 3 credits then directly queue up to 3 of the pending files
      // (the slots the user just earned). We bypass handleFiles here so we
      // don't hit the stale effectiveLimit closure — we KNOW the user earned
      // exactly 3 slots regardless of what Firestore has propagated yet.
      await awardCredits(3);

      const EARNED = 3;
      const toAdd   = allPending.slice(0, EARNED);
      const overflow = allPending.slice(EARNED);

      if (toAdd.length) {
        const newItems = await Promise.all(toAdd.map(async (file) => {
          const { base64, mediaType, previewSrc } = await resizeImageFile(file);
          return { id: Date.now() + Math.random(), file, base64, mediaType, previewSrc, name: file.name, status: 'pending' };
        }));
        setQueue(prev => [...prev, ...newItems]);
        pendingQueue.current = [...pendingQueue.current, ...newItems];
        runQueue();
      }

      // If there are still more files beyond the earned slots, re-gate them
      // after a short pause so the user can see the modal close first.
      if (overflow.length) {
        pendingFilesRef.current = overflow;
        setTimeout(() => setAdGate({ type: 'upload' }), 600);
      }
    } else if (gate?.type === 'daily') {
      await awardCredits(1);
      setDailyBonusReady(null);
    } else if (gate?.type === 'streak10') {
      await awardCredits(10);
      setDailyBonusReady(null);
    } else if (gate?.type === 'value') {
      await unlockValueView();
      setShowValueBreakdown(true);
    }
  }, [awardCredits, unlockValueView, runQueue]);

  const handleAdDismiss = useCallback(() => {
    pendingFilesRef.current = null;
    setAdGate(null);
  }, []);

  const handleAdUpgrade = useCallback(() => {
    setAdGate(null);
    pendingFilesRef.current = null;
    setShowProComingSoon(true);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const categories = ["All", "Favourites", ...new Set(cards.map(c => c.cardCategory).filter(cat => cat && cat !== "Other" && cat !== "Unknown"))].concat(
    cards.some(c => !c.cardCategory || c.cardCategory === "Other") ? ["Other"] : []
  );

  const top10 = [...cards]
    .filter(c => c.estimatedValue > 0)
    .sort((a, b) => b.estimatedValue - a.estimatedValue)
    .slice(0, 10);

  const filteredCards = cards
    .filter(c => {
      if (filter === "All") return true;
      if (filter === "Favourites") return c.isFavourite === true;
      if (filter === "Other") return !c.cardCategory || c.cardCategory === "Other" || c.cardCategory === "Unknown";
      return c.cardCategory === filter;
    })
    .filter(c => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        (c.playerName || "").toLowerCase().includes(q) ||
        (c.fullCardName || "").toLowerCase().includes(q) ||
        (c.team || "").toLowerCase().includes(q) ||
        (c.cardCategory || "").toLowerCase().includes(q) ||
        (c.series || "").toLowerCase().includes(q) ||
        (c.year || "").toLowerCase().includes(q) ||
        (c.parallel || "").toLowerCase().includes(q) ||
        (c.serialNumber || "").toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (sortBy === "newest") return b.id - a.id;
      if (sortBy === "player") return a.playerName.localeCompare(b.playerName);
      if (sortBy === "set") return (a.fullCardName || "").localeCompare(b.fullCardName || "");
      return 0;
    });

  const rareCounts = cards.filter(c => ["Rare", "Very Rare", "Ultra Rare", "Legendary"].includes(c.rarity)).length;
  const totalValue = cards.reduce((s, c) => s + (c.estimatedValue || 0), 0);

  const activeQueue = queue.filter(q => q.status !== "done");
  const isProcessingNow = queue.some(q => q.status === "processing");
  const doneCount = queue.filter(q => q.status === "done").length;

  return (
    <div data-theme={theme} style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--t)", fontFamily: "'Inter', sans-serif", overflowX: "hidden", width: "100%" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Barlow+Condensed:wght@400;600;700&family=Barlow:wght@400;600&family=Inter:wght@400;500;600;700&display=swap');
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        * { box-sizing: border-box; }
        .profile-dropdown {
          position: absolute; top: calc(100% + 8px); right: 0;
          background: var(--card); border: 1px solid var(--b);
          border-radius: 14px; padding: 6px;
          min-width: 180px; z-index: 200;
          box-shadow: 0 8px 32px rgba(0,0,0,0.35);
          animation: fadeIn 0.15s ease;
        }
        .profile-dropdown button {
          width: 100%; background: none; border: none;
          color: var(--ts); font-size: 12px; font-weight: 600;
          padding: 9px 12px; border-radius: 9px; cursor: pointer;
          display: flex; align-items: center; gap: 9px; text-align: left;
          transition: background 0.12s;
        }
        .profile-dropdown button:hover { background: var(--gbg); }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: var(--scroll-track); }
        ::-webkit-scrollbar-thumb { background: var(--scroll-thumb); border-radius: 3px; }
        [data-theme="dark"] {
          --bg:#07070f; --surface:#09090e; --card:#0e0e1c; --card2:#12121f;
          --input:#0d0d1a; --deep:#0a0a14;
          --b:#1a1a2e; --bs:#1c1c2e; --bf:rgba(255,255,255,0.024);
          --t:#f0f0f0; --ts:#888; --tm:#555; --td:#444; --tg:#3a3a5a; --tf:#2a2a3a; --tl:#4a4a6a;
          --hbg:linear-gradient(180deg,#09090f 0%,transparent 100%); --hb:rgba(255,255,255,0.024);
          --sk:#1a1a2e; --so:#252535; --sh:#444;
          --gbg:rgba(255,255,255,0.04); --gb:rgba(255,255,255,0.08); --gc:#888;
          --scroll-track:#0a0a10; --scroll-thumb:#222;
        }
        [data-theme="light"] {
          --bg:#f2f2f8; --surface:#f6f6fc; --card:#ffffff; --card2:#f9f9fc;
          --input:#ebebf5; --deep:#e0e0f0;
          --b:#d8d8ea; --bs:#d0d0e6; --bf:rgba(0,0,0,0.06);
          --t:#111120; --ts:#505060; --tm:#70709a; --td:#88889a; --tg:#8888aa; --tf:#b0b0c8; --tl:#9090b4;
          --hbg:linear-gradient(180deg,#f2f2f8 0%,transparent 100%); --hb:rgba(0,0,0,0.08);
          --sk:#d8d8ea; --so:#cacada; --sh:#888;
          --gbg:rgba(0,0,0,0.04); --gb:rgba(0,0,0,0.1); --gc:#555;
          --scroll-track:#e4e4f2; --scroll-thumb:#c0c0d8;
        }
      `}</style>

      {/* Header */}
      <div style={{
        background: "var(--hbg)",
        borderBottom: "1px solid var(--hb)", padding: "16px 16px 14px",
        position: "sticky", top: 0, zIndex: 10, backdropFilter: "blur(20px)"
      }}>
        <div style={{ maxWidth: 680, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, minWidth: 0 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 24 }}>🏀</span>
              <h1 style={{
                margin: 0, fontSize: 26, fontWeight: 800,
                fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 3,
                background: "linear-gradient(135deg, #ff6b35 0%, #f7c59f 100%)",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent"
              }}>The Vault</h1>
            </div>
            <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--tg)" }}>AI card identification · Live pricing</p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0, minWidth: 0 }}>
            {cards.length > 0 && (
              <button
                onClick={() => setShareModal({ mode: 'collection', cards, filterLabel: null })}
                title="Share your vault"
                style={{
                  background: "var(--gbg)", border: "1px solid var(--gb)",
                  borderRadius: 20, padding: "5px 12px",
                  color: "var(--gc)", fontSize: 11, fontWeight: 700, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 5, letterSpacing: 0.3, flexShrink: 0
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                  <polyline points="16 6 12 2 8 6" />
                  <line x1="12" y1="2" x2="12" y2="15" />
                </svg>
                Share
              </button>
            )}
            <button
              onClick={() => setShowChat(v => !v)}
              title="Ask The Vault AI"
              style={{
                background: showChat ? "#ff6b3518" : "var(--gbg)",
                border: `1px solid ${showChat ? "#ff6b3550" : "var(--gb)"}`,
                borderRadius: 20, padding: "5px 12px",
                color: showChat ? "#ff6b35" : "var(--gc)",
                fontSize: 11, fontWeight: 700, cursor: "pointer",
                letterSpacing: 0.3, display: "flex", alignItems: "center", gap: 5, flexShrink: 0
              }}
            >
              <span style={{ fontSize: 13 }}>✦</span> Ask AI
            </button>
            {user === undefined ? null : user ? (
              <div style={{ position: "relative", flexShrink: 0 }}>
                <button
                  onClick={() => setProfileMenuOpen(v => !v)}
                  title={`Signed in as ${user.displayName || user.email}`}
                  style={{
                    background: "none", border: "2px solid var(--b)",
                    borderRadius: "50%", padding: 0, cursor: "pointer",
                    width: 32, height: 32, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0, transition: "border-color 0.15s"
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = "#ff6b3580"}
                  onMouseLeave={e => e.currentTarget.style.borderColor = "var(--b)"}
                >
                  {user.photoURL
                    ? <img src={user.photoURL} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : <span style={{ fontSize: 14, color: "var(--gc)" }}>👤</span>
                  }
                </button>
                {profileMenuOpen && (
                  <>
                    <div onClick={() => setProfileMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 199 }} />
                    <div className="profile-dropdown">
                      <div style={{ padding: "8px 12px 6px", borderBottom: "1px solid var(--b)", marginBottom: 4 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.displayName || "Signed in"}</div>
                        <div style={{ fontSize: 10, color: "var(--tg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.email}</div>
                      </div>
                      <button onClick={() => { toggleTheme(); setProfileMenuOpen(false); }}>
                        <span style={{ fontSize: 15 }}>{theme === "dark" ? "☀️" : "🌙"}</span>
                        {theme === "dark" ? "Light mode" : "Dark mode"}
                      </button>
                      <div style={{ borderTop: "1px solid var(--b)", margin: "4px 0" }} />
                      <button onClick={() => { window.open("https://myvaults.io/privacy-policy", "_blank"); setProfileMenuOpen(false); }}>
                        <span style={{ fontSize: 13 }}>🔒</span> Privacy Policy
                      </button>
                      <button onClick={() => { window.open("https://myvaults.io/terms", "_blank"); setProfileMenuOpen(false); }}>
                        <span style={{ fontSize: 13 }}>📄</span> Terms &amp; Conditions
                      </button>
                      <button onClick={() => { setShowReferral(true); setProfileMenuOpen(false); }}>
                        <span style={{ fontSize: 13 }}>🎁</span> Invite Friends (+20 cards)
                      </button>
                      <div style={{ borderTop: "1px solid var(--b)", margin: "4px 0" }} />
                      <button onClick={() => { signOut(); setProfileMenuOpen(false); }} style={{ color: "#ff6b35" }}>
                        <span style={{ fontSize: 14 }}>→</span> Sign out
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <button
                onClick={() => setShowAuth(true)}
                style={{
                  background: "var(--gbg)", border: "1px solid #ff6b3530",
                  borderRadius: 20, padding: "5px 14px",
                  color: "#ff6b35", fontSize: 11, fontWeight: 700,
                  cursor: "pointer", letterSpacing: 0.4, flexShrink: 0
                }}
              >
                Sign in
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stats strip — shown below the fixed header when cards exist */}
      {cards.length > 0 && (
        <div style={{
          borderBottom: "1px solid var(--b)",
          background: "var(--surface)",
        }}>
          <div style={{
            maxWidth: 680, margin: "0 auto",
            padding: "10px 16px",
            display: "flex", gap: 24, alignItems: "center",
          }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 20, fontWeight: 800, color: "#ff6b35", fontFamily: "'Bebas Neue', sans-serif", lineHeight: 1 }}>{cards.length}</span>
              <span style={{ fontSize: 9, color: "var(--tg)", textTransform: "uppercase", letterSpacing: 1 }}>Cards</span>
            </div>
            {totalValue > 0 && (
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontSize: 20, fontWeight: 800, color: "#f0c040", fontFamily: "'Bebas Neue', sans-serif", lineHeight: 1 }}>
                  {totalValue >= 1000 ? `$${(totalValue / 1000).toFixed(1)}k` : `$${Math.round(totalValue)}`}
                </span>
                <span style={{ fontSize: 9, color: "var(--tg)", textTransform: "uppercase", letterSpacing: 1 }}>Est. Value</span>
              </div>
            )}
            {/* Daily / streak bonus claim button — non-blocking, user-initiated */}
            {dailyBonusReady && user && (
              <button
                onClick={() => setAdGate({ type: dailyBonusReady.type, streak: dailyBonusReady.streak })}
                style={{
                  marginLeft: "auto",
                  background: "rgba(255,165,0,0.1)",
                  border: "1px solid rgba(255,165,0,0.3)",
                  borderRadius: 20, padding: "5px 14px",
                  color: "#ffa030",
                  fontSize: 11, fontWeight: 600, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
                }}
              >
                🎁 Daily Bonus
              </button>
            )}
            {/* Collection value breakdown button */}
            {totalValue > 0 && user && (
              <button
                onClick={() => {
                  if (isPro || isValueUnlocked) {
                    setShowValueBreakdown(true);
                  } else {
                    setAdGate({ type: 'value' });
                  }
                }}
                style={{
                  marginLeft: "auto",
                  background: isValueUnlocked || isPro ? "rgba(240,192,64,0.1)" : "rgba(255,255,255,0.04)",
                  border: isValueUnlocked || isPro ? "1px solid rgba(240,192,64,0.25)" : "1px solid var(--b)",
                  borderRadius: 20, padding: "5px 14px",
                  color: isValueUnlocked || isPro ? "#f0c040" : "var(--td)",
                  fontSize: 11, fontWeight: 600, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 6,
                }}
              >
                {isValueUnlocked || isPro ? "📊 Full Breakdown" : "🔒 Full Breakdown"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Collection value breakdown modal */}
      {showValueBreakdown && (
        <ValueBreakdownModal
          cards={cards}
          totalValue={totalValue}
          onClose={() => setShowValueBreakdown(false)}
        />
      )}

      {/* Referral modal */}
      {showReferral && user && (
        <ReferralModal user={user} profile={profile} onClose={() => setShowReferral(false)} />
      )}

      {/* Pro coming soon modal */}
      {showProComingSoon && (
        <ProComingSoonModal onClose={() => setShowProComingSoon(false)} />
      )}

      {/* Referral notification toast */}
      {referralNotification && (
        <div style={{
          position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)",
          zIndex: 900, maxWidth: 340, width: "calc(100% - 32px)",
          background: "#0e0e1c", border: "1px solid rgba(255,107,53,0.35)",
          borderRadius: 14, padding: "12px 16px",
          boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
          display: "flex", alignItems: "center", gap: 10,
          animation: "fadeIn 0.25s ease",
        }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>🎁</span>
          <span style={{ fontSize: 12, color: "#e0e0e0", lineHeight: 1.5 }}>{referralNotification}</span>
          <button
            onClick={() => setReferralNotification(null)}
            style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 16, flexShrink: 0, padding: 2 }}
          >×</button>
        </div>
      )}

      {adminGiftNotification && (
        <div style={{
          position: "fixed", bottom: referralNotification ? 164 : 90, left: "50%", transform: "translateX(-50%)",
          zIndex: 901, maxWidth: 400, width: "calc(100% - 24px)",
          background: "linear-gradient(135deg, #1a1400 0%, #0e0e1c 60%)",
          border: "1.5px solid rgba(240,192,64,0.6)",
          borderRadius: 20, padding: "18px 20px 16px",
          boxShadow: "0 0 0 1px rgba(240,192,64,0.12), 0 12px 60px rgba(0,0,0,0.75), 0 0 40px rgba(240,192,64,0.08)",
          animation: "fadeIn 0.3s ease",
        }}>
          {/* header row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 26 }}>🎁</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#f0c040", letterSpacing: 0.4, textTransform: "uppercase" }}>You've received a gift!</span>
            </div>
            <button
              onClick={() => setAdminGiftNotification(null)}
              style={{ background: "none", border: "none", color: "rgba(240,192,64,0.5)", cursor: "pointer", fontSize: 20, lineHeight: 1, padding: "0 2px", flexShrink: 0 }}
            >×</button>
          </div>
          {/* message */}
          <p style={{ fontSize: 14, color: "#f5ead0", lineHeight: 1.55, margin: 0, paddingLeft: 2 }}>{adminGiftNotification}</p>
          {/* bottom accent bar */}
          <div style={{ marginTop: 14, height: 3, borderRadius: 2, background: "linear-gradient(90deg, #f0c040, #ff9800, transparent)" }} />
        </div>
      )}

      <div style={{ maxWidth: 680, margin: "0 auto", padding: "20px 20px" }}>

        {/* Non-logged-in landing page */}
        {!user && <LandingPage onSignUp={() => setShowAuth(true)} />}

        {/* Logged-in content */}
        {user && (<>
        {top10.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 9, color: "var(--tg)", textTransform: "uppercase", letterSpacing: 1.2, fontWeight: 700, marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
              Top 10 by Value
              <span style={{ fontSize: 8, color: "var(--tf)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>based on recent eBay sales</span>
            </div>
            <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 10, scrollbarWidth: "thin", scrollbarColor: "#1a1a2e transparent" }}>
              {top10.map((card, i) => {
                const rarityColors = { Common: "#555", Uncommon: "#4caf50", Rare: "#2196f3", "Very Rare": "#9c27b0", "Ultra Rare": "#ff9800", Legendary: "#f44336" };
                const rc = rarityColors[card.rarity] || "#555";
                return (
                  <div key={card.id} style={{ flexShrink: 0, width: 90, display: "flex", flexDirection: "column", gap: 5 }}>
                    <div style={{ position: "relative", width: 90, height: 124, borderRadius: 10, overflow: "hidden", border: `1px solid ${rc}40`, boxShadow: `0 0 14px ${rc}18` }}>
                      <img src={card.imageUrl} alt={card.playerName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      <div style={{
                        position: "absolute", top: 5, left: 5,
                        background: "rgba(0,0,0,0.75)", borderRadius: 5,
                        fontSize: 9, fontWeight: 800, color: "#fff",
                        padding: "1px 5px", fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 0.5
                      }}>#{i + 1}</div>
                      {card.isFavourite && (
                        <div style={{ position: "absolute", top: 3, right: 5, fontSize: 12, color: "#f0c040" }}>★</div>
                      )}
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--ts)", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{card.playerName}</div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#4caf50", fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 0.5 }}>${card.estimatedValue.toFixed(2)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Upload Zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          style={{
            border: `2px dashed ${dragOver ? "#ff6b35" : "var(--b)"}`,
            borderRadius: 18, padding: "24px 24px", textAlign: "center",
            background: dragOver ? "#ff6b3506" : "var(--surface)",
            transition: "all 0.2s", marginBottom: 20
          }}
        >
          <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: "none" }}
            onChange={e => handleFiles(e.target.files)} />
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }}
            onChange={e => handleFiles(e.target.files)} />

          {queue.length > 0 ? (
            <>
              {/* Queue progress */}
              <div style={{ marginBottom: 12 }}>
                {isProcessingNow ? (
                  <>
                    <div style={{ fontSize: 11, color: "#ff6b35", fontWeight: 600, marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>
                      Identifying card {doneCount + 1} of {queue.length}...
                    </div>
                    <div style={{ height: 3, background: "#1a1a28", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{
                        height: "100%", borderRadius: 2,
                        background: "linear-gradient(90deg, #ff6b35, #f7c59f)",
                        width: `${Math.round((doneCount / queue.length) * 100)}%`,
                        transition: "width 0.4s ease"
                      }} />
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 11, color: "#4caf50", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>
                    ✓ All {queue.length} cards identified
                  </div>
                )}
              </div>
              {/* Thumbnail strip */}
              <div style={{ display: "flex", gap: 5, justifyContent: "center", flexWrap: "wrap" }}>
                {queue.map(q => (
                  <div key={q.id} style={{
                    width: 38, height: 52, borderRadius: 5, overflow: "hidden", position: "relative", flexShrink: 0,
                    border: `2px solid ${q.status === "done" ? "#4caf5060" : q.status === "processing" ? "#ff6b35" : q.status === "error" ? "#ff444460" : "#2a2a3a"}`,
                    opacity: q.status === "pending" ? 0.35 : 1, transition: "all 0.3s"
                  }}>
                    <img src={q.previewSrc} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    {q.status === "processing" && (
                      <div style={{ position: "absolute", inset: 0, background: "rgba(255,107,53,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <div style={{ width: 14, height: 14, border: "2px solid #ff6b35", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                      </div>
                    )}
                    {q.status === "done" && (
                      <div style={{ position: "absolute", inset: 0, background: "rgba(76,175,80,0.45)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "#fff" }}>✓</div>
                    )}
                    {q.status === "error" && (
                      <div style={{ position: "absolute", inset: 0, background: "rgba(255,68,68,0.5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#fff" }}>✗</div>
                    )}
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, color: "#333", marginTop: 10, display: "flex", gap: 8, justifyContent: "center" }}>
                <span onClick={() => cameraRef.current?.click()} style={{ cursor: "pointer", color: "#ff6b35", fontWeight: 600 }}>📷 Camera</span>
                <span style={{ color: "#444" }}>·</span>
                <span onClick={() => fileRef.current?.click()} style={{ cursor: "pointer", color: "var(--ts)", fontWeight: 600 }}>🗂️ Files</span>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📸</div>
              <div style={{ color: "var(--ts)", fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Add card photos to identify</div>
              <div style={{ color: "var(--td)", fontSize: 12, marginBottom: 16 }}>Reading card details &amp; researching player...</div>
              <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
                <button
                  onClick={e => { e.stopPropagation(); cameraRef.current?.click(); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 7,
                    background: "linear-gradient(135deg, #ff6b35 0%, #f7931a 100%)",
                    border: "none", borderRadius: 12, padding: "10px 20px",
                    color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", letterSpacing: 0.3
                  }}
                >
                  <span style={{ fontSize: 16 }}>📷</span> Take Photo
                </button>
                <button
                  onClick={e => { e.stopPropagation(); fileRef.current?.click(); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 7,
                    background: "var(--card)", border: "1px solid var(--b)",
                    borderRadius: 12, padding: "10px 20px",
                    color: "var(--ts)", fontWeight: 700, fontSize: 13, cursor: "pointer", letterSpacing: 0.3
                  }}
                >
                  <span style={{ fontSize: 16 }}>🗂️</span> Choose Files
                </button>
              </div>
              {/* Card slot indicator — free tier only */}
              {user && !isPro && profile && (() => {
                const used = cards.length;
                const total = effectiveLimit;
                const remaining = Math.max(0, total - used);
                return (
                  <div style={{
                    marginTop: 14,
                    display: "inline-flex", alignItems: "center", gap: 6,
                    background: remaining === 0 ? "rgba(255,68,68,0.08)" : "rgba(255,107,53,0.07)",
                    border: `1px solid ${remaining === 0 ? "rgba(255,68,68,0.25)" : "rgba(255,107,53,0.2)"}`,
                    borderRadius: 20, padding: "5px 14px",
                  }}>
                    <span style={{ fontSize: 12 }}>{remaining === 0 ? "🔒" : "🃏"}</span>
                    <span style={{
                      fontSize: 11, fontWeight: 600,
                      color: remaining === 0 ? "#ff4444" : "var(--td)",
                    }}>
                      {remaining === 0
                        ? "No slots left — watch an ad for +3"
                        : `${remaining} card slot${remaining === 1 ? "" : "s"} remaining`}
                    </span>
                  </div>
                );
              })()}
            </>
          )}
        </div>

        {queue.some(q => q.status === "error") && (
          <div style={{
            background: "#ff444412", border: "1px solid #ff444430",
            borderRadius: 10, padding: "10px 14px", color: "#ff6666", fontSize: 12, marginBottom: 16
          }}>
            {queue.filter(q => q.status === "error").length} card{queue.filter(q => q.status === "error").length > 1 ? "s" : ""} failed to identify — try uploading again.
            {queue.filter(q => q.status === "error" && q.errorMsg).map(q => (
              <div key={q.id} style={{ marginTop: 4, fontSize: 11, opacity: 0.8, wordBreak: "break-all" }}>{q.errorMsg}</div>
            ))}
          </div>
        )}

        {/* Category Tiles */}
        {cards.length > 0 && categories.filter(c => c !== "All" && c !== "Favourites").length > 1 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 10 }}>
              {categories.filter(c => c !== "All" && c !== "Favourites").map(cat => {
                const img = CATEGORY_IMAGES[cat];
                const emoji = CATEGORY_EMOJI[cat] || "🃏";
                const catCards = cards.filter(c =>
                  cat === "Other"
                    ? (!c.cardCategory || c.cardCategory === "Other" || c.cardCategory === "Unknown")
                    : c.cardCategory === cat
                );
                const count = catCards.length;
                const catValue = catCards.reduce((s, c) => s + (c.estimatedValue || 0), 0);
                const isActive = filter === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => setFilter(isActive ? "All" : cat)}
                    style={{
                      position: "relative", aspectRatio: "3/4", width: "100%", borderRadius: 12, overflow: "hidden",
                      border: `2px solid ${isActive ? "#ff6b35" : "rgba(255,255,255,0.06)"}`,
                      cursor: "pointer", padding: 0, background: "var(--deep)",
                      boxShadow: isActive ? "0 0 16px #ff6b3540" : "none",
                      transition: "all 0.15s",
                    }}
                  >
                    {img ? (
                      <img src={img} alt={cat} style={{ width: "100%", height: "100%", objectFit: "cover", opacity: isActive ? 1 : 0.75, transition: "opacity 0.15s" }} />
                    ) : (
                      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>{emoji}</div>
                    )}
                    <div style={{
                      position: "absolute", inset: 0,
                      background: isActive
                        ? "linear-gradient(to top, rgba(255,107,53,0.85) 0%, rgba(0,0,0,0.15) 100%)"
                        : "linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.08) 70%)",
                      display: "flex", flexDirection: "column", justifyContent: "flex-end",
                      padding: "0 7px 7px", transition: "background 0.15s",
                    }}>
                      <div style={{ fontSize: 10, fontWeight: 800, color: "#fff", textTransform: "uppercase", letterSpacing: 0.7, lineHeight: 1.3 }}>{cat}</div>
                      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.7)", fontWeight: 600 }}>{count} card{count !== 1 ? "s" : ""}</div>
                      {catValue > 0 && <div style={{ fontSize: 9, color: "rgba(240,192,64,0.9)", fontWeight: 700 }}>{catValue >= 1000 ? `$${(catValue / 1000).toFixed(1)}k` : `$${Math.round(catValue)}`}</div>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Filters */}
        {cards.length > 0 && (
          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ position: "relative", width: "100%", marginBottom: 6 }}>
              <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "var(--td)", pointerEvents: "none" }}>🔍</span>
              <input
                type="text"
                placeholder="Search player, set, category, parallel, serial…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  width: "100%", padding: "8px 12px 8px 34px",
                  background: "var(--input)", border: "1px solid var(--b)",
                  borderRadius: 10, color: "var(--t)", fontSize: 14, outline: "none"
                }}
              />
              {search && (
                <button onClick={() => setSearch("")} style={{
                  position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                  background: "none", border: "none", color: "var(--tm)", cursor: "pointer", fontSize: 16, lineHeight: 1
                }}>×</button>
              )}
            </div>
            <div style={{ display: "flex", gap: 5, flex: 1, flexWrap: "wrap" }}>
              {categories.map(t => {
                const isFav = t === "Favourites";
                const activeColor = isFav ? "#f0c040" : "#ff6b35";
                return (
                  <button key={t} onClick={() => setFilter(t)} style={{
                    padding: "4px 12px", borderRadius: 20, border: "1px solid",
                    borderColor: filter === t ? activeColor : "var(--b)",
                    background: filter === t ? `${activeColor}15` : "transparent",
                    color: filter === t ? activeColor : "var(--tm)",
                    cursor: "pointer", fontSize: 12, fontWeight: 600
                  }}>{isFav ? "★ Faves" : t}</button>
                );
              })}
            </div>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{
              background: "var(--deep)", border: "1px solid var(--b)", color: "var(--ts)",
              borderRadius: 8, padding: "4px 10px", fontSize: 11, cursor: "pointer"
            }}>
              <option value="newest">Newest</option>
              <option value="player">Player A–Z</option>
              <option value="set">Set Name</option>
            </select>
            <div style={{ display: "flex", gap: 4 }}>
              {["cards", "table"].map(v => (
                <button key={v} onClick={() => setView(v)} style={{
                  padding: "4px 10px", borderRadius: 8, border: "1px solid",
                  borderColor: view === v ? "#ff6b35" : "var(--b)",
                  background: view === v ? "#ff6b3515" : "transparent",
                  color: view === v ? "#ff6b35" : "var(--td)",
                  cursor: "pointer", fontSize: 13
                }}>{v === "cards" ? "⊞" : "☰"}</button>
              ))}
            </div>
            {view === "cards" && (
              <button
                onClick={() => { setBundleMode(v => !v); setBundleCardIds(new Set()); }}
                style={{
                  padding: "4px 12px", borderRadius: 8, border: "1px solid",
                  borderColor: bundleMode ? "#e53935" : "var(--b)",
                  background: bundleMode ? "#e5393515" : "transparent",
                  color: bundleMode ? "#e53935" : "var(--td)",
                  cursor: "pointer", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap"
                }}
              >{bundleMode ? "✕ Cancel Bundle" : "Bundle Sell"}</button>
            )}
            {filter !== "All" && filter !== "Favourites" && (
              <button
                onClick={() => setShareModal({ mode: 'set', cards: filteredCards, filterLabel: filter })}
                style={{
                  padding: "4px 12px", borderRadius: 8,
                  border: "1px solid rgba(255,107,53,0.3)",
                  background: "rgba(255,107,53,0.08)",
                  color: "#ff6b35",
                  cursor: "pointer", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap"
                }}
              >Share Set ↑</button>
            )}
          </div>
        )}

        {/* Card List */}
        {view === "cards" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filteredCards.map(card => (
              <div key={card.id} style={{ animation: "fadeIn 0.25s ease" }}>
                <CardItem card={card} onDelete={id => setCards(prev => prev.filter(c => c.id !== id))} onUpdate={handleUpdate} user={user} bundleMode={bundleMode} inBundle={bundleCardIds.has(String(card.id))} onToggleBundle={handleBundleToggle} onSell={handleSellCard} onShare={card => setShareModal({ mode: 'card', card, cards: null, filterLabel: null })} />
              </div>
            ))}
            {cards.length === 0 && queue.length === 0 && (
              <div style={{ textAlign: "center", padding: "60px 0" }}>
                <div style={{ fontSize: 44, marginBottom: 10 }}>🃏</div>
                <div style={{ fontSize: 13, color: "var(--tf)" }}>Your vault is empty — upload your first card</div>
              </div>
            )}
            {cards.length > 0 && filteredCards.length === 0 && (
              <div style={{ textAlign: "center", padding: "40px 0" }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
                <div style={{ fontSize: 13, color: "var(--tf)" }}>No cards match your search</div>
              </div>
            )}
          </div>
        )}

        {/* Table View */}
        {view === "table" && (
          <div style={{ overflowX: "auto" }}>
            {cards.length === 0 && queue.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 0" }}>
                <div style={{ fontSize: 44, marginBottom: 10 }}>🃏</div>
                <div style={{ fontSize: 13, color: "var(--tf)" }}>Your vault is empty — upload your first card</div>
              </div>
            ) : filteredCards.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0" }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
                <div style={{ fontSize: 13, color: "var(--tf)" }}>No cards match your search</div>
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--b)" }}>
                    {["★", "Player", "Set", "Category", "Year", "Parallel", "Serial", "Auto", "Rarity", "Condition", "Est. Value", ""].map(h => (
                      <th key={h} style={{ padding: "8px 10px", color: "var(--td)", fontWeight: 600, textAlign: "left", whiteSpace: "nowrap", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredCards.map((card, i) => {
                    const rarityColor = { Common: "#555", Uncommon: "#4caf50", Rare: "#2196f3", "Very Rare": "#9c27b0", "Ultra Rare": "#ff9800", Legendary: "#ff6b35" }[card.rarity] || "#555";
                    return (
                      <tr key={card.id} style={{ borderBottom: "1px solid var(--b)", background: "transparent" }}>
                        <td style={{ padding: "9px 6px", textAlign: "center" }}>
                          <button onClick={() => handleUpdate(card.id, { isFavourite: !card.isFavourite })} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, padding: 2, color: card.isFavourite ? "#f0c040" : "var(--so)" }} title={card.isFavourite ? "Unfavourite" : "Favourite"}>{card.isFavourite ? "★" : "☆"}</button>
                        </td>
                        <td style={{ padding: "9px 10px", color: "var(--t)", fontWeight: 600, whiteSpace: "nowrap" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            {card.imageUrl && <img src={card.imageUrl} alt="" style={{ width: 28, height: 38, objectFit: "cover", borderRadius: 3, flexShrink: 0 }} />}
                            <span>{card.playerName || "—"}</span>
                          </div>
                        </td>
                        <td style={{ padding: "9px 10px", color: "var(--ts)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{card.fullCardName || "—"}</td>
                        <td style={{ padding: "9px 10px", color: "var(--ts)", whiteSpace: "nowrap" }}>{card.cardCategory || card.team || "—"}</td>
                        <td style={{ padding: "9px 10px", color: "var(--td)", whiteSpace: "nowrap" }}>{card.year || "—"}</td>
                        <td style={{ padding: "9px 10px", color: "var(--td)", whiteSpace: "nowrap" }}>{card.parallel || "Base"}</td>
                        <td style={{ padding: "9px 10px", color: "#ff9800", fontWeight: 600, whiteSpace: "nowrap" }}>{card.serialNumber || "—"}</td>
                        <td style={{ padding: "9px 10px", textAlign: "center" }}>{card.hasAutograph ? <span style={{ color: "#4caf50" }}>✓</span> : <span style={{ color: "var(--tf)" }}>—</span>}</td>
                        <td style={{ padding: "9px 10px", whiteSpace: "nowrap" }}>
                          <span style={{ color: rarityColor, fontWeight: 600 }}>{card.rarity || "—"}</span>
                        </td>
                        <td style={{ padding: "9px 10px", color: "var(--ts)", whiteSpace: "nowrap" }}>{card.condition || "—"}</td>
                        <td style={{ padding: "9px 10px", color: "#4caf50", fontWeight: 600, whiteSpace: "nowrap" }}>
                          {card.ebayData?.avg ? `$${card.ebayData.avg}` : "—"}
                        </td>
                        <td style={{ padding: "9px 10px" }}>
                          <button onClick={() => {
                            if (window.confirm(`Remove "${card.name || card.playerName || "this card"}" from your collection?`)) {
                              setCards(prev => prev.filter(c => c.id !== card.id));
                            }
                          }} style={{
                            background: "none", border: "none", color: "var(--tf)", cursor: "pointer", fontSize: 14, padding: 2
                          }} title="Delete">✕</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
        </>)}
      </div>
      {/* Floating bundle action bar */}
      {bundleMode && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          zIndex: 50, background: "var(--card)", border: "1px solid var(--b)",
          borderRadius: 40, padding: "10px 20px", display: "flex", alignItems: "center", gap: 12,
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)", whiteSpace: "nowrap"
        }}>
          <span style={{ fontSize: 12, color: "var(--ts)" }}>
            {bundleCardIds.size === 0 ? "Tap cards to add to bundle" : `${bundleCardIds.size} card${bundleCardIds.size > 1 ? "s" : ""} selected`}
          </span>
          {bundleCardIds.size >= 2 && (
            <button onClick={openBundleSell} style={{
              background: "#e53935", border: "none", color: "#fff",
              borderRadius: 20, padding: "6px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer"
            }}>List Bundle →</button>
          )}
          <button onClick={cancelBundleMode} style={{
            background: "var(--gbg)", border: "1px solid var(--gb)", color: "var(--gc)",
            borderRadius: 20, padding: "6px 12px", fontSize: 11, cursor: "pointer"
          }}>Cancel</button>
        </div>
      )}

      {sellModalCards && (
        <EbayListingModal
          cards={sellModalCards}
          user={user}
          onClose={() => setSellModalCards(null)}
          onSuccess={handleSellSuccess}
        />
      )}
      {publicView && (
        <PublicShareView
          mode={publicView.mode}
          card={publicView.card}
          cards={publicView.cards}
          filterLabel={publicView.filterLabel}
          onClose={() => setPublicView(null)}
        />
      )}
      {shareModal && (
        <ShareModal
          mode={shareModal.mode}
          card={shareModal.card}
          cards={shareModal.cards}
          filterLabel={shareModal.filterLabel}
          user={user}
          onClose={() => setShareModal(null)}
        />
      )}
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
      <VaultChat
        cards={cards}
        isOpen={showChat}
        onClose={async () => {
          setShowChat(false);
          if (user && !isPro) await endAISession();
        }}
        user={user}
        isPro={isPro}
        aiSessionActive={profile?.aiSessionActive ?? false}
        startAISession={startAISession}
        onUpgradeClick={() => setShowProComingSoon(true)}
      />

      {/* Footer */}
      <div style={{
        borderTop: '1px solid var(--b)', padding: '18px 16px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: 10, marginTop: 40,
      }}>
        <span style={{ fontSize: 11, color: 'var(--tm)', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 2 }}>THE VAULT</span>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          <a href="https://myvaults.io/privacy-policy" target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 11, color: 'var(--ts)', textDecoration: 'none' }}>Privacy Policy</a>
          <a href="https://myvaults.io/terms" target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 11, color: 'var(--ts)', textDecoration: 'none' }}>Terms &amp; Conditions</a>
        </div>
        <span style={{ fontSize: 11, color: 'var(--tm)' }}>© 2026 Abaza Business Services</span>
      </div>

      {/* ── Ad gate modals ────────────────────────────────────────────────── */}
      {adGate?.type === 'upload' && (
        <AdGateModal
          title="Unlock 3 More Card Slots"
          description="Watch a short ad to add 3 more cards to your vault. It's a fair trade."
          rewardLine="+3 card credits"
          isDismissable={false}
          onWatched={handleAdWatched}
          onUpgrade={handleAdUpgrade}
          onDismiss={handleAdDismiss}
        />
      )}
      {adGate?.type === 'daily' && (
        <AdGateModal
          title={`Day ${adGate.streak} — Claim Your Daily Card!`}
          description="Watch a short ad to claim today's card credit bonus."
          rewardLine="+1 card credit"
          streakCount={adGate.streak}
          isDismissable={true}
          onWatched={handleAdWatched}
          onUpgrade={handleAdUpgrade}
          onDismiss={handleAdDismiss}
        />
      )}
      {adGate?.type === 'streak10' && (
        <AdGateModal
          title="🔥 10-Day Streak!"
          description="You've logged in 10 days in a row. Watch an ad to claim your bonus card pack."
          rewardLine="+10 card credits"
          streakCount={10}
          isDismissable={false}
          onWatched={handleAdWatched}
          onUpgrade={handleAdUpgrade}
          onDismiss={handleAdDismiss}
        />
      )}
      {adGate?.type === 'value' && (
        <AdGateModal
          title="Your Collection Value Breakdown"
          description={`Your collection is estimated at ${totalValue >= 1000 ? `$${(totalValue / 1000).toFixed(1)}k` : `$${Math.round(totalValue)}`}. Watch a short ad to see the full per-card breakdown, unlocked for 24 hours.`}
          rewardLine="24-Hour Breakdown Unlock"
          isDismissable={true}
          onWatched={handleAdWatched}
          onUpgrade={handleAdUpgrade}
          onDismiss={handleAdDismiss}
        />
      )}
    </div>
  );
}
