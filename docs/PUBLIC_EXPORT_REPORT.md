# Portfolio Terminal: Public Edition export report (15 Nov 2026)

Deliverable: `portfolio-terminal-public.html` (single self-contained file, 277 KB, opens directly in a browser).

## 0. Separation from the private version

- The export was built from a **byte copy** of the private page source. The copy's SHA-256 (847d4704…) is identical to the private source before and after the build.
- Nothing was published or written to the private artifact. Its live version is the same before and after the export (1794720684-4470).
- The private Google Sheets, database, scheduled tasks and portfolio history were only read for the scan. None were changed.
- The public file has no connection to any of them (details in section A).

## A. Privacy audit

**Removed from the exported code**
- Owner name in the page title, broker labels and broker-specific messages.
- The share-count note tied to a dated private snapshot.
- Ten private Google Sheet IDs and every link to them. They are replaced by neutral dataset keys (ROTATION, BREADTH, RISK, OBOS, FACTOR, PEER, VOLATILITY, VALIN, HISTORY, ENGINE).
- All calls to the Claude platform database and connector. They go to a local adapter instead, so the file cannot reach the private database even if it is opened inside Claude.
- Special handling for a specific owned gold fund and a Hong Kong listing; HKD listings are now handled generically.
- Valuation overrides keyed to owned tickers.
- Help text that named owned securities.
- Listeners for the private price-engine snapshot and the gold NAV.
- The schedule-specific news text.

**Was never embedded**
- The private page loaded all holdings, values and history at runtime. No holdings, quantities, costs, cash, gold, totals, snapshots or transactions existed in its code.
- In the export, every portfolio field starts empty. No demo or sample portfolio ships with it.

**Storage isolation**
- Everything is stored in localStorage under the `ptpub.v1.` namespace. No cookies, no IndexedDB.
- The private page's unprefixed keys (`cur`, `tab`, …) are never read.

**Tests run** (automated, reproducible):
- `privacy_scan.py` checks the export for:
  - identifier and connection strings
  - sheet-shaped IDs
  - 289 private numbers (every share count, cost, value and total from the private engine export, plus snapshot totals)
  - any reference to an owned ticker outside public index lists
  - embedded numeric datasets

  Result: **PASS**.
- Control tests on the scanner itself:
  - On the private source it reports 61 findings.
  - With one private portfolio total planted in the export, it fails.

  So it does detect leaks.
- Browser run (Playwright, file opened directly):
  - Network requests: `fonts.googleapis.com` only.
  - Cookies: none.
  - localStorage: only `ptpub.v1.*` keys.
  - Runtime errors: none.

**Remaining concerns**
- AI-theme names and default valuation assumptions reflect the original design choices. They are generic and not financial data.
- Some help text still names the original data vendors (e.g. "Google Finance via the Valuation Inputs sheet"). These are not private, but they describe the original pipeline.

## B. Feature preservation

| Feature | Status |
|---|---|
| Tabs, layout, design, dark mode, mobile layout | Preserved and operational (tested desktop, 390 px, dark) |
| Portfolio: add/update/remove holdings, cash, USD/THB/HKD, value, P&L, weights, themes, risk bars, alerts | Preserved and operational, using the customer's own entries and manual prices; reuses the original calculation code (tested: 3 synthetic holdings → $1,750 total, $150 P&L, 5.7% cash, all correct) |
| Daily change, performance vs S&P/Nasdaq, drawdown from peak | Preserved; needs a price and history source (shows "needs daily prices" without one) |
| Rates and inflation, regime probabilities | Preserved; needs a market-data source |
| Market rotation, RRG, breadth, OB/OS, risk appetite, VIXEQ − VIX | Preserved; needs a market-data source |
| Leadership quality (factor model, revisions) | Preserved; needs a market-data source |
| Capital flows (13F, ETF flows, insiders, CFTC, TIC) | Preserved; needs a market-data source |
| Intrinsic value (DCF/MOS) | Preserved; needs a fundamentals and valuation-inputs source |
| Market news briefing | Preserved; needs a news source |
| Daily valuation history and model log | Preserved; stored locally per user |
| Owner-specific scheduled refreshes | Removed: they live in the owner's account, and a product needs its own backend jobs |

Every "needs a source" panel shows an explicit "no market-data source connected" state; nothing is fabricated.

To test these panels, I fed the export real market datasets through its documented data interface, using a QA-only file that is not shipped. All of them rendered with no errors: rotation, RRG, breadth, OB/OS, risk appetite, VIXEQ, macro, regime, leadership, capital flows and valuation.

## C. Commercial deployment guide (not implemented, by request)

1. **Hosting:** the file is static and can be served from any static host or CDN.
2. **Market-data backend.** Implement `window.PT_DATA_SOURCE` against your own server:
   - `fetchCsv(key)` for the dataset keys above.
   - `getDoc(path)` for `meta/fredhist`, `meta/regime_val`, `meta/factor_val`, `meta/vixeq_hist`, `meta/macro`, `meta/valin`, `meta/f13`, `meta/cftc`, `meta/tic`.
   - `getCollection(name)` for `fund`, `rev`, `etf`, `ins`, `news`.

   The formats are exactly what the parsers already read.
3. **Licensing** must be cleared before redistributing data:
   - Google Finance data cannot be redistributed. Use a licensed vendor.
   - Cboe VIX/VIXEQ, Yahoo and stockanalysis (S&P Global) data and scraped third-party sites (13f.info, OpenInsider) need licences, or replacement with primary sources (SEC EDGAR bulk files, CFTC, Treasury).
   - Some FRED series are copyrighted, for example Moody's Baa.
4. **Accounts:** add an auth provider, server-side user storage for holdings (replacing localStorage), billing, and **server-side** entitlement checks on every data endpoint. A check in this HTML can be bypassed by anyone, so none was added.
5. **Scheduled jobs:** rebuild the refresh jobs on your backend, with no tie to the owner's account.

## D. Technical handover

- **Build:** `python3 build_public.py`
  - Input: a fresh copy of the private page saved as `private_v14_copy.html`.
  - Output: `dist/portfolio-terminal-public.html`.
  - Every edit is asserted. If the private source changes in a way the script doesn't expect, the build fails instead of leaking.
- **Gate:** `python3 privacy_scan.py`. It must print PASS before anything ships. It reads private reference values locally and never writes them out.
- **QA:** `node qa/qa.js dist/portfolio-terminal-public.html bare` (no data source). Optionally build a local QA harness with a test `PT_DATA_SOURCE`, and never ship it.
- **Modules added:**
  - `public_adapter.js`: isolated database and data-source adapter.
  - `public_holdings.*`: customer holdings editor; it produces the original engine-table format so the existing maths is reused.
- **Rule for future builds:** copy, never edit, the private file; run the build, then the scan, then QA; deliver only `dist/`.
