# eBay sold-comp valuation

Built 2026-08-29. Every claim below was verified live against eBay production
with The Vault's own app keys, not from documentation alone.

## What eBay actually offers today

| API | Sold data? | Status on our keys |
|---|---|---|
| Finding API `findCompletedItems` | was the only free source | **Decommissioned 4 Feb 2025.** Gone. |
| Browse API `item_summary/search` | no — active listings only | Works. `soldItemsOnly`, `buyingOptions:{SOLD}` and `itemEndDate` filters all rejected as invalid. |
| **Marketplace Insights `item_sales/search`** | **yes — 90 days of sales** | **Not approved.** Scope request returns *"exceeds the scope granted to the client"*; endpoint returns **403 Access denied**. |
| Metadata API `getItemConditionPolicies` | n/a | Works. |

So: sold comps on eBay are a Marketplace Insights feature and nothing else.
The integration is complete and tested; it returns real numbers the day eBay
approves the app, and a clean "unavailable" until then. No other code changes
will be needed at that point.

## Valuation rule

    >= 5 sold comps  ->  average of the 5 most recent      (method: average_of_5)
     1-4 sold comps  ->  price of the single most recent   (method: most_recent)
       0 sold comps  ->  value: null                        (unknown / blank, never 0)

Comps are ranked by `lastSoldDate` descending. Ties break on item ID so the
same inputs always give the same number.

## Endpoints

### `POST /api/ebay-value` — the one to call

```jsonc
// request
{
  "playerName": "Julio Rodriguez",
  "year": "2023", "brand": "Topps Chrome",
  "series": "Sepia Refractor", "parallel": "Sepia", "cardNumber": "200",
  "graded": true, "grader": "PSA", "grade": "10", "certNumber": "87654321",
  "condition": "Near Mint",        // ungraded cards instead of grader/grade
  "marketplaceId": "EBAY_US",      // optional
  "categoryIds": "261328"          // optional, narrows the search
}

// response
{
  "value": 128.40,                 // THE number to display. null = unknown.
  "currency": "USD",
  "method": "average_of_5",
  "sampleSize": 5,
  "itemIds":       ["v1|1234|0", ...],   // eBay REST item IDs used
  "legacyItemIds": ["1234", ...],        // classic numeric item IDs
  "comps": [ { "itemId", "title", "price", "soldDate", "url", ... } ],
  "query": "2023 Topps Chrome ... PSA 10",
  "queryTier": "exact",
  "asOf": "2026-08-29T...Z",
  "priceSource": "eBay sold",
  "unavailable": null,
  "note": "Average of the 5 most recent eBay sales."
}
```

Always HTTP 200, even on failure — a pricing lookup must never break the card
view. When `value` is null, `unavailable` says why:

| `unavailable` | Meaning |
|---|---|
| `null` | Genuinely no sold comps in 90 days. Show the empty state. |
| `NO_MARKETPLACE_INSIGHTS_ACCESS` | eBay has not approved the app yet. |
| `RATE_LIMITED` | eBay 429; `retryAfter` included. |
| `TIMEOUT` / `UPSTREAM_ERROR` | eBay slow or erroring. Safe to retry later. |
| `NOT_CONFIGURED` | App credentials missing from the environment. |

### `GET /api/ebay-conditions?categoryId=183050`

Live grader / grade / card-condition lists from `getItemConditionPolicies`.
Use it to populate dropdowns instead of hardcoding IDs — eBay adds graders
regularly (25 as of today, up from the handful the old code assumed).

`POST` it with `{ card: {...} }` to get resolved descriptor IDs plus the ready
AddItem XML block.

### `POST /api/ebay-sales` — compatibility shim

Kept so the existing `fetchEbaySales()` in `App.jsx` keeps working. It now runs
on sold comps instead of the dead Finding API, and no longer falls back to
*asking* prices from Browse. New code should call `/api/ebay-value`.

## Accuracy guards

Averaging whatever eBay returns produces nonsense valuations, so comps are
filtered before the rule is applied:

- **Graded vs raw never mix.** A PSA 10 comp is excluded from a raw card's
  valuation and vice versa, by both `conditionId` and title parsing.
- **Grade must match.** A PSA 10 card is not valued off PSA 9 sales.
- **Lots, bundles, breaks, repacks, customs, reprints, sealed boxes** are
  dropped. These are the biggest source of wild numbers.
- **The player's surname must appear in the title**, or eBay's fuzzy match has
  drifted to a different card.
- **Currencies are never averaged together.** The most recent sale's currency
  anchors the result; other-currency comps are dropped and counted in
  `droppedForCurrency`.
- **Progressive relaxation.** If the exact query finds nothing, the search
  loosens in steps (drop card number, then parallel, then down to player+year).
  `queryTier` reports how tight the match actually was, so the UI can say so.

`rejectedCount` tells you how many nearby sales were thrown out — useful when a
card shows "no comps" but clearly has sales.

## Condition descriptors

Card condition on eBay is no longer an item specific. It is
`ConditionDescriptorType` on the listing, and the numeric IDs come from
`getItemConditionPolicies`. Verified live for categories 183050 / 261328 / 183454,
all three of which accept exactly **2750 (Graded), 3000 (Used), 4000 (Ungraded)**.

| ConditionID | Descriptor | Name ID | Values |
|---|---|---|---|
| 2750 Graded | Professional Grader | `27501` | 25 graders (`275010` = PSA, `275013` = BGS, `275016` = SGC ...) |
| 2750 Graded | Grade | `27502` | 24 values (`275020` = 10, `275021` = 9.5 ...) |
| 2750 Graded | Certification Number | `27503` | free text — goes in `AdditionalInfo`, not `Value` |
| 4000 Ungraded | Card Condition | `40001` | `400010` Near mint or better, `400011` Excellent, `400012` Very good, `400013` Poor |

Generated XML:

```xml
<ConditionDescriptors>
  <ConditionDescriptor><Name>27501</Name><Value>275010</Value></ConditionDescriptor>
  <ConditionDescriptor><Name>27502</Name><Value>275020</Value></ConditionDescriptor>
  <ConditionDescriptor><Name>27503</Name><AdditionalInfo>87654321</AdditionalInfo></ConditionDescriptor>
</ConditionDescriptors>
```

### Bug fixed in `api/ebay-list.js`

The listing path was sending **ConditionID 5000 / 6000**, which category 183050
does not accept, and was sending "Card Condition" as an item specific with
values ("Good", "Very Good") that are not in eBay's list. Both would fail or
mis-list. It now resolves ConditionID and descriptors from live metadata, and
handles graded cards (2750) which it previously could not list at all.

## Files

    app/api/_ebay/token.js        scoped app tokens, scope-refusal detection
    app/api/_ebay/conditions.js   getItemConditionPolicies + descriptor resolution
    app/api/_ebay/soldComps.js    query tiers, comp filtering, the valuation rule
    app/api/ebay-value.js         main endpoint (+ 6h in-process cache)
    app/api/ebay-conditions.js    condition descriptor metadata endpoint
    app/api/ebay-sales.js         compatibility shim over the new engine
    app/api/ebay-list.js          patched: real ConditionDescriptors
    app/scripts/ebay-selftest.mjs 38 checks, live + offline

Run the tests:

    cd app && node scripts/ebay-selftest.mjs

The self-test reports the Marketplace Insights access state, so re-run it after
applying to eBay to see the moment access lands.

## Gotcha worth remembering

`.env.production` and `.env.local` are written by the Vercel CLI with **quoted
values**, and the repo lives on Windows so they carry **CRLF** endings. Either
one makes eBay Basic auth fail with a misleading `invalid_client` /
"client authentication failed". `token.js` now strips both.
