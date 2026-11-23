import { useEffect, useState } from "react"
import { ArrowRight, Loader2, Lock } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import * as A from "@/lib/account"
import { FEATURES, PLAN_NAME, PRICE, planFor } from "@/lib/entitlements"

const errMsg = (e) => (e && e.message) || "Billing is not available right now."

/* The access-restricted screen shown INSTEAD of a module the account's plan does not include. The original
   module is never mounted behind it. The button uses the real billing flow:
     - demo / not signed in   -> sign in or create an account first (billing needs an account)
     - Free (no subscription) -> Stripe Checkout for the cheapest plan that includes the feature
     - existing subscriber    -> Stripe billing portal (Checkout refuses a second subscription; plan changes happen there)
   Access changes only after Stripe's webhook has updated the account: the screen re-reads /api/auth/me and the
   original module appears on its own once the verified plan includes it. */
export default function LockedFeature({ feature, title, tier, me, signedIn, demo, navigate, confirming }) {
  const plan = planFor(feature), f = FEATURES[feature] || {}, [busy, setBusy] = useState(false)
  const subscriber = !!(me && (me.tier === "paid" || me.tier === "premium") && me.can_manage_billing)
  const lapsed = !!(me && ["past_due", "unpaid", "incomplete"].includes(me.sub_status))
  useEffect(() => { if (confirming) setBusy(false) }, [confirming])
  const upgrade = async () => {
    if (!signedIn || demo) { navigate("account/profile"); return }
    setBusy(true)
    try { const j = subscriber || lapsed ? await A.portal() : await A.checkout(plan); location.href = j.url }
    catch (e) {
      setBusy(false)
      // 409: the account already has a subscription that Checkout cannot replace; the portal is the place to change it
      if (e && e.status === 409) { try { const j = await A.portal(); location.href = j.url; return } catch (e2) { toast.error(errMsg(e2)); return } }
      toast.error(errMsg(e))
    }
  }
  const label = !signedIn || demo ? "Sign in or create an account" : lapsed ? "Update payment method" : `Upgrade to ${PLAN_NAME[plan]}`
  return (
    <section aria-labelledby="locked-title" className="mx-auto my-6 max-w-xl rounded-xl border border-border bg-card px-6 py-10 text-center shadow-sm sm:px-10">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{title}</p>
      <div className="mx-auto mt-6 flex size-12 items-center justify-center rounded-full border border-border bg-background" aria-hidden="true"><Lock className="size-5 text-primary" /></div>
      <h2 id="locked-title" className="mt-5 text-lg font-semibold tracking-tight">{PLAN_NAME[plan]} feature</h2>
      <p className="mx-auto mt-2 max-w-md text-[13.5px] leading-relaxed text-muted-foreground">{f.summary}</p>
      <p className="num mt-5 text-[13.5px] font-medium">{PLAN_NAME[plan]} — {PRICE[plan]}</p>
      {plan === "paid" && <p className="mt-1 text-[12px] text-muted-foreground">Also included in Premium — {PRICE.premium}</p>}
      {confirming
        ? <p className="mt-6 inline-flex items-center gap-2 text-[13px] text-muted-foreground" role="status"><Loader2 className="size-4 animate-spin" />Waiting for Stripe to confirm the subscription. This screen opens the feature as soon as your account is updated.</p>
        : <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <Button onClick={upgrade} disabled={busy} aria-describedby="locked-title">{busy ? <><Loader2 className="animate-spin" />Opening secure billing…</> : <>{label}<ArrowRight /></>}</Button>
            <Button variant="outline" onClick={() => navigate("account/plans")}>Compare plans</Button>
          </div>}
      {lapsed && !confirming && <p className="mt-4 text-[12px] text-muted-foreground">The latest payment for your subscription was not received, so paid features are paused until Stripe confirms it.</p>}
      {demo && <p className="mt-4 text-[12px] text-muted-foreground">The demo is a free preview with a sample portfolio. {PLAN_NAME[plan]} features need a subscription on your own account.</p>}
      {!demo && signedIn && tier && tier !== "demo" && <p className="mt-4 text-[12px] text-muted-foreground">You are on the {PLAN_NAME[tier] || tier} plan.</p>}
    </section>)
}
