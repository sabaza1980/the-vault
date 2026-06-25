# Add Break Pricing Guidance to All 5 Sets

> Paste this into Cursor / Claude Code / Copilot Chat in VS Code.
> The original feature spec lives at `/the-vault/BREAK_TRACKER_PROMPT.md`.
> Set-specific integration prompts are at `ADD_TOPPS_THREE_PROMPT.md` and `ADD_COSMIC_CHROME_PROMPT.md`.
> This file is additive — don't redo the architecture, just wire up break pricing across all sets.

---

## What's already done

The Break Hit Tracker ships for **Bowman**, **Cosmic Chrome**, and **Topps Three**. Each set's odds file already has a `breakPricingGuidance` block. The AI assistant (Toppsy / AJ) has set-specific context for Topps Three.

Five odds files in `/the-vault/` now contain `breakPricingGuidance`:

**Topps Three** and **Cosmic Chrome** have uniform case pricing. **Bowman**, **Hoops**, and **Midnight** have per-configuration pricing — the `breakPricingGuidance` block in each odds file is keyed by configuration name.

| File | Configuration | Case Cost | Autos/Case | 15% Revenue Target | PYT Avg/Spot |
|---|---|---|---|---|---|
| `2025-26-topps-three-basketball-odds.json` | *(uniform)* | $6,750 | 12 | $8,063 | $269 |
| `2025-26-topps-cosmic-chrome-basketball-odds.json` | *(uniform)* | $8,499 | 2 ⚠️ | $9,774 | $326 |
| `2025-26-bowman-basketball-odds.json` | Hobby | $7,000 | 24 | $8,050 | $268 |
| `2025-26-bowman-basketball-odds.json` | Jumbo | $8,000 | 32 | $9,200 | $307 |
| `2025-26-bowman-basketball-odds.json` | BreakerDelight | TBD ⚠️ | 18 | TBD | TBD |
| `2025-26-topps-hoops-basketball-odds.json` | Hobby | $3,900 | 12 | $4,485 | $150 |
| `2025-26-topps-hoops-basketball-odds.json` | HobbyJumbo | $3,300 | 16 | $3,795 | $126 |
| `2025-26-topps-midnight-basketball-odds.json` | Hobby | $865 | 24 | $995 | $33 |

⚠️ **Bowman BreakerDelight case price is unconfirmed** (~$3,500–4,500 estimated). AI must not quote a revenue target for this config until it reads a non-null `casePriceUSD`.

Bowman **Mega** and **Value** are retail configs — `breakRelevant: false`. Do not include them in break pricing answers.

Hoops **Value** is also retail — `breakRelevant: false`.

Hoops and Midnight **do not yet have checklist files** — they are odds-only references for AI context. Do not attempt to register them as tracker sets until checklists are added.

---

## What I need

Make the AI assistant aware of break pricing for all 5 sets so it can answer break comp and spot pricing questions for any of them — not just Topps Three.

The `breakPricingGuidance` block in each odds file is the single source of truth. Read it from there. Do not hardcode any numbers.

---

## Break pricing intake flow (AI behaviour)

When a user asks any break pricing question — "how should I price this break?", "what should Dallas go for?", "is this a fair price?" — the AI **must ask clarifying questions before answering**. It should never assume a break format.

### Intake question sequence

The AI should ask these in a single, conversational message (not a numbered interrogation). Tailor which questions to ask based on what the user already told you.

**Step 1 — Format**
> "What format is the break? PYT (pick your team), PYP (pick your player), random team, random player, a mix, or something else?"

**Step 1b — Box configuration** (ask only for multi-config sets: Bowman and Hoops)
> "Which box type are you breaking — Hobby, Jumbo, or Breaker Delight?" (Bowman) / "Hobby or Hobby Jumbo?" (Hoops)
>
> This determines the case cost and therefore the revenue target. Do not calculate any prices until the configuration is confirmed. If the user mentions BreakerDelight, note that the case price is unconfirmed and ask them to provide it before proceeding.

**Step 2 — Pricing mechanism** (ask only if not obvious from format)
> "How are spots being sold — fixed Buy Now prices, live auction, or a standard price list?"

**Step 3 — Cases and margin** (ask only if not already stated)
> "How many cases are you running, and what margin are you targeting? (I'll use 15% as a default if you're not sure.)"

**Step 4 — Constraints** (ask only if relevant)
> "Are any spots already sold or reserved? Any players/teams you want to price separately (e.g. auction the top 3 and Buy Now the rest)?"

---

### Break formats the AI must understand

| Format | Description | Key pricing variable |
|---|---|---|
| **PYT — Fixed price** | 30 spots, one per NBA team, set prices | Team demand ranking |
| **PYT — Auction** | Teams go to highest bidder; breaker sets starting bids | Starting bid = ~50–60% of Buy Now comp |
| **PYT — Mix** | Most teams fixed price; top 3–5 teams auctioned | Which teams to auction, floor prices |
| **PYP — Fixed price** | One spot per player, set prices | Player EV / demand weight |
| **PYP — Buy Now** | Players listed at fixed prices; buyers pick and pay | Same as fixed but AI should evaluate listed prices against EV |
| **PYP — Auction** | Top players auctioned; rest are fixed | Floor = ~60% of Buy Now comp; no ceiling |
| **PYP — Mix** | Flagg/Wemby auctioned; rest fixed | Identify which players warrant auction vs fixed |
| **Random Team** | Random team assignment, equal spots | Spot price = revenue_target / 30 |
| **Random Player** | Random player from checklist, equal spots | Spot price = revenue_target / player_count |
| **Hybrid** | e.g. buy a team slot AND get a random player bonus | Must price both components separately then combine |

---

### How to evaluate Buy Now prices

When a user asks "is this a fair Buy Now price for [player/team]?", the AI should:

1. Pull the player's/team's `breakPricingGuidance` weight or `pytPricing.examples` price for that set.
2. Compare to the listed price. State whether it's above, at, or below fair value.
3. Frame it from **both sides** — is it fair for the *buyer* (EV vs price) and for the *breaker* (does it hit revenue target if all spots sell at these prices)?
4. Flag if a listed price looks like it won't hit the revenue target across the full break.

Example response structure:
> "For a 1-case Bowman break at 15% margin, Dallas should be around $900–1,100 (Luka + Flagg RC). At $750 that's underpriced — good deal for the buyer, but you'll need the rest of the break to overperform to hit your target. Want me to check if the full price list balances?"

---

### How to evaluate auction starting bids

- Starting bid = 50–65% of the expected Buy Now price for that slot.
- Reserve (if used) = 80–90% of Buy Now.
- No-reserve auctions on top slots drive excitement but risk selling below EV if turnout is low.
- The AI should calculate: "At your current starting bid of $X, if the auction hits fair value, your total revenue will be $Y vs your $Z target."

---

### Multi-format hybrid example

> User: "I'm running PYT for most teams but auctioning Dallas, San Antonio, and OKC. Everything else is Buy Now."

AI should:
1. Calculate Buy Now prices for the 27 non-auction teams summing to `revenue_target × 0.7` (roughly — the top 3 teams represent ~30% of total value).
2. Suggest starting bids for the 3 auctioned teams.
3. State what auction outcome is needed to hit the overall revenue target.
4. Note the risk: if auctions underperform, Buy Now revenue won't fully cover the gap.

---

## Break pricing logic (teach the AI)

The AI needs to understand and apply this framework for **any** set, using the set's own `breakPricingGuidance` data:

### Core formula

```
revenue_target = case_cost × (1 + margin)   // typically 15%
```

### Break formats

**PYT (Pick Your Team) — 30 spots**
- One spot per NBA team
- Average spot = `revenue_target / 30`
- Top teams (Dallas, San Antonio, Brooklyn for 2025-26 draft class) price at 2–4× average
- The `breakPricingGuidance.pytPricing.examples` array has team-by-team pricing

**PYP (Pick Your Player) — variable spots**
- One spot per featured player
- Assign demand weights; scale weights to revenue target; round to $25
- Top player (Flagg, Wemby) = 15–20× lowest spot
- Topps Three PYP example: 140 spots across 5 cases → `Topps3-PYP-Pricing.xlsx`

**Random — equal spots**
- `spot_price = revenue_target / spot_count` (rounded to $25)
- Typical: 30 spots for mid-tier products, more for high-auto-count products

### EV vs. spot price

A **fair spot** is one where:
- `buyer_EV ≥ spot_price` at the breaker's breakeven
- `buyer_EV ≤ spot_price × (1 + margin_premium)` — buyer isn't overpaying badly

The AI should distinguish between *cost to the breaker* and *fair price to the buyer*. These are different questions and the AI should answer them separately when asked.

### Per-card vs. per-pack odds

- **Topps Three**: `oddsUnit = "per-card"`. No packs — each card in the box IS the product.
- All other sets: `oddsUnit = "per-pack"`. Standard pack-based odds.

The AI must label odds correctly when discussing each set.

---

## Set-specific things the AI must know

### Cosmic Chrome — auto rate is very low
`autosPerCase: 2` — approximately 2 autos per 8-box case. This is NOT an auto-focused product.
Break value is in **numbered parallels** (SuperFractor 1/1, Red /5, Black /10, Orange /25, Gold /50) and SSP insert case hits.
When answering Cosmic Chrome break pricing questions, the AI must proactively mention this — buyers expecting autos should be warned.

### Bowman — multi-config + dual auto structure (NBA + NCAA)
Bowman has three break-relevant configurations with different case costs and auto counts:
- **Hobby** ($7,000/case, 12 boxes, 24 autos) — 1 NBA + 1 NCAA auto per box
- **Jumbo** ($8,000/case, 8 boxes, 32 autos) — 2 NBA + 2 NCAA autos per box
- **BreakerDelight** (case price unconfirmed ~$3,500–4,500, 6 boxes, 18 autos) — 2 NBA + 1 NIL auto per box

AI must ask which config before quoting any Bowman break prices. NCAA autos (college prospects) are typically lower value than NBA star autos unless the prospect is elite. When pricing PYT, college team associations matter: a buyer getting an IU or Duke spot might hit a top prospect auto.

### Topps Three — per-card mechanics, no unlimited base
Auto base is `/49` (NOT unlimited). See `ADD_TOPPS_THREE_PROMPT.md` for full parallel rainbow and rarity tier details.
The AI already has this context; do not duplicate it — just ensure multi-set queries don't lose it.

### Hoops — multi-config budget entry product
Two break-relevant configurations:
- **Hobby** ($3,900/case, 12 boxes, 12 autos) — $4,485 revenue target at 15%, $150 PYT avg
- **HobbyJumbo** ($3,300/case, 8 boxes, 16 autos) — $3,795 revenue target at 15%, $126 PYT avg

AI must ask which Hoops config before quoting break prices. High spot count, good for new collectors. No checklist yet — AI can discuss break economics but cannot answer checklist/player-specific questions.

### Midnight — best auto-per-dollar value
`$865 / 24 autos = ~$36/auto at cost`. Best value-per-auto of all five sets.
3 autos guaranteed per box, 7 cards per box (1 pack). Very auto-dense for the price.
No checklist yet — same caveat as Hoops.

---

## AI assistant updates

The AI fact pack must be updated to include break pricing context for all 5 sets. After this update, the AI should correctly answer:

1. **"What's a fair PYT price for Dallas in a Bowman Hobby break?"**
   → Reference `breakPricingGuidance.Hobby.pytPricing.examples` for Bowman. Dallas = Luka + Flagg RC → ~$850–1,100 at 15% margin on a 1-case break. If user didn't specify config, ask first.

2. **"How should I price a random break for Midnight?"**
   → $865 case cost, 15% margin = $995 target. 30 random spots = ~$33/spot. Point out that at 24 autos/case, every 1.25 spots is expected to land an auto — strong value proposition for buyers.

3. **"Is Cosmic Chrome worth breaking?"**
   → Only ~2 autos per case. Value is in numbered parallels. At $9,774 revenue target across 30 PYT spots ($326 avg), buyers are paying for a chance at SuperFractors and low-numbered refractors, not guaranteed autos. Breaker should communicate this clearly.

4. **"Compare break value across all 5 sets — which gives best ROI for buyers?"**
   → AI should compare: Midnight (best auto/$), Bowman (strong RC auto depth), Topps Three (high-end parallels + auto /49), Hoops (affordable entry), Cosmic Chrome (parallel/insert chase, auto-light).

5. **"How does multi-case scaling work for Topps Three PYP?"**
   → Revenue target scales linearly. 5-case break = 5 × $6,750 = $33,750 cost, $38,812 at 15% margin. See `Topps3-PYP-Pricing.xlsx` for the full 140-spot pricing sheet.

6. **"What's the breakeven cost per auto for each set?"**
   → Midnight $36, Hoops $206, Bowman $292, Topps Three $563, Cosmic Chrome $4,250 (⚠️ parallel product not auto product).

---

## Implementation steps

1. **Read all 5 odds files.** Load `breakPricingGuidance` from each. For uniform-pricing sets (Topps Three, Cosmic Chrome), confirm `caseCost`, `revenueTarget`, `pytPricing`, `randomBreak`, `autosPerCase` are present at the top level. For multi-config sets (Bowman, Hoops), confirm these keys are present inside each named configuration sub-block (e.g. `breakPricingGuidance.Hobby.caseCost`). Check `casePriceUSD` on each configuration — if `null`, mark it as "price unconfirmed" and do not calculate targets for that config.

2. **Update the AI fact pack builder.** The function/component that constructs the AI assistant's system context should iterate over all loaded odds files and include the `breakPricingGuidance` block from each — not just the active set.

3. **Multi-set context.** When a user is viewing a specific set's tracker, the AI should have full break pricing context for ALL 5 sets (not just the current set) so cross-set comparison questions work.

4. **Hoops and Midnight.** These are odds-only (no checklist). The AI should be able to answer break pricing questions but should caveat that checklist/player-specific queries aren't available yet for these sets.

5. **No hardcoding.** All prices, targets, and configs must be read from the JSON. If the odds file is updated, the AI context updates automatically.

---

## Acceptance criteria

### Break pricing accuracy
1. AI correctly states `autosPerCase` for all 5 sets without prompting.
2. AI warns that Cosmic Chrome is NOT an auto-focused product when asked about breaks.
3. AI quotes PYT average spot price within $5 of the calculated value for any set.
4. AI correctly computes multi-case revenue targets (e.g. "5 Bowman cases at 20% margin").
5. AI correctly distinguishes `per-card` odds (Topps Three) from `per-pack` odds (all others).
6. AI can rank all 5 sets by auto-per-dollar value.

### Intake flow behaviour
7. **Ambiguous query → asks questions first.** Given "how do I price my Bowman break?", AI asks about box configuration, format, pricing mechanism, cases, and margin before giving any numbers.
8. **Multi-config set → always asks box type.** Given "PYT fixed price, 1 case Bowman, 15% margin", AI still asks "which config — Hobby, Jumbo, or Breaker Delight?" before calculating. Same for Hoops.
9. **Already-fully-specified query → skips answered questions.** Given "PYT fixed price, 1 case Bowman Hobby, 15% margin", AI skips all intake questions and goes straight to pricing.
10. **BreakerDelight price unknown → asks breaker to provide it.** Given "pricing a Bowman BreakerDelight break", AI states the case price is unconfirmed and asks the user to share what they paid before calculating targets.
11. **Buy Now evaluation.** Given "someone is offering Dallas in a 1-case Bowman Hobby break for $750 — is that fair?", AI states the fair range, says whether it's over/under, and checks whether it hits the revenue target.
12. **Auction starting bid.** Given "I'm auctioning Dallas in my Topps Three PYT, what starting bid?", AI suggests 50–65% of the Buy Now comp with a note about reserve price.
13. **Hybrid format.** Given "auctioning Dallas, SA, OKC and setting Buy Now on the rest for Bowman Hobby", AI calculates what the 27 fixed-price teams need to total, suggests starting bids for the 3 auctions, and states the revenue risk if auctions underperform.
14. **Random break.** Given "running a 30-spot random team break on 1 Midnight case", AI prices it correctly ($33/spot) and notes the auto density value proposition to include in the break listing.

### No regressions
15. Existing Topps Three, Bowman, and Cosmic Chrome tracker pages still work end-to-end.

---

## Out of scope

- Adding checklist files for Hoops or Midnight (separate task).
- Cross-set "show me all Cooper Flagg cards" queries.
- Live market price feeds.
