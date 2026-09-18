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
 *   ?bulk=1      or  #bulk       multi-card scanning in one go
 *   ?collections=1 or #collections  the saved-collections builder
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
/**
 * Scanning a stack in one sitting.
 *
 * Off by default: one card at a time. A single card gets the full attention of
 * the identifier, the collector sees the result before the next photo, and a
 * quiet Sunday afternoon of 200 cards no longer costs a run of API calls or
 * buries every other collector in the feed. The queue machinery below stays
 * intact so this is one flag away from coming back.
 */
export const BULK_SCAN_ENABLED = flag("bulk");

/**
 * The saved-collections builder.
 *
 * Off while the second tab becomes the way into your own vault. Grouping cards
 * into named sets is a filing tool, and nobody had asked for it yet; parking it
 * keeps one meaning for "Collections" instead of two. The whole feature is
 * intact behind `?collections=1`.
 */
export const COLLECTIONS_ENABLED = flag("collections");
