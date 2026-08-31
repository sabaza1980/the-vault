# Marketplace Insights request, length ladder

Paste the longest version that fits. All say the same thing, progressively compressed.

## Version A (2459 characters, 417 words)

The Vault is a collection management app for trading card collectors, live on web, iOS and Android. Collectors photograph a card, the app identifies it, and it goes into a catalogued collection with an estimated value.

We are already an active eBay developer. The app uses the Trading API to create listings on behalf of sellers, the Account API for business policies, and Browse and Taxonomy for category and aspect data. Selling to eBay from a collection is a feature our users have today, not a plan.

I need Marketplace Insights for one function: estimating what a card is worth from its recent eBay sold listings, so a collector can decide whether to sell it, or simply know what their collection is worth.

The logic is narrow. For a given card we take sold listings from the last 90 days and return one number: the average of the five most recent sales, or the most recent single sale if there are fewer than five, or blank if there are none. We never show a fabricated or zero value. Every sale behind the number is shown to the collector and links back to the eBay item page with our EPN tracking.

The integration is built and tested against production. It currently returns a clean "unavailable" state because the scope is not granted: the scope request returns "exceeds the scope granted to the client", and item_sales/search returns 403. Everything around that call is finished, including valuation rules, comp filtering so graded and raw sales are never averaged together, condition handling via getItemConditionPolicies and ConditionDescriptorType rather than hardcoded IDs, and error handling for 403, 429 and timeouts. Approval is the only remaining step.

Volume is low and bounded. Valuations are fetched lazily, once when a card is added and again only when a collector opens it or taps Refresh, then cached six hours per card. One call per card valuation, not per page view. Low hundreds of calls per day.

This moves inventory onto eBay. Collectors who see a realistic sold price are far more likely to list, and our listing flow already runs on the Trading API, so valuation to live listing is one screen. Better priced listings also sell faster. We reach a segment eBay struggles to reach directly: hobbyist collectors with hundreds of cards in binders who have never listed anything.

I have completed the EPN developer questionnaire. I can provide a test account, UI mockups and a walkthrough of the end to end flow whenever useful.

## Version B (2077 characters, 354 words)

The Vault is a collection management app for trading card collectors, live on web, iOS and Android. Collectors photograph a card, the app identifies it, and it goes into a catalogued collection with an estimated value.

We are already an active eBay developer. The app uses the Trading API to create listings for sellers, the Account API for business policies, and Browse and Taxonomy for category data. Selling to eBay from a collection is a feature our users have today.

I need Marketplace Insights for one function: estimating what a card is worth from its recent eBay sold listings, so a collector can decide whether to sell it, or simply know what their collection is worth.

The logic is narrow. For a given card we take sold listings from the last 90 days and return one number: the average of the five most recent sales, or the most recent single sale if there are fewer than five, or blank if there are none. We never show a fabricated or zero value. Every sale behind the number is shown to the collector and links back to the eBay item page with our EPN tracking.

The integration is built and tested. It returns a clean "unavailable" state today because the scope is not granted: the scope request returns "exceeds the scope granted to the client", and item_sales/search returns 403. Valuation rules, comp filtering, condition handling via getItemConditionPolicies, and 403/429/timeout handling are all done. Approval is the only remaining step.

Volume is low and bounded. Valuations are fetched lazily, once when a card is added and again only when a collector opens it or taps Refresh, then cached six hours per card. Low hundreds of calls per day.

This moves inventory onto eBay. Collectors who see a realistic sold price are far more likely to list, and our listing flow already runs on the Trading API, so valuation to live listing is one screen. We reach hobbyist collectors with hundreds of cards in binders who have never listed anything.

I have completed the EPN developer questionnaire and can provide a test account and a walkthrough whenever useful.

## Version C (1612 characters, 285 words)

The Vault is a collection management app for trading card collectors, live on web, iOS and Android. We are already an active eBay developer: the app uses the Trading API to create listings for sellers, plus the Account, Browse and Taxonomy APIs. Selling to eBay from a collection is a feature our users have today.

I need Marketplace Insights for one function: estimating what a card is worth from its recent eBay sold listings, so a collector can decide whether to sell it, or simply know what their collection is worth.

The logic is narrow. For a given card we take sold listings from the last 90 days and return one number: the average of the five most recent sales, or the most recent single sale if there are fewer than five, or blank if there are none. We never show a fabricated or zero value. Every sale behind the number links back to the eBay item page with our EPN tracking.

The integration is built and tested. It returns a clean "unavailable" state today because the scope is not granted: the scope request returns "exceeds the scope granted to the client", and item_sales/search returns 403. Approval is the only remaining step.

Volume is low. Valuations are fetched lazily and cached six hours per card, so it is one call per card valuation, not per page view. Low hundreds of calls per day.

This moves inventory onto eBay. Collectors who see a realistic sold price are far more likely to list, and our listing flow already runs on the Trading API, so valuation to live listing is one screen.

I have completed the EPN developer questionnaire and can provide a test account and a walkthrough.

## Version D (1272 characters, 223 words)

The Vault is a collection management app for trading card collectors, live on web, iOS and Android. We are already an active eBay developer, using the Trading API to create listings for sellers plus the Account, Browse and Taxonomy APIs.

I need Marketplace Insights for one function: estimating what a card is worth from its recent eBay sold listings, so a collector can decide whether to sell it.

For a given card we take sold listings from the last 90 days and return one number: the average of the five most recent sales, or the most recent single sale if there are fewer than five, or blank if there are none. Every sale behind the number links back to the eBay item page with our EPN tracking.

The integration is built and tested. It returns a clean "unavailable" state today because the scope is not granted (403 on item_sales/search). Approval is the only remaining step.

Volume is low: valuations are cached six hours per card, low hundreds of calls per day.

This moves inventory onto eBay. Collectors who see a realistic sold price are far more likely to list, and our listing flow already runs on the Trading API, so valuation to live listing is one screen.

I have completed the EPN developer questionnaire and can provide a test account and a walkthrough.

## Version E (1061 characters, 187 words)

The Vault is a collection management app for trading card collectors, live on web, iOS and Android. We are already an active eBay developer, using the Trading API to create listings for sellers.

I need Marketplace Insights for one function: valuing a card from its recent eBay sold listings. For a given card we take sold listings from the last 90 days and return one number: the average of the five most recent sales, or the most recent single sale if fewer than five, or blank if none. Every sale behind the number links back to the eBay item page with our EPN tracking.

The integration is built and tested, and returns a clean "unavailable" state today because the scope is not granted (403 on item_sales/search). Volume is low: cached six hours per card, low hundreds of calls per day.

Collectors who see a realistic sold price are far more likely to list, and our listing flow already runs on the Trading API, so valuation to live listing is one screen.

I have completed the EPN developer questionnaire and can provide a test account and a walkthrough.

## Version F (809 characters, 149 words)

The Vault is a collection management app for trading card collectors on web, iOS and Android. We already use the Trading API to create listings for sellers.

I need Marketplace Insights to value a card from its recent eBay sold listings: for a given card, the average of the five most recent sales in the last 90 days, or the most recent single sale if fewer than five, or blank if none. Every sale behind the number links back to the eBay item page with our EPN tracking.

The integration is built and tested, and returns 403 today because the scope is not granted. Volume is low: cached six hours per card, low hundreds of calls per day.

Collectors who see a realistic sold price are far more likely to list, and our listing flow already runs on the Trading API, so valuation to live listing is one screen.

## Version G (682 characters, 126 words)

The Vault is a collection management app for trading card collectors on web, iOS and Android. We already use the Trading API to create listings for sellers.

I need Marketplace Insights to value a card from recent eBay sold listings: the average of the five most recent sales in the last 90 days, or the most recent sale if fewer than five. Each comp links back to the eBay item with our EPN tracking.

The integration is built and tested, and returns 403 because the scope is not granted. Volume is low: cached six hours per card, low hundreds of calls per day. Collectors who see a real sold price are far more likely to list, and our listing flow already runs on the Trading API.