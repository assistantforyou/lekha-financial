/* The plan a visitor picked before they were ready to pay for it (no session yet, or signed in but inside the demo).
   The route carries it (#/account/plans?plan=paid); this record lets it survive the reload after sign-in and the e-mail
   confirmation round trip, which ends on a different URL. It is a convenience only: the server decides who may check out
   and what they pay, and checkout still happens on Stripe's page. Pure functions (storage and clock are arguments) so
   api/_planintent.test.js can run them. */
export const KEY = "ptpub.v1.app.planIntent"
export const TTL_MS = 60 * 60e3   // long enough to open a confirmation e-mail; short enough that nobody is sent to checkout the next day
const PLANS = ["free", "paid", "premium"]
const local = () => { try { return window.localStorage } catch (e) { return null } }
const norm = (email) => String(email || "").trim().toLowerCase()

export const planFromQuery = (query) => { const p = query ? query.get("plan") : null; return PLANS.includes(p) ? p : null }
export const planPath = (plan) => (plan ? `account/plans?plan=${plan}` : "account/plans")

function drop(store) { try { store.removeItem(KEY) } catch (e) {} }
function read(store, now) {
  try {
    const raw = store.getItem(KEY); if (!raw) return null
    const j = JSON.parse(raw)
    if (j && PLANS.includes(j.plan) && now - j.at <= TTL_MS) return j
  } catch (e) {}
  drop(store); return null
}
function write(store, rec) { try { store.setItem(KEY, JSON.stringify(rec)) } catch (e) {} }

/* `email` (when known) limits the choice to that account. An e-mail link already on its way stays expected. */
export function rememberPlan(plan, { email } = {}, store = local(), now = Date.now()) {
  if (!PLANS.includes(plan)) return
  const was = read(store, now)
  write(store, { plan, at: now, email: norm(email) || (was && was.email) || "", awaiting: !!(was && was.awaiting) })
}
/* a confirmation (or password reset) e-mail was sent: closing the dialog must no longer forget the choice */
export function awaitEmail(email, store = local(), now = Date.now()) {
  const was = read(store, now); if (was) write(store, { ...was, email: norm(email), awaiting: true, at: now })
}
export const awaitingEmail = (store = local(), now = Date.now()) => { const r = read(store, now); return r && r.awaiting ? r.email : null }
export function abandonPlan(store = local(), now = Date.now()) { const r = read(store, now); if (r && !r.awaiting) drop(store) }
export const pendingPlan = (store = local(), now = Date.now()) => { const r = read(store, now); return r ? r.plan : null }
export const forgetPlan = (store = local()) => drop(store)
/* someone is on the way to a plan: nothing should navigate them elsewhere */
export const planInProgress = (hash, store = local(), now = Date.now()) => /[?&]plan=/.test(String(hash || "")) || !!pendingPlan(store, now)
/* Whether this page load began on the way to a plan. Read once at boot: lazily loaded parts (the Quick Tour) start after the choice may already be used. */
export const arrivedForPlan = typeof location !== "undefined" && planInProgress(location.hash)
/* is this plan still waiting, for this signed-in account? Looks only. */
export function isPicked(plan, email, store = local(), now = Date.now()) {
  const r = read(store, now); return !!r && r.plan === plan && (!r.email || r.email === norm(email))
}
/* Consume the choice, at the moment of leaving for checkout (a reload before then must find it again). True once, and only
   for the plan and account it was made for; another account asking for that plan clears it. */
export function takePlan(plan, email, store = local(), now = Date.now()) {
  const r = read(store, now); if (!r || r.plan !== plan) return false
  const mine = isPicked(plan, email, store, now)
  drop(store)
  return mine
}

/* What the signed-in account does with the picked plan: the same rules as the buttons on the Plans page.
   `me` is the verified record from /api/auth/me. */
export function nextStep(plan, me) {
  if (plan === "free") return "included"
  const tier = me && me.tier
  if (tier === plan) return "current"
  if (tier === "premium") return "covered"
  const lapsed = ["past_due", "unpaid", "incomplete"].includes(me && me.sub_status)
  // Checkout refuses a second subscription: an existing subscriber changes plan (or fixes the card) in the billing portal
  if (me && me.can_manage_billing && (lapsed || tier === "paid")) return "portal"
  return "checkout"
}
