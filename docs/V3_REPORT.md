# LEKHA Financials V3 — delivery report (2026-11-19)

Branch `claude/lekha-v3-development-949434` (from `origin/main` 57c1bde). Not pushed, deployed or merged. `/v2` unchanged (`git diff origin/main -- public/v2` empty).

## 1. Feature migration (V2 → V3)
| V2 feature | V3 location |
|---|---|
| KPIs, Summary (now 4 cards), Portfolio performance | My Portfolio → Overview |
| Your holdings editor + Import (PDF/CSV/screenshot), Holdings ledger | My Portfolio → Holdings |
| Risk (concentration, themes, AI exposure, drawdown alerts, movers) | My Portfolio → Risk |
| 1B Projection Lab (illustrative data) | Replaced by Intelligent Simulation on the real engine (horizons, fan, histogram, catalysts, table, export kept) |
| Rates, inflation & macro regime (+ Fear & Greed, regime models) | Macro → Macro Regime |
| Market rotation RSP/SPY | Macro → Market Rotation |
| Market intelligence (news) | Macro → Market Intelligence |
| Risk appetite XLY/XLP (+ VIX) | Macro → Risk Appetite |
| Intrinsic Value tab (all panels, method) | Deep Analysis → Intrinsic Value & MOS |
| — (new) | Deep Analysis → Holdings Deep Analysis |
| — (new) | Deep Analysis → LLM Council |
| AI Portfolio Analyst (Ask / Briefing / Simulate) + Council reports | Deep Analysis → AI Research Reports |
| Sector Rotation Intelligence + Right now | Sector Rotation → Right Now |
| Relative rotation graph | Sector Rotation → Rotation Graph |
| Leadership quality | Sector Rotation → Leadership Quality |
| Sector breadth + Overbought/oversold | Sector Rotation → Sector Breadth |
| Settings tab (account, plans, display, layout, import, admin costs) | Settings drawer in the header |
| 100 themes | Settings → Display (+ LEKHA Navy default, LEKHA Light) |
| Layout presets | Per-sub-tab layout kept; presets → "Start screen" (Portfolio first / Markets first) |
| Currency, language, refresh, demo, account | Header utility row |

## 2. Technical summary
- **Controlled migration:** `scripts/build-v3.mjs` reads `public/v2` and writes the V3 engine, CSS, settings/UI, themes and analyst files with named patches that must match exactly once. Classic calculations run unmodified; V2 drift fails the build instead of silently diverging.
- **Navigation:** `public/v3/lekha-shell.js` — 5 primary tabs, sub-tabs, `#/<tab>/<sub>` routes, persisted per user, keyboard arrows, redraw on show (classic charts measure width), Settings drawer. The classic `S.tab` is kept as an engine mode (`ov` / `val` / `set`) so existing render gates are untouched.
- **Simulation:** `core/engine.js` gained an additive `runStream`; `public/v3/sim-*.js` stream 10K–1M paths across up to 8 workers into fixed-bin histograms. Branded "LEKHA 1 BILLION SIMULATION ENGINE"; the completed path count shown is always the real one.
- **Council:** `POST /api/ai/council-v3` — one model request returns five perspectives + CEO verdict; Premium enforced on the server; cached; no fallback model. Demo/Free/Paid use `council-demo.json` (4 scenarios) with no AI calls.
- **Isolation:** V3-only storage keys (`ptpub.v1.v3.*`); holdings shared with V2 by design; demo data stays in `ptpub.v1.demo.*`.

## 3. Verification (dev server, sample portfolio)
| Check | Result |
|---|---|
| API tests (`node api/*.test.js`) | 19/20 pass; `_i18n.test.js` fails on origin/main too (requires moved `public/pt-i18n.js`) |
| Engine regression (`_council.test.js`, CouncilRun hash) | Pass |
| V2 ↔ V3 numeric parity, 29 shared panels (KPIs, summary, risk, macro, rotation, RRG, breadth, OBOS, leadership, ledger, holdings editor, valuation KPIs/table/missing/status) | 29/29 identical text, same session data |
| Direct navigation + reload on routes | Pass (portfolio, simulation, macro, analysis/value, analysis/council, analysis/deep, sector/rrg) |
| Council demo | 5 cards + CEO + report rendered; **0 `/api/ai` requests** |
| `council-v3` without Premium | HTTP 403 `premium_required` |
| One model call per Premium analysis | Unit test with stubbed model (exactly 1 call); live Premium run **not tested** (no Premium account locally) |
| Simulation | 100K auto-run (8 workers); Stop at 230,000/1,000,000 reported exactly; worst main-thread gap 51 ms; heap +13 MB; same seed reproduced identical median after reload |
| Data integrity | Demo session wrote 0 keys to the real `ptpub.v1.db.*` space; V2 saved tab restored and unchanged |
| V2 / root regression | `/v2`, `/`, `/v3` HTTP 200; `/v2` renders the same KPI value with no console errors |
| Responsive | 375 px and 768 px: no page-level horizontal scroll; phone header 89 px |

## 4. Known limitations
- Live Premium Council run not exercised in a browser; prompt quality unreviewed against real model output.
- Simulation events are volatility-only jumps (no directional lean); earnings dates are estimated slots, labelled as such.
- Beta is capped at 3.0 in the model (shown as "3.00+ (capped)" in Deep Analysis); AMD in sample data has a raw beta of 3.44.
- New V3 text is English-only (V2 dictionaries translate matching strings).
- Council connector lines are drawn for a 5-column row; approximate when the grid wraps.
- Deterministic fixture replay for parity (plan item) not built; parity was verified live with both versions on the same session data.

## 5. Preview
```
node scripts/dev-server.mjs 3456   # with keys from ~/.config/portfolio-terminal/keys.env (or preview "pt-dev")
open http://localhost:3456/v3?demo=1#/portfolio/overview
```
After any V2 change: `node scripts/build-v3.mjs`.

## 6. Production readiness
Ready to review on a Vercel preview deployment of this branch (`/v3` rewrite already exists in `vercel.json`). Needs approval before production: (1) a live Premium Council test and env review (`COUNCIL_V3_DAILY`, `COUNCIL_V3_MAX_TOKENS`, `ZAI_API_KEY`); (2) decision on server-side Premium enforcement for the older `/api/ai/{ask,briefing,simulate,council}` endpoints, which currently accept free/paid; (3) translations for new V3 strings; (4) merge to `main`.
