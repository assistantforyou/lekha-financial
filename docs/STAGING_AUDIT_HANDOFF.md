# Staging audit handoff (2026-11-22)

Branch `audit/full-system-repair` (PR #15, draft, **not merged**). Production untouched.
Preview alias: `portfolio-terminal-git-f896cf-assistantforyou999-8501s-projects.vercel.app` (Deployment Protection on; use `vercel curl --deployment <url>` or be signed in to Vercel).

## Fixed and verified
- **Duplicate fiscal labels** (June 2025 and June 2026 both `2026 Q2`). `fy`/`fp` describe the filing, not the period, and the SEC adapter took them from the latest filing. Labels now come from the earliest filing; values still use the latest (restatements win). Commit `e566971`. Regression test in `api/_finservice.test.js`.
- **Stale cache hid the fix.** Statements were cached 6h/7d in two layers (service and SEC provider) with unversioned keys. Both keys now carry `STATEMENT_SCHEMA` (`sec.js`). Bump it whenever `buildStatements` output changes. Commits `2855a27`, `8fc1bfd`.
- Verified on a fresh deploy: AMD quarterly 2025-06-28 -> `2025 Q2`, 2025-03-29 -> `2025 Q1`, 2026-06-27 -> `2026 Q2`.
- Tests: `node api/_fincalc.test.js api/_finservice.test.js api/_finagent.test.js` pass.
- Preview Stripe is test-mode: the release guard (`scripts/check-release-config.mjs`) only lets a Preview build when `STRIPE_SECRET_KEY` is `sk_test_`/`rk_test_`, prices are distinct and the webhook secret is set, and builds are Ready. (The key's value was never read.)

## Added to Preview (branch-scoped)
`ZAI_API_KEY`, `GEMINI_API_KEY`, `ALPACA_API_KEY_ID`, `ALPACA_API_SECRET_KEY`, `TWELVEDATA_API_KEY`, `AV_API_KEY`, `GEMINI_MODEL`, `ALPACA_DATA_URL`. The six keys were stored as Secret (James's rule going forward: store as pullable, not Secret/Sensitive). `PT_PROBE_TEST` is a leftover dummy variable (value `x`); delete it in the dashboard.

## Found and fixed since the first handoff
- **Signup/login/AI all returned 429 on staging.** Root cause: `pt_rate_hit` and `pt_av_spend` were never created in the staging database; `rateHit()` fails closed. SQL now in `docs/sql/2026-11-22-rpc-functions.sql` (applied to staging only). Anyone creating a new Supabase project must run it.
- **Audit trail** (`pt_audit`, `api/_audit.js`, admin report `GET /api/data/audit?days=7`): one row per API call with verified user id, route, status, latency, error code, ticker, provider failures. No prompts, bodies, emails or tokens. Schema: `docs/sql/2026-11-22-audit-events.sql` (applied to staging). No UI page yet. Keep 90 days.
- Signed in on the Preview and ran the AI agent: Gemini and Z.ai both answer; cost about $0.003.

## Still open
- **Stripe checkout fails**: `stripe_resource_missing`. `STRIPE_PRICE_PAID` / `STRIPE_PRICE_PREMIUM` in Preview are not prices in the test-mode account behind `STRIPE_SECRET_KEY`. Create test products/prices (or fix the IDs) and re-run. The release guard should also verify the prices exist. Webhook delivery untested.
- **Confirmation email never arrives on staging**: Supabase built-in SMTP only delivers to org members, and Site URL looks like `localhost:3000`. Set staging Site URL/redirects to the preview URL and configure SMTP. The test user was confirmed by SQL instead, so the real email path is unverified.
- Production Supabase has an extra function `pt_rag_match` (vector search) that staging lacks.
- Not investigated: null dataset refresh timestamps, insider history 0/45 days, signed-in live news, real AI provider fallback ordering.

## Previously listed (still true)
- **Signed-in checks** (persistence, isolation, AI fallback, Stripe checkout and webhook) were not completed. Sign-up on the Preview returns `Too many attempts. Wait a few minutes.` (HTTP 429). It is either the app limiter (20 auth attempts per client per 10 min, `api/auth/[action].js`) or the staging Supabase email send limit. Retry after the window; if it persists, check staging Supabase auth logs (the staging project is NOT in the connector account used in this session).
- Anonymous AI endpoint returned `Daily research limit reached (15/day)`; real AI fallback needs a signed-in account.
- Stripe connector in this session only exposes the LIVE account; no test-mode calls were made. Check test-mode prices and webhook delivery in the Stripe test dashboard. The webhook needs a reachable URL (Preview is protected: needs a protection bypass or a public alias).
- Dataset refresh timestamps are null and insider history is 0/45 days: not investigated.
- Empty AMD news is intentional demo-date behaviour (18 Aug 2026); signed-in live news is unverified.
- A CLI `vercel deploy` fails the release guard (`SITE_URL` must match the preview host). Only git-triggered deploys pass. Build `jrxdt3sbi` also showed Error.
- AI spend cap agreed with James: USD 10. Spent so far: effectively 0 (one request rejected by the daily limit).

## Test account
A Gmail plus-alias of James's inbox was used for sign-up attempts (address kept out of the repo). Make your own account with an address you can read.
