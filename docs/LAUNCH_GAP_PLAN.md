> **AI provider note (2026-11-25):** Z.ai/GLM has been removed. DeepSeek is the only conversational AI provider; Gemini is used only for document embeddings. Any Z.ai/GLM or Gemini-chat references below are historical test records, not current setup.

# Launch gap plan · 22 November 2026

Concrete settings and steps for the gaps left after staging acceptance. Evidence is in `STAGING_AUDIT_LOG.md`. Nothing here asserts a licence; where rights are unproven the source is treated as unavailable for sale.

## 1. Data sources without proven commercial rights

Switch: `DATA_BLOCKED_SOURCES` (comma-separated provider names, `api/_licensing.js`). A listed source is never called, its earlier results are not served from the shared or in-memory caches (the cache key carries the policy), and callers fall back or show no data. Set on the staging Preview to `yahoo` since 2026-11-22 16:50 UTC.

| Source | Paths that reach users | With `yahoo` blocked (verified on Preview) | Launch decision needed |
| --- | --- | --- | --- |
| Yahoo Finance (unofficial chart, search, ticker RSS; personal use) | Non-US quotes, history and intraday (`/api/data/quote|history|intraday`, `_intl.js` series and all-time highs, watchlist `/api/free/quotes`), crypto intraday, ticker search fallback, per-ticker headlines (`news.company`, `street.js`), anything derived from them (valuation, simulation inputs, CSV exports, AI evidence, archived RAG news) | 7203.T and PTT.BK quote/history return `no_provider` with `yahoo:blocked`; watchlist omits them; US symbols unaffected; AAPL company news returns 502 because Yahoo RSS was its only per-ticker source | Block in production before the first paid customer. Non-US coverage and per-ticker news then need a licensed provider. |
| Alpaca free IEX feed | All US quotes, history and intraday | not blocked | Free plan is personal/dev use; redistribution needs Alpaca's data agreement. Add `alpaca` to the switch or sign the agreement. Blocking it today leaves US prices to Twelve Data or nothing. |
| Twelve Data, Finnhub, FMP, Alpha Vantage free tiers | Fallback quotes/history; Finnhub/FMP keys absent | not blocked | Free tiers are non-commercial or display-restricted; each needs a commercial plan or a block. |
| Publisher RSS (CNBC, MarketWatch, Investing.com, Bloomberg, Al Jazeera, Nasdaq, Seeking Alpha and others) | Market news, `mentioning()` per-ticker matches, AI news context | not blocked | Headlines and links only; terms vary per publisher. Counsel to confirm or remove feeds. |
| SEC EDGAR, FRED, ECB via Frankfurter | Statements, filings, macro, FX | allowed | Public domain / free reuse with attribution; keep. |

Smallest commercial configuration without new contracts: `DATA_BLOCKED_SOURCES=yahoo,alpaca,twelvedata,alphavantage` plus removal of unlicensed RSS feeds. The product then offers SEC fundamentals, filings and FRED macro only, with no prices. A sellable product needs at least one licensed price feed.

## 2. AI provider routing

Staging results (`pt_costs`, 2026-11-22):

| Job | Z.ai `glm-4.6v-flash` | Gemini `gemini-3.5-flash-lite` | Policy |
| --- | --- | --- | --- |
| `agent-answer` (cited claims, numeric check) | 3 of 3 rejected by validation (rows 2, 7, 9) | 2 of 4 accepted (rows 10, 19); 2 rejected by the numeric check (rows 8, 11) | **Gemini first**, Z.ai backup |
| `ai-council-v3` (structured report) | 1 of 1 `invalid_response` after about 25 s | 3 of 3 valid (rows 13, 16, 18) | **Gemini first**, Z.ai backup |
| `agent-expert` (one-field answer) | 3 of 4 valid (rows 5, 14, 20; one timeout) | valid (rows 6, 12) | Z.ai first |
| `news` (summary) | valid | not needed | Z.ai first |

Setting: `LLM_GEMINI_FIRST_JOBS=ai-council-v3,agent-answer` (set on the staging Preview). After the change: Council one call, no fallback (row 18, USD 0.0030); agent answer accepted on the first call in 5.8 s instead of 12.5 s (row 19, USD 0.0012); expert still Z.ai (row 20). Validation (`accept`) and fallback apply to whichever provider answers. Total staging AI spend to date: USD 0.018.

## 3. Operations (no paid infrastructure, nothing destructive)

* **Scheduled jobs.** Vercel runs crons only on Production. Staging test: owner adds a sensitive, branch-scoped Preview variable `CRON_SECRET`, redeploys, and calls `GET /api/cron/prune`, `/api/cron/flows` and `/api/cron/insiders?run=1` with `Authorization: Bearer <secret>`. `prune` deletes `pt_audit` rows older than 90 days; staging has none, so it is a no-op that still proves the route. Evidence: response body (`cutoff`), `pt_audit` row, updated dataset timestamp in `pt_av_cache`.
* **Alerting.** The code has no alert delivery: failures are logged (`billing_sync_failed`, `ai_provider_fallback`, `scheduled_refresh_failed`) and counted in Diagnostics. Options without new spend: a Vercel log query reviewed daily, or a Stripe webhook failure email (Stripe sends these to the account owner automatically after repeated failures). A real alert needs a log drain or a monitoring service (paid on Hobby). Owner decision.
* **Backup and isolated restore.** Supabase organisation is on the Free plan: no point-in-time recovery, no branching, no downloadable dashboard backups. Safe drill: owner runs `supabase db dump --db-url <staging connection string> -f staging.sql` (schema) and `--data-only` locally, restores into a local Docker Postgres (`supabase start` or `postgres:17`), and compares row counts for `pt_profiles`, `pt_audit`, `pt_costs`. Production needs Supabase Pro (daily backups, optional PITR) before launch.
* **Rollback.** Vercel keeps previous deployments; rollback is `request_rollback`/Promote of the last known-good deployment. Rehearse on Preview by redeploying `dpl_FBjMsS18zG4NH7mKcrPoypHcayjH` and checking the alias.

## 4. Signup links consumed before the user opens them

Observed: 1 of 3 staging signups was confirmed 36 s after sending, before the operator opened the mail; the user then saw "link expired". Auth mail is sent by Supabase custom SMTP through Resend as `noreply@gingerbrosshop.com`, and the HTML link is rewritten by Resend click tracking (`*.resend-clicks-a.com`). A scanner following the tracked link performs Supabase's one-time `GET /auth/v1/verify`.

Settings, in order (none touches the GingerBros project):

1. Resend: add a LEKHA sending domain or subdomain (e.g. `mail.<lekha domain>`), verify DNS, and turn **click tracking off** (and open tracking off) for that domain only. Do not change `gingerbrosshop.com`.
2. Supabase staging (then production) → Authentication → SMTP: sender `noreply@mail.<lekha domain>`, name `LEKHA`, Resend SMTP credentials for the new domain.
3. Supabase → Authentication → Email templates (Confirm signup, Reset password, Change email address): link to `{{ .SiteURL }}/auth-callback.html?token_hash={{ .TokenHash }}&type=<signup|recovery|email_change>` instead of `{{ .ConfirmationURL }}`. The callback then needs a small change to verify on a user click (`POST /auth/v1/verify` with `token_hash`), so a prefetch cannot consume the token. This code change is not made yet.
4. Verify: three fresh signups, none confirmed before the link is opened.

## 5. Checkout presentation (Stripe TEST, applies to live)

The hosted page opens in **USD 39.76** with "Charges will vary based on exchange rates" (Adaptive Pricing) and shows the merchant as **Assistant For You**. THB 1,299.00 appears only after the customer switches currency. Owner decision: disable Adaptive Pricing or accept FX presentation; set the public business name and statement descriptor to LEKHA; align Terms/Privacy links on the Checkout page.
