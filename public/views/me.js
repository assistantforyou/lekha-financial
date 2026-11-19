/* v2 Me: account, plans, language and look, and plain answers to "where does this data come from?" */
import { t, LANGS, getLang, fmtMoney, fmtAgo } from "/core/i18n.js";
import { D } from "/core/data.js";
import { prefs, isDemo, tierName, checkout, billingPortal, signOut, session } from "/core/store.js";
import { esc, toast } from "/core/util.js";
import { cardHead, icon } from "../ui.js";
import { segHtml, bindSeg } from "./shared.js";
import { openAuth } from "../sheets.js";
import { status } from "/core/live.js";

const PLAN_ROWS = () => [
  { id: "free", name: t("Free"), price: 0, items: [t("Up to 20 holdings"), t("5 years of price history"), t("Live prices, news and analyst views"), t("The nine-investor outlook")] },
  { id: "paid", name: t("Paid"), price: 699, items: [t("Unlimited holdings"), t("Full price history"), t("Extra analyst and estimate data"), t("Everything in Free")] },
  { id: "premium", name: t("Premium"), price: 1299, items: [t("AI analyst: ask, daily briefing, stress test"), t("AI explanation of every investor in the outlook"), t("Everything in Paid")] },
];
export default {
  render() {
    const p = prefs.get(), tier = tierName(D.me), demo = isDemo(), hasSession = !!session(), em = D.me && D.me.email;
    const signed = !demo && !!em;
    const acct = signed ? `<div class="row"><span class="av" style="background:var(--accent);width:2.6rem;height:2.6rem;border-radius:50%;display:grid;place-items:center;color:var(--accent-ink);font-weight:800">${esc((em || "?").charAt(0).toUpperCase())}</span><div><b>${esc(em || "")}</b><div class="small muted">${esc(t("Plan"))}: ${esc(PLAN_ROWS().find((x) => x.id === tier)?.name || tier)}</div></div><span class="sp row">${tier !== "free" ? `<button class="btn sm" id="portal">${esc(t("Manage billing"))}</button>` : ""}<button class="btn sm" id="out">${esc(t("Sign out"))}</button></span></div>`
      : `<p class="small muted" style="margin-top:0">${esc(t("You are on the demo account: a sample portfolio with live market data. Create a free account to add your own holdings and keep them on every device."))}</p><div class="row"><button class="btn primary" data-auth="signup">${esc(t("Create account"))}</button><button class="btn" data-auth="login">${esc(t("Sign in"))}</button></div>`;
    const demoCard = `<div class="card">${cardHead(t("Demo account"), `<p>${esc(t("Try the whole terminal with a sample portfolio and live prices. No sign-up, and nothing you do here touches a real account."))}</p>`)}
      <div class="stack">
        ${demo
          ? `<div class="row"><span class="pill up">${esc(t("Demo mode is on"))}</span>${hasSession ? `<button class="btn" id="exitdemo">${esc(t("Exit demo"))}</button>` : ""}</div><p class="small muted" style="margin:0">${esc(t("Holdings you add in the demo stay on this device. Sign up when you want them saved to your account."))}</p>`
          : `<div class="row"><button class="btn primary" id="opendemo">${esc(t("Open the demo"))}</button><span class="small muted">${esc(t("Explore first, sign up later."))}</span></div>`}
      </div></div>`;
    return `<div class="page"><div class="grid">
      <div class="card">${cardHead(t("Account"), "")}${acct}</div>
      ${demoCard}
      <div class="card">${cardHead(t("Make it yours"), "")}<div class="stack">
        <label class="field">${esc(t("Language"))}<select id="lang">${LANGS.map((l) => `<option value="${l.code}" ${l.code === getLang() ? "selected" : ""}>${esc(l.native)}</option>`).join("")}</select></label>
        <div class="field">${esc(t("Theme"))}${segHtml("th", [["auto", t("Auto")], ["light", t("Light")], ["dark", t("Dark")]], p.theme)}</div>
        <div class="field">${esc(t("Text size"))}${segHtml("sz", [["S", t("Small")], ["M", t("Medium")], ["L", t("Large")], ["XL", t("Extra large")]], p.size)}</div>
        <div class="field">${esc(t("Show money in"))}${segHtml("cu", [["USD", "USD"], ["THB", "THB ฿"]], p.cur)}</div></div></div>
      <div class="card full">${cardHead(t("Plans"), `<p>${esc(t("Everything works on every plan. Higher plans add depth: more holdings, more history, and the AI analyst."))}</p><p>${esc(t("Billing is monthly and handled securely by Stripe. Cancel any time from Manage billing."))}</p>`)}<div class="plans">${PLAN_ROWS().map((pl) => `<div class="plan ${pl.id === tier ? "cur" : ""}"><b>${esc(pl.name)}</b><div class="pr">${esc(fmtMoney(pl.price, "THB", 0))} <small>${esc(t("per month"))}</small></div><ul>${pl.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>${pl.id === tier ? `<span class="pill up" style="justify-self:start">${esc(t("Your plan"))}</span>` : pl.price && tier !== "premium" ? `<button class="btn primary" data-plan="${pl.id}">${esc(t("Choose {plan}", { plan: pl.name }))}</button>` : pl.price ? "" : ""}</div>`).join("")}</div></div>
      <div class="card full row"><a class="btn" href="/v2">${esc(t("Open the classic terminal"))}</a><span class="small muted">${esc(t("Deep valuation models, sector rotation and the full original tools."))}</span></div>
    </div></div>`;
  },
  mount(root, ctx) {
    const app = window.PT_V2;
    root.addEventListener("click", async (e) => {
      const a = e.target.closest("[data-auth]"); if (a) return openAuth(a.dataset.auth);
      const pl = e.target.closest("[data-plan]"); if (pl) { if (isDemo()) return openAuth("signup", t("Create a free account first, then choose a plan.")); pl.disabled = true; const r = await checkout(pl.dataset.plan); if (r.url) location.href = r.url; else { pl.disabled = false; toast(r.status === 409 ? t("You already have a subscription. Use Manage billing to switch.") : t("Payments are not available right now.")); } return; }
      if (e.target.closest("#portal")) { const r = await billingPortal(); if (r.url) location.href = r.url; else toast(t("Billing is not available right now.")); return; }
      if (e.target.closest("#out")) { await signOut(); location.reload(); }
      if (e.target.closest("#opendemo")) { const u = new URL(location.href); u.searchParams.set("demo", "1"); location.href = u.toString(); return; }
      if (e.target.closest("#exitdemo")) { const u = new URL(location.href); u.searchParams.delete("demo"); u.hash = "#/me"; location.href = u.toString(); return; }
    });
    root.querySelector("#lang").addEventListener("change", (e) => app.setLanguage(e.target.value));
    bindSeg(root, "th", (k) => { prefs.set({ theme: k }); app.applyLook(); });
    bindSeg(root, "sz", (k) => { prefs.set({ size: k }); app.applyLook(); });
    bindSeg(root, "cu", (k) => { prefs.set({ cur: k }); app.shell(); ctx.rerender(); });
  },
};
