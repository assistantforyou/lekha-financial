# Product analytics (PostHog)

Last updated 2026-11-25. The app sends product analytics to PostHog on every surface: the unified app (`/`), V3 (`/v3`), V2 (`/v2`) and the sign-in page (`/login.html`). Without a key everything is a no-op, so local development and previews stay quiet until they are configured.

## Configuration

| Variable | Where | Meaning |
|---|---|---|
| `POSTHOG_KEY` | Vercel (Production, Preview), `keys.env` | Project API key (`phc_...`). Public by design. |
| `POSTHOG_HOST` | same | Ingestion host: `https://us.i.posthog.com` or `https://eu.i.posthog.com`. |
| `POSTHOG_UI_HOST` | optional | App host used for toolbar and replay links; derived from the ingestion host by default. |
| `POSTHOG_DISABLED` | optional | Set to `1` to stop browser and server capture without removing the key. |

`GET /api/ph` serves `{ enabled, key, host, uiHost, environment }` with a five-minute cache. It is the only endpoint that exposes the key; nothing is committed to the repo.

The browser bundle is vendored at `public/vendor/posthog.js` (from the `posthog-js` dependency) so every surface loads the same version from our own origin. Re-copy it after upgrading `posthog-js`:

```bash
cp node_modules/posthog-js/dist/array.full.js public/vendor/posthog.js
```

## What is captured automatically

`public/pt-analytics.js` initialises PostHog once per page with:

* autocapture of clicks and form submissions (`mask_all_text: true`), pageleave, heatmaps;
* session replay with every input and all on-screen text masked (`maskTextSelector: "*"`, `blockSelector: "[data-ph-block]"`): replay shows layout and interaction, never balances, holdings or wording;
* exception capture and web vitals;
* manual pageviews on hash, history and popstate changes, tagged with the surface (`app`, `v3`, `v2`, `login`);
* identity from the Supabase session (`user_id` only, never the e-mail), reset on sign-out;
* person properties `plan`, `admin`, `surface`, `environment`;
* a bridge from the Meta pixel helpers: `Purchase`, `Subscribe`, `InitiateCheckout`, `CompleteRegistration`, `Lead` and `ptTrackCustom` are mirrored as `purchase`, `subscription_started`, `checkout_started`, `signup_completed`, `lead_submitted` and `meta_custom`;
* delegation for the classic chrome: navigation tabs, `.seg.tabs`, `#refresh`, `#cur-usd`/`#cur-thb`, `#acct`, `#lay-toggle`, and any element carrying `data-ph-event` (optionally `data-ph-props` as JSON).

Interactive elements can opt out of replay with `data-ph-block`, or be masked with `data-ph-mask`.

## Event catalogue

Shell and navigation: `screen_viewed`, `nav_item_clicked`, `nav_group_toggled`, `nav_groups_toggled`, `nav_filter_used`, `nav_toggled`, `search_opened`, `search_result_opened`, `currency_changed`, `prices_refreshed`, `theme_opened`, `language_opened`, `layout_customize_toggled`, `account_opened`, `account_clicked`, `ai_entry_clicked`.

Accounts and billing: `signed_in`, `signup_completed`, `signed_out`, `password_changed`, `password_recovery_requested`, `email_change_requested`, `account_deleted`, `data_exported`, `data_imported`, `checkout_started`, `checkout_returned`, `billing_portal_opened`, `plan_activated`, `paywall_viewed`, `upgrade_clicked`, `plans_compared`, `subscription_synced` (server, Stripe webhook).

Research: `company_opened`, `company_tab_viewed`, `watchlist_changed`, `watchlist_add_rejected`, `council_started`, `council_completed`, `council_failed`, `report_opened`, `report_deleted`, `agent_question_started`, `agent_question_completed`, `agent_question_stopped`, `agent_question_failed`, `agent_signup_wall`, `agent_thread_started`, `agent_thread_opened`, `agent_thread_deleted`, `agent_mode_changed`.

Onboarding: `tour_started`, `tour_step_viewed`, `tour_finished`, `tour_language_changed`, `tour_account_clicked`, `tour_replayed`.

Server: `api_request` for every API call (group, route, method, status, duration; user id when signed in), emitted from `api/_router.js` after the handler finishes.

## Privacy rules

Never send e-mails, names, passwords, tokens, prompts, questions, answers, search text, holdings, positions, balances, cost basis or API keys to PostHog. Both the browser helper (`public/pt-analytics.js`) and the server helper (`api/_ph.js`) drop those keys, truncate strings and arrays, and the server helper refuses objects deeper than two levels. Events carry ids, route names, plans, counts and durations only. `api/_ph.test.js` locks the server filter in place.

## Server capture

```js
const ph = require("./_ph");
ph.capture("subscription_synced", userId, { plan: "paid", status: "active" });
ph.identify(userId, { plan: "paid" });
```

`capture` is fire-and-forget with a 1.5 s timeout and never throws; do not await it on a request path. Use `distinct_id` values that match the browser identity: the Supabase user id, or `anonymous`.

## Warehouse sources

Both connections live in PostHog (project 767236, Data pipeline -> Sources), not in this repo. They were created on 2026-11-25 through the PostHog API with a personal key that has the data warehouse write scope. The wizard CLI is not required and could not reach `us.posthog.com` from some networks.

Supabase Postgres, source prefix `supabase`, status Completed, full sync then every 6 hours:

| Field | Value |
|---|---|
| Host | `aws-1-ap-northeast-1.pooler.supabase.com` (Supavisor pooler; the direct `db.<ref>.supabase.co` host is IPv6-only and unreachable) |
| Port | `5432` |
| Database | `postgres` |
| User | `postgres.<project-ref>` |
| Password | the database password from Project settings -> Database |
| SSL | required, `verify_server_certificate` false (the pooler certificate does not verify) |

Tables: `pt_audit` (API usage and provider metadata), `pt_av_budget`, `pt_av_cache` (fundamentals and price cache), `pt_cost_fixed`, `pt_costs` (model token spend), `pt_profiles` (plan and subscription state; the e-mail column is flagged sensitive in PostHog), `pt_rag_docs`, `pt_rate`, `pt_user_state`. Prefer a read-only role if the connection is ever recreated.

Stripe, source prefix `stripe`, OAuth connection (Stripe Apps marketplace). A restricted API key also works and needs read access to charges, customers, subscriptions, invoices, products and prices; creating one requires the account's two-factor code. The OAuth app grants the granular Stripe App permissions, so the revenue tables sync (Customer, Charge, Invoice, Subscription, SubscriptionItem, Product, Price, Plan, Coupon, PromotionCode, Dispute, Payout) while tables outside its permission set (PaymentIntent, CheckoutSession, Event, TaxRate and the Billing credit tables) report a permission error until the connection is reauthorised with a restricted key that has those scopes.

The project is "Lekha" on US Cloud, project id `767236`. The public ingestion key is set as `POSTHOG_KEY` in Vercel for production, preview and development; `/api/ph` serves it at runtime.
