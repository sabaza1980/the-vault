export default function LandingPage({ onSignUp }) {
  const features = [
    {
      icon: "🔍",
      title: "AI Card Identification",
      desc: "Snap a photo. Our AI reads the card, identifies the player, set and year instantly.",
    },
    {
      icon: "💰",
      title: "Live Pricing",
      desc: "Every card is matched to real market data via Card Hedge so you always know what it's worth.",
    },
    {
      icon: "📈",
      title: "Collection Value",
      desc: "Track your entire collection's value in one place and watch it grow over time.",
    },
    {
      icon: "🔗",
      title: "Share Your Vault",
      desc: "Show off your best cards. Share your full vault with anyone, anywhere.",
    },
  ];

  const pilots = [
    {
      name: "PJ",
      avatar: "/panini-avatar.png",
      accent: "#ff6b35",
      tagline: "Your laid-back card collector co-pilot",
      quote: '"Yo, that Luka rookie is sitting way under market — might be worth a flip."',
      btnLabel: "Ask PJ",
    },
    {
      name: "Toppsy",
      avatar: "/toppsy-avatar.png",
      accent: "#9c27b0",
      tagline: "Your sharp-eyed hobby co-pilot",
      quote: '"Based on recent sales data, your PSA 10 Wembanyama has appreciated 34% this quarter."',
      btnLabel: "Ask Toppsy",
    },
  ];

  return (
    <>
      {/* ── Stats strip ── */}
      <div style={{ borderBottom: "1px solid var(--b)", background: "var(--surface)" }}>
        <div style={{
          maxWidth: 680, margin: "0 auto", padding: "10px 16px",
          display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap",
        }}>
          {[
            { label: "Cards in Vault", value: "0", color: "#ff6b35" },
            { label: "Est. Collection Value", value: "$0", color: "#f0c040" },
            { label: "Rare+ Cards", value: "0", color: "#9c27b0" },
          ].map(stat => (
            <div key={stat.label} style={{ display: "flex", flexDirection: "column" }}>
              <span style={{
                fontSize: 20, fontWeight: 800, color: stat.color,
                fontFamily: "'Bebas Neue', sans-serif", lineHeight: 1,
              }}>{stat.value}</span>
              <span style={{
                fontSize: 9, color: "var(--tg)", textTransform: "uppercase", letterSpacing: 1,
              }}>{stat.label}</span>
            </div>
          ))}
          <span style={{
            marginLeft: "auto", fontSize: 10, color: "var(--td)",
            fontStyle: "italic", flexShrink: 0,
          }}>Sign in to start scanning</span>
        </div>
      </div>

      <div style={{ maxWidth: 680, margin: "0 auto", padding: "32px 20px 48px" }}>

        {/* ── Hero ── */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <h2 style={{
            margin: "0 0 10px",
            fontSize: 44, fontWeight: 800,
            fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 3,
            background: "linear-gradient(135deg, #ff6b35 0%, #f7c59f 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            lineHeight: 1.1,
          }}>
            Your collection<br />starts here
          </h2>
          <p style={{
            margin: "0 0 24px",
            fontSize: 15, color: "var(--ts)", lineHeight: 1.55,
          }}>
            Scan any card, stamp or coin. AI identifies it in seconds.<br />It's free.
          </p>
          <button
            onClick={onSignUp}
            style={{
              background: "linear-gradient(135deg, #ff6b35 0%, #e85d2a 100%)",
              border: "none", borderRadius: 40,
              padding: "14px 32px",
              color: "#fff", fontSize: 14, fontWeight: 800,
              letterSpacing: 1.5, textTransform: "uppercase",
              cursor: "pointer",
              boxShadow: "0 6px 28px rgba(255,107,53,0.45)",
              transition: "transform 0.15s, box-shadow 0.15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 10px 36px rgba(255,107,53,0.55)"; }}
            onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "0 6px 28px rgba(255,107,53,0.45)"; }}
          >
            Create Free Account
          </button>
        </div>

        {/* ── Looping video ── */}
        <div style={{ marginBottom: 40, borderRadius: 18, overflow: "hidden", boxShadow: "0 8px 40px rgba(0,0,0,0.5)" }}>
          <video
            src="/vault-open-video.mp4"
            autoPlay
            loop
            muted
            playsInline
            style={{ width: "100%", display: "block" }}
          />
        </div>

        {/* ── What the vault does ── */}
        <div style={{ marginBottom: 40 }}>
          <div style={{
            fontSize: 10, color: "var(--tg)", textTransform: "uppercase",
            letterSpacing: 2, fontWeight: 700, marginBottom: 16, textAlign: "center",
          }}>
            What the vault does
          </div>
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12,
          }}>
            {features.map(f => (
              <div key={f.title} style={{
                background: "var(--card)", border: "1px solid var(--b)",
                borderRadius: 16, padding: "18px 16px",
              }}>
                <div style={{ fontSize: 26, marginBottom: 8 }}>{f.icon}</div>
                <div style={{
                  fontSize: 13, fontWeight: 700, color: "var(--t)",
                  marginBottom: 6, lineHeight: 1.25,
                }}>{f.title}</div>
                <div style={{
                  fontSize: 11, color: "var(--ts)", lineHeight: 1.5,
                }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Meet your AI co-pilots ── */}
        <div style={{ marginBottom: 8 }}>
          <div style={{
            fontSize: 10, color: "var(--tg)", textTransform: "uppercase",
            letterSpacing: 2, fontWeight: 700, marginBottom: 16, textAlign: "center",
          }}>
            Meet your AI co-pilots
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {pilots.map(p => (
              <div key={p.name} style={{
                background: "var(--card)", border: `1px solid ${p.accent}30`,
                borderRadius: 16, padding: "20px 16px",
                display: "flex", flexDirection: "column", gap: 10,
                boxShadow: `0 0 24px ${p.accent}10`,
              }}>
                <img
                  src={p.avatar}
                  alt={p.name}
                  style={{
                    width: 52, height: 52, borderRadius: "50%",
                    border: `2px solid ${p.accent}60`,
                    objectFit: "cover",
                  }}
                />
                <div>
                  <div style={{
                    fontSize: 16, fontWeight: 800, color: p.accent,
                    fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1.5,
                    lineHeight: 1,
                  }}>{p.name}</div>
                  <div style={{
                    fontSize: 10, color: "var(--tg)", marginTop: 2, lineHeight: 1.3,
                  }}>{p.tagline}</div>
                </div>
                <div style={{
                  fontSize: 11, color: "var(--ts)", fontStyle: "italic",
                  lineHeight: 1.5, borderLeft: `2px solid ${p.accent}40`,
                  paddingLeft: 10, flexGrow: 1,
                }}>
                  {p.quote}
                </div>
                <button
                  onClick={onSignUp}
                  style={{
                    background: `${p.accent}18`,
                    border: `1px solid ${p.accent}50`,
                    borderRadius: 20, padding: "8px 0",
                    color: p.accent, fontSize: 12, fontWeight: 700,
                    cursor: "pointer", letterSpacing: 0.5,
                    width: "100%",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = `${p.accent}28`}
                  onMouseLeave={e => e.currentTarget.style.background = `${p.accent}18`}
                >
                  {p.btnLabel}
                </button>
              </div>
            ))}
          </div>
          <p style={{
            textAlign: "center", fontSize: 11, color: "var(--td)",
            marginTop: 16, lineHeight: 1.6,
          }}>
            Ask about your collection, get grading advice, spot trends —{" "}
            <span
              onClick={onSignUp}
              style={{ color: "#ff6b35", fontWeight: 600, cursor: "pointer" }}
            >
              sign in to unlock.
            </span>
          </p>
        </div>

      </div>
    </>
  );
}
