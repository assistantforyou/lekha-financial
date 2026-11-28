/* What to do with a verified plan after coming back from Stripe (?billing=success|portal). The redirect proves nothing:
   `tier` is always the server's answer. The webhook may land after this page loads (the plan changes while polling) or
   before it (the first answer is already the new plan), and both must be recognised. Pure, so
   api/_billingreturn.test.js can run it.
   Returns null to keep polling, else { activated: report a purchase, reload: restart on the new plan }; the caller
   announces the plan either way. `firstTier` is the first verified answer on this page load (undefined while this is
   it); `before` is the plan this tab showed before leaving for Stripe; `unlocked` means the screen on view is a paid
   one that is already open. */
const RANK = { free: 0, paid: 1, premium: 2 }

export function billingStep({ result, tier, firstTier, unlocked, before }) {
  if (!tier || tier === "demo") return null
  const changed = firstTier !== undefined && tier !== firstTier
  // checkout refuses anyone who already subscribes, so a paying plan after "success" is the purchase just made
  const bought = result === "success" && RANK[tier] > 0
  // a portal change that was already in place when the page loaded
  const moved = result === "portal" && firstTier === undefined && before in RANK && tier !== before
  if (!changed && !bought && !moved && !unlocked) return null
  const from = changed ? firstTier : moved ? before : undefined
  return { activated: bought || RANK[tier] > RANK[from], reload: changed }
}
