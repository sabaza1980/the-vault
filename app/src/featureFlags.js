/**
 * Parked features.
 *
 * Some parts of the app are built and working but deliberately have no entry
 * point right now, because the product is focused on collecting and sharing
 * rather than selling. The code stays in place and stays reachable so it can be
 * exercised without a rebuild, but nothing in the UI leads to it.
 *
 * To open one, add the query param or the hash to any app URL:
 *   ?sell=1      or  #sell       eBay listing, bundle sell, listing badges
 *   ?breakers=1  or  #breakers   the Breakers hub
 *
 * Read once at module load. These do not change during a session.
 */
function flag(name) {
  if (typeof window === "undefined") return false;
  const qs = new URLSearchParams(window.location.search);
  return qs.get(name) === "1" || window.location.hash === `#${name}`;
}

export const SELL_ENABLED   = flag("sell");
/** New Break / My Breaks, and the Breakers hub they belong to. */
export const BREAKS_ENABLED = flag("breakers");
