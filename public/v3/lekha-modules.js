/* LEKHA V3 feature modules (ES modules): Intelligent Simulation, LLM Council, Holdings Deep Analysis.
   Each module is optional: a missing or failing module leaves an explicit notice, never a blank pane.
   Entitlements (api/_data/entitlements.json): Deep Analysis is Paid and Premium; Simulation and the Council
   are Premium. A module is imported and mounted only when /api/auth/me says the account's plan includes it;
   otherwise its host shows a locked notice. This only decides what is mounted: the module files are static
   assets, and every server call they make is checked against the verified subscription again. */
const slots = [
  ["lekha-sim", "/v3/lekha-sim.js", "Intelligent Simulation", "simulation", "Premium", "฿599/month"],
  ["lekha-council", "/v3/lekha-council.js", "LLM Council", "council", "Premium", "฿599/month"],
  ["lekha-deep", "/v3/lekha-deep.js", "Holdings Deep Analysis", "deepAnalysis", "Paid", "฿399/month"],
];
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
/* the demo is a preview, never a plan; a signed-in account is entitled only when its /api/auth/me record says so */
async function entitled(feature) {
  if (window.PT_DEMO_MODE) return false;
  try { const me = window.PT_TIER_READY ? await window.PT_TIER_READY() : null; return !!(me && me.features && me.features[feature] === true); }
  catch (e) { return false; }
}
function locked(host, name, plan, price) {
  host.innerHTML = `<section class="panel"><div class="ph"><h2>${esc(name)}</h2></div><div class="empty">${esc(name)} is included in the ${esc(plan)} plan (${esc(price)}). <a href="/#/account/plans">Compare plans</a></div></section>`;
}
for (const [id, src, name, feature, plan, price] of slots) {
  const host = document.getElementById(id);
  if (!host) continue;
  entitled(feature).then((ok) => {
    if (!ok) return locked(host, name, plan, price);
    return import(src).then((m) => m.mount && m.mount(host)).catch((e) => {
      console.warn("[v3] module not available:", src, e && e.message);
      host.innerHTML = `<div class="panel"><div class="ph"><h2>${name}</h2></div><div class="empty">This V3 module is not built yet in this checkout (see V3_HANDOFF.md).</div></div>`;
    });
  });
}
