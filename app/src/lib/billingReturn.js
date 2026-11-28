/* What to do with a verified plan after coming back from Stripe (?billing=success|portal). The redirect proves nothing:
   `tier` is always the server's answer. The webhook may land after this page loads (the plan changes while polling) or
   before it (the first answer is already the new plan), and both are a completed purchase. Pure, so
   api/_billingreturn.test.js can run it.
   Returns null to keep polling, else { activated: report and announce a purchase, reload: restart on the new plan }.
   `firstTier` is the first verified answer on this page load (undefined while this is it); `unlocked` means the screen
   on view is a paid one that is already open. */
export function billingStep({ result, tier, firstTier, unlocked }) {
  if (!tier || tier === "demo") return null
  const paying = tier === "paid" || tier === "premium"
  const changed = firstTier !== undefined && tier !== firstTier
  // checkout refuses anyone who already subscribes, so a paying plan after "success" is the purchase just made
  const bought = result === "success" && paying
  if (!changed && !bought && !unlocked) return null
  return { activated: paying && (changed || bought), reload: changed }
}
