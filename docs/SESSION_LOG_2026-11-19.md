# Portfolio Terminal: session log, 19 Nov 2026 (done by James, with Claude)

For the Todoist tasks "Sex Projext" and "Idea Dumps". Design and architecture are in `docs/V2.md`.

## Done
- **`/v2`: a new phone-first version** (`public/v2`, shared engine in `public/core`). Five screens (Today, Holdings, Market,
  Outlook, Me), bottom tabs on phones and a side rail on desktop, fluid type and layout, descriptions collapsed behind an
  `i` button, details that open directly under what you tap. Same login, plans, Stripe and holdings sync as the classic
  terminal (it reuses `pt-datasource.js`, `pt-state.js`, `pt-demo.js`). Sample portfolio shows no DEMO labels or warnings.
- **Live prices:** `POST /api/free/quotes` (Alpaca IEX + Yahoo for HK/BK, 4 s shared server cache), one client poller with
  subscribers (`core/live.js`), cross-tab sharing via BroadcastChannel, adaptive cadence, paused when hidden.
- **Browser cache** (`core/cache.js`, IndexedDB + TTL + stale-while-revalidate) for everyone-the-same data.
- **Analysts + events:** `POST /api/free/street` (rating mix, price target, ticker headlines with tone, earnings dates;
  providers FMP / Finnhub / Alpha Vantage, each optional). Events (Fed, jobs, CPI, earnings) carry an analyst / media /
  run-up / mood lean that shifts the simulated jump.
- **The Council** replaces the "1B Projection Lab": real Monte Carlo (default 5,000 futures, up to 50,000) of nine investor
  personas on the user's own holdings, with rule-derived reasons per persona and a Premium AI explanation
  (`POST /api/ai/council`).
- **Translation:** every v2 string (378) in 9 languages plus Intl-formatted numbers/dates/axes; news translated per language
  server-side; `scripts/check-i18n.mjs` and `api/_council.test.js` fail on any missing string. Swept all 5 screens x 10
  languages in a browser: zero fallbacks to English.
- **News:** more sources (BBC, Nasdaq, Seeking Alpha), refresh window 6 h -> 90 min, numeric HTML entities decoded.
- Classic terminal gets a `V2` button. Billing checkout/portal accept `ret:"/v2"`.
- Tests: 18 files green (new `_council.test.js`, `_quotes.test.js`).

## Ongoing
- Not rebuilt in v2 (reachable through the classic terminal link): DCF valuation tab, RRG rotation, breadth/OBOS, factor and
  capital-flow panels, 100 themes, admin cost page.
- Analyst target *range* (low/high) needs `FMP_API_KEY` (or a paid data plan); without it only mean target + rating mix show.

## Planning (needs James)
1. Decide whether to add `FMP_API_KEY` (and optionally `FINNHUB_API_KEY`) in Vercel for full analyst target ranges.
2. Real-time websocket would need a long-running host (Vercel functions cannot hold Alpaca's single free stream for many users).
3. Pick the next versions (v3+ must be visually different but reuse `public/core`).

## Idea dump
- v3: dense desktop "trading desk" layout; v4: one-screen "radar" feed; v5: ultra-simple "How am I doing?" for beginners.
- Push alerts when an event's lean flips or a holding moves more than 5% intraday.
- Share a read-only link of the Council result.
