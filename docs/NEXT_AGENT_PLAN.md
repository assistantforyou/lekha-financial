# Plan for the next agent (written 2026-11-22)

Read first: `CLAUDE.md`, `docs/STAGING_AUDIT_HANDOFF.md`, `docs/STAGING_AUDIT_LOG.md`. Branch: `audit/full-system-repair` (PR #15, draft, **do not merge**). Latest pushed commit at time of writing: `78f35aa`.

## Ground rules (from James)
1. **Production is off limits for writes.** Production Supabase is `zlpnxnexlxdkhsygbtnr`, staging is `lekha-staging` (`tnfmujnwjkxgjdqbdupb`). Read-only queries on production only when essential, and log them.
2. **Vercel env vars must be stored pullable, never Secret/Sensitive.** On CLI 65.x the default is Secret, so pass an explicit `--type` (see `vercel env add --help`). Never print or commit values. Existing six provider keys were stored as Secret before this rule; re-add them pullable (`vercel env rm` needs James's approval in the dashboard or CLI prompt).
3. **Stripe: test mode only.** The Stripe connector in Claude only exposes the LIVE account; do not use it for writes. Use the Stripe dashboard in test mode via the browser, or ask James for a restricted `sk_test_` key.
4. **Keep an audit trail.** Append every action to `docs/STAGING_AUDIT_LOG.md` (time UTC, action, target, result). No secrets, no James's email address in the repo.
5. **AI spend cap: USD 10** for the whole audit (about $0.003 used). Check `pt_costs` on staging.
6. Test user: James's Gmail plus-alias. His Gmail connector can read mail. Make new plus-aliases for new accounts. Staging test user was confirmed via SQL because mail did not arrive.
7. Commits: end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Run `npm test` (must exit 0) before every push. Previews deploy from git pushes only (CLI deploy fails `scripts/check-release-config.mjs`).
8. Preview URL: `https://portfolio-terminal-git-f896cf-assistantforyou999-8501s-projects.vercel.app` (Deployment Protection on; use `vercel curl --deployment <url> --scope assistantforyou999-8501s-projects` or James's signed-in Chrome). Use the Claude in Chrome extension; in-page `javascript_tool` output is often blocked, so read results from the DB (`pt_audit`, `pt_costs`) instead.

## Tasks, in order

### 1. Fix Stripe test checkout (blocker)
Symptom: `POST /api/billing/checkout {plan:"paid"}` returns 502; runtime log says `checkout failed: stripe_resource_missing`. `STRIPE_PRICE_PAID` / `STRIPE_PRICE_PREMIUM` on Preview are not prices in the test-mode account that `STRIPE_SECRET_KEY` (sk_test) belongs to.
- In the Stripe dashboard (test mode) create the Paid and Premium products with recurring prices, copy the two `price_...` IDs.
- Set both on Vercel Preview for branch `audit/full-system-repair` (pullable type), redeploy by pushing a trivial commit, retry checkout as the test user.
- Improve `scripts/check-release-config.mjs` or add a runtime check so Preview fails fast when the prices do not exist (a `GET /v1/prices/{id}` with the key during build, names only in output).
- Complete the test checkout with Stripe's published test card `4242 4242 4242 4242`, any future expiry/CVC. Confirm the Checkout page shows test mode before typing the card.
- Webhook: Preview is behind Deployment Protection. Either add a protection-bypass for Stripe or use a public alias, create a test-mode webhook endpoint for `/api/billing/webhook`, set `STRIPE_WEBHOOK_SECRET` (pullable), then verify the profile row in `pt_profiles` (staging) shows the subscription after payment, and that duplicate delivery is idempotent. Also test cancel via the billing portal.
- Done when: checkout completes, `pt_profiles` entitlement updates, `pt_audit` shows `billing/checkout` 200 and `billing/webhook` 200.

### 2. Make confirmation emails work on staging
Supabase built-in SMTP only delivers to org members and the staging Site URL looks like `http://localhost:3000`. In the Supabase dashboard for `lekha-staging` (Auth settings; the Claude Supabase connector cannot change auth config): set Site URL and redirect allow-list to the Preview URL, and configure custom SMTP (Resend or similar). Then sign up a fresh plus-alias, read the email through the Gmail connector, click the link, sign in. Log it. Done when a real confirmation email is received and the link signs the user in.

### 3. Finish the signed-in audit
Using two accounts (A, B), verify and log each:
- **Isolation:** B cannot read A's `pt_user_state` documents (try the app's state routes with B's token against A's keys); RLS is on for every table (`docs/sql/check-commercial-rls.sql` against staging).
- **Persistence:** save holdings as A, sign in from a second browser profile, data is there.
- **Tier gates:** FREE user hitting Premium endpoints gets 402/403 and it appears as `gated`/`denied` in `pt_audit`.
- **AI fallback:** temporarily make the primary provider fail (set a bad key value on Preview only, redeploy, call `/api/data/agent`) and confirm the fallback answers and `pt_costs` shows the fallback model. Restore the key afterwards. Stay inside the USD 10 cap.
- **News (signed in), dataset refresh timestamps (null), insider history (0/45 days):** find out why with `/api/data/diag` (admin only: set `ADMIN_EMAILS` to the test alias on Preview, pullable) and fix or document.
- **Rate limiter:** confirm 21st auth attempt in 10 minutes returns 429 and normal use does not.

### 4. Audit report page in the admin UI
Backend exists: `GET /api/data/audit?days=7` (admin only), pure aggregator `summarize()` in `api/_audit.js`, tests in `api/_audit.test.js`. Build a section in `app/src/pages/system.jsx` (Account → Diagnostics) using shadcn components in `app/src/components/ui`, `DataState`/`ErrorBox`/`EmptyBox`, `app/src/lib/fmt.js`:
- tiles: calls, active users, server-error rate, p95 latency;
- table: per-route calls/errors/error rate/p50/p95/rate-limited/denied, sorted by errors;
- top errors list, daily trend, top users (short ids), funnel (signed up → signed in → asked AI → hit limit);
- a days selector (1/7/30).
Then `npm run build:app` (generated files are committed; never hand-edit `public/app/*`, `public/assets/*`), `npm test`, push, verify in the browser as an admin. Optional: record client-side events (page views, panel opens) through a small `POST /api/data/audit-event` that only accepts a fixed allow-list of event names.

### 5. Production readiness for the audit trail and RPCs (needs James's explicit go-ahead first)
Production already has `pt_rate_hit`/`pt_av_spend`. Staging lacks `pt_rag_match` (needs pgvector); add it to staging via a migration copied from production if RAG is in scope. Before any production deploy: run `docs/sql/2026-11-22-audit-events.sql` on production, add a 90-day prune (cron or `delete from pt_audit where ts < now() - interval '90 days'`), and decide who is in `ADMIN_EMAILS`.

### 6. Housekeeping
- Delete leftover Vercel var `PT_PROBE_TEST` (Preview, branch scoped, value `x`).
- Failed CLI deployment `portfolio-terminal-jhem1n03w` and build `jrxdt3sbi` (Error) can be ignored or removed.
- Update `docs/STAGING_AUDIT_HANDOFF.md` and the audit log at the end; add a Todoist update (project "Sex Projext", tasks titled "<what> - james") per James's global instructions.

## Known facts that save time
- Staging DB tables match production; staging was missing only the RPC functions (now applied) and `pt_audit` (applied).
- `rateHit()` fails closed: any RPC/DB error shows up as "Too many attempts".
- Statement caches are versioned by `STATEMENT_SCHEMA` in `api/_fin/providers/sec.js`; bump it whenever `buildStatements` output changes.
- Empty AMD news is intentional demo-date behaviour (18 Aug 2026).
- Audit rows are written after the handler returns (`api/_audit.js` `around()`); set `AUDIT_DISABLED=1` to turn off (the billing webhook test does this).
