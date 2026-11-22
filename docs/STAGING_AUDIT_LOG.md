# Staging audit log (append-only)

Times are UTC, 2026-11-22. Scope: Preview `audit/full-system-repair` only. No secret values are recorded here.

| Time | Action | Target | Result |
|---|---|---|---|
| ~07:5x | Added Preview env vars (branch-scoped, stored Secret): ZAI_API_KEY, GEMINI_API_KEY, ALPACA_API_KEY_ID, ALPACA_API_SECRET_KEY, TWELVEDATA_API_KEY, AV_API_KEY; config: GEMINI_MODEL, ALPACA_DATA_URL | Vercel project portfolio-terminal, Preview/audit/full-system-repair | Added. Values copied from James's local keys.env, never printed. |
| ~07:5x | Created then (attempted) removed probe var PT_PROBE_TEST | same | Created; removal needs human approval, still present (value `x`) |
| ~08:0x | Pushed e566971 (fiscal label fix) | origin/audit/full-system-repair | Pushed; cherry-picked onto PR branch, conflict with `asOf` change resolved by hand |
| ~08:1x | Pushed 2855a27 (version SEC provider cache key) | same | Pushed |
| ~08:1x | `vercel deploy` from CLI | Preview | Failed release guard (SITE_URL must match preview host). Deployment jhem1n03w left in Error state. |
| ~08:1x | Pushed 8fc1bfd (version service-level cache key) | same | Pushed; Ready build evy81rknb |
| ~08:1x | GET /api/data/statements?symbol=AMD&type=quarterly via `vercel curl` on evy81rknb | Preview | Fresh fetch: 2025-06-28 -> 2025 Q2 (fixed) |
| ~08:1x | POST /api/data/agent (one anonymous question) | Preview | 429 `Daily research limit reached (15/day)`; no model call, no spend |
| ~08:1x | GET /api/data/diag | Preview | `Admins only` |
| ~08:1x | Stripe connector: list accounts; one test-mode read | Stripe | Only a LIVE account exists; test-mode call returned 422. No live-mode calls made. |
| ~08:1x | Sign-up attempt 1 and 2 in Chrome (Gmail plus-alias of James) | Preview /login.html | Both `Too many attempts` (HTTP 429). Not bypassed. |
| ~08:2x | Supabase connector: list projects | Supabase | 4 unrelated projects; staging (tnfmujnwjk...) and production refs are NOT in this account. Nothing touched. |
| ~08:2x | Pushed cb1616b (STAGING_AUDIT_HANDOFF.md) | same | Pushed |
| ~08:2x | Supabase connector re-listed after James connected it: `lekha-staging` (tnfmujnwjkxgjdqbdupb) and production (zlpnxnexlxdkhsygbtnr) now visible | Supabase | Production: ONE read-only query (pg_get_functiondef of pt_* functions) and one table-name listing. Nothing written to production. |
| ~08:2x | Read staging auth logs and `pt_rate` | staging | Finding: no GoTrue 429; `public` schema had NO functions, so `pt_rate_hit` failed closed and every signup/login/AI call returned 429 |
| ~08:25 | Applied docs/sql/2026-11-22-rpc-functions.sql (pt_av_spend, pt_rate_hit; EXECUTE for service_role only) | staging only | Applied; limiter now counts (`pt_rate`) |
| 08:26 | Sign-up in Chrome with Gmail plus-alias (1 attempt) | Preview | OK. Supabase default mailer logged `mail.send` but nothing reached Gmail (built-in SMTP only delivers to Supabase org members); staging Site URL also looks like localhost:3000 (auth log referer) |
| ~08:27 | `update auth.users set email_confirmed_at=now()` for the one test user I created | staging only | DEVIATION from the real confirmation-email path, done because the email could not be delivered. Email path remains UNVERIFIED. |
| ~08:27 | Signed in as test user (FREE tier); 3 agent requests (my JS ran 3x) | Preview /api/data/agent | OK. pt_costs: Gemini gemini-3.5-flash-lite x2 (~$0.0026), Z.ai glm-4.6v-flash x1 ($0). Total about $0.003 of the $10 cap. Fallback ordering not forced/verified. |
| ~08:3x | Pushed d086944: audit trail (pt_audit, api/_audit.js, GET /api/data/audit) | origin/audit/full-system-repair | Full `npm test` exit 0 |
| ~08:3x | Created pt_audit table | staging only | Applied from docs/sql/2026-11-22-audit-events.sql |
| 08:36 | Traffic as test user: quote, statements (ok and bad symbol), auth/me, data/diag | Preview | All 5 rows present in pt_audit with verified user id; diag 403 recorded as `denied` |
| 08:36 | POST /api/billing/checkout {plan:"paid"} | Preview | 502. Runtime log: `checkout failed: stripe_resource_missing` (price not found in the test-mode account). Recorded in pt_audit. No payment attempted. |

AI spend: about $0.003 of the USD 10 cap (authorised by James).
