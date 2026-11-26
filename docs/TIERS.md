# LEKHA Financials — plans and feature access (23 Nov 2026)

Exactly three commercial plans: **Free ฿0**, **Paid ฿399/month**, **Premium ฿599/month**.
The **Demo** is a non-billable preview for visitors without an account. It is not a plan, and nothing
in it is locked (owner decision, 23 Nov 2026): every screen, the analyst, the Council and the
simulation engine run on a simulated sample portfolio computed in the browser. It reports tier `demo`
and never a paid tier, so no server endpoint is opened by it; real accounts stay enforced server-side.

The feature matrix lives in one file, `api/_data/entitlements.json`. The server reads it through
`api/_tiers.js` (`FEATURES`, `featureOfRoute`, `canUse`, `quota`) and enforces it. The React shell
imports the same file (`app/src/lib/entitlements.js`) only to decide what to show.

| Route | Feature | Free | Paid | Premium |
|---|---|---|---|---|
| `macro/rotation` | marketRotation | locked | yes | yes |
| `macro/intel` | marketIntel | locked | yes | yes |
| `macro/appetite` | riskAppetite | locked | yes | yes |
| `analysis/value` | valuation | locked | yes | yes |
| `analysis/deep` | deepAnalysis | locked | yes | yes |
| `analysis/ask` | analyst | locked | yes | yes |
| `analysis/briefing` | briefing | locked | yes | yes |
| `analysis/council` | council | locked | locked | yes |
| `analysis/reports` | councilReports | locked | locked | yes |
| `analysis/stress` | simulation | locked | locked | yes |
| `sector/*` | sectorRotation | locked | yes | yes |
| `simulation/*` | simulation | locked | locked | yes |

Every other route keeps its Free entitlement: portfolio overview, holdings, `portfolio/risk`,
watchlist, company workspace, research agent, news search, macro dashboard, macro regime and account pages.

| Limits | Demo | Free | Paid | Premium |
|---|---|---|---|---|
| Holdings | 14 sample | 20 | unlimited | unlimited |
| Own-portfolio history | sample | 5 years | full depth served | full depth served |
| Portfolio analyst requests / day | — | — | 20 | 40 |
| Analyst chat turns / day | 1 | 30 | 150 | 400 |
| Deep analyst chat turns / day | — | — | 20 | 100 |
| New daily briefings / day | — | — | 1 | 3 |
| Cited research agent questions / day | 15 | 30 | 30 | 80 |
| Expert-mode analyst questions / day | — | — | 30 | 80 |
| New Council reports / day | — | — | — | 10 |
| Server simulations / day | — | — | — | 10 |
| Monte Carlo per run (browser) | — | — | — | up to 1,000,000 requested paths, 25 invested holdings; the completed count is shown |

The Paid AI quotas are new with this change. They are finite and counted server-side through the
atomic `pt_rate_hit` RPC; review them against real usage before a commercial launch. Every number
above is read from `api/_data/entitlements.json` through `quota()`; there are no literal plan limits
in the endpoints. The demo chat question is keyed to a random per-browser id (`X-Demo-Id`, hashed
server-side), not the visitor's IP, and `pt_rate_undo` gives it back when a failed or aborted request
produced no answer.

## Where the numbers live

`api/_tiers.js` is the single source of truth: `TIERS`, `LIMITS` (null = unlimited),
`PRICING`, `tierOf(profile)`, `limitsOf`, `has`. The browser only ever sees its tier
through `/api/auth/me` (display only, never trusted); every restricted endpoint
re-resolves it server-side from the JWT-verified `pt_profiles` row.

`tierOf` rules: no profile → demo; `ADMIN_EMAILS` member → premium; a subscription that
is not `active`/`trialing` or is past its `period_end` (+1 day grace) → free;
`plan:"premium"` → premium (legacy $60/mo subscribers are grandfathered here);
`plan:"paid"` → paid; anything else → free.

## What each piece enforces

- `api/_auth.js` — `requireTier(req, res, allowed)`: 401 anonymous, 402 with
  `{tier, need}` when the tier is not allowed. `requireFeature(req, res, feature | [features])`
  is the same contract for a feature of the matrix and adds `{feature, plan}` to the 402 body.
  The synthetic sample-portfolio request (`__demoPublic`) never passes `requireFeature`.
  `lockCache(res)` forces `Cache-Control: private, no-store` on gated responses so no CDN or
  browser cache can hand an entitled answer to someone else.
- `api/_h/free/csv/[key]` — ROTATION, RISK, VOLATILITY, BREADTH, OBOS, FACTOR, PEER and VALIN
  need the feature they feed (Paid/Premium). HISTORY keeps its Free entitlement.
- `api/_h/free/collection/[name]` — `news` (the AI-labelled market briefing), `fund` and `rev`
  need Paid/Premium; `etf` and `ins` stay public. `api/_h/free/doc` — `meta/vixeq_hist` needs
  Risk appetite; the FRED, CFTC, TIC and Fear & Greed docs feed Free screens and stay public.
- `api/_h/free/demo` — serves only HISTORY, quotes and street (analyst targets) for the sample
  portfolio; valuation, fundamentals, factor history and revisions were removed.
- `api/state.js` — holdings documents are capped per plan (Free 20; Paid/Premium
  unlimited): a sync over the cap returns `422 {code:"holdings_limit"}`. Saved Council reports
  (`reports/*`) are withheld from `GET` (not deleted) for accounts without `councilReports`.
- `api/rag.js`, `api/_fin/agent.js` — indexing a Council report needs `councilReports`, and the
  research agent never retrieves saved reports for an account without it.
- `api/_history.js` — own-portfolio history truncated to `historyDays` (Free 1825,
  subscribers untruncated).
- `api/_valuation.js` — valuation/fundamentals symbols capped at `valSymbols`; Paid and Premium
  are unlimited and sent in batches of 25.
- `api/_h/av/*` — the Alpha Vantage layer (consensus, revisions, premium news) requires Paid or Premium.
- `api/_h/ai/ask`, `briefing` and the expert mode of `/api/data/agent` — Paid and Premium, with the
  per-plan daily quotas above. `api/_h/ai/simulate`, `council` — Premium. `council-v3` keeps its
  documented 403 below Premium. Portfolio context is assembled server-side from the caller's own
  `pt_user_state` rows only — never from the request.

## What the browser enforces (display only)

- `app/src/App.jsx` renders `LockedFeature` instead of the module for a locked route, so the
  classic panels never leave the hidden stage; the sidebar shows a lock on locked routes.
- `public/pt-datasource.js` reports tier `demo` in the demo and skips gated datasets when
  `/api/auth/me` says the plan lacks them. `public/pt-demo.js` serves no sample data for locked features.
- `public/v3/lekha-modules.js` imports and mounts Simulation, Council and Deep Analysis only when
  `/api/auth/me` includes the feature. `/v2` and `/v3` use the same data source, so locked panels
  there show "included in the Paid and Premium plans" instead of data.
- `app/src/App.jsx` and `app/src/main.jsx` wrap routed pages and the root in an error boundary, and
  `/login.html` has its own. A failed lazy chunk or a render error shows a recoverable message with
  Reload and Back to portfolio instead of a blank screen and a dead Back button.

**Limitation:** the Monte Carlo engine (`public/v3/lekha-sim.js`, `sim-runner.js`,
`sim-stream.worker.js`, `public/core/engine.js`) and the Projection Lab illustration
(`public/v2/pt-projection-data.json`) are static assets that any visitor can download. The lock
stops the app from mounting them for accounts without Premium; it cannot stop someone from running
public JavaScript on their own data. The server-side Premium simulation (`/api/ai/simulate`) is
protected. See `docs/SUBSCRIPTION_ENTITLEMENTS_2026-11-23.md`.

## Upgrades

- Free → Paid or Premium: `POST /api/billing/checkout {plan}` opens Stripe Checkout. Checkout first
  reads the configured price from Stripe and opens only if it is active, THB, monthly and exactly
  the advertised amount (39,900 / 59,900 satang); otherwise it returns `503 {code:"price_mismatch"}`
  and creates nothing.
- Paid ↔ Premium, cancel, card change: the Stripe billing portal (`POST /api/billing/portal`).
  Checkout refuses a second subscription with `409`. The portal only offers the plan switch if the
  portal configuration in Stripe lists both products and their current prices.
- Returning from Checkout (`?billing=success`) or the portal (`?billing=portal`) grants nothing. The
  app re-reads `/api/auth/me` every 3 s for up to a minute and reloads once when the verified plan
  changes. Only the signed webhook changes `pt_profiles`.

## Demo architecture

Anonymous visitors enter demo mode. The browser seeds sample holdings and uses a separate storage
namespace. Account document sync is disabled. Every screen is open on that simulated sample data:
`public/pt-demo.js` builds each dataset locally for the sample portfolio, and the analyst and Monte
Carlo run in the browser. The analyst calls the real model with the sample portfolio as context. The
Council plays pre-written sample reports; no model is called for it in the demo. The demo reports tier
`demo` and no server endpoint opens a restricted feature: `/api/free/demo` serves only HISTORY, quotes
and street for the sample tickers, and the gated `/api/h/*` routes stay closed. The cited research
agent keeps its demo allowance (15 questions per day per browser, `X-Demo-Id`); the one free chat
question is also per browser, not per IP.

## Stripe

Prices are configured in Vercel, not in code. The Premium price must change before this pricing
can go live, in one coordinated release with this code: see the cutover and rollback procedure in
`docs/SUBSCRIPTION_ENTITLEMENTS_2026-11-23.md` section 8.5. Production today (read 23 Nov) still sells the
฿699 Premium price and lists the ฿599 candidate as legacy; the target configuration is:

```
STRIPE_PRICE_PAID=price_1UesoyQ0yLOm6KwFuYZbTz9J     # ฿399/month (live, 23 Nov) — unchanged
STRIPE_PRICE_PREMIUM=<a verified live ฿599/month Premium price>
# Earlier prices stay mapped so existing subscribers keep their plan:
STRIPE_LEGACY_PAID_PRICES=price_1UcqQNQ0yLOm6KwFb5qMhW1q,price_1UesDJQ0yLOm6KwFIldZbquM    # ฿699 (18 Nov), ฿299 (23 Nov)
STRIPE_LEGACY_PREMIUM_PRICES=price_1UcqQNQ0yLOm6KwFJRbgNC8n,price_1UesqhQ0yLOm6KwFvcO9Owwh # ฿1,299 (18 Nov), ฿699 (23 Nov)
```

- Candidate for `STRIPE_PRICE_PREMIUM`: `price_1UesDNQ0yLOm6KwFfD77FGmK`, recorded here as the ฿599
  Premium price created on 23 Nov and since moved to the legacy list. Reuse it only after confirming
  in the live Stripe dashboard that it belongs to the LEKHA Premium product, is active, THB,
  59,900 satang, monthly and licensed. When it becomes the current price, move the ฿699 price
  `price_1UesqhQ0yLOm6KwFvcO9Owwh` into `STRIPE_LEGACY_PREMIUM_PRICES` (as above) so anyone who
  subscribed at ฿699 keeps Premium. Existing subscriptions keep their own price; nothing migrates them.
- Preview (Stripe TEST mode) needs its own ฿599 Premium TEST price; the staging TEST Premium price on
  record is ฿1,299 (`docs/STAGING_AUDIT_LOG.md`, 22 Nov).
- `node scripts/check-release-config.mjs` runs first in the Vercel build command (restored after
  `404ef49` removed it). It checks build configuration offline, then the live Stripe prices; any
  failure, including a Stripe outage, stops the build so nothing is deployed. Each price may grant
  only one plan (checked at build, in Checkout and in the webhook).
- Webhook: only explicitly mapped Paid, Premium and grandfathered price IDs grant access. An unknown
  active price raises a retryable error for operator reconciliation.

## Multi-portfolio

Not implemented by design: the app has one portfolio per account (broker "accounts"
are labels inside it). The entitlement layer is where a portfolio-count limit would
go if that ever changes.

## Display

- **Plans** (`app/src/pages/account.jsx`, classic card in `public/v2/pt-ui.js`): copy mirrors
  `api/_data/entitlements.json`; the backend enforces it.
- **Themes** (`public/pt-themes.js`): 100 editor-style themes (74 dark, 26 light) plus LEKHA Auto/Light/Dark, picked
  from the palette button in the header and stored in the `theme` display preference (synced per account).
  `node scripts/check-themes.mjs` verifies every theme's contrast.
- **Demo calendar**: supported historical research endpoints use the demo cutoff. The browser clock and individual datasets may have different dates. Check each source's observation date.
