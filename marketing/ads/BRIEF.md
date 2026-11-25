# LEKHA Financials: Facebook and Instagram ad set

Three sets, 31 creatives, all rendered by `node marketing/ads/build.mjs` (PNGs in `out/`, preview in `index.html`).

> **23 Nov 2026 repricing: the PNGs in `out/` are stale.** Plans are now Free THB 0, Paid THB 399, Premium THB 599. `build.mjs` and the HTML sources in `src/` are updated; the PNGs and `index.html` still show the earlier THB 299 Paid price and must be re-rendered (`node marketing/ads/build.mjs`, needs Playwright and Chromium) before any creative is used.
Style: LEKHA Light palette (cream #FCF7F0, navy #17223B, teal #0A7A6A), Inter, the LEKHA serif logo, no screenshots, no emoji.

| Set | Objective | Creatives |
|---|---|---|
| A. Price and plans | Conversions (subscribe) | Carousel A1-A7 (1080x1350), Stories A-story1..3 (1080x1920), Feed square A-square |
| B. Brand awareness | Reach, follow | Carousel B1-B4, Stories B-story1..2, Feed square B-square |
| C. Feature explainer | Consideration, then conversion | Carousel C1-C9, Stories C-story1..3, Feed square C-square |

Stories and Reels keep text inside the safe zone (250 px top, 270 px bottom).

## Prices shown
LEKHA Free THB 0, Paid THB 399 per month, Premium THB 599 per month (`api/_tiers.js` PRICING). Checkout refuses to open unless the configured Stripe price matches these amounts, so confirm the live price IDs before the campaign starts.
Everything in the creatives is in Thai baht. Competitor USD list prices are converted at 1 USD = 32.70 THB and rounded to the whole baht (the rate is stated on each price slide). Change `FX` in `build.mjs` and rebuild if the rate moves.

| Platform | USD list price | THB per month | Source |
|---|---|---|---|
| Bloomberg Terminal | $31,980 a year, one terminal (third-party reports) | 87,146 | https://www.koyfin.com/blog/bloomberg-terminal-cost/ , https://privateequitylist.com/intelligence/bloomberg-terminal-cost |
| Koyfin Premium | $79 a month | 2,583 | https://www.koyfin.com/pricing/ |
| TradingView Premium | $69.95 a month ($59.95 on annual billing) | 2,287 | https://www.tradingview.com/pricing/ |
| TIKR Pro | $54.95 a month | 1,797 | https://www.tikr.com/pricing |
| Finviz Elite | $39.50 a month ($299.50 a year) | 1,292 | https://finviz.com/elite |
| Koyfin Plus | $39 a month | 1,275 | https://www.koyfin.com/pricing/ |
| Morningstar Investor | $34.95 a month ($249 a year) | 1,143 | https://www.morningstar.com/mm/investor/affiliate |
| TIKR Plus | $24.95 a month | 816 | https://www.tikr.com/pricing |
| Seeking Alpha Premium | $299 a year | 815 | https://about.seekingalpha.com/premium-subscription-price-update |
| Stock Analysis Pro | $9.99 a month | 327 | https://stockanalysis.com/pro/ |
| LEKHA Premium | THB 599 a month | 599 | `api/_tiers.js` PRICING; live Stripe price to be confirmed |
| LEKHA Paid | THB 399 a month | 399 | `api/_tiers.js` PRICING; live Stripe price |

Re-check every figure on the vendor page on the day the ads go live. Bloomberg publishes no rate card, so that number rests on third-party reports.
The chart compares monthly list prices. Several competitors are cheaper on annual billing (for example TIKR Plus about $17.95 a month and Stock Analysis Pro $79 a year), and LEKHA bills monthly only, so do not claim LEKHA is cheaper on an annual basis.
Considered and left out because no current list price could be confirmed: YCharts (quote-based), Simply Wall St (official page showed no price in search).

## Claims policy used in the creatives
- Price claim: at THB 399 LEKHA Paid is above Stock Analysis Pro (THB 327), so "priced below every platform shown" is no longer true. `build.mjs` now computes the headline from the table: "LEKHA Paid is priced below 9 of the 10 platforms shown". The source note is on every price slide.
- No "same features" claim. Slide A5 compares primary focus only and says it is not a full feature list; the feature slides (Set C) describe LEKHA only. Do not add a competitor feature matrix without verifying each cell on the vendor site.
- No performance, return or advice claims. Monte Carlo, stress tests, the Projection Lab and council reports are marked Premium. The AI portfolio analyst and daily briefing are Paid and Premium.
- Simulation counts: "up to 1M requested paths per run"; the app shows the completed count on every result. Never describe the engine as running a billion simulations.
- The demo is a free preview with a sample portfolio, not a plan. It does not unlock Paid or Premium features, so do not say "everything unlocked".

## Ad copy (Set A, conversions)
Primary text
1. Institutional-grade research from THB 399 a month. Portfolio, filings, valuation, macro data and an AI analyst that cites its sources, in one workspace. Try the live demo, no account needed.
2. A professional terminal costs THB 1,045,746 a year. LEKHA Financials paid plans start at THB 399 a month. See the comparison.
3. Every number the AI analyst states is checked against the evidence it cites. Fact, calculated, interpretation, speculation: each claim is labelled.

Headlines: "Institutional-grade research" · "LEKHA Paid is priced below 9 of the 10 platforms shown" · "An analyst that shows its work"
Description: "Paid plans from THB 399 a month." · "Cancel any time."
CTA button: Learn more (or Sign up). Link: https://lekhafinancial.com with UTM `utm_source=meta&utm_medium=paid&utm_campaign=paid_subscription&utm_content=<creative>`.

## Ad copy (Set B, awareness)
1. One workspace for the whole research process: portfolio, companies, filings, news, macro data and a cited AI analyst.
2. Answers that show their sources. Follow @lekha_financials.
Hashtags (max 3): #investing #financialanalysis #portfolio
CTA button: Follow / Learn more.

## Ad copy (Set C, features)
1. Everything a research desk needs: portfolio and risk, company research, valuation, macro, simulation and cited AI. Swipe to see each capability.
2. Intrinsic value with explicit assumptions, relative rotation graphs, Monte Carlo up to 1M requested paths per run (Premium). Explore the live demo.
CTA button: Learn more.

## Targeting and setup (to confirm in Ads Manager)
- Audiences: self-directed investors and finance professionals, age 25 to 55; start in Thailand, then English-speaking markets. Interests: investing, equity research, financial analysis, portfolio management. Exclude existing subscribers.
- Placements: Instagram Feed, Stories, Reels; Facebook Feed. Use the 1080x1350 carousel for feeds and the 1080x1920 frames for Stories and Reels.
- Test plan: A1 hook vs A-story1; price chart (A3) vs plans card (A4) as the lead card; Set C as a retargeting audience for people who viewed Set A.
- Check Meta's current financial-products advertising rules and any advertiser verification needed for each target country before launch.
- Thai-language versions of the copy are not included; commission or review before running to a Thai audience.
