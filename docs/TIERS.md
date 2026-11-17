# Portfolio Terminal — plans and data tiers (18 Nov 2026)

One product, four levels. The terminal is the same for everyone; what changes is
**whether the data is simulated or real, how deep it goes, and (on Premium) the AI layer.**
No feature is hidden behind a tier wall — lower tiers see the same panels with limited
depth and upgrade hints.

| | Demo | Free | Paid ฿699/mo | Premium ฿1,299/mo |
|---|---|---|---|---|
| Sign-in | none | account | account | account |
| Data | fully simulated, deterministic | real (public sources) | real + Alpha Vantage layer | real + Alpha Vantage layer |
| Holdings | 14 demo positions (demo namespace) | 20 | unlimited | unlimited |
| Own-portfolio history | full simulated | 5 years | full depth the source serves | full depth the source serves |
| Valuation symbols | 14 | 12 | 25 | 40 |
| Analyst estimate revisions | simulated | — | ✓ | ✓ |
| AI analyst chat / daily briefing / Monte Carlo & stress sims | canned demo answers | teaser | teaser | ✓ (40 asks, 3 briefings, 10 sims per day) |

Market-wide datasets (rotation, breadth, OBOS, factor, peer, volatility, macro, flows)
are identical for every signed-in tier — they are shared, cheap, and cached. Gating
targets the user's own portfolio depth, not the shared market context.

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
  `{tier, need}` when the tier is not allowed. Every gated endpoint calls it.
- `api/state.js` — holdings documents are capped per plan (Free 20; Paid/Premium
  unlimited): a sync over the cap returns `422 {code:"holdings_limit"}` with the
  limit in the message.
- `api/_history.js` — own-portfolio history truncated to `historyDays` (Free 1825,
  subscribers untruncated).
- `api/_valuation.js` — valuation/fundamentals symbols capped at `valSymbols`
  (Free 12, Paid 25, Premium 40, absolute ceiling 40).
- `api/_h/av/*` — the Alpha Vantage layer (consensus, revisions, premium news)
  requires Paid or Premium.
- `api/_h/ai/*` — the AI analyst (ask / briefing / simulate) requires Premium, with
  per-user daily caps via the atomic `pt_rate_hit` RPC. Portfolio context is assembled
  server-side from the caller's own `pt_user_state` rows only — never from the request.

## Demo architecture

Anonymous visitors get the demo automatically (`?demo=1` forces it even signed in).
`public/pt-demo.js` is a deterministic, seeded simulation (mulberry32 per symbol,
market-correlated walks) that implements the exact data-source contract the parsers
already read: all nine CSV datasets, the `meta/*` market docs, and the
fund/rev/news/etf/ins collections — so every panel, chart and AI answer renders with
one internally consistent story (a big NVDA winner, a deep TSLA drawdown, semiconductor
concentration). The demo never calls `/api`, writes only to the `ptpub.v1.demo.*`
localStorage namespace, and refuses to sync (`pt-state.js` no-ops while
`PT_DEMO_MODE` is set). Every surface is marked "DEMO — SIMULATED DATA".

## Stripe

One product per plan, THB monthly prices, created live 18 Nov 2026:

```
STRIPE_PRICE_PAID=price_1UcqQNQ0yLOm6KwFb5qMhW1q     # ฿699/month
STRIPE_PRICE_PREMIUM=price_1UcqQNQ0yLOm6KwFJRbgNC8n   # ฿1,299/month
```

- Checkout: `POST /api/billing/checkout {plan:"paid"|"premium"}` → Stripe Checkout.
  An existing active subscription gets `409` (switch plans from the customer portal).
- Webhook: signature-verified; maps the subscription's price id to the plan
  (`STRIPE_PRICE_PAID` → paid, any other price → premium, so the old $60/mo price
  stays premium). Canceled subs write `plan:"free"`.
- Until both price env vars are set in Vercel, checkout returns a clear 503 and
  everything else works.

## Multi-portfolio

Not implemented by design: the app has one portfolio per account (broker "accounts"
are labels inside it). The entitlement layer is where a portfolio-count limit would
go if that ever changes.
