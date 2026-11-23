# LEKHA Financials: Facebook and Instagram ad set

Three sets, 31 creatives, all rendered by `node marketing/ads/build.mjs` (PNGs in `out/`, preview in `index.html`).
Style: LEKHA Light palette (cream #FCF7F0, navy #17223B, teal #0A7A6A), Inter, the LEKHA serif logo, no screenshots, no emoji.

| Set | Objective | Creatives |
|---|---|---|
| A. Price and plans | Conversions (subscribe) | Carousel A1-A7 (1080x1350), Stories A-story1..3 (1080x1920), Feed square A-square |
| B. Brand awareness | Reach, follow | Carousel B1-B4, Stories B-story1..2, Feed square B-square |
| C. Feature explainer | Consideration, then conversion | Carousel C1-C9, Stories C-story1..3, Feed square C-square |

Stories and Reels keep text inside the safe zone (250 px top, 270 px bottom).

## Prices shown
LEKHA Paid THB 299 per month, Premium THB 599 per month (live Stripe prices created 23 Nov 2026).
USD figures use 1 USD = 32.70 THB: Paid $9.14, Premium $18.32.

| Platform | Monthly USD | Basis | Source |
|---|---|---|---|
| Bloomberg Terminal | $2,665 | $31,980 a year, one terminal, third-party reports | https://www.koyfin.com/blog/bloomberg-terminal-cost/ , https://privateequitylist.com/intelligence/bloomberg-terminal-cost |
| Koyfin Premium | $79 | monthly billing | https://www.koyfin.com/pricing/ |
| Koyfin Plus | $39 | monthly billing | https://www.koyfin.com/pricing/ |
| TradingView Premium | $69.95 | monthly billing; $59.95 per month on annual billing | https://www.tradingview.com/pricing/ |
| Seeking Alpha Premium | $24.92 | $299 a year divided by 12 | https://about.seekingalpha.com/premium-subscription-price-update |

Re-check every figure on the vendor page on the day the ads go live. Bloomberg publishes no rate card, so that number rests on third-party reports.
Koyfin and TradingView discount annual billing; the chart uses monthly list price for those two.

## Claims policy used in the creatives
- Price claim: "Priced below every platform shown" is true for the plans and billing intervals listed above, and the source note is on every price slide.
- No "same features" claim. Slide A5 compares primary focus only and says it is not a full feature list; the feature slides (Set C) describe LEKHA only. Do not add a competitor feature matrix without verifying each cell on the vendor site.
- No performance, return or advice claims. Monte Carlo, stress tests and council reports are marked Premium.

## Ad copy (Set A, conversions)
Primary text
1. Institutional-grade research from THB 299 a month. Portfolio, filings, valuation, macro data and an AI analyst that cites its sources, in one workspace. Try the live demo, no account needed.
2. A professional terminal costs $31,980 a year. LEKHA Financials starts at THB 299 a month. See the comparison.
3. Every number the AI analyst states is checked against the evidence it cites. Fact, calculated, interpretation, speculation: each claim is labelled.

Headlines: "Institutional-grade research" · "Priced below every platform shown" · "An analyst that shows its work"
Description: "Plans from THB 299 a month." · "Cancel any time."
CTA button: Learn more (or Sign up). Link: https://lekhafinancial.com with UTM `utm_source=meta&utm_medium=paid&utm_campaign=paid_subscription&utm_content=<creative>`.

## Ad copy (Set B, awareness)
1. One workspace for the whole research process: portfolio, companies, filings, news, macro data and a cited AI analyst.
2. Answers that show their sources. Follow @lekha_financials.
Hashtags (max 3): #investing #financialanalysis #portfolio
CTA button: Follow / Learn more.

## Ad copy (Set C, features)
1. Everything a research desk needs: portfolio and risk, company research, valuation, macro, simulation and cited AI. Swipe to see each capability.
2. Intrinsic value with explicit assumptions, relative rotation graphs, Monte Carlo up to 1M paths. Explore the live demo.
CTA button: Learn more.

## Targeting and setup (to confirm in Ads Manager)
- Audiences: self-directed investors and finance professionals, age 25 to 55; start in Thailand, then English-speaking markets. Interests: investing, equity research, financial analysis, portfolio management. Exclude existing subscribers.
- Placements: Instagram Feed, Stories, Reels; Facebook Feed. Use the 1080x1350 carousel for feeds and the 1080x1920 frames for Stories and Reels.
- Test plan: A1 hook vs A-story1; price chart (A3) vs plans card (A4) as the lead card; Set C as a retargeting audience for people who viewed Set A.
- Check Meta's current financial-products advertising rules and any advertiser verification needed for each target country before launch.
- Thai-language versions of the copy are not included; commission or review before running to a Thai audience.
