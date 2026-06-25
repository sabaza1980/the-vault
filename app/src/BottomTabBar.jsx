// Mobile bottom tab bar (WP-1). Rendered only on mobile (native app + mobile web).
// Five slots: Home · Collections · (+) Scan · Ask AI · Profile. The center (+) is a
// raised accent button that triggers the camera/scan flow (most frequent action).
//
// Self-contained: takes an `active` key + handlers, no dependency on App internals.

const ACCENT = "#ff6b35";

function TabButton({ label, active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      style={{
        flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", gap: 3, padding: "8px 0 6px",
        background: "none", border: "none", cursor: "pointer",
        color: active ? ACCENT : "var(--gc)", transition: "color 0.15s",
      }}
    >
      <span style={{ display: "flex", height: 22, alignItems: "center" }}>{children}</span>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.3 }}>{label}</span>
    </button>
  );
}

function Icon({ d, fill }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill={fill ? "currentColor" : "none"}
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {d}
    </svg>
  );
}

export default function BottomTabBar({ active, onHome, onCollections, onScan, onAskAI, onProfile }) {
  return (
    <nav
      style={{
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 700,
        display: "flex", alignItems: "flex-end",
        background: "var(--surface)", borderTop: "1px solid var(--b)",
        backdropFilter: "blur(20px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        boxShadow: "0 -4px 24px rgba(0,0,0,0.18)",
      }}
    >
      <TabButton label="Home" active={active === "home"} onClick={onHome}>
        <Icon d={<><path d="M3 11l9-8 9 8" /><path d="M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10" /></>} />
      </TabButton>

      <TabButton label="Collections" active={active === "collections"} onClick={onCollections}>
        <Icon d={<><path d="M12 3l9 5-9 5-9-5 9-5z" /><path d="M3 13l9 5 9-5" /></>} />
      </TabButton>

      {/* Center raised scan / add button */}
      <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "flex-end" }}>
        <button
          onClick={onScan}
          aria-label="Scan or add a card"
          style={{
            width: 56, height: 56, borderRadius: "50%", marginBottom: 14, marginTop: -22,
            background: `linear-gradient(135deg, ${ACCENT} 0%, #f7931e 100%)`,
            border: "3px solid var(--surface)", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: `0 6px 18px ${ACCENT}55`,
          }}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff"
            strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      <TabButton label="Ask AI" active={active === "ai"} onClick={onAskAI}>
        <Icon fill d={<path d="M12 2.6l1.9 5.1a3 3 0 0 0 1.4 1.4L20.4 11l-5.1 1.9a3 3 0 0 0-1.4 1.4L12 19.4l-1.9-5.1a3 3 0 0 0-1.4-1.4L3.6 11l5.1-1.9a3 3 0 0 0 1.4-1.4z" />} />
      </TabButton>

      <TabButton label="Profile" active={active === "profile"} onClick={onProfile}>
        <Icon d={<><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 4-6.5 8-6.5s8 2.5 8 6.5" /></>} />
      </TabButton>
    </nav>
  );
}
