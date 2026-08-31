# Getting Marketplace Insights access from eBay

The code is finished and tested. The only thing standing between The Vault and
live eBay sold-price valuations is eBay approving the app for the
`buy.marketplace.insights` scope.

Current state, verified 2026-08-29 against production with our own keys:

    scope request  ->  "exceeds the scope granted to the client"
    endpoint call  ->  403 Access denied

## The process

Marketplace Insights is a Limited Release Buy API. Access has three parts and
they are done in order.

**1. Join the eBay Partner Network.**
https://partnernetwork.ebay.com/ — production access to Buy APIs requires EPN
membership. Sign up with the same eBay user ID that owns the developer account.

**2. Submit the Buy API developer questionnaire.**
https://partnernetwork.ebay.com/page/developer-questionnaire — this is where the
business case gets assessed. Draft answers are below.

**3. Open a developer support ticket.**
https://developer.ebay.com/my/support/tickets
Subject line, exactly this format: `Buy API Production Access (your eBay user ID)`
Ticket body draft is below.

eBay says plainly there is no guarantee of approval, and that acceptance turns
on the proposed business model. Two things they look hard at: whether the app
drives buyers to eBay, and whether affiliate tracking is implemented. The Vault
has a genuinely strong story on the first, since the listing integration already
puts inventory onto eBay.

## Draft: developer questionnaire answers

**What does your application do?**

The Vault (myvaults.io) is a collection management app for trading card, coin
and stamp collectors, on web, iOS and Android. Collectors photograph a card, the
app identifies it, and it goes into a catalogued collection with an estimated
value. The app already integrates eBay's Trading API so collectors can list
cards from their collection directly to eBay, and eBay's Browse and Taxonomy
APIs for category and aspect data.

**Why do you need the Marketplace Insights API?**

Collectors need to know what a card is actually worth before they decide to
sell it. Today we estimate value from third party pricing databases, which
cover popular sports and TCG cards but miss parallels, serial numbered cards
and recent releases. Recent eBay sold prices are the number collectors trust,
because eBay is where the market clears.

We use it for one specific job: given a card, return its estimated value from
recent sold listings. Five most recent sales averaged, or the single most
recent sale if there are fewer than five, or blank if there are none. We show
the collector which sold listings produced the number, linked back to eBay.

**How does this benefit eBay?**

It moves inventory onto eBay and buyers toward it.

- Collectors who see a realistic sold price are far more likely to list. Our
  listing flow is already built on the Trading API, so the path from valuation
  to a live eBay listing is one screen.
- Every comp we show links back to the eBay item page with affiliate tracking.
- Accurate valuations mean better priced listings, which sell faster.
- We serve a segment that is hard for eBay to reach directly: hobbyist
  collectors with hundreds of cards sitting in binders who have never listed
  anything.

**Which marketplaces?**
Primarily EBAY_US. The app is global and the seller's registered marketplace
drives the call, so EBAY_GB, EBAY_CA, EBAY_AU and the EU sites as adoption
follows.

**Which categories?**
Trading card categories: 183050 Sports Trading Cards, 261328 Sports Trading Card
Singles, 183454 CCG Individual Cards. Coins and stamps later.

**Expected call volume?**
Low and bounded. Valuations are fetched lazily, once when a card is added and
again only when a collector opens the card or taps Refresh, then cached for six
hours per card. One call per card valuation, not per page view. We expect low
thousands of calls per day at current usage.

**Affiliate tracking?**
Yes. Every outbound link to an eBay item or search carries our EPN tracking.

**How can eBay test it?**
App: https://app.myvaults.io — we will provide a test account with a seeded
collection. Sandbox walkthrough and UI mockups of the valuation screen supplied
with the application.

## Draft: support ticket

> Subject: Buy API Production Access (YOUR_EBAY_USER_ID)
>
> Hello,
>
> I am requesting production access to the Marketplace Insights API
> (`buy.marketplace.insights` scope) for my application.
>
> App name: The Vault
> App ID (Client ID): AbazaBus-TheVault-PRD-7bf27a730-571f10c9
> eBay user ID: YOUR_EBAY_USER_ID
> EPN registered user ID: YOUR_EPN_USER_ID
> Site: https://app.myvaults.io
>
> The Vault is a collection management app for trading card collectors, live on
> web, iOS and Android. It already uses eBay's Trading API to create listings on
> behalf of sellers, plus the Browse and Taxonomy APIs.
>
> I need Marketplace Insights for one function: estimating what a card is worth
> from its recent eBay sold listings, so collectors can decide whether to sell.
> The valuation is the average of the five most recent sales, or the most recent
> single sale when there are fewer than five. Each comp is shown to the user and
> links back to the eBay item with affiliate tracking.
>
> This feeds directly into listing creation on eBay. Collectors who see a real
> sold price list the card, and the listing flow is already built.
>
> Usage is modest and cached: one call per card valuation, cached six hours,
> triggered lazily rather than on page load. Marketplaces: EBAY_US first, then
> the seller's registered marketplace. Categories: 183050, 261328, 183454.
>
> I have completed the EPN developer questionnaire and can supply a test account,
> UI mockups and a sandbox walkthrough on request.
>
> Thank you,
> Sherif Abaza

## When access lands

Nothing needs building. Run:

    cd app && node scripts/ebay-selftest.mjs

and the Marketplace Insights line flips from "NOT granted" to "sold-price lookup
is LIVE". The valuation endpoint starts returning real numbers on the next call.

## If eBay says no

The integration stays exactly as it is and reports
`NO_MARKETPLACE_INSIGHTS_ACCESS`, so nothing breaks. The pricing pipeline keeps
running on SportsCardsPro and PriceCharting. Worth knowing: there is no legal
back door. 130point and Card Ladder have no public API, and scraping eBay sold
pages violates their terms and will get the developer account pulled, which
would also kill the listing integration.
