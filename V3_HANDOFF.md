# LEKHA Financials V3 — handoff (checkpoint 2026-11-19)

Branch: `claude/lekha-v3-development-949434` (worktree), based on `origin/main` 57c1bde. Not pushed, not deployed, not merged.
Approved plan: `~/.claude/plans/pull-from-main-eager-peach.md` (the full spec; read it before continuing).
V2 (`/v2` = classic terminal, `public/v2/*`) is **untouched**: `git diff origin/main -- public/v2` is empty. (Local `main` ref is stale; compare against `origin/main`.)

## How V3 is built
- `node scripts/build-v3.mjs` regenerates V3 from V2 sources: it reads `public/v2/index.html`, `pt-ui.js`, `pt-themes.js`, `pt-analyst.js` and writes
  `public/v3/{index.html, lekha-base.css, lekha-engine.js, lekha-account.js, lekha-ui.js, lekha-themes.js, lekha-analyst.js}`.
  Each change to classic code is a named `patch()` that must match exactly once, so V2 drift fails loudly. **Never hand-edit generated files**; edit the patch or `public/v3/src/index.template.html`.
- Hand-written V3 files: `public/v3/src/index.template.html` (shell + `<!--@fragment-->` slots for classic panels), `lekha-shell.js` (5 tabs, sub-tabs, hash routes `#/<tab>/<sub>`, redraw-on-show, Settings drawer, 4-card summary), `lekha-v3.css` (LEKHA navy/white/amber tokens), `lekha-modules.js` (loads optional ES modules `lekha-sim.js`, `lekha-council.js`, `lekha-deep.js`; shows a notice if missing).
- Engine mode: classic `S.tab` stays `"ov"|"val"|"set"`; the shell maps `analysis/value` → `"val"`, the Settings drawer → `"set"`, everything else → `"ov"`. Classic `setTab()` now asks `LEKHA_SHELL.engineTab()` first.
- V3-only storage keys (never overwrite V2's): `ptpub.v1.v3.route`, `ptpub.v1.v3.route.<tab>`, `ptpub.v1.v3.start`, `ptpub.v1.v3.layout`, `ptpub.v1.v3.theme`. Holdings/user docs are the same `ptpub.v1.db.*` / `ptpub.v1.demo.db.*` as V2 (shared on purpose).
- Logo: `public/v3/brand/lekha-logo-master.png` (supplied artwork, untouched) → `lekha-logo-white.png` / `@2x` (alpha from luminance, pure white, transparent; verified crisp on navy).

## Done and verified (browser, `/v3?demo=1`, dev server `pt-dev`)
- Five primary tabs + sub-tabs render; direct navigation to `#/sector/rrg`, `#/analysis/value`, `#/macro/regime` works; breadcrumb and title update.
- Classic engine runs unmodified in V3: KPIs, summary (now 4 cards: assessment / drivers / risks / market context, same sentences as V2), performance chart, RRG, Intrinsic Value (`val` mode, table + charts), macro chart redrawn at real width (not the 760px hidden fallback).
- `node --check` passes on all generated scripts.

## Done by parallel sessions — committed in 8a29b6e (all api tests pass except `_i18n.test.js`, which was already broken on origin/main: it requires `public/pt-i18n.js`, moved to `public/v2/` by the V1/V2 swap)
- `public/v3/council-demo.json` — 4 deterministic demo scenarios (session finished; committed in this checkpoint).
- Council backend `api/_h/ai/council-v3.js`, `api/ai.js` route, `api/_llm.js` options, `api/_councilv3.test.js` — session `local_d92696cb…` was still working.
- Simulation core `public/core/engine.js` (additive `runStream`), `public/v3/sim-aggregate.js`, `sim-runner.js`, `sim-stream.worker.js`, `api/_simstream.test.js` — session `local_a89e9f18…` was still working.
  → Before committing those: run `for f in api/*.test.js; do node $f; done` and `node scripts/check-i18n.mjs`; confirm `api/_council.test.js` still passes (engine regression).

## Feature screens — built and checked in the browser (demo)
- `lekha-sim.js`: real engine via `sim-runner.js`; input from `PT_APP.S` (1Y beta/vol vs S&P from page history, live 10Y, FGI); FOMC/CPI/jobs = scheduled, earnings = estimated; fan, histogram, risk table, all-horizons table, catalysts, execution details (true completed count), JSON/SVG export; auto-runs 100K once on first visit. Verified: 100,000 paths, 8 workers. Publishes `window.LEKHA_SIM_LAST` for Council evidence.
- `lekha-council.js`: five judge cards → CEO → report from ONE response. Premium = one `POST /api/ai/council-v3` on click; others = `council-demo.json`, verified **zero `/api/ai` requests** in demo. Reports list in AI Research Reports (live reports saved per namespace, + 4 samples). `window.LEKHA_COUNCIL.prefill(q, scope)`.
- `lekha-deep.js`: holding picker, price chart, position, risk, valuation (from Intrinsic Value results), analysts (`/api/free/street`, signed-in only), headlines, "Ask the Council" (prefill only, no request).

## Remaining tasks (in order)
1. ~~Commit the two sessions' work~~ done (8a29b6e). Simulation core measured: 1,000,000 paths in ~11.4 s on 8 workers, main thread not blocked. Read `public/v3/sim-runner.js` header for its API and `api/_h/ai/council-v3.js` header for the request/response contract.
2. ~~lekha-sim.js~~ done. Original spec kept for reference: **`public/v3/lekha-sim.js`** (export `mount(host)`): UI for "LEKHA INTELLIGENT SIMULATION / 1 BILLION SIMULATION ENGINE" using `sim-runner.js`; input built from `PT_APP.S` (weights from `PT_APP.lekha.positions()/aggregate()`, vol/beta from `S.hist`, rf = live 10Y `S.tnx`, FGI/VIX); events from `/core/calendar.js` (FOMC/CPI/jobs scheduled; earnings confirmed vs **estimated**, labelled). Horizons 21D/1M/3M/6M/1Y, presets 10K/100K/1M (hard cap), Stop, fan chart P5–P95/P25–P75/median, histogram, catalyst markers, stats (P gain/loss, mean/median, VaR/CVaR 5%, drawdown), five-horizon table, JSON/SVG export. **Show the real completed path count in Execution details; never label 1M as 1B** (user asked for this; declined as misleading — the brand name stays).
3. ~~lekha-council.js~~ done. Spec: **`public/v3/lekha-council.js`**: five judge cards (Investor, Analyst, Pessimist, Allocator, Optimist) + thin SVG lines → CEO node → "LEKHA INVESTMENT INTELLIGENCE REPORT". Premium (`window.PT_TIER==="premium"` and not `PT_DEMO_MODE`): one `PT_AUTH.fetch("/api/ai/council-v3")` on the explicit button only. Everyone else: `council-demo.json`, label "SIMULATED DEMONSTRATION — NOT LIVE ANALYSIS", **zero** `/api/ai` calls, subtle upgrade link. Copy: "Five perspectives · one CEO synthesis" (never "five models"). Save reports in `ptpub.v1[.demo].v3.council` (last 20) and list them in `#lekha-reports` (AI Research Reports tab, which already hosts the migrated AI Analyst `#v3-ai-host`).
4. ~~lekha-deep.js~~ done. Spec: **`public/v3/lekha-deep.js`**: holding selector from `PT_APP.lekha.positions()`, price chart, P&L, valuation (`PT_APP.lekha.computeVal()` then `S.vres.res[tk]`), factor detail (`ldDetail`), risk, ticker news from `S.news`, analyst block via `POST /api/free/street`, "Ask the Council" (pre-fills question + `LEKHA_SHELL.go("analysis/council")`, no request).
5. Visual polish: header utility row on mobile (currently wraps to 2–3 rows), panel spacing, check Light theme.
6. ~~Verification~~ done 2026-11-19, results in `docs/V3_REPORT.md`. Not done: live Premium council run, fixture-replay parity harness. Original list: (plan §Verification): parity harness (`scripts/record-fixtures.mjs`, `PT_FIXTURES` replay in dev-server, `public/v3/dev/parity.html`), data-integrity snapshot V2↔V3, simulation timing/memory/cancel, council 403s + single-request + zero demo calls, 375/768px responsive, `/v2` and `/` regression in browser.
7. ~~Deliverables report~~ `docs/V3_REPORT.md`. (migration table is in the plan; add verification results + production-readiness).

## Known issues / notes
- Beta clamp at 3.0 (lekha-sim.js `riskOf`) is real data, not misalignment (AMD sample raw beta 3.44); Deep Analysis shows it as capped.
- Council: live Premium path not exercised in a browser (no Premium test account here); backend covered by `api/_councilv3.test.js`. Connector lines are drawn for 5 columns; at 3-column widths they are approximate.
- Simulation: earnings/macro events have no directional lean in V3 (sigma-only jumps, labelled as a model assumption).
- Analyst forked from V2 still says "AI Portfolio Analyst" and polls tier like V2; Premium briefing loads when the Briefing tab is clicked (acceptable; verify it never fires on boot).
- `.git/objects/pack/._*` AppleDouble files on the external SSD print "non-monotonic index" warnings on every git command — harmless.
- V2 bugs found, intentionally not fixed (V2 frozen): projection JSON relative path 404 on `/v2`; `pt-state` events dispatched on `window` but V2 listens on `document` (fixed in V3 copies); existing `/api/ai/{ask,briefing,simulate,council}` don't enforce Premium server-side.
- New V3 strings are English-only; avoid core `t()` in `public/v3` or add keys (check-i18n scans `public/v3`).

## Preview
```
preview_start pt-dev   (or: node scripts/dev-server.mjs 3456 with keys from ~/.config/portfolio-terminal/keys.env)
open http://localhost:3456/v3?demo=1#/portfolio/overview
```

## Merge-readiness check (PR #2)
- GitHub checks: all passed; branch merges cleanly into `main`. Vercel preview: Ready, `/v3` loads.
- Live Premium Council: **BLOCKED**. `ZAI_API_KEY` exists locally, but there is no Premium test account (no Premium email/password configured); none was created. To unblock: sign in on the Vercel preview (or local `/v3`) with a Premium account, open Deep Analysis → LLM Council, run one short question, and confirm five perspectives + CEO render with `meta.llmRequests: 1`.

## Live Premium Council test (local, 2026-11-19) — FAIL, one request made
- Setup: the owner's verified account was given local-only admin (= Premium) via the dev-server start command; override removed afterwards (`.claude/launch.json` reverted, server stopped). Production, Supabase, Stripe untouched.
- Result: one `POST /api/ai/council-v3` (scope NVDA) → HTTP 502 `upstream` after ~21 s; frontend correctly showed the error and five "Unavailable" cards. Auth + Premium gate + single request: PASS. Model response: FAIL.
- Likely cause (unconfirmed, the error was not logged): output truncated at `COUNCIL_V3_MAX_TOKENS` default 2400 → invalid/empty JSON. Error logging added (`console.error("council-v3 failed: …")`).
- Next: raise the default to ~4000 (or set env `COUNCIL_V3_MAX_TOKENS`), then run ONE more live request and read the log line.
- Manual cleanup: unconfirmed Supabase auth user `pt-admin-test@example.com` (created by a local signup attempt) — delete in Supabase → Authentication → Users.
