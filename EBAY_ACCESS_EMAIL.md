# Email / support ticket to eBay Developer Support

Send via https://developer.ebay.com/my/support/tickets (eBay routes Buy API access
through tickets rather than plain email, but this same text works either way).

Subject: Buy API Production Access (YOUR_EBAY_USER_ID) - Marketplace Insights for The Vault

Fill in before sending: YOUR_EBAY_USER_ID and YOUR_EPN_USER_ID. App ID is already filled in.

---

Hello,

I am requesting production access to the Marketplace Insights API
(`buy.marketplace.insights` scope) for my application, The Vault.

**Application details**
- App name: The Vault
- App ID (Client ID): AbazaBus-TheVault-PRD-7bf27a730-571f10c9
- eBay user ID: YOUR_EBAY_USER_ID
- EPN registered user ID: YOUR_EPN_USER_ID
- Live app: https://app.myvaults.io
- Marketplaces: EBAY_US initially, then the seller's registered marketplace
- Categories: 183050, 261328, 183454

**What The Vault is**

The Vault is a collection management app for trading card collectors, live on web,
iOS and Android. Collectors photograph a card, the app identifies it, and it goes
into a catalogued collection with an estimated value.

We are already an active eBay developer. The app uses the Trading API to create
listings on behalf of sellers, the Account API for business policies, and the
Browse and Taxonomy APIs for category and aspect data. Selling to eBay from a
collection is a feature our users have today, not a plan.

**What I need Marketplace Insights for**

One function: estimating what a card is worth from its recent eBay sold listings,
so a collector can decide whether to sell it.

The logic is deliberately narrow. For a given card we take the sold listings from
the last 90 days and return a single number: the average of the five most recent
sales, or the price of the single most recent sale if there are fewer than five,
or blank if there are none. We never show a fabricated or zero value. Each sale
that contributed to the number is shown to the collector and links back to the
eBay item page with our EPN affiliate tracking.

**What I have already built**

The integration is complete and tested against production, and is currently
returning a clean "unavailable" state because the scope is not granted. To be
specific about what I verified on my own keys:

- Requesting the `buy.marketplace.insights` scope returns "exceeds the scope
  granted to the client"
- Calling `/buy/marketplace_insights/v1_beta/item_sales/search` returns 403
  Access denied

Everything around that call is finished and covered by an automated test suite
(38 checks, currently all passing). That includes the valuation rules, comp
filtering so that graded and raw sales are never averaged together, condition
handling built on `getItemConditionPolicies` and `ConditionDescriptorType` rather
than hardcoded IDs, and structured error handling for 403, 429 and timeout cases.
Nothing else needs building. Approval is the only remaining step.

**Call volume**

Low and bounded by design. Valuations are fetched lazily, once when a card is
added and again only when a collector opens that card or taps Refresh, then
cached for six hours per card. That is one call per card valuation, not one per
page view. Current usage would be in the low thousands of calls per day.

**Why this is good for eBay**

It moves inventory onto eBay and buyers toward it.

Collectors who see a realistic sold price are far more likely to list. Our listing
flow already runs on the Trading API, so the path from valuation to a live eBay
listing is one screen. Accurate valuations also mean better priced listings, which
sell faster. And we reach a segment that is hard for eBay to reach directly:
hobbyist collectors with hundreds of cards in binders who have never listed
anything.

Every outbound link to an eBay item or search carries our EPN tracking.

**Next steps**

I have completed the EPN developer questionnaire. I can provide a test account
with a seeded collection, UI mockups of the valuation screen, and a walkthrough of
the end to end flow, in sandbox or on the live app, whenever it is useful.

Happy to answer any questions or adjust the implementation to meet your
requirements.

Thank you,

Sherif Abaza
The Vault
sabaza@gmail.com
https://app.myvaults.io
