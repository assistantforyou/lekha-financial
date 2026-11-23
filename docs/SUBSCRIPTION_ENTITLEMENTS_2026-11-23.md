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
3. **Release check.** Run `node scripts/check-release-config.mjs` with the target environment's variables before
   deploying, or restore it to the Vercel build command (it was removed in `404ef49`).
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
