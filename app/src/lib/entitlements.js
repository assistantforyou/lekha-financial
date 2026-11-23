// Display-side copy of the feature access matrix. Same file the server reads (api/_data/entitlements.json),
// so a route and the endpoints behind it always resolve to the same decision. Nothing here is security:
// every restricted endpoint re-checks the verified subscription server-side.
import ENT from "../../../api/_data/entitlements.json"

export const PRICE = { free: "฿0/month", paid: "฿399/month", premium: "฿599/month" }
export const PLAN_NAME = { free: "Free", paid: "Paid", premium: "Premium" }
export const FEATURES = ENT.features
export const QUOTAS = ENT.quotas

/* "macro/intel" -> "marketIntel"; null for a route with no restriction */
export function featureOfRoute(key) {
  const k = String(key || "")
  return ENT.routes[k] || ENT.groups[k.split("/")[0]] || null
}
/* tier: "demo" | "free" | "paid" | "premium". The demo is a full preview on simulated data: nothing is locked
   (owner decision, 23 Nov 2026). It is display only; the server never grants the demo a paid endpoint. */
export function allows(tier, feature) {
  if (!feature || tier === "demo") return true
  const f = ENT.features[feature]
  return !!f && f.tiers.includes(tier)
}
/* cheapest plan that unlocks the feature */
export const planFor = (feature) => { const t = (ENT.features[feature] || {}).tiers || []; return t.includes("paid") ? "paid" : "premium" }
