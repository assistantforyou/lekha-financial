# Subscription entitlements · 23 November 2026

Free ฿0 / Paid ฿399 per month / Premium ฿599 per month, with server-enforced feature access.
Branch `feature/subscription-entitlements-399-599`, started from `origin/main` at
`b9ce6967d43e7758b1d8e5bd2db7c8c09a301327` ("Reprice plans to THB 399/699"). PR #15 is merged
in that history (`d5bb5ae`). The local `main` checkout (`c59121f`, 106 commits behind) and its untracked files
were left untouched; the work was done in a separate worktree.

**Status: NOT READY for paying customers.** The code, the mocked tests and a localhost browser check pass. The
Stripe price, the staging journey and protected simulation execution are not verified (see Blockers).

## 1. Access paths found before the change

| Path | Executed | Protection before | Now |
|---|---|---|---|
| `/` React shell, `PanelHost` moves classic panels out of the hidden `#stage` | browser | analyst screens only, by tier in the browser | every restricted route renders `LockedFeature`; the panel never leaves `#stage` |
| `/v2`, `/v3` classic shells (same engine, same data source) | browser | none for market screens; Premium checks in sim and analyst | same data source and module gates as `/`; panels show "included in the Paid and Premium plans" |
| `/api/free/csv/{ROTATION,RISK,BREADTH,OBOS,PEER,VOLATILITY}` | server | **public, CDN-cacheable** | Paid/Premium feature, `private, no-store` |
| `/api/free/csv/{FACTOR,VALIN}`, `/api/free/collection/{fund,rev}` | server | any signed-in account | Paid/Premium feature, `private, no-store` |
| `/api/free/collection/news` (AI-labelled market briefing) | server | **public** | Paid/Premium feature, `private, no-store` |
| `/api/free/doc?path=meta/vixeq_hist` | server | public | Risk appetite feature |
| `/api/free/doc` FRED/CFTC/TIC/F&G, `collection/{etf,ins}`, `csv/HISTORY` | server | public / signed-in | unchanged: they feed Free screens |
| `/api/free/demo?k=` sample portfolio | server | served VALIN, fund, FACTOR, rev at paid depth to anyone | HISTORY, quotes and street only |
| `/api/ai/ask`, `/api/ai/briefing`, `/api/data/agent` expert mode | server + LLM | Premium | Paid and Premium, finite per-plan quotas |
| `/api/ai/simulate`, `/api/ai/council`, `/api/ai/council-v3` | server + LLM | Premium | unchanged (Premium) via the shared matrix |
| `/api/state` `reports/*` (saved Council reports) | server | any signed-in owner | withheld from `GET` without `councilReports`; not deleted |
| `/api/rag` ingest `kind:"report"`; agent retrieval | server | any owner | needs `councilReports`; agent drops report passages without it |
| Demo (`PT_DEMO_MODE`, `?demo=1`) | browser | **reported `PT_TIER="premium"`**: analyst, sim, Council, Projection Lab open | reports `demo`; `pt-demo.js` serves no data for locked features; modules not mounted |
| Monte Carlo engine `public/v3/lekha-sim.js`, `sim-runner.js`, `sim-stream.worker.js`, `public/core/engine.js` | browser | Premium check in the browser | not imported or mounted without Premium; **static files remain public** (see 4) |
| Projection Lab `public/v2/pt-projection.js` + `pt-projection-data.json` | browser | open to demo and Premium | Premium only; the JSON is a labelled illustration and stays a public static file |

## 2. What changed

- `api/_data/entitlements.json`: the single feature matrix (routes, features, Paid quotas). Read by
  `api/_tiers.js` and imported by the React shell.
- `api/_tiers.js`: `PRICING` Free 0 / Paid 399 / Premium 599; demo no longer "deliberately open";
  Paid gets the analyst and briefing; `FEATURES`, `featureOfRoute`, `tierAllows`, `canUse`, `featuresOf`, `planFor`, `quota`.
- `api/_auth.js`: `requireFeature` (same 401/402 contract as `requireTier`, plus `feature` and `plan`),
  `lockCache`, `features` in `/api/auth/me`. `requireTier` semantics are unchanged.
- Endpoints listed in section 1.
- `api/_h/billing/checkout.js`: before any customer or session is created, the configured Stripe price must be
  active, THB, monthly, licensed and exactly 39,900 / 59,900 satang, or Checkout returns `503 price_mismatch`.
  Added because `scripts/check-release-config.mjs` is no longer in the Vercel build command (`404ef49`).
- `api/_h/billing/portal.js`: returns to `/?billing=portal` so the app re-reads the verified plan.
- `scripts/check-release-config.mjs`: Premium 59,900 satang (Paid stays 39,900).
- React: `LockedFeature.jsx` (Lucide lock, plan, price, real Checkout or portal, keyboard-accessible,
  responsive); `App.jsx` one route decision, billing-return polling and one reload when the verified plan
  changes; `Sidebar.jsx` lock icons; Plans page copy and prices; `AnalystGate.jsx` removed.
- Classic: `pt-datasource.js`, `pt-demo.js`, `v2/pt-analyst.js` (Paid live chat + briefing, sim locked),
  `v2/pt-ui.js` (plan card), `v2/pt-projection.js`, `v2/index.html` (`plan_required` message),
  `v3/lekha-modules.js`, `v3/lekha-sim.js`; generated files rebuilt with `node scripts/build-v3.mjs` and `npm run build:app`.
- Tests: `api/_entitlements.test.js`, `api/_checkout-price.test.js`, `api/_scripts-parse.test.js` (new);
  `_tiers`, `_gate`, `_demo`, `_release-config`, `_commercial-journey` extended.
- Docs and marketing: `docs/TIERS.md`, `SETUP.md`, `CLAUDE.md`, `marketing/ads/BRIEF.md`, `marketing/ads/build.mjs`
  and the regenerated HTML in `marketing/ads/src/`. Historical logs and audit records were not edited.

## 3. Paid usage limits introduced

Paid previously had no AI access. New finite daily caps, counted by the existing `pt_rate_hit` RPC:
20 portfolio-analyst questions, 1 new briefing (cached briefings are free), 30 expert-mode questions,
and the existing 30 research-agent questions. Premium keeps 40 / 3 / 80 / 80. These numbers are a starting
point chosen for this change; check them against cost data before selling.

## 4. Simulation execution: BLOCKED

The 1,000,000-path Monte Carlo runs in the browser from static JavaScript. A static asset on Vercel is
public; the app no longer imports or mounts it without Premium, but anyone can download it and run it on
their own inputs, and its inputs (own price history) are Free data. Lazy loading is not access control.

Smallest architecture that would protect it: move the path engine behind a Premium endpoint that returns
only aggregates (histograms, percentiles, completed path count), and remove the engine files from
`public/`. Constraints observed: Vercel functions here are capped at 60 s (`vercel.json`), the Hobby plan
allows 12 functions and 10 are used, so it must live inside an existing router (`api/ai.js`). A run is
roughly paths × 252 days × holdings draws (1M × 252 × 25 ≈ 6.3 billion), which cannot finish in one 60 s
invocation; 100,000 paths (about 630 million draws) might, unmeasured. Selling 1M-path server runs would need
chunked jobs with stored state or a different compute service. That is a re-architecture outside this change,
so the "protected simulation execution" criterion is **BLOCKED**. The existing server simulation
(`/api/ai/simulate`, 2,000 paths, 10 per day) is Premium-protected. Actual path counts are unchanged and
the UI still shows completed paths; no simulated results were fabricated.

## 5. Acceptance

| Criterion | Result | Evidence |
|---|---|---|
| Exactly three plans, Free ฿0 / Paid ฿399 / Premium ฿599, in code, Plans page, classic card, lock screens | PASS (local) | `_tiers.test.js`; localhost browser check |
| Release checker expects 39,900 / 59,900 satang; retired 69,900 and 129,900 held | PASS (mocked) | `_release-config.test.js` |
| Checkout refuses a price that is not the advertised amount | PASS (mocked) | `_checkout-price.test.js` |
| Live Stripe price for ฿599 Premium configured and verified | BLOCKED | no Stripe access in this environment; owner action below |
| Stripe TEST ฿599 price, portal configuration (Paid ↔ Premium switch) | BLOCKED / NOT TESTED | no Stripe access |
| Route matrix (12 routes + `sector/*`, `simulation/*`) for demo, Free, Paid, Premium | PASS (mocked + localhost) | `_tiers.test.js`, `_entitlements.test.js`; browser with a local stub account per plan |
| Every gated endpoint refuses demo/anonymous (401) and Free, expired, cancelled, past-due, unpaid (402) | PASS (mocked + localhost) | `_entitlements.test.js`; direct `fetch` from a Free session with forged headers, body and `PT_TIER` |
| Gated responses never publicly cacheable | PASS (mocked + localhost) | `Cache-Control: private, no-store` asserted and observed |
| Demo cannot reach restricted features; `?demo=1` on Premium resolves to demo | PASS (localhost) | browser: tier `demo`, lock screens, sim code not downloaded |
| `/v2`, `/v3` cannot bypass for server-backed screens | PASS (localhost) | browser as Free: no gated data, modules locked, analyst locked |
| `/v2`, `/v3`, devtools cannot run the browser Monte Carlo without Premium | BLOCKED | section 4 |
| Saved Council reports: Paid/Free cannot retrieve via `/api/state`, RAG or the agent | PASS (mocked) | `_entitlements.test.js` |
| Upgrade button uses real Checkout / portal | PASS (localhost) for routing; NOT TESTED against Stripe | Free → `POST /api/billing/checkout {plan:"paid"}`; Paid → `POST /api/billing/portal`; both 503 locally (no Stripe) |
| Redirect alone grants nothing; original module unlocks after the verified record changes | PASS (localhost, stub webhook) | `?billing=success` kept Free; stub record → Paid; page polled, reloaded once, mounted Market intelligence |
| Access revoked at cancellation | PASS (localhost, stub) + mocked | 204/200 → 402 immediately after the record changed; `_checkout-price.test.js` |
| Webhook: transitions, duplicates, out-of-order, unknown price, ฿699 grandfathered | PASS (mocked) | `_billing-webhook.test.js`, `_checkout-price.test.js` |
| Anonymous → Free → Paid → Premium → downgrade on the protected Preview with Stripe TEST | NOT TESTED / BLOCKED | see Blockers |
| Regression: holdings, valuation maths, data layer, Council validation, quotas, tour, i18n, style | PASS (mocked) | `npm test`: 43 files, exit 0 |
| Every browser script parses (caught a real defect in this change) | PASS | `_scripts-parse.test.js` |
| Responsive lock screen, no horizontal scroll at 375 px, keyboard focus | PASS (localhost) | browser at 375×812 |
| Ad PNGs match the new prices | FAIL | `marketing/ads/out/*.png` still show ฿299; needs Playwright to re-render |

"Mocked" means handler tests with Supabase and Stripe replaced at `fetch`. "Localhost" means the real dev server and
browser with a local stand-in for Supabase (three fixed test accounts, no keys, nothing external except public
market-data reads). Neither is deployed integration evidence.

## 6. Blockers and owner actions

1. **Live Premium price.** Production must not run this code while `STRIPE_PRICE_PREMIUM` is the ฿699 price:
   the page would say ฿599 and Checkout would now refuse (503) rather than charge ฿699. Verify
   `price_1UesDNQ0yLOm6KwFfD77FGmK` (recorded as the ฿599 Premium price of 23 Nov) in the live dashboard, or
   create a new ฿599 monthly price on the Premium product; set it as `STRIPE_PRICE_PREMIUM`; add
   `price_1UesqhQ0yLOm6KwFvcO9Owwh` (฿699) to `STRIPE_LEGACY_PREMIUM_PRICES`. Existing subscriptions are not migrated.
2. **Stripe TEST + staging.** Create a ฿599 Premium TEST price; set the Preview variables (branch-scoped to this branch
   or the staging branch); confirm the TEST portal configuration offers both products. Staging variables were
   recorded as branch-scoped to `audit/full-system-repair` (`STAGING_AUDIT_LOG.md`, 22 Nov), so a Preview of this branch
   will not have staging Supabase or Stripe configuration until the owner adds it. Then run the journey in section 5.
3. **Release check.** Restored to the Vercel build command in the PR #19 repair round (section 8). Until the
   owner completes items 1 and 2, every Production and Preview build of this code is held by design.
4. **Simulation protection** (section 4): decide whether the browser engine is acceptable as a Premium feature
   or fund the server-side architecture.
5. **Ads:** re-render `marketing/ads/out/` with `node marketing/ads/build.mjs` before any creative is used.
6. **Paid quotas** (section 3): confirm against expected cost.

## 7. Incident during local verification

The in-app preview tool started the main checkout's `pt-dev` configuration once (it reads `.claude/launch.json` from
the main checkout), which loads `~/.config/portfolio-terminal/keys.env`. That file points at the **production**
Supabase project. The server ran for about 9 seconds and was stopped; the page had no session and made no `/api/`
requests (checked in the browser), so nothing reached production. All later checks used a local stand-in with no
real keys. A temporary launch entry added for that was removed and the main checkout's `launch.json` restored.

## 8. PR #19 repair round (23 Nov 2026)

Review findings on PR #19 head `7ddf3c3`, fixed on the same branch. Nothing was merged or deployed, and no Vercel,
Supabase or Stripe setting was changed. Vercel and Supabase were read for setting **names**, scopes and table
names only; no secret value was decrypted.

### 8.1 Checkout price cache (fixed)

`priceMatches` remembered a verified price by price ID alone. If one ID was ever verified as Paid (฿399), the same
ID configured for Premium passed for 10 minutes on that instance and Checkout would sell Premium for ฿399. The cache
key is now `plan | price ID | expected satang`. A shared `priceMap()` (`api/_stripe.js`) refuses any configuration
where one price grants two plans: identical Paid and Premium IDs, or a current price listed in the other plan's
legacy list. Checkout answers `503 price_conflict` before any Stripe call, and the webhook grants nothing and returns
500 so Stripe retries after the fix. Regression test: `_checkout-price.test.js` (a cached ฿399 Paid verification is
re-checked and refused for Premium). A mutation that restores the old key makes it fail.

### 8.2 Release gate (restored)

`vercel.json` runs `node scripts/check-release-config.mjs && npm run build:app` again. A failure stops the build,
so no deployment is created and the current one keeps serving. The output names two stages separately:

| Stage | Checks | Network |
|---|---|---|
| Build configuration | required settings per environment; Preview uses the isolated staging Supabase project and a Stripe test key behind Deployment Protection; Production has a live key, data-rights approval, terms and privacy URLs, cron and AI keys; each Stripe price grants one plan | none |
| Live Stripe integration | Paid and Premium prices exist in the configured account, in the right mode, active, THB, monthly, licensed, exactly 39,900 / 59,900 satang, on different products. A Stripe outage, 5xx, unreadable answer or missing key holds the build (it used to pass) | Stripe API, read-only |

Only setting names are printed. A passing check is configuration evidence, not a billing test: it cannot see
the webhook endpoint, the portal configuration or a real checkout.

**Effect today (read from Vercel setting names):**
- **Production** has no `SITE_URL`, `COMMERCIAL_DATA_APPROVAL`, `VITE_TERMS_URL` or `VITE_PRIVACY_URL`.
  Its Premium price is not ฿599 (see 8.5). If PR #19 is merged as it is, the Production build fails and the
  current deployment `dpl_8arkS4JSoBp7tJ2ZEZzZhVsG9ZQ8` (`b9ce696`) keeps serving. Every later merge to `main`
  is held the same way until these are set.
- **Preview of this branch:** the staging variables (`SUPABASE_URL`, test `STRIPE_SECRET_KEY`, `SITE_URL`,
  `PREVIEW_ACCESS_PROTECTED`, project refs) are scoped to `audit/full-system-repair`. A Preview built from this
  branch is therefore held until they are scoped to it too.

### 8.3 Pricing presentation (fixed)

The React Plans page and the classic card now show exactly three priced cards: Free ฿0, Paid ฿399 and Premium ฿599.
The demo is a separate strip, "a free preview, not a plan". The classic card's "One terminal, four levels" text,
which also listed the AI analyst as Premium-only, is replaced with text that matches the matrix. Checked in a browser
against the built `public/` folder, and pinned by `_pricing-presentation.test.js`. Translations in `public/i18n`
still contain the old classic sentence, so the new English text shows untranslated until they are regenerated.

### 8.4 Council reports after a downgrade

| Path | Result |
|---|---|
| `GET /api/state` | withheld from the response, not deleted; the response is `no-store` (tested Premium → Paid on one account) |
| `/api/rag` ingest of a report | 402 |
| `/api/rag` status | reports counts by kind (a number), never content |
| Research agent retrieval | report chunks are filtered before evidence is built. It now fetches 8 candidates and keeps 4, so reports cannot crowd out the account's own documents. Tested through the real agent path with stubbed storage: no report text reaches the model |
| `/api/ai/council-v3` | 403 before any quota or cache lookup (tested: no cache request) |
| Portfolio analyst context (`_ctx.js`) | reads holdings and valuation history only, never `reports/*` |
| React `analysis/reports`, `/v3` reports pane | lock screen, or the Council module is never imported. The module's saved-reports list is now also shown only while the account is verified Premium |
| CDN or browser cache | every gated and state response is `no-store` or `private, no-store` |

**Limitations (accepted, documented):**
- Reports saved while Premium stay in that browser's local storage. Hydration never deletes local data. They
  are hidden in the interface but remain on the user's own device and appear in the user's own data export.
  This is the user's previously downloaded data; deleting it would destroy data the user created.
- The simulation engine and the Projection Lab data are public static files (section 4, BLOCKED).

### 8.5 Production billing: current state, cutover and rollback

The values below were read from Vercel. Plain settings were read directly; sensitive values were not decrypted.

- `STRIPE_LEGACY_PREMIUM_PRICES` (Production) = `price_1UcqQNQ0yLOm6KwFJRbgNC8n` (฿1,299, 18 Nov),
  `price_1UesDNQ0yLOm6KwFfD77FGmK` (the ฿599 candidate).
- The ฿699 price `price_1UesqhQ0yLOm6KwFvcO9Owwh` is in neither legacy list. So it is the current
  `STRIPE_PRICE_PREMIUM` (value sensitive, not read), matching the live `b9ce696` deployment ("Reprice plans to THB 399/699").
- `STRIPE_PRICE_PREMIUM` (Production) was last edited at the same time as that deployment.

**Do not change Production `STRIPE_PRICE_PREMIUM` while `b9ce696` is live.** Vercel applies settings at build time,
so a change does not reach the running deployment until a redeploy. Redeploying `b9ce696` with a ฿599 price would
advertise ฿699 and charge ฿599.

**Cutover (owner, one coordinated release):**
1. In the live Stripe dashboard, confirm `price_1UesDNQ0yLOm6KwFfD77FGmK`: Premium product (not the Paid product),
   active, THB, 59,900, monthly, licensed. If anything differs, create a new ฿599 monthly price on the Premium
   product instead. Do not edit or archive the ฿699 price: existing ฿699 subscriptions keep billing at ฿699.
2. Record the rollback anchor: the current Production deployment ID and its settings (names and plain values).
3. Set the Production settings in one sitting, without redeploying:
   - `STRIPE_PRICE_PREMIUM` = the verified ฿599 price.
   - `STRIPE_LEGACY_PREMIUM_PRICES` = `price_1UcqQNQ0yLOm6KwFJRbgNC8n,price_1UesqhQ0yLOm6KwFvcO9Owwh` (฿1,299 and ฿699).
     Remove the ฿599 ID from the legacy list; harmless, but it is now current.
   - `STRIPE_LEGACY_PAID_PRICES` unchanged.
   - Also set `SITE_URL`, `COMMERCIAL_DATA_APPROVAL`, `VITE_TERMS_URL` and `VITE_PRIVACY_URL`; the gate requires them.
4. Merge PR #19 only after the staged journey (8.6) passes. The merge triggers the Production build, and the gate
   checks every setting above against live Stripe. If it fails, nothing is deployed and `b9ce696` keeps serving
   with its original settings.
5. After the deployment is Ready: run the read-only smoke check. Open Plans while signed out and confirm three cards
   at ฿0/399/599. Start one Premium Checkout from a test account and confirm the Stripe page shows ฿599, then
   abandon it without paying. Watch `billing_sync_failed` and `billing_price_*` logs.

**Rollback:**
- Use Vercel Instant Rollback to the recorded deployment (`dpl_8arkS4JSoBp7tJ2ZEZzZhVsG9ZQ8`). A rolled-back
  deployment runs with the settings it was built with, so it again sells ฿699. Confirm this on the Plans page
  and the Checkout amount.
- Then put the Production settings back to the recorded values, so the next build cannot mix the old code with
  the new price.
- Webhooks keep working during the switch: both prices stay mapped to Premium in the new settings, and the
  old deployment knows the ฿699 price as current. A customer who bought ฿599 Premium during the window keeps
  Premium only if the ฿599 ID stays in `STRIPE_LEGACY_PREMIUM_PRICES` after rollback. It is there today; keep it there.
- Reconcile any `billing_sync_failed` events in Stripe before reopening sales.

### 8.6 Staged billing journey: BLOCKED (prepared)

| Prerequisite | State |
|---|---|
| Separate staging Supabase project | **PASS**: `lekha-staging` (`tnfmujnwjkxgjdqbdupb`), separate from production (`zlpnxn…`). It has `pt_profiles`, `pt_user_state`, `pt_rate`, `pt_rag_docs` and `pt_audit`, with RLS enabled (table list only) |
| Preview variables for this branch | **FAIL**: staging Supabase, test Stripe key, `SITE_URL` and protection flag are scoped to `audit/full-system-repair` only |
| Stripe TEST ฿399 / ฿599 prices | **BLOCKED**: no Stripe access here. The unscoped Preview Premium price on record is ฿1,299 (`STAGING_AUDIT_LOG.md`, 22 Nov); the gate will hold it |
| TEST webhook endpoint reaching the protected Preview | **BLOCKED**: needs Stripe dashboard and a Vercel automation bypass |
| TEST portal configuration (Paid ↔ Premium, cancellation) | **BLOCKED**: Stripe dashboard |

Owner steps, then the run (Stripe hosted test checkout, test card only):
1. Create TEST prices ฿399 (Paid product) and ฿599 (Premium product). Configure the TEST portal with both
   products, plan switching, and "cancel at end of billing period".
2. Scope the existing staging Preview variables to `feature/subscription-entitlements-399-599`, plus
   `STRIPE_PRICE_PAID`/`STRIPE_PRICE_PREMIUM` (TEST), the TEST `STRIPE_WEBHOOK_SECRET`, and `SITE_URL` = this
   branch's Preview alias. Redeploy; the build log must show both release stages passed.
3. Point a TEST webhook endpoint at `<preview>/api/billing/webhook`, through the protection bypass.

| Step | Expected |
|---|---|
| Sign up, confirm email (staging) | Free; `/api/auth/me` tier free; `macro/intel` locked; gated API 402 |
| Free → Paid (Checkout, test card) | `?billing=success` alone grants nothing; after the webhook, `pt_profiles.plan=paid`, `period_end` = Stripe `current_period_end`; Paid routes open; Council/simulation 402 |
| Paid → Premium (portal) | Immediate. Stripe prorates; `plan=premium` after `customer.subscription.updated`; `period_end` unchanged; Council works and saves a report |
| Premium → Paid (portal) | Effective when Stripe changes the subscription item. Immediate if the portal applies it now; at period end if it schedules it. Then `plan=paid`; `GET /api/state` withholds the report; council-v3 403; agent hides it |
| Cancel (portal, at period end) | `status` stays `active` with `cancel_at_period_end`; access continues until `period_end`. At period end `customer.subscription.deleted` sets `plan=free`; gated API 402 |
| Auth | every step with a fresh token; another account cannot read the first account's state; a forged `x-plan` header changes nothing |
| Replay | resend one event from Stripe: no change, 200 |

Record event IDs and timestamps; never record card data, keys or portfolio contents.

### 8.7 Result matrix

| Item | Result | Evidence |
|---|---|---|
| Cross-plan price cache reuse impossible | PASS (mocked) | `_checkout-price.test.js`; mutation caught |
| Identical Paid/Premium IDs rejected at runtime (checkout + webhook) and at build | PASS (mocked) | `_checkout-price.test.js`, `_release-config.test.js` |
| Release check enforced in the Vercel build | PASS (code); effect on Vercel NOT TESTED | `vercel.json`; `_release-config.test.js` asserts the command |
| Build checks separated from live Stripe checks; outage fails closed | PASS (mocked) | `_release-config.test.js` |
| No credentials printed | PASS | the script prints setting names only |
| Exactly three plan cards; demo separate; classic text corrected | PASS (local build, browser) | `_pricing-presentation.test.js`; browser on built `public/` |
| Downgraded account: state, RAG, agent, council-v3 cache, legacy views | PASS (mocked); browser NOT TESTED for downgrade | `_entitlements.test.js` section 9; mutations caught |
| Local copies and public simulation JavaScript | LIMITATION / BLOCKED | 8.4, section 4 |
| Separate staging Supabase | PASS (read-only metadata) | Supabase project list |
| Stripe TEST prices, webhook, portal | BLOCKED | no Stripe access |
| Free → Paid → Premium → Paid → cancel on staging | BLOCKED | 8.6 prerequisites |
| Production unchanged | PASS | no setting, deployment or merge made |
| Production ฿599 cutover | BLOCKED (owner) | 8.5 |
