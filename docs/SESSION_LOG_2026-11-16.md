# Portfolio Terminal: session log, 16 Nov 2026 (done by James, with Claude)

For the Todoist task "Sex Project" (project Lekha) and "Idea Dumps". The Todoist connector didn't connect this session, so this file holds the entries to copy in.

## Done
- **AI provider switch (free).** Statement import and news now use Z.ai GLM models, which are free: `glm-4.6v-flash` reads statement text and images, and also writes the news briefing. Google Gemini is the backup.
  - Google retired `gemini-3.5-flash` on 8 Oct 2026. Requests sent to that name are billed at the newer 3.6 Flash price: about $16/mo at 40 imports a day, rising to about $32/mo from 1 Jan 2027.
  - Tested on a sample statement: NVDA/SPY/0700.HK/cash extracted correctly, and a planted "ignore instructions" line was ignored.
  - The Z.ai account was created with Google sign-in (assistantforyou999). Its key is `ZAI_API_KEY` in keys.env and in Vercel production.
- **PDFs are read in the browser.** pdf.js pulls the text out and masks account numbers before anything is uploaded. Scanned PDFs are sent as up to 4 page images.
- **AI cost log.** Every AI call writes its model, tokens and USD cost to the Supabase table `pt_costs`. Statement content is never stored. Prices live in `api/_pricing.js`.
- **Empty "n/a" panels filled with free data:**
  - HK and Thai holdings get live prices and charts (Yahoo chart, non-US only).
  - All-time high and % from ATH: Twelve Data gives about 20 years of history for US stocks, Yahoo 10 years for the rest.
  - USD/THB and HKD/USD fill in automatically from the ECB (Frankfurter). Typing a rate still overrides it.
  - Analyst consensus, EPS revisions, price targets and forward P/E for your holdings come from the Alpha Vantage free key, cached so each holding costs about 2 calls a week.
  - Insider cluster buys come straight from SEC EDGAR Form 4 for all S&P 500 companies. A daily cron runs 3 times a night and resumes where it stopped. A 60-day backfill was running in the background; it had stored 14 of 44 business days at last check.
  - 13F holder changes by sector come from the SEC 13F data sets: 467 of 503 S&P 500 stocks matched, Q1 to Q2 2026. Built by `scripts/build-13f.mjs`, which needs a quarterly re-run.
  - No bare "n/a" is left on the page. Missing values show a dash with an explanation, and sector-wide revisions show a "Premium" label.
- **Settings tab:**
  - Account: sign up, sign in, sign out, change password.
  - Data source: Free, Premium $60/mo, Custom or Off. This replaces the old header popup.
  - A data-freshness chart.
  - Display: theme, text size S–XL, density.
  - Layout: show/hide panels, presets.
  - Import passcode.
  - Admin-only running-costs page: AI spend this month, projected month total, a daily chart, fixed plans, Stripe revenue, and links to each provider's billing page.
- **Customizable dashboard.** A Customize button lets you drag panels or move them with arrows, set half or full width, hide and collapse. Layouts are saved in the browser and synced to the account.
- **Easier to read:**
  - Larger minimum text and higher contrast.
  - Every panel has a plain-English line saying what it shows.
  - A colourblind-safe chart palette (checked with the validator).
  - New charts: holdings allocation donut, news impact bars, data freshness, cost chart.
- **Accounts and Premium (server side):**
  - Supabase Auth with email + password, handled on the server.
  - Stripe Checkout, customer portal and a signed webhook.
  - `/api/av/*` now requires a signed-in Premium subscriber.
  - The security review's two findings are fixed: admin needs a confirmed email, and sign-up no longer reveals which emails exist.
- **Database.** Supabase tables `pt_profiles`, `pt_costs` and `pt_cost_fixed` were created (SQL in `docs/sql/`).
- **Tests and commits.** All 11 test files pass (`node api/<file>.test.js`). Four commits on branch `claude/expense-tracking-settings-137d04`.

## Ongoing
- The insider-filing backfill fills the remaining days through the nightly crons once deployed.
- Analyst price targets fill in as the Alpha Vantage free budget allows (25 calls a day).

## Planning (needs James)
1. **Approve the production deploy** (`vercel deploy --prod`). The tool blocked it without your OK.
2. **Approve removing the old `GEMINI_MODEL` value in Vercel** (it's set to the deprecated model). The code already ignores it, so this is cleanup only.
3. **Stripe for Portfolio Terminal.** Chrome is signed in to the GingerBros Stripe account, which is the wrong business for this, so it wasn't touched. Create a separate Stripe account (or a new account under the same login), then put its test keys in keys.env:
   - `STRIPE_SECRET_KEY`
   - `STRIPE_PRICE_PREMIUM`: a $60/month price
   - `STRIPE_WEBHOOK_SECRET`: from a webhook pointed at `/api/billing/webhook` for checkout.session.completed and customer.subscription.*
4. **Admin email.** `ADMIN_EMAILS` is set to assistantforyou999@gmail.com. Sign up with that email (or tell Claude a different one).
5. **Confirmation emails.** Supabase's built-in sender only manages a few emails an hour. Set up custom SMTP (Resend has a free tier) before launch.
6. **Alpha Vantage licence.** Check AV's terms before charging users real money for its data: reselling may need their commercial licence. Their $49.99/mo plan (75 calls/min) is the one to buy once the first real subscriber arrives.

## Task dump
- Finnhub signup skipped: it has no Google sign-in. It would add free sector-wide recommendation trends.
- 13F refresh: run `scripts/build-13f.mjs` on the home server after each SEC release (end of Feb, May, Aug, Nov).
- Optional: Z.ai GLM-OCR (needs a few dollars of prepaid balance, then set `LLM_OCR=1`) for harder scans.
- Optional: a Vercel API token so the costs page shows real Vercel billing.

## Idea dump (for "Idea Dumps")
- Weekly email digest of the portfolio (Resend) for Premium users.
- Price alerts by LINE / email when a holding hits its buy price from the valuation model.
- A Google Cloud Vision OCR fallback (1,000 pages a month free, needs Cloud billing on).
- Holdings sync between devices when signed in. Today only layout and display settings sync; holdings stay in one browser.
- Sector-wide analyst revisions on Premium via a nightly Alpha Vantage sweep of all 500 stocks at 75 calls a minute.
