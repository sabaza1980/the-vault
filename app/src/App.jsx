import { useState, useRef, useCallback } from "react";
import { useAuth } from "./AuthContext";
import { useFirestoreSync } from "./useFirestoreSync";

const ANTHROPIC_MODEL = "claude-sonnet-4-20250514";
const EBAY_CLIENT_ID = import.meta.env.VITE_EBAY_CLIENT_ID;
const EBAY_CLIENT_SECRET = import.meta.env.VITE_EBAY_CLIENT_SECRET;

// eBay OAuth token cache
const ebayToken = { value: null, expiry: 0 };

async function getEbayToken() {
  if (ebayToken.value && Date.now() < ebayToken.expiry) return ebayToken.value;
  const credentials = btoa(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`);
  const res = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${credentials}`
    },
    body: "grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope"
  });
  if (!res.ok) throw new Error("eBay auth failed");
  const data = await res.json();
  ebayToken.value = data.access_token;
  ebayToken.expiry = Date.now() + (data.expires_in - 60) * 1000;
  return ebayToken.value;
}

async function fetchEbaySales(cardInfo) {
  try {
    const token = await getEbayToken();
    const q = [cardInfo.playerName, cardInfo.fullCardName, cardInfo.parallel !== "Base" ? cardInfo.parallel : ""].filter(Boolean).join(" ").trim();
    const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(q)}&filter=conditionIds%3A%7B3000%7D&sort=newlyListed&limit=5`;
    const res = await fetch(url, {
      headers: { "Authorization": `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" }
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.itemSummaries || data.itemSummaries.length === 0) return null;
    const sales = data.itemSummaries
      .filter(item => item.price)
      .map(item => ({
        title: item.title,
        price: parseFloat(item.price.value),
        currency: item.price.currency,
        url: item.itemWebUrl,
        date: item.itemEndDate || null
      }));
    if (sales.length === 0) return null;
    const avg = sales.reduce((s, i) => s + i.price, 0) / sales.length;
    return { sales, avg: Math.round(avg * 100) / 100 };
  } catch (e) {
    console.error("eBay fetch error:", e);
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
      background: "#0d0d1a", border: "1px solid #1a1a2e",
      borderRadius: 16, padding: 16, display: "flex", gap: 14,
      animation: "pulse 1.5s ease-in-out infinite"
    }}>
      <div style={{ width: 80, height: 110, borderRadius: 8, background: "#1a1a2e", flexShrink: 0 }} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, paddingTop: 4 }}>
        <div style={{ height: 10, width: "40%", borderRadius: 4, background: "#1a1a2e" }} />
        <div style={{ height: 22, width: "65%", borderRadius: 4, background: "#1a1a2e" }} />
        <div style={{ height: 12, width: "50%", borderRadius: 4, background: "#1a1a2e" }} />
        <div style={{ height: 10, width: "35%", borderRadius: 4, background: "#1a1a2e" }} />
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
      <span style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: 1 }}>{label}</span>
    </div>
  );
}

function DetailRow({ label, value, color }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <span style={{ fontSize: 9, color: "#3a3a5a", textTransform: "uppercase", letterSpacing: 1 }}>{label}</span>
      <span style={{ fontSize: 12, color: color || "#999", fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function CardItem({ card, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const [ebayData, setEbayData] = useState(null);
  const [ebayLoading, setEbayLoading] = useState(false);
  const [ebayFetched, setEbayFetched] = useState(false);

  const handleExpand = useCallback(async () => {
    const next = !expanded;
    setExpanded(next);
    if (next && !ebayFetched) {
      setEbayLoading(true);
      setEbayFetched(true);
      const result = await fetchEbaySales(card);
      setEbayData(result);
      setEbayLoading(false);
    }
  }, [expanded, ebayFetched, card]);

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
      {lightbox && <Lightbox imageUrl={card.imageUrl} playerName={card.playerName} onClose={() => setLightbox(false)} />}

      <div style={{
        background: "linear-gradient(160deg, #0e0e1c 0%, #12121f 100%)",
        border: `1px solid ${expanded ? rColor + "40" : "#1c1c2e"}`,
        borderRadius: 16, overflow: "hidden",
        transition: "border-color 0.2s, box-shadow 0.2s, transform 0.15s",
        boxShadow: expanded ? `0 6px 28px ${rColor}15` : "none"
      }}
        onMouseEnter={e => e.currentTarget.style.transform = "translateY(-1px)"}
        onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}
      >
        <div style={{ display: "flex", gap: 14, padding: 14 }}>

          {/* Thumbnail — click = lightbox */}
          <div
            onClick={() => setLightbox(true)}
            title="Click to zoom"
            style={{
              width: 80, height: 110, borderRadius: 9, overflow: "hidden", flexShrink: 0,
              border: `2px solid ${rColor}40`, boxShadow: `0 0 14px ${rColor}18`,
              cursor: "zoom-in", position: "relative", display: "flex", alignItems: "center", justifyContent: "center"
            }}
          >
            <img src={card.imageUrl} alt={card.playerName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            <div style={{
              position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
              background: "rgba(0,0,0,0)", transition: "background 0.15s",
              fontSize: 20, color: "#fff", opacity: 0
            }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(0,0,0,0.5)"; e.currentTarget.style.opacity = 1; }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(0,0,0,0)"; e.currentTarget.style.opacity = 0; }}
            >🔍</div>
          </div>

          {/* Info — click = expand */}
          <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={handleExpand}>

            {/* Set name — top line */}
            <div style={{ fontSize: 10, color: "#4a4a6a", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3, lineHeight: 1.3 }}>
              {fullCardName}
              {parallelLabel && <span style={{ color: "#ff6b3580" }}> · {parallelLabel}</span>}
              {card.pack && <span style={{ color: "#3a3a5a" }}> · {card.pack}</span>}
            </div>

            {/* Player name + rarity badge */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
              <h3 style={{
                margin: 0, fontSize: 20, fontWeight: 800, color: "#f0f0f0",
                fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1.5, lineHeight: 1
              }}>{card.playerName}</h3>
              {card.rarity !== "Common" && (
                <span style={{
                  fontSize: 9, padding: "3px 8px", borderRadius: 20, flexShrink: 0, marginTop: 1,
                  background: `${rColor}18`, color: rColor, border: `1px solid ${rColor}35`,
                  fontWeight: 700, textTransform: "uppercase", letterSpacing: 1
                }}>{card.rarity}</span>
              )}
            </div>

            {/* Team */}
            {card.team && card.team !== "Unknown" && (
              <div style={{ color: "#555", fontSize: 12, marginTop: 3 }}>{card.team}</div>
            )}

            {/* Badges */}
            <div style={{ display: "flex", gap: 5, marginTop: 8, flexWrap: "wrap" }}>
              {card.isRookie && <Badge label="RC" color="#ff6b35" />}
              {card.hasAutograph && <Badge label="AUTO" color="#f0c040" />}
              {card.serialNumber && <Badge label={card.serialNumber} color="#ce93d8" />}
              {card.cardNumber && <Badge label={`#${card.cardNumber}`} color="#555" />}
              {card.confidenceLevel === "Low" && <Badge label="⚠ Low Confidence" color="#ff6666" />}
            </div>
          </div>
        </div>

        {/* Expanded panel */}
        {expanded && (
          <div style={{ borderTop: "1px solid #ffffff06", padding: "14px 14px 14px" }}>

            {/* Player context */}
            {card.playerContext && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 9, color: "#3a3a5a", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600, marginBottom: 5 }}>About This Card</div>
                <p style={{ margin: 0, fontSize: 12, color: "#888", lineHeight: 1.7 }}>{card.playerContext}</p>
              </div>
            )}

            {/* Condition detail */}
            {card.conditionDetail && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                  <div style={{ fontSize: 9, color: "#3a3a5a", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>Condition Assessment</div>
                  {card.condition && (
                    <span style={{
                      fontSize: 9, padding: "2px 7px", borderRadius: 6, fontWeight: 700,
                      background: card.condition === "Mint" ? "#4caf5020" : card.condition === "Near Mint" ? "#8bc34a20" : card.condition === "Excellent" ? "#ff980020" : "#88888820",
                      color: card.condition === "Mint" ? "#4caf50" : card.condition === "Near Mint" ? "#8bc34a" : card.condition === "Excellent" ? "#ff9800" : "#888",
                      border: `1px solid ${card.condition === "Mint" ? "#4caf5040" : card.condition === "Near Mint" ? "#8bc34a40" : card.condition === "Excellent" ? "#ff980040" : "#88888840"}`
                    }}>{card.condition}</span>
                  )}
                </div>
                <p style={{ margin: 0, fontSize: 12, color: "#888", lineHeight: 1.7 }}>{card.conditionDetail}</p>
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
              <p style={{ margin: "0 0 12px", fontSize: 11, color: "#3a3a5a", lineHeight: 1.6, fontStyle: "italic" }}>{card.notes}</p>
            )}

            {/* eBay Live Pricing */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 9, color: "#3a3a5a", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                Recent eBay Sales
                <span style={{ fontSize: 8, color: "#2a2a4a", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>live data</span>
              </div>
              {ebayLoading && (
                <div style={{ fontSize: 12, color: "#3a3a5a", display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 10, height: 10, border: "2px solid #ff6b35", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                  Fetching eBay sales...
                </div>
              )}
              {!ebayLoading && ebayData && (
                <>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 22, fontWeight: 800, color: "#4caf50", fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1 }}>
                      ${ebayData.avg.toFixed(2)}
                    </span>
                    <span style={{ fontSize: 10, color: "#555" }}>avg of {ebayData.sales.length} recent sales</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {ebayData.sales.slice(0, 4).map((sale, i) => (
                      <a key={i} href={sale.url} target="_blank" rel="noopener noreferrer" style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "6px 10px", borderRadius: 8, background: "#0a0a14",
                        border: "1px solid #1a1a28", textDecoration: "none",
                        transition: "border-color 0.15s"
                      }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = "#4caf5040"}
                        onMouseLeave={e => e.currentTarget.style.borderColor = "#1a1a28"}
                      >
                        <span style={{ fontSize: 11, color: "#666", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginRight: 8 }}>{sale.title}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#4caf50", flexShrink: 0 }}>${sale.price.toFixed(2)}</span>
                      </a>
                    ))}
                  </div>
                </>
              )}
              {!ebayLoading && !ebayData && ebayFetched && (
                <div style={{ fontSize: 12, color: "#3a3a5a", fontStyle: "italic" }}>No recent eBay sales found for this card.</div>
              )}
            </div>

            <button
              onClick={() => onDelete(card.id)}
              style={{
                background: "transparent", border: "1px solid #ff444428", color: "#ff444488",
                borderRadius: 8, padding: "5px 14px", cursor: "pointer", fontSize: 11, fontWeight: 600
              }}
            >Remove</button>
          </div>
        )}
      </div>
    </>
  );
}

function Badge({ label, color }) {
  return (
    <span style={{
      fontSize: 10, padding: "2px 8px", borderRadius: 10,
      background: `${color}15`, color, border: `1px solid ${color}35`, fontWeight: 700
    }}>{label}</span>
  );
}

export default function App() {
  const { user, signInWithGoogle, signOut } = useAuth();
  const [cards, setCards] = useState([]);
  const [queue, setQueue] = useState([]); // [{id, file, previewBase64, status}]
  const [dragOver, setDragOver] = useState(false);
  const [filter, setFilter] = useState("All");
  const [sortBy, setSortBy] = useState("newest");
  const fileRef = useRef();
  const isProcessing = useRef(false);
  const pendingQueue = useRef([]);

  // Sync cards to/from Firestore when the user is signed in.
  useFirestoreSync(user ?? null, cards, setCards);

  const analyzeCard = useCallback(async (item) => {
    try {
      const base64 = item.base64;
      const mediaType = item.mediaType;
      const imageUrl = `data:${mediaType};base64,${base64}`;

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: ANTHROPIC_MODEL,
          max_tokens: 1000,
          messages: [{
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
              {
                type: "text",
                text: `You are a strict sports card authenticator. Analyze this card image and return ONLY a valid JSON object. No markdown, no backticks, no explanation.

CRITICAL RULES:
1. ONLY report what you can ACTUALLY READ on the card. Never guess or fabricate.
2. If you cannot clearly read a field, use null or "Unknown".
3. "fullCardName" is the most important field. Format it exactly as a price guide would: "[Year] [Brand] [Series]" e.g. "2023-24 Panini Prizm", "1996-97 Topps Chrome", "2021 Bowman Draft". Read year, brand and series directly from the card.
4. "pack" = the product/pack type if identifiable (e.g. "Hobby Box", "Blaster Box", "Mega Box") or null.
5. RARITY defaults to "Common" — only upgrade with explicit physical evidence:
   - "Uncommon" = visible parallel finish / colored border
   - "Rare" = refractor / prizm / chrome / foil clearly visible
   - "Very Rare" = serial number /299 or lower printed on card
   - "Ultra Rare" = serial number /25 or lower
   - "Legendary" = 1/1 or on-card autograph + serial /10 or lower
   - NEVER assign Rare+ based on player name or fame.
6. isRookie = true ONLY if "ROOKIE", "RC", or "Rated Rookie" is physically printed on the card.
7. hasAutograph = true ONLY if a physical signature is visible on the card.
8. condition = one of: Mint | Near Mint | Excellent | Good | Fair | Poor | Unknown — based strictly on what you can see.
9. conditionDetail = a 1-2 sentence assessment of the card's physical condition based on the image. Comment specifically on: corners (sharp/worn/dinged), surface finish (clean/scratched/print defects), and centering (well-centered/slightly off/noticeably off). Only describe what is visible.
10. playerContext = 2-3 sentences about who this player is and why this card is or isn't particularly significant. Include: their career highlights/status (active star, legend, prospect, journeyman, etc.), whether this is a notable year for them, and any reason the card itself is or isn't collectible beyond the base version.
11. parallel = exact finish name (Base, Silver Prizm, Gold Prizm, Red Wave, Holo, Refractor, etc.) or "Base".

{
  "playerName": "Exact name as printed, or 'Unknown Player'",
  "fullCardName": "e.g. '2023-24 Panini Prizm' — year + brand + series as on card",
  "pack": "Pack/product name or null",
  "team": "Team name as printed, or 'Unknown'",
  "year": "Year or season e.g. '2023-24', or 'Unknown'",
  "brand": "Panini | Topps | Upper Deck | Fleer | Bowman | etc., or 'Unknown'",
  "series": "Exact set name e.g. 'Prizm' | 'Select' | 'Hoops' | 'Chrome', or null",
  "parallel": "Base | Silver Prizm | Gold Prizm | etc.",
  "cardNumber": "Card number as printed or null",
  "serialNumber": "e.g. '45/99' or null",
  "isRookie": false,
  "hasAutograph": false,
  "rarity": "Common",
  "condition": "Mint | Near Mint | Excellent | Good | Fair | Poor | Unknown",
  "conditionDetail": "e.g. 'Corners appear sharp with no visible wear. Surface is clean with good finish. Centering is slightly left-heavy but acceptable.'",
  "playerContext": "e.g. 'LeBron James is an all-time great and 4x NBA champion. This 2003-04 Topps card is from his rookie season, making it one of the most sought-after modern cards. Base versions are common but still desirable.'",
  "confidenceLevel": "High | Medium | Low",
  "notes": "Any other factual observations — print lines, staining, foil damage, etc."
}`
              }
            ]
          }]
        })
      });

      if (!response.ok) throw new Error(`API error ${response.status}`);
      const data = await response.json();
      const text = data.content.filter(b => b.type === "text").map(b => b.text).join("");

      let cardInfo;
      try {
        const clean = text.replace(/```json|```/g, "").trim();
        cardInfo = JSON.parse(clean);
      } catch {
        cardInfo = { playerName: "Unknown Player", fullCardName: "Unknown Card", team: "Unknown", year: "Unknown", brand: "Unknown", rarity: "Unknown", condition: "Unknown", confidenceLevel: "Low" };
      }

      setCards(prev => [{ id: Date.now(), imageUrl, ...cardInfo, addedAt: new Date().toISOString() }, ...prev]);
      setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: "done" } : q));
    } catch (err) {
      setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: "error" } : q));
      console.error(err);
    }
  }, []);

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

  const handleFiles = useCallback(async (files) => {
    const imageFiles = Array.from(files).filter(f => f.type.startsWith("image/"));
    if (!imageFiles.length) return;

    // Read all files to base64 first
    const newItems = await Promise.all(imageFiles.map(async (file) => {
      const base64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result.split(",")[1]);
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      return {
        id: Date.now() + Math.random(),
        file,
        base64,
        mediaType: file.type || "image/jpeg",
        previewSrc: `data:${file.type || "image/jpeg"};base64,${base64}`,
        name: file.name,
        status: "pending"
      };
    }));

    setQueue(prev => [...prev, ...newItems]);
    pendingQueue.current = [...pendingQueue.current, ...newItems];
    runQueue();
  }, [runQueue]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const teams = ["All", ...new Set(cards.map(c => c.team).filter(t => t && t !== "Unknown"))];

  const filteredCards = cards
    .filter(c => filter === "All" || c.team === filter)
    .sort((a, b) => {
      if (sortBy === "newest") return b.id - a.id;
      if (sortBy === "player") return a.playerName.localeCompare(b.playerName);
      if (sortBy === "set") return (a.fullCardName || "").localeCompare(b.fullCardName || "");
      return 0;
    });

  const rareCounts = cards.filter(c => ["Rare", "Very Rare", "Ultra Rare", "Legendary"].includes(c.rarity)).length;

  const activeQueue = queue.filter(q => q.status !== "done");
  const isProcessingNow = queue.some(q => q.status === "processing");
  const doneCount = queue.filter(q => q.status === "done").length;

  return (
    <div style={{ minHeight: "100vh", background: "#07070f", color: "#fff", fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700&display=swap');
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: #0a0a10; }
        ::-webkit-scrollbar-thumb { background: #222; border-radius: 3px; }
      `}</style>

      {/* Header */}
      <div style={{
        background: "linear-gradient(180deg, #09090f 0%, transparent 100%)",
        borderBottom: "1px solid #ffffff06", padding: "22px 24px 18px",
        position: "sticky", top: 0, zIndex: 10, backdropFilter: "blur(20px)"
      }}>
        <div style={{ maxWidth: 680, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
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
            <p style={{ margin: "2px 0 0", fontSize: 11, color: "#383850" }}>AI card identification · eBay pricing</p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {cards.length > 0 && (
              <>
                <StatBadge label="Cards" value={cards.length} color="#ff6b35" />
                {rareCounts > 0 && <StatBadge label="Rare+" value={rareCounts} color="#9c27b0" />}
              </>
            )}
            {user === undefined ? null : user ? (
              <button
                onClick={signOut}
                title={`Signed in as ${user.displayName || user.email}`}
                style={{
                  background: "#ffffff0a", border: "1px solid #ffffff15",
                  borderRadius: 20, padding: "5px 12px",
                  color: "#888", fontSize: 11, fontWeight: 600,
                  cursor: "pointer", display: "flex", alignItems: "center", gap: 6
                }}
              >
                {user.photoURL && (
                  <img src={user.photoURL} alt="" style={{ width: 18, height: 18, borderRadius: "50%" }} />
                )}
                Sign out
              </button>
            ) : (
              <button
                onClick={signInWithGoogle}
                style={{
                  background: "#ffffff0a", border: "1px solid #ff6b3530",
                  borderRadius: 20, padding: "5px 14px",
                  color: "#ff6b35", fontSize: 11, fontWeight: 700,
                  cursor: "pointer", letterSpacing: 0.4
                }}
              >
                Sign in
              </button>
            )}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 680, margin: "0 auto", padding: "20px 20px" }}>

        {/* Upload Zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          style={{
            border: `2px dashed ${dragOver ? "#ff6b35" : "#1a1a28"}`,
            borderRadius: 18, padding: "24px 24px", textAlign: "center",
            cursor: "pointer", background: dragOver ? "#ff6b3506" : "#09090e",
            transition: "all 0.2s", marginBottom: 20
          }}
        >
          <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: "none" }}
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
              <div style={{ fontSize: 11, color: "#333", marginTop: 10 }}>Tap to add more cards</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📸</div>
              <div style={{ color: "#aaa", fontWeight: 600, fontSize: 14 }}>Drop card photos here</div>
              <div style={{ color: "#333", fontSize: 12, marginTop: 3 }}>Select one or multiple — each card is identified automatically</div>
            </>
          )}
        </div>

        {queue.some(q => q.status === "error") && (
          <div style={{
            background: "#ff444412", border: "1px solid #ff444430",
            borderRadius: 10, padding: "10px 14px", color: "#ff6666", fontSize: 12, marginBottom: 16
          }}>
            {queue.filter(q => q.status === "error").length} card{queue.filter(q => q.status === "error").length > 1 ? "s" : ""} failed to identify — try uploading again.
          </div>
        )}

        {/* Filters */}
        {cards.length > 0 && (
          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ display: "flex", gap: 5, flex: 1, flexWrap: "wrap" }}>
              {teams.map(t => (
                <button key={t} onClick={() => setFilter(t)} style={{
                  padding: "4px 12px", borderRadius: 20, border: "1px solid",
                  borderColor: filter === t ? "#ff6b35" : "#1a1a28",
                  background: filter === t ? "#ff6b3515" : "transparent",
                  color: filter === t ? "#ff6b35" : "#555",
                  cursor: "pointer", fontSize: 11, fontWeight: 600
                }}>{t}</button>
              ))}
            </div>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{
              background: "#0a0a10", border: "1px solid #1a1a28", color: "#666",
              borderRadius: 8, padding: "4px 10px", fontSize: 11, cursor: "pointer"
            }}>
              <option value="newest">Newest</option>
              <option value="player">Player A–Z</option>
              <option value="set">Set Name</option>
            </select>
          </div>
        )}

        {/* Card List */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filteredCards.map(card => (
            <div key={card.id} style={{ animation: "fadeIn 0.25s ease" }}>
              <CardItem card={card} onDelete={id => setCards(prev => prev.filter(c => c.id !== id))} />
            </div>
          ))}
          {cards.length === 0 && queue.length === 0 && (
            <div style={{ textAlign: "center", padding: "60px 0" }}>
              <div style={{ fontSize: 44, marginBottom: 10 }}>🃏</div>
              <div style={{ fontSize: 13, color: "#2a2a3a" }}>Your vault is empty — upload your first card</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
