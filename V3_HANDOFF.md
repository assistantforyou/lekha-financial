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

## Done by parallel sessions (uncommitted when this checkpoint was written — verify, then commit)
- `public/v3/council-demo.json` — 4 deterministic demo scenarios (session finished; committed in this checkpoint).
- Council backend `api/_h/ai/council-v3.js`, `api/ai.js` route, `api/_llm.js` options, `api/_councilv3.test.js` — session `local_d92696cb…` was still working.
- Simulation core `public/core/engine.js` (additive `runStream`), `public/v3/sim-aggregate.js`, `sim-runner.js`, `sim-stream.worker.js`, `api/_simstream.test.js` — session `local_a89e9f18…` was still working.
  → Before committing those: run `for f in api/*.test.js; do node $f; done` and `node scripts/check-i18n.mjs`; confirm `api/_council.test.js` still passes (engine regression).

## Remaining tasks (in order)
1. **Commit the two sessions' work** after tests pass (see above).
2. **`public/v3/lekha-sim.js`** (export `mount(host)`): UI for "LEKHA INTELLIGENT SIMULATION / 1 BILLION SIMULATION ENGINE" using `sim-runner.js`; input built from `PT_APP.S` (weights from `PT_APP.lekha.positions()/aggregate()`, vol/beta from `S.hist`, rf = live 10Y `S.tnx`, FGI/VIX); events from `/core/calendar.js` (FOMC/CPI/jobs scheduled; earnings confirmed vs **estimated**, labelled). Horizons 21D/1M/3M/6M/1Y, presets 10K/100K/1M (hard cap), Stop, fan chart P5–P95/P25–P75/median, histogram, catalyst markers, stats (P gain/loss, mean/median, VaR/CVaR 5%, drawdown), five-horizon table, JSON/SVG export. **Show the real completed path count in Execution details; never label 1M as 1B** (user asked for this; declined as misleading — the brand name stays).
3. **`public/v3/lekha-council.js`**: five judge cards (Investor, Analyst, Pessimist, Allocator, Optimist) + thin SVG lines → CEO node → "LEKHA INVESTMENT INTELLIGENCE REPORT". Premium (`window.PT_TIER==="premium"` and not `PT_DEMO_MODE`): one `PT_AUTH.fetch("/api/ai/council-v3")` on the explicit button only. Everyone else: `council-demo.json`, label "SIMULATED DEMONSTRATION — NOT LIVE ANALYSIS", **zero** `/api/ai` calls, subtle upgrade link. Copy: "Five perspectives · one CEO synthesis" (never "five models"). Save reports in `ptpub.v1[.demo].v3.council` (last 20) and list them in `#lekha-reports` (AI Research Reports tab, which already hosts the migrated AI Analyst `#v3-ai-host`).
4. **`public/v3/lekha-deep.js`**: holding selector from `PT_APP.lekha.positions()`, price chart, P&L, valuation (`PT_APP.lekha.computeVal()` then `S.vres.res[tk]`), factor detail (`ldDetail`), risk, ticker news from `S.news`, analyst block via `POST /api/free/street`, "Ask the Council" (pre-fills question + `LEKHA_SHELL.go("analysis/council")`, no request).
5. Visual polish: header utility row on mobile (currently wraps to 2–3 rows), panel spacing, check Light theme.
6. Verification still to do (plan §Verification): parity harness (`scripts/record-fixtures.mjs`, `PT_FIXTURES` replay in dev-server, `public/v3/dev/parity.html`), data-integrity snapshot V2↔V3, simulation timing/memory/cancel, council 403s + single-request + zero demo calls, 375/768px responsive, `/v2` and `/` regression in browser.
7. Deliverables report (migration table is in the plan; add verification results + production-readiness).

## Known issues / notes
- Analyst forked from V2 still says "AI Portfolio Analyst" and polls tier like V2; Premium briefing loads when the Briefing tab is clicked (acceptable; verify it never fires on boot).
- `.git/objects/pack/._*` AppleDouble files on the external SSD print "non-monotonic index" warnings on every git command — harmless.
- V2 bugs found, intentionally not fixed (V2 frozen): projection JSON relative path 404 on `/v2`; `pt-state` events dispatched on `window` but V2 listens on `document` (fixed in V3 copies); existing `/api/ai/{ask,briefing,simulate,council}` don't enforce Premium server-side.
- New V3 strings are English-only; avoid core `t()` in `public/v3` or add keys (check-i18n scans `public/v3`).

## Preview
```
preview_start pt-dev   (or: node scripts/dev-server.mjs 3456 with keys from ~/.config/portfolio-terminal/keys.env)
open http://localhost:3456/v3?demo=1#/portfolio/overview
```
