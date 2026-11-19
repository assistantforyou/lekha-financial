/* Lekha Financials: shell, router and live painter. Screens live in views/, shared logic in /core. */
import { t, detectLang, setLang, getLang, fmtAgo } from "/core/i18n.js";
import { D, init, onData, loadNews, loadHistory, loadStreet, positions, totals } from "/core/data.js";
import * as live from "/core/live.js";
import { prefs } from "/core/store.js";
import { esc } from "/core/util.js";
import { icon, bindInfo, money, moneySigned, pct, price, tone, curr, openSheet } from "./ui.js";
import today from "./views/today.js"; import holdings from "./views/holdings.js"; import market from "./views/market.js"; import risk from "./views/risk.js"; import outlook from "./views/outlook.js"; import me from "./views/me.js"; import analysis from "./views/analysis.js"; import projection from "./views/projection.js";
import { openAsk } from "./sheets.js";

const VIEWS = { today, holdings, market, risk, outlook, analysis, me, projection }, ORDER = ["today", "holdings", "market", "risk", "outlook", "analysis"];
const LABEL = () => ({ today: t("Today"), holdings: t("Holdings"), market: t("Market"), risk: t("Risk"), outlook: t("Outlook"), analysis: t("Analysis"), me: t("Me"), projection: t("Projection Lab") });
const $ = (s) => document.querySelector(s);
let route = { id: "today", param: null }, raf = 0;

function parse() { const h = location.hash.replace(/^#\/?/, "").split("/"); return { id: VIEWS[h[0]] ? h[0] : "today", param: h[1] ? decodeURIComponent(h[1]) : null }; }
function applyLook() {
  const p = prefs.get(), r = document.documentElement;
  if (p.theme === "light" || p.theme === "dark") r.setAttribute("data-theme", p.theme); else r.removeAttribute("data-theme");
  r.style.setProperty("--z", { S: 0.92, M: 1, L: 1.12, XL: 1.25 }[p.size] || 1);
}
function shell() {
  const L = LABEL(), nav = (cls) => ORDER.map((id) => `<a class="${cls}" href="#/${id}" data-tab="${id}" ${route.id === id ? 'aria-current="page"' : ""}>${icon(id)}<span>${esc(L[id])}</span></a>`).join("");
  $("#rail").innerHTML = `<div class="brand"><i>${icon("trend")}</i><b>Lekha Financials</b></div>${nav("rtab")}`;
  $("#tabs").innerHTML = nav("tab");
  $("#top").innerHTML = `<div class="brand"><i>${icon("trend")}</i><span>Lekha<span class="brand-sub"> Financials</span></span></div><span class="live" id="livepill"><b></b><span>${esc(t("Connecting…"))}</span></span><button class="btn sm askbtn" id="askbtn">${icon("spark")} ${esc(t("Ask"))}</button><button class="iconbtn" id="curbtn" aria-label="${esc(t("Change currency"))}">${curr() === "THB" ? "THB ฿" : "USD $"}</button><a class="iconbtn" href="#/me" aria-label="${esc(t("Account and demo"))}">${icon("me")}</a>`;
  $("#fab-root").innerHTML = `<button class="fab" id="fab" aria-label="${esc(t("Ask your analyst"))}">${icon("spark")}<span>${esc(t("Ask"))}</span></button>`;
  $("#curbtn").onclick = () => { prefs.set({ cur: curr() === "THB" ? "USD" : "THB" }); shell(); paintAll(); view(); };
  $("#fab").onclick = openAsk; $("#askbtn").onclick = openAsk; pill();
}
function pill() {
  const el = $("#livepill"); if (!el) return; const s = D.session, on = s === "open" || s === "pre" || s === "post";
  el.classList.toggle("on", on); el.lastElementChild.textContent = !D.loaded.history ? t("Loading…") : s === "open" ? t("Live") : s === "pre" || s === "post" ? t("Extended hours") : t("Market closed");
  el.title = D.liveAt ? t("Prices updated {t}", { t: fmtAgo(D.liveAt) }) : "";
}
function view() {
  const y = window.scrollY, old = $("#view"), v = VIEWS[route.id], root = old.cloneNode(false);   // a fresh container each time drops the previous screen's listeners
  old.replaceWith(root); root.innerHTML = v.render(); v.mount(root, { param: route.param, rerender: schedule });
  document.querySelectorAll("[data-tab]").forEach((a) => (route.id === a.dataset.tab ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
  window.scrollTo(0, y);
}
function schedule() { if (VIEWS[route.id].static) return; cancelAnimationFrame(raf); raf = requestAnimationFrame(view); }
function go() { route = parse(); shell(); $("#view").innerHTML = ""; view(); window.scrollTo(0, 0); if (route.param) { const el = document.getElementById("h-" + route.param); el && el.scrollIntoView({ block: "center" }); } }

/* ---------- live painting: update only the numbers that changed, no re-render ---------- */
function flash(el, dir) { if (!el || !dir) return; el.classList.remove("fl-up", "fl-down"); void el.offsetWidth; el.classList.add(dir > 0 ? "fl-up" : "fl-down"); }
function paintAll(changed = []) {
  const rows = positions(), tot = totals(rows), by = Object.fromEntries(rows.map((r) => [r.tk, r]));
  const set = (sel, txt, cls) => document.querySelectorAll(sel).forEach((el) => { if (el.textContent !== txt) el.textContent = txt; if (cls != null) { el.classList.remove("up", "down"); if (cls) el.classList.add(cls); } });
  const tv = document.querySelector('[data-live="total"]'); if (tv) { const old = tv.textContent; set('[data-live="total"]', money(tot.value, 0)); if (old !== tv.textContent) flash(tv, 0); }
  set('[data-live="dayusd"]', moneySigned(tot.day, 0), tone(tot.day)); const dp = document.querySelector('[data-live="daypct"]'); if (dp) { dp.textContent = pct(tot.dayPct); dp.className = "pill " + tone(tot.dayPct); }
  document.querySelectorAll('[data-live="px"]').forEach((el) => { const r = by[el.dataset.tk]; if (r) { const s = price(r.px, r.cur); if (el.textContent !== s) { el.textContent = s; if (changed.includes(r.tk)) { const q = D.quotes[r.tk]; flash(el, q ? Math.sign(q.px - q.was) : 0); } } } });
  document.querySelectorAll('[data-live="day"]').forEach((el) => { const r = by[el.dataset.tk]; if (r) { el.textContent = pct(r.dayPct); el.classList.remove("up", "down"); const c = tone(r.dayPct); if (c) el.classList.add(c); } });
  document.querySelectorAll('[data-live="val"]').forEach((el) => { const r = by[el.dataset.tk]; if (r) el.textContent = money(r.valueUsd, 0); });
  pill();
}

window.PT_V2 = {
  applyLook, shell,
  async setLanguage(code) { await setLang(code); await loadNews(code, true); shell(); view(); },
  async reloadData() { await loadHistory(true); outlook.invalidate && outlook.invalidate(); loadStreet(); schedule(); },
};

async function boot() {
  applyLook(); await setLang(detectLang(), false);
  document.addEventListener("click", (e) => { const g = e.target.closest("[data-go]"); if (g) { e.preventDefault(); location.hash = g.dataset.go; } });
  bindInfo(document.body); window.addEventListener("hashchange", go);
  route = parse(); shell(); view();
  onData((what) => { if (what === "quotes") return; if (what === "history") { shell(); } schedule(); });
  live.subscribe(({ changed }) => paintAll(changed));
  setInterval(pill, 15000);
  await init(getLang());
  live.start(); shell(); view();
  if (/[?&]billing=success/.test(location.search)) { history.replaceState(null, "", location.pathname + location.hash); const { toast } = await import("/core/util.js"); toast(t("Thank you. Your plan will update in a moment.")); setTimeout(() => location.reload(), 4000); }
}
boot();
