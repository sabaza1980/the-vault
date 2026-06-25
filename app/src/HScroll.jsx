import { useRef, useState, useEffect, useCallback } from "react";

// Horizontal scroller with scroll affordances (WP-4).
// Wraps its children in a single horizontally-scrolling row and shows a fade +
// chevron on each edge that still has content to scroll toward — so the user can
// always tell there's more in either direction. Reusable for any card rail.

export default function HScroll({ children, gap = 10, fade = "var(--bg)" }) {
  const ref = useRef(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const left = el.scrollLeft > 4;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
    setEdges((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
  }, []);

  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return;
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [update, children]);

  const nudge = (dir) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
  };

  const chevron = (side) => ({
    position: "absolute", top: "50%", [side]: 4, transform: "translateY(-50%)",
    width: 30, height: 30, borderRadius: "50%", zIndex: 2,
    background: "var(--surface)", border: "1px solid var(--b)",
    color: "var(--t)", fontSize: 18, lineHeight: 1, cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
    boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
  });

  return (
    <div style={{ position: "relative" }}>
      <div
        ref={ref}
        className="hscroll-row"
        style={{
          display: "flex", gap, overflowX: "auto", paddingBottom: 4,
          scrollSnapType: "x proximity", WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none",
        }}
      >
        <style>{`.hscroll-row::-webkit-scrollbar { display: none; }`}</style>
        {children}
      </div>

      <div style={{
        position: "absolute", left: 0, top: 0, bottom: 4, width: 40, pointerEvents: "none",
        opacity: edges.left ? 1 : 0, transition: "opacity 0.2s",
        background: `linear-gradient(to right, ${fade}, transparent)`,
      }} />
      {edges.left && <button aria-label="Scroll left" onClick={() => nudge(-1)} style={chevron("left")}>‹</button>}

      <div style={{
        position: "absolute", right: 0, top: 0, bottom: 4, width: 40, pointerEvents: "none",
        opacity: edges.right ? 1 : 0, transition: "opacity 0.2s",
        background: `linear-gradient(to left, ${fade}, transparent)`,
      }} />
      {edges.right && <button aria-label="Scroll right" onClick={() => nudge(1)} style={chevron("right")}>›</button>}
    </div>
  );
}
