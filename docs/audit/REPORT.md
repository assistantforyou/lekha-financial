# LEKHA Financials engineering audit

**Production assessment: not ready for production sign-off.** The integrated branch builds and the tested local journeys pass. Two account-level failures were reproducible on the original source, and historical filings, model failover and AI evidence needed corrections. Live identity, billing, provider entitlements, deployed access policies and financial-model calibration still require independent evidence. The browser inventory covers a subset of possible states.

## Revision history

| Milestone | Git commit |
| --- | --- |
| Original fetched main | `2bf8853d11cc202ec1a03e0f45cead360aff0a1b` |
| Preserved audit work before synchronization | `cfe46b22afef7d87b2a790c4ee5169da55c31c0e` on `audit/checkpoint-before-main-sync` |
| Updated main | `73e359010b2190e92a1db14548525c6fea38c61c` |
| Integrated merge | `ac17ff26b965cd1040d0bd8756cbd8f4fc2ba123` |
| Repaired and tested code | `362740950c10ffb10719d7d3412de271897cda58` on `audit/full-system-repair` |

The merge incorporated 21 upstream commits across 41 files. Main independently fixed signed-in initialization, watchlist validation, council network failover and misleading AI summaries. The merge retained the upstream sortable watchlist, analyst screens, council questions, summary guards, chart and company routing work, and the audit's schema validation, circuit breaker, unit checks, duplicate-request protection and browser regressions. The unified app bundle was regenerated from source.

## PR #15 billing release check

**P1 resolved.** A signed checkout webhook returned HTTP 200 when the Supabase profile update returned HTTP 503 or matched zero rows. Stripe could treat delivery as complete while a paying account stayed on Free. The handler now requests the profile identifier in the PATCH response and acknowledges the event only after a successful write returns exactly one matching identifier. A write failure or missing confirmation returns HTTP 500 so Stripe can retry.

All seven webhook regression tests passed with local Stripe and Supabase fixtures. They cover successful and duplicate delivery, HTTP 503, a network exception, zero rows, a mismatched identifier, successful retry, creation, upgrade, cancellation, a late update and rejection of an invalid signature. The full suite passed across 33 test files, and the Node 24 production build passed. Live Stripe delivery and deployed Supabase access remain unverified. [Webhook regressions](../../api/_billing-webhook.test.js)

## Functional verification

| Feature | Initial status or reproduction | Repair | Final status and evidence |
| --- | --- | --- | --- |
| Signed-in data | Free, Paid and Premium sessions threw `async is not defined` before registering their market-data source | Integrated the upstream correction to the shared reader in `public/pt-datasource.js` | All three browser fixtures signed in and read a rotation dataset through the application adapter |
| Watchlist | Adding a ticker to an empty list crashed with `api is not defined` | Integrated the upstream import, validation, sorting, polling and error UI in `app/src/pages/watchlist.jsx` | Browser added SPY, read a fixture quote, reloaded, saw the provider outage and removed the ticker |
| Login translation and themes | A referenced translation script returned 404. The theme checker required a moved file | Fixed `login/login.html`, rebuilt its output, updated `scripts/check-themes.mjs` | Login loaded its translator. All ten language choices survived reload. All 104 unified themes were selected through the UI. The separate checker passed for 100 base themes |
| Council and generic AI failover | A timeout could exhaust the primary budget. The council suppressed most fallback cases. Syntactically valid objects could violate the requested schema | Updated `api/_llm.js` and `api/_h/ai/council-v3.js` | Real adapter code passed mocked timeout, stalled body, HTTP 401/429/500/503, malformed JSON, wrong shape/type, whitespace, dual failure, missing configuration and circuit tests. Both transports received the same evidence. One attempt per provider |
| Council quota and results | Concurrent equal requests could start duplicate generation. The UI reported one model request even after fallback | Coalesced in-flight calls by account, day, question, scope, evidence and language. Reported actual attempts | Handler fixtures verified one quota use for concurrent equal requests on the same instance, cache hits, and zero model calls below Premium. Browser verified a visible provider error, a labeled Gemini fixture response and saved report retrieval |
| Council interaction and isolation | Idle roles advertised expansion without content. Reports used a shared signed-in browser key. Anonymous knowledge was partitioned by network address | Scoped report storage by account and demo knowledge by an opaque per-session capability. Kept rate limiting separate. Added keyboard activation for completed roles | Five roles opened and closed by keyboard. Four labeled samples ran without an AI request. Namespace tests passed. Existing unscoped records were preserved and excluded from automatic reassignment |
| Historical financial statements | The fixture's original filing reported 100, a later amendment reported 105, and a March cutoff selected the April amendment | Filtered facts by actual filing date before selecting restatements. Removed estimated filing dates. Partitioned caches by cutoff in `api/_fin/providers/sec.js` and `api/_fin/service.js` | March selected 100 and its original filing date. A pre-filing cutoff returned no row |
| Returns, TTM and market risk | A missing cost basis produced a 1,000% return. Duplicate or missing quarters could form a four-row sum. Beta paired different trading dates | Updated `api/_fin/calc.js` and service callers | Known zero basis, incomplete cost/price coverage, quarter continuity and common-date beta passed deterministic checks |
| Units, prices and source age | Foreign quotes and statements carried USD units. Loading a shared cache entry restarted its freshness clock. An expired demo dataset was returned while a refresh was already available | Corrected schema units, guarded cross-currency comparisons, preserved cache timestamps and awaited the refreshed dataset | Schema, expiry, stale fallback and concurrent refresh fixtures passed. The fixed-date demo identifies its simulated sample and uses that dataset consistently |
| Evidence sent to the analyst | An $80 price against $100 intrinsic value produced a 25% margin of safety. Incomplete portfolios were described as totals. A price of 184.50 could support an AI claim of 18,450 | Repaired `api/_h/ai/_ctx.js` and `api/_fin/agent.js` | Prompt regression reports 20%, identifies priced subtotals and missing basis, and labels simulated prices. Numerical evidence tests reject unsupported scale and direction |
| Simulation | Stopping before the first worker chunk completed triggered an undefined-horizon exception | Guarded the zero-path outcome in `public/v3/lekha-sim.js` | Browser ran 100,000 paths, reran 10,000, checked JSON counts and ordered percentiles, exported SVG and cancelled a million-path request. Runner tests verified deterministic seeds, chunk merging, duplicate rejection, hard cap and partial completion |
| Navigation and company workspace | New upstream routing and tabs could invalidate earlier UI results | Built from merged sources and exercised the changed routes | All 29 visible demo sidebar destinations selected the intended page. Nine additional company tabs changed URL, selection and visible panel under an unavailable-provider fixture. Mobile navigation opened at 390 px |

## Architecture and inventory

The unified React shell at `/` mounts React screens and classic panels under one navigation tree. `/v2` is the classic application. `/v3` is the generated terminal with hand-written simulation and council modules. `/login.html` and `/auth-callback.html` handle account entry and callbacks. The build combines classic panel generation and two Vite builds. Vercel rewrites grouped API requests into serverless handlers. The local server exercises the same handler modules.

| API surface | Routes or operations |
| --- | --- |
| Financial data | `/api/data/{search,quote,quotes,history,intraday,movers,company,profile,statements,facts,filings,news,earnings,estimates,peers,ratios,valuation,macro,fx,calc,agent,diag}` |
| Free and Alpha Vantage | Both groups expose health, CSV, document and collection handlers. The free group also serves quotes, extras, street, status and demo datasets |
| AI | `/api/ai/{ask,briefing,simulate,council,council-v3}` and statement extraction at `/api/parse-positions` |
| Accounts and persistence | Auth setup, signup, login, refresh, logout, recovery, password, email, deletion, preferences and current user. `/api/state` stores account documents. `/api/rag` handles document, holding and filing retrieval/indexing |
| Billing and operations | Stripe checkout, portal and webhook. Admin cost reporting. Scheduled flows and three scheduled insider runs in `vercel.json` |

Supabase supplies authentication, account state, billing state, cache, quotas, cost logs and pgvector storage. Financial providers include SEC EDGAR, FRED, Alpaca, Yahoo, Twelve Data, Alpha Vantage, Frankfurter, CoinGecko, RSS, FMP and Finnhub. The AI adapter handles narrative generation and extraction. Gemini embeddings remain a separate retrieval dependency. Scan imports retain parallel independent readers when both are configured. No AI response supplies a replacement price to the market-data provider chain.

**Control coverage.** The main browser run recorded 3,333 visible control instances across 59 snapshots. The inventory grouped instances by URL pathname, tag, element ID and label. Of 854 distinct signatures, **191 (22.4%)** had an individually recorded passing interaction. Shared controls recur across snapshots, and controls with identical labels and no ID can share a signature. The runner passed 82 named checks, some covering several controls, with zero uncaught page errors. The nine company tabs are recorded separately. The remaining observed controls and undiscovered dynamic or role-specific states carry no passing claim. [Browser inventory and checks](browser.json) · [Company tabs](company-tabs.json)

## Validation scope and remaining work

- Node 24 production build and all 32 test files ran on the integrated source. The localization suite passed for 1,733 keys across nine translations. The standalone i18n and base-theme checks passed. npm audit reported zero known advisories for the resolved dependency tree.
- Deterministic fixtures covered FX conversion, portfolio weights, profit and loss, growth, margins, WACC, CAPM, DCF, beta, volatility, drawdown, factor calculations and several market-data mappings. Historical comparables, FX assumptions, macro revisions, long-run forecast calibration and all provider-specific units still lack comprehensive independent benchmarking.
- The simulation's billion-path product name exceeds the per-run cap of one million. Verification used actual counts. The million-path browser exercise tested cancellation. A full million-path resource profile, memory endurance and cross-browser performance remain unmeasured.
- Live Z.ai and Gemini completion, model availability, production quotas, live SEC and other provider coverage, Supabase policies and Stripe webhook delivery remain unverified. The cloud environment lacked the relevant credentials. Its outbound proxy returned 403 on a read-only request to the supplied production domain. There is no observation of production availability from that request.
- Browser evidence includes expected missing-service responses from account setup, knowledge storage, news and movers, plus an injected watchlist outage. External font requests also encountered network restrictions. Zero uncaught JavaScript errors does not establish successful external requests.
- Historical company statements now require an actual published filing at or before the cutoff. The demo uses explicitly simulated portfolio inputs. Private reports saved under the former shared key require a verified owner before migration. Provider failover and request coalescing were tested in a single server process. Distributed quota, concurrency, recovery and provider latency need staging validation.
- Remaining high-value journeys include real account recovery and persistence with throwaway accounts, account switching across devices, statement upload against authorized providers, sandbox billing, live council provenance, cron execution with representative storage, and keyboard/mobile coverage for the remaining controls.
