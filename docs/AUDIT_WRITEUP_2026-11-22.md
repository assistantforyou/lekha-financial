> **AI provider note (2026-11-25):** Z.ai/GLM has been removed. DeepSeek is the only conversational AI provider; Gemini is used only for document embeddings. Any Z.ai/GLM or Gemini-chat references below are historical test records, not current setup.

# LEKHA Financials full-system audit — state of the work, 22 November 2026

Written for handover. It records what was verified, what is still open, and — in the
section "Secrets and access" — exactly which credentials the remaining steps need and
why they could not be pulled automatically.

Nothing in this document is a secret. Every credential is referred to by name only.

- Repository: `portfolio-terminal` (LEKHA Financials), Vercel project
  `assistantforyou999-8501s-projects/portfolio-terminal`
- Work branch: `audit/full-system-repair` (head `ef01e1d` at the time of writing)
- Preview deployment: `portfolio-terminal-git-f896cf-assistantforyou999-8501s-projects.vercel.app`
- Staging Supabase: `lekha-staging` (`tnfmujnwjkxgjdqbdupb`)
- Production Supabase: `zlpnxnexlxdkhsygbtnr`
- All timestamps UTC unless stated.

Two audits ran in parallel against this repository — one driven from Claude, one from
ChatGPT. This document describes the Claude side end to end so the two can be compared
without redoing the work.

## 1. Environments and the rules that governed the work

| Environment | Database | Status during this audit |
|---|---|---|
| Production | `zlpnxnexlxdkhsygbtnr` | Read-only except one additive schema change, approved in advance |
| Staging (`lekha-staging`) | `tnfmujnwjkxgjdqbdupb` | Writable; free plan |
| Preview branch `audit/full-system-repair` | Staging | SSO-protected, exercised through an automation bypass |
| Local dev | none | Used for unit tests only |

Rules followed throughout:

1. No production writes without an explicit approval from the owner. The only production
   change made was creating the new `pt_audit` table (approved in advance, additive only).
2. Stripe test mode only. The live Stripe account was never touched; a CLI profile
   (`pt-staging`) points at the test sandbox so a command cannot silently hit live.
3. Vercel environment variables are added as type Config (pullable), never Secret, so the
   next person is not blocked the way this audit was.
4. No secret is written to a document, a commit, or a log. Two credentials did surface in
   local terminal output during the work and are called out in section 5.
5. AI spend stayed inside the USD 10 cap; about USD 0.003 has been used, tracked in
   `pt_costs`.

## 2. What is verified working

Each item below was checked against the deployed Preview, not inferred from code.

**Stripe test checkout and webhook.** Two test-mode prices exist in the sandbox
`acct_1TYqCeQ0yLOm6KwF` — LEKHA Paid at THB 699/month and LEKHA Premium at THB 1,299/month —
and their IDs are set as branch-scoped Preview variables. `POST /api/billing/checkout`
returns 200 with a `cs_test_…` session (it previously failed with
`stripe_resource_missing`, because the price IDs in `docs/TIERS.md` belong to the live
account and do not exist in the test sandbox). The payment page was completed with a 4242
test card, producing `sub_1UeX6mQ0yLOm6KwFnWyg1aAT`. The webhook endpoint
(`/api/billing/webhook`) is subscribed to `checkout.session.completed`,
`customer.subscription.updated` and `customer.subscription.deleted`, its signing secret is
stored on Preview, unsigned and badly signed payloads return 400, and after processing
`GET /api/auth/me` reports `tier: paid`, `sub_status: active`, `period_end: 2026-12-22`.

**Staging confirmation email.** Supabase staging now sends through Resend
(`smtp.resend.com:465`, sender `LEKHA <noreply@gingerbrosshop.com>`), with Site URL and the
redirect allow-list pointing at the Preview host instead of `localhost:3000`. A real sign-up
produced a delivered message and its confirmation link redirected to the Preview callback
with a session. Evidence: Resend message delivered `2026-11-22 09:02:58Z`, Supabase verify
endpoint returning 303 to `/auth-callback.html`.

**Account isolation, persistence and tier gates.** Two accounts were used — one paid (via
the test subscription) and one free — and both saved preferences independently; each read
back only its own values, and a re-login returned the stored values. `POST /api/data/agent`
with `mode: "expert"` returns 402 for both free and paid (the analyst is Premium-only), and
the admin endpoints return 401 anonymous and 403 for a non-admin, confirmed session.

**AI provider fallback.** A regression test in `api/_llm.test.js` forces the primary
provider to fail and asserts the answer comes from the backup provider, that the fallback is
recorded in the response metadata and logged, and that the error surfaces when no backup is
configured. This is now a deterministic test instead of a hoped-for outage.

**Rate limiting.** 400 requests to `/api/data/quote` in one minute produced 387 × 200 and
13 × 429. The limiter is real but per serverless instance (in-memory buckets, 120/min for
reads, 60/min for batch quotes, 30/min for calculations), so it is not a global quota.
Reported as a limitation rather than a defect.

**Audit trail.** Every routed API call writes one row to `pt_audit` after the handler
returns: route, method, status, outcome class, duration, error code, client, symbol, and
provider attempt metadata. `GET /api/data/audit?days=N` (admin only) summarises the window
into totals, per-route error rates and percentiles, top errors, busiest accounts, a daily
trend and a sign-up to AI funnel.

**Audit report page.** `app/src/pages/system.jsx` gained an `Audit` page, wired into
navigation as `Audit log (admin)` under Account & settings (route `#/account/audit`,
admin-only). Verified in the browser as an admin: with the 7-day window it showed 613
events, 3 active users, 4 failed calls (0.7%), 13 rate-limited, 6 denied, the funnel
(2 accounts created, 12 sign-ins, 2 analyst questions, 0 limits hit), the per-route table,
the failure breakdown, the busiest accounts and the daily trend.

**Retention.** `api/_h/cron/prune.js` deletes `pt_audit` rows older than 90 days, guarded
by the cron bearer secret and scheduled daily at 04:45 in `vercel.json`. Unit tested
(`api/_prune.test.js`), including the unauthorised and failed-delete paths.

**Production schema.** `pt_audit` was created on production with RLS enabled, three indexes
and access revoked from `anon`/`authenticated`. The statement batch returned
"Success. No rows returned". The production table deliberately starts empty.

## 3. What is still open

1. **Deploy to production.** The branch is not merged. Merging
   `audit/full-system-repair` into `main` deploys the audit writer, the prune cron and the
   admin report page. This was approved by the owner but had not been executed when this
   document was written. Production already holds `CRON_SECRET` and `ADMIN_EMAILS`, so no
   new variables are needed.
2. **Confirm production rows.** After the deploy, one production API call should appear in
   `pt_audit`; check with `select count(*) from public.pt_audit` and the audit page itself.
3. **RAG parity.** Production has `pt_rag_match`; staging does not (it needs pgvector). Only
   worth porting if retrieval-augmented search is in scope.
4. **Insider filings, 13F holders and ECB FX on staging read as stale or empty.** Crons run
   only on production deployments, and the Preview branch has no `CRON_SECRET`, so no
   scheduled job can run there. The FX cache key is warmed lazily on first conversion. These
   are environment artefacts, not code defects, and should disappear on production.
5. **Housekeeping.** The leftover `PT_PROBE_TEST` Preview variable was deleted. A session
   record for Todoist could not be written because this environment has no Todoist
   connector.

## 4. Non-defects, so nobody re-investigates

- `GET /api/data/news?symbol=AAPL` returns an empty list at the demo date (18 August 2026):
  the RSS provider succeeds and every headline is then filtered by the demo cut-off. The
  response says so in `meta.note`.
- `Exchange rates (ECB)` shows `null` in the data-status page until something actually
  converts THB or HKD, because the status reads the `free/fx` cache key and nothing had
  warmed it.
- `Insider filings (SEC Form 4)` reads `0 of 45 business days stored` on staging for the
  cron reason in section 3.
- The 500 kB bundle warning in the app build is pre-existing.

## 5. Secrets and access — what was actually blocked

This is the part the parallel audit was stuck on. The short version: the credentials exist,
they are readable only through dashboards, and several of them are stored with a type that
makes them impossible to pull from the CLI.

Vercel stores each Preview variable either as **Config** (readable, value survives a pull)
or **Secret** (write-only; `vercel env pull` returns `[SENSITIVE]`). Six provider keys plus
Stripe and Supabase credentials had been added as Secret during the earlier session, which
is precisely why the values could not be read back and used.

| Variable | Environment | Type observed | Needed for |
|---|---|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | all | Secret on production, Config on the audited Preview branch | Server-side database and auth |
| `STRIPE_SECRET_KEY` | Preview (test key), production (live key) | Secret | Checkout sessions, price lookup |
| `STRIPE_WEBHOOK_SECRET` | Preview | Config | Verifying webhook signatures |
| `STRIPE_PRICE_PAID`, `STRIPE_PRICE_PREMIUM` | Preview | Config | Mapping a plan to a price |
| `ADMIN_EMAILS` | production, plus the audited Preview branch | Secret on production | Who may open the admin pages |
| `CRON_SECRET` | production only | Secret | Authorising scheduled jobs |
| `ZAI_API_KEY`, `GEMINI_API_KEY`, `GEMINI_MODEL` | Preview | Secret | The analyst and the AI fallback |
| `ALPACA_API_KEY_ID`, `ALPACA_API_SECRET_KEY`, `ALPACA_DATA_URL`, `TWELVEDATA_API_KEY`, `AV_API_KEY` | Preview | Secret | Market data providers |
| `PRODUCTION_SUPABASE_PROJECT_REF`, `STAGING_SUPABASE_PROJECT_REF`, `SITE_URL`, `PREVIEW_ACCESS_PROTECTED` | Preview | Config | Release guard and redirects |

How each block was worked around, without anyone pasting a key into chat:

- **Stripe.** The CLI was authorised through a device-code flow against the test sandbox and
  a dedicated profile, so no API key had to be extracted from Vercel. Prices and the webhook
  endpoint were created that way; the endpoint's signing secret went straight from the CLI
  response into `vercel env add` without being printed.
- **Supabase.** Changes were made through the dashboard in a signed-in browser (Site URL,
  redirect allow-list, SMTP). The staging service-role key was never needed, because the app
  server routes already hold it.
- **Verification.** Sign-up, prefs, gates, audit and checkout were exercised through the
  deployed API with a bearer token obtained by logging in, which needs no server secret.
- **Email evidence.** Read through the Resend API with a send-only key already present in
  another project's local env file; the Gmail connector in this environment returns
  Unauthorized, so the mailbox itself could not be read.

Two credentials surfaced in local terminal output during this work and should be treated as
exposed even though they were not shared anywhere:

- a Stripe **test-mode** webhook signing secret, printed once by a masking command that did
  not match the quoted value in the env file. The endpoint was rotated and recreated
  afterwards, and the stored secret replaced.
- the Vercel **protection bypass** token, printed while querying project protection. It is a
  deployment-access credential, not a data credential, and cannot be rotated from the CLI;
  it should be regenerated in the project's deployment-protection settings when convenient.

For the next person: reading a Secret value is not possible from the CLI. Either recreate
the variable as Config, or operate through the dashboard and the CLI flows described above.
Do not ask for keys in chat.

## 6. Fastest way to re-verify (no secrets required)

```
# health of the preview (needs the project's protection bypass parameter)
curl -s -o /dev/null -w '%{http_code}\n' "<preview-url>/api/data/quote?symbol=AAPL"

# sign in, then use the returned access token as a bearer
POST <preview-url>/api/auth/login            {"email": "...", "password": "..."}
GET  <preview-url>/api/auth/me               -> tier, sub_status, is_admin
GET  <preview-url>/api/data/audit?days=7     -> admin only
GET  <preview-url>/api/data/diag             -> admin only

# unit and integration suite
npm test
node api/_llm.test.js api/_prune.test.js
```

## 7. Changes on this branch

| Commit | Content |
|---|---|
| `d086944` … `085d3aa` | Earlier audit work: signed-in data repair, AI failover bounds, filing vintages, cache versioning, audit trail, handover docs |
| `fe10401` | Release guard now checks that the configured Stripe price IDs exist in the account and match the deployment's mode and interval |
| `9005484` | Admin audit report page, navigation entry, AI fallback regression test, audit log rows |
| `ef01e1d` | Daily 90-day prune for `pt_audit`, cron route and schedule, unit test |

## 8. Recommended order for the remaining work

1. Merge and deploy, then confirm the first production audit rows and the report page.
2. Decide who is in `ADMIN_EMAILS` on production and record it.
3. Port `pt_rag_match` to staging only if RAG is in scope.
4. Consider promoting the audited Preview keys from Secret to Config so the next audit is not
   blocked the same way.
5. Move rate limiting to a shared counter (`pt_rate_hit` already exists) if a global quota is
   a product requirement rather than a per-instance safeguard.
