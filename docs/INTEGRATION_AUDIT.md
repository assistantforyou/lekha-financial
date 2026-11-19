# Integration audit (2026-11-19)

Scope: every part of the app that touches financial data, before the unified data layer (`api/_fin/`) was added.

## 1. What exists today

| Area | State |
|---|---|
| Frontend | Three UIs on one origin: `/` (modular "main" skin), `/v2` and `/v3` (classic engine, ~250 KB of global-state JS rendering DOM panels). Login page is React + shadcn. No shared data client: each UI calls `/api/free/*` through its own code. |
| API shape | Vercel Hobby = max 12 functions. Group routers: `free`, `av`, `billing`, `cron`, `ai`, `auth/[action]`, `state`, `admin/costs`, `parse-positions` (9 used). `_router.js` maps `/api/<group>/<rest>`. |
| Database | Supabase: `pt_profiles`, `pt_costs`, `pt_cost_fixed`, `pt_user_state` (RLS on, service role only) and the cache tables `pt_av_cache`, `pt_av_budget` plus RPCs `pt_rate_hit`, `pt_av_spend`. |
| Auth | Supabase GoTrue through `/api/auth/*`, tokens in `localStorage`, tier resolved server side (`_tiers.js`, `requireTier`). Tiers: demo, free, paid, premium. |
| Prices | Alpaca IEX (primary), Twelve Data (fallback), Yahoo chart (non-US, unofficial), FRED CSV (keyless), Frankfurter FX. |
| Fundamentals | SEC EDGAR `companyfacts`/`submissions` (keyless) through `_edgar.js` + `_fundamentals.js`; used for valuation, peers (S&P 500 EPS), insiders. |
| Estimates / analysts | Alpha Vantage (22 calls/day budget), FMP price targets and Finnhub recommendations **only if keys are set** (neither is set locally or, per notes, in production). |
| News | Public RSS (CNBC, MarketWatch, Fed, BBC, Nasdaq, Seeking Alpha) + Yahoo per-ticker RSS, AI only labels/summarises, never invents links. |
| Macro | FRED keyless CSV (CPI, Fed funds, 10Y, ...) feeding the Macro Regime panel. |
| Flows | CFTC Socrata, Treasury TIC, SSGA/iShares ETF shares, SEC insiders/13F. All keyless. |
| AI / LLM | `_llm.js`: Z.ai GLM primary, Gemini fallback, usage logged to `pt_costs`. `ai/ask` answers only from server-built portfolio context. Council-v3 is one call with a demo fallback. |
| Caching | `_lib.cached()` Supabase-backed (stale-while-error, 30 min failure backoff), per-instance memory caches in a few handlers, and a client-side `core/cache.js`. No shared TTL policy; no hit-rate accounting. |
| Search | None beyond local ticker fields. No company page, no filings browser, no watchlist. |
| Calculations | Scattered: valuation (DCF/RIM) inside the classic engine, risk/vol in `_vol.js`/engine. No reusable, tested calculation module. |
| Charts | Hand-rolled SVG in the classic engine and the sim/council modules. |
| MCP | Dev-time only (GitHub, Supabase, Vercel, Alpha Vantage URL in `keys.env`). The product does not depend on any MCP. |
| Env vars in use | `SUPABASE_*`, `ALPACA_*`, `TWELVEDATA_API_KEY`, `AV_API_KEY`, `ZAI_API_KEY`, `GEMINI_*`, `NEWS_MODEL`, `FMP_API_KEY`, `FINNHUB_API_KEY`, `SEC_USER_AGENT`, `STRIPE_*`, `ADMIN_EMAILS`, `CRON_SECRET`, `PT_IMPORT_PASSCODE`. |

## 2. Redundancy and risk found

* **Three overlapping price paths** (`_prices.js`, `_intl.js`, `quotes.js`) with their own fallbacks and no common schema.
* **Two SEC User-Agents**: `_edgar.js` sends a contact-less string (SEC may 403 it; `_insiders.js` already documents that), `_insiders.js` sends a declared contact.
* **Units are implicit**: XBRL values arrive in USD, the classic engine mixes millions and per-share values by convention.
* **Cache has no policy**: TTLs are hard-coded per call site; nothing reports hit rate.
* **AI context is portfolio-only**: `ai/ask` cannot answer "why did NVDA fall today?" because it has no price move, news, filings or macro tools, and its answers carry no citations.
* **No provider health view**: failures are swallowed (`cached()` returns stale), so an outage is invisible.
* **Alpha Vantage budget (22/day) is shared** with valuation/estimates; any new feature that spends it would starve existing ones.

## 3. Missing capabilities (user value ranked)

1. Company workspace (profile, price chart, statements, ratios, filings, news, earnings, peers) on one normalized data model.
2. Universal search (company, ticker, ETF, index, crypto, concepts, filings, news).
3. Source-aware AI with tools and citations that separates fact / calculated / interpretation / speculation.
4. Deterministic calculation engine (CAGR, growth, margins, ROE/ROIC, FCF yield, P/E, EV/EBITDA, PEG, DCF, WACC, beta, Sharpe, drawdown, volatility, portfolio math).
5. Macro dashboard the AI can reference (rates, CPI, PPI, unemployment, GDP, yields, sentiment, M2).
6. News service with dedupe and per-company/market/earnings/M&A/regulatory/macro routing.
7. Provider diagnostics (latency, error rate, cache hit rate, tool-call failures, token use).
8. Watchlist.

## 4. Integration decisions (cost, legality, reliability)

| Provider | Decision | Why |
|---|---|---|
| **SEC EDGAR** | **Primary fundamentals + filings.** Keyless, official, public domain. Needs a declared `SEC_USER_AGENT`; 10 req/s. | Authoritative reported numbers; already used. |
| **FRED** (St. Louis Fed) | **Primary macro.** Keyless CSV; optional `FRED_API_KEY` upgrades to JSON API. | Free, official. Some series (e.g. UMCSENT) carry third-party notices: attribute, no resale. |
| **Alpaca IEX** | Primary US quotes/history (already keyed, free). | Real-time IEX, free. Not consolidated tape. |
| **Yahoo (unofficial)** | Fallback quotes, non-US prices, search, per-ticker RSS. | Keyless but **personal-use / unofficial**: flagged in diagnostics, must be replaced before commercial redistribution. |
| **Twelve Data** | Fallback history (already keyed). | Existing. |
| **Frankfurter** | FX (ECB reference rates), keyless. | Free, open. |
| **CoinGecko** | Crypto quotes/history, keyless demo tier. | Free; attribution required. |
| **FMP** | **Optional**, activates with `FMP_API_KEY` (statements, ratios, estimates, transcripts, screener, profile). Provider is replaceable. | Free tier is tiny (≈250 calls/day) and **display licensing needs the paid plan**. Not required. |
| **Finnhub** | **Optional**, activates with `FINNHUB_API_KEY` (quote, company news, earnings calendar, recommendations). | Free tier 60 calls/min; display of data to end users needs a licence on paid tiers. |
| **Alpha Vantage** | Last-resort fallback only (macro/FX/crypto/indicators). Budget-guarded, never first choice. | 25 calls/day free. |
| **Massive / Polygon** | **Not added.** | Only valuable for intraday trades, options and WebSockets, which the app does not need yet; paid. |
| **NewsAPI / paid news** | Not added. | RSS + optional Finnhub already cover company/market news; NewsAPI forbids production use on the free plan. |
| **MCP servers** | Not integrated into the product. | Direct HTTP gives control over caching, units and fallbacks. Official MCPs are evaluated for developer tooling only. |

Minimum set implemented: **SEC, FRED, Alpaca, Yahoo, Twelve Data, Frankfurter, CoinGecko, RSS** (all free) + **optional FMP, Finnhub, Alpha Vantage** behind keys.
