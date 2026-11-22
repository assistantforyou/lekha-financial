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

AI spend budget: USD 10 (authorised by James). Spent: 0 so far.
