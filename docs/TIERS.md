# Portfolio Terminal — plans and data tiers (18 Nov 2026)

One product, four levels. The terminal is the same for everyone; what changes is
**whether the data is simulated or real, how deep it goes, and (on Premium) the AI layer.**
Some panels preview higher tiers. The server checks account entitlements for restricted operations.

| | Demo | Free | Paid ฿399/mo | Premium ฿699/mo |
|---|---|---|---|---|
| Sign-in | none | account | account | account |
| Data | sample portfolio; some research routes use historical provider data | real (public sources) | real + Alpha Vantage layer | real + Alpha Vantage layer |
| Holdings | 14 demo positions (demo namespace) | 20 | unlimited | unlimited |
| Own-portfolio history | full simulated | 5 years | full depth the source serves | full depth the source serves |
| Valuation symbols | 14 | 12 | unlimited | unlimited |
| Analyst estimate revisions | simulated | — | ✓ | ✓ |
| Illustrative Projection Lab (synthetic scenario panel) | ✓ | locked teaser | hidden | ✓ |
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
  (Free 12; Paid and Premium `null` = unlimited). Every request is still capped at 25
  symbols (`BATCH`: SEC pacing + the 60 s function limit), so the client
  (`pt-datasource.js` `holdPost`) sends unlimited plans as batches of 25 and merges the
  results. Unlimited plans get 120 valuation requests per 10 minutes (Free: 20).
- `api/_h/av/*` — the Alpha Vantage layer (consensus, revisions, premium news)
  requires Paid or Premium.
- `api/_h/ai/*` — the AI analyst (ask / briefing / simulate) requires Premium, with
  per-user daily caps via the atomic `pt_rate_hit` RPC. Portfolio context is assembled
  server-side from the caller's own `pt_user_state` rows only — never from the request.

## Demo architecture

Anonymous visitors enter demo mode. The browser seeds sample holdings and uses a separate storage namespace. Historical research routes can contact the server. Council scenarios are pre-written and local Monte Carlo runs use the sample portfolio. Account document sync is disabled in demo mode.

The cited research endpoint allows 15 questions per day in demo, 30 per signed-in Free or Paid account and 80 on Premium. Premium expert requests also consume the research allowance. The portfolio analyst has a separate 40-question cap. The Premium Council default is 10 new generations per day. Its five perspectives and synthesis come from one structured model response. Cached Council answers consume no new generation.

## Stripe

One product per plan, THB monthly prices, created live 18 Nov 2026:

```
STRIPE_PRICE_PAID=price_1UesoyQ0yLOm6KwFuYZbTz9J     # ฿399/month
STRIPE_PRICE_PREMIUM=price_1UesqhQ0yLOm6KwFvcO9Owwh   # ฿699/month
# Earlier prices stay active so existing subscribers keep their plan:
STRIPE_LEGACY_PAID_PRICES=price_1UcqQNQ0yLOm6KwFb5qMhW1q,price_1UesDJQ0yLOm6KwFIldZbquM   # ฿699 (18 Nov), ฿299 (23 Nov)
STRIPE_LEGACY_PREMIUM_PRICES=price_1UcqQNQ0yLOm6KwFJRbgNC8n,price_1UesDNQ0yLOm6KwFfD77FGmK # ฿1,299 (18 Nov), ฿599 (23 Nov)
```

- Checkout: `POST /api/billing/checkout {plan:"paid"|"premium"}` → Stripe Checkout.
  An existing active subscription gets `409` (switch plans from the customer portal).
- Webhook: only explicitly mapped Paid, Premium and grandfathered price IDs grant access. An unknown active price raises a retryable error for operator reconciliation.
- Until both price env vars are set in Vercel, checkout returns a clear 503 and
  everything else works.

## Multi-portfolio

Not implemented by design: the app has one portfolio per account (broker "accounts"
are labels inside it). The entitlement layer is where a portfolio-count limit would
go if that ever changes.

## Display

- **Plans card** (`public/pt-ui.js`): the rows mirror the "Revised pricing structure" table. Copy only — the
  gating numbers above (`api/_tiers.js`) are what the backend enforces.
- **Themes** (`public/pt-themes.js`): 100 editor-style themes (74 dark, 26 light) plus LEKHA Auto/Light/Dark, picked
  from the palette button in the header and stored in the `theme` display preference (synced per account).
  `node scripts/check-themes.mjs` verifies every theme's contrast.
- **Demo calendar**: supported historical research endpoints use the demo cutoff. The browser clock and individual datasets may have different dates. Check each source's observation date.
