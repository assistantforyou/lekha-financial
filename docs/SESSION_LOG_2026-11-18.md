# Portfolio Terminal: session log, 18 Nov 2026 (done by James, with Claude)

For the Todoist task "Sex Projext" and "Idea Dumps". The full tier spec and design are in
`docs/TIERS.md`; this log records what the session did.

## Done
- **Four-tier product/access system shipped on `main`:** Demo (public, simulated), Free
  (account, real data), Paid ฿699/mo, Premium ฿1,299/mo. One terminal for all tiers —
  gated on data depth and intelligence, never on features.
- **Stripe (live).** One product per plan with THB monthly prices, created via the API
  with the keys James pasted (keys never committed; James should rotate the `rk_live` key):
  - Paid ฿699/mo → `STRIPE_PRICE_PAID` = price_1UcqQNQ0yLOm6KwFb5qMhW1q
  - Premium ฿1,299/mo → `STRIPE_PRICE_PREMIUM` = price_1UcqQNQ0yLOm6KwFJRbgNC8n
  - Checkout takes `{plan}`, the webhook maps price id → plan, and the old $60/mo price
    is grandfathered to Premium. Both price ids added to Vercel env this session.
- **Central entitlement config** — `api/_tiers.js` (single source of truth: tier mapping,
  limits, pricing). `/api/auth/me` now returns `tier` + `limits`; every gated endpoint
  re-resolves the tier server-side from the JWT-verified profile row.
- **Limits (James's final call):** Free = 20 holdings, **5 years** of own history,
  12 valuation symbols. Paid = **unlimited holdings, full history**, 25 symbols.
  Premium = unlimited holdings, **40 valuation symbols** + the AI layer
  (40 asks/day, 3 briefings/day, 10 simulations/day).
- **Backend gating.** All `/api/free/*` data endpoints now require a signed-in account
  (anonymous visitors get the demo instead, never the API). `/api/av/*` opens to
  Paid + Premium. Holdings sync over the plan cap returns `422 holdings_limit`.
  History/fundamentals truncated per tier server-side.
- **Premium AI analyst — `api/ai.js` group:** ask-your-analyst chat (server-assembled
  portfolio context, prompt-injection-safe), daily briefing (cached per day), and
  deterministic Monte Carlo + 4 stress scenarios (seeded, no token cost) with an AI
  narrative. Uses the existing Z.ai/Gemini `_llm` layer; all cost-logged.
- **Demo simulation — `public/pt-demo.js`:** deterministic, seeded, internally
  consistent (NVDA winner, TSLA drawdown, semis concentration) and byte-compatible with
  every parser the terminal already has. Anonymous users get it automatically; existing
  anonymous users with local holdings got a one-time "create a free account / keep
  exploring demo" prompt. Demo writes to its own `ptpub.v1.demo.*` namespace only.
- **Settings:** the old Data-source card (free/premium/custom/off picker + freshness
  chart) is gone; a "Plans & data" card shows the four tiers with live Subscribe buttons
  (Stripe Checkout) and a Manage-subscription portal link. Data source is fully
  tier-driven now.
- **AI panel (`public/pt-analyst.js`):** demo mode (canned simulated answers), teaser
  (Free/Paid see what Premium adds), and live Premium chat/briefing/simulations.
- **Tests: 14 files, all passing** — new `_tiers.test.js` (tier mapping incl. the
  $60 grandfather), `_gate.test.js` (401/402 auth, holdings cap 422 incl. unlimited for
  paid, AI premium-only, webhook price→plan), `_demo.test.js` (demo determinism and
  parser gates). Existing 11 suites untouched and green. Login bundle rebuilt.
- **Browser smoke test:** the demo was driven end-to-end in a real browser (banner,
  charts, canned AI answer, pricing grid) with zero console errors.
- **Deployed to `main`** (Vercel auto-deploys from the push).

## Ongoing
- Statement import stays off in demo mode by design (real statements never mix with
  simulated data).
- The `?demo=1` override works for signed-in users who want to preview the demo.

## Planning (needs James)
1. **Rotate the Stripe restricted key** pasted in chat during this session.
2. Watch the AV free-key budget once real subscribers arrive; the $49.99/mo AV plan is
   the upgrade path (reselling may need AV's commercial licence).
3. Supabase custom SMTP before launch (confirmation-email volume).

## Idea dump (for "Idea Dumps")
- Premium: weekly email digest of the portfolio (Resend).
- Premium: "what changed this week" auto-briefing beyond the daily one.
- Alert packs per tier (drawdown/valuation alerts exist in the UI; server-side push is
  the next step).
- Multi-portfolio remains a documented future TODO (`docs/TIERS.md` has the extension
  point: a portfolio-count limit in the entitlement config).
