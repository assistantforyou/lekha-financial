/* LEKHA V3 Holdings Deep Analysis: one holding at a time, assembled from data the page already holds
   (positions, price history, intrinsic-value results, news). Editing stays in My Portfolio. No AI calls here. */
import { tickerRisk } from "./lekha-sim.js";

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pc = (x, d = 1) => x == null || !isFinite(x) ? "–" : (x > 0 ? "+" : x < 0 ? "−" : "") + Math.abs(x * 100).toFixed(d) + "%";
const tone = (x) => (x > 0 ? "up" : x < 0 ? "down" : "");
const RANGES = [["1M", 31], ["3M", 92], ["6M", 183], ["1Y", 366]];
let host, sel = null, range = "1Y", street = {};

function L() { return window.PT_APP && PT_APP.lekha; }
function list() { try { const { list, total } = L().aggregate(); return { inv: list.filter((a) => a.ticker !== "CASH").sort((a, b) => b.value - a.value), total }; } catch (e) { return { inv: [], total: 0 }; } }
function money(v) { return L() ? L().money(v, 0) : "$" + Math.round(v); }
function valOf(tk) {
  const S = PT_APP.S; try { if (!S.vres && S.fundLoaded) L().computeVal(); } catch (e) {}
  return S.vres && S.vres.res && S.vres.res[tk];
}
function render() {
  const { inv } = list();
  if (!inv.length) { host.innerHTML = `<section class="panel"><div class="ph"><h2>Holdings Deep Analysis</h2></div><div class="empty">Add holdings in My Portfolio → Holdings to research them here.</div></section>`; return; }
  if (!sel || !inv.find((a) => a.ticker === sel)) sel = inv[0].ticker;
  const a = inv.find((x) => x.ticker === sel), S = PT_APP.S, v = valOf(sel), rk = tickerRisk(a.symbol || a.ticker);
  const news = [];
  (S.news || []).forEach((d) => (d.items || []).forEach((n) => { if ((n.tickers || []).includes(sel)) news.push({ ...n, date: d.date }); }));
  const kv = (k, val, cls = "") => `<div><span>${k}</span><b class="${cls}">${val}</b></div>`;
  const val = v && v.px ? `<div class="dp-kv">${kv("Bear value", isFinite(v.down) ? pc(v.down) + " vs price" : "–", "down")}${kv("Base value", pc(v.up) + " vs price", tone(v.up))}${kv("Bull value", isFinite(v.bullUp) ? pc(v.bullUp) + " vs price" : "–", "up")}
      ${kv("Margin of safety", pc(v.mos), tone(v.mos))}${kv("Required MOS", pc(v.reqMos, 0))}${kv("Buy-below price", v.buy ? "$" + v.buy.toFixed(2) : "–")}${kv("Screen result", esc(v.status === "pass" ? "Meets required MOS" : v.status === "near" ? "Within 10 points" : v.status === "fail" ? "Fails" : v.status || "–"), v.status === "pass" ? "up" : v.status === "fail" ? "down" : "")}${kv("Method · confidence", esc((v.method || "–") + " · " + (v.conf || "–")))}</div>
      <p class="note">From the Intrinsic Value model (same calculation as V2). <a href="#/analysis/value" id="dp-val">Open the full stock model</a></p>` : `<p class="note">${v && v.notes ? esc(v.notes.join(" ")) : "No intrinsic value for this holding yet (funds, missing fundamentals, or still loading)."} <a href="#/analysis/value">Intrinsic Value tab</a></p>`;
  const st = street[sel];
  host.innerHTML = `<section class="panel dp">
  <div class="ph"><h2>Holdings Deep Analysis</h2><span class="note">Research view built from your existing holdings data · edit positions in My Portfolio</span></div>
  <div class="v3sub dp-pick" role="tablist" aria-label="Holding">${inv.map((x) => `<button role="tab" data-tk="${esc(x.ticker)}" aria-selected="${x.ticker === sel}">${esc(x.ticker)}</button>`).join("")}</div>
  <div class="dp-head"><span class="dp-tk">${esc(a.ticker)}</span><span class="dp-px">${a.price != null ? "$" + a.price.toFixed(2) : "–"}</span><span class="pill ${tone(a.day)}">${pc(a.day)} today</span><span class="muted">${esc(a.theme || "")}</span>
    <span class="sp"></span><button class="btn pri" id="dp-ask" type="button">Ask the Council about ${esc(a.ticker)}</button></div>
  <div class="seg" id="dp-rg" role="group" aria-label="Chart range">${RANGES.map(([k]) => `<button data-r="${k}" aria-pressed="${k === range}">${k}</button>`).join("")}</div>
  <div class="chart" id="dp-chart"></div>
  <div class="dp-cols">
    <div><h3>Position</h3><div class="dp-kv">${kv("Market value", esc(money(a.value)))}${kv("Weight", pc(a.weight, 1).replace("+", ""))}${kv("Cost basis", esc(money(a.cost)))}${kv("Unrealized P&amp;L", esc(money(a.pnl)) + " · " + pc(a.pnlPct), tone(a.pnl))}${kv("1 month", pc(a.m1), tone(a.m1))}${kv("Year to date", pc(a.ytd), tone(a.ytd))}${kv("From 52-week high", pc(a.from52), tone(a.from52))}</div></div>
    <div><h3>Risk</h3><div class="dp-kv">${rk ? kv("Beta vs S&amp;P 500", rk.beta.toFixed(2)) + kv("Volatility (1Y, annualised)", pc(rk.vol).replace("+", "")) + kv("Stock-specific volatility", pc(rk.idio).replace("+", "")) + kv("Return, last 12 months", pc(rk.y1), tone(rk.y1)) + kv("Risk contribution (weight × vol)", pc(a.weight * rk.vol, 2).replace("+", "")) : "<p class='note'>Not enough price history to estimate risk.</p>"}</div>
      <p class="note">Estimated from one year of daily prices. Factor-adjusted strength for this name is in <a href="#/sector/lead">Sector Rotation → Leadership Quality</a> (Holdings view).</p></div>
    <div><h3>Valuation</h3>${val}</div>
    <div><h3>Analysts</h3><div id="dp-street">${st ? streetHtml(st) : `<p class="note">${window.PT_DEMO_MODE || !window.PT_AUTH || !PT_AUTH.session() ? "Analyst ratings and price targets load for signed-in accounts." : "Loading analyst view…"}</p>`}</div></div>
  </div>
  <h3>Headlines mentioning ${esc(a.ticker)}</h3>${news.length ? `<div class="news">${news.slice(0, 6).map((n) => `<div class="dp-news"><span class="pill">${esc(n.impact || "")}</span> <b>${esc(n.headline)}</b><p>${esc(n.summary || "")}</p><span class="note">${esc(n.source || "")} · ${esc(n.date)}${n.url ? ` · <a href="${esc(n.url)}" target="_blank" rel="noopener noreferrer">Source</a>` : ""}</span></div>`).join("")}</div>` : `<p class="note">No headline in the current market briefing names this holding.</p>`}
  </section>`;
  host.querySelector(".dp-pick").onclick = (e) => { const b = e.target.closest("[data-tk]"); if (b) { sel = b.dataset.tk; render(); loadStreet(); } };
  host.querySelector("#dp-rg").onclick = (e) => { const b = e.target.closest("[data-r]"); if (b) { range = b.dataset.r; render(); } };
  host.querySelector("#dp-ask").onclick = () => { window.LEKHA_SHELL.go("analysis/council"); setTimeout(() => window.LEKHA_COUNCIL && LEKHA_COUNCIL.prefill(`Should I add to, hold or trim ${a.ticker}?`, a.ticker), 50); };
  const vl = host.querySelector("#dp-val"); if (vl) vl.onclick = () => { PT_APP.S.vSel = sel; };
  chart(a);
}
function chart(a) {
  const el = host.querySelector("#dp-chart"), h = PT_APP.S.hist && PT_APP.S.hist[a.symbol || a.ticker];
  if (!h || !h.D) { el.innerHTML = `<div class="empty">Loading price history…</div>`; return; }
  const last = h.D[h.D.length - 1][0], days = RANGES.find((r) => r[0] === range)[1], pts = h.D.filter((p) => p[0] >= last - days * 864e5);
  const c = a.cur === "HKD" ? "HK$" : a.cur === "THB" ? "฿" : "$";
  L().lineChart(el, pts, { label: a.ticker + " price", h: 220, fmt: (v, full) => c + (full ? v.toFixed(2) : v >= 1000 ? v.toFixed(0) : v.toFixed(v >= 100 ? 0 : 2)) });
}
function streetHtml(s) {
  if (s.err) return `<p class="note">${esc(s.err)}</p>`;
  const r = s.rating || s.ratings || {}, pt = s.pt || {};
  return `<div class="dp-kv">${r.buy != null ? `<div><span>Buy / Hold / Sell</span><b>${r.buy} / ${r.hold ?? "–"} / ${r.sell ?? "–"}</b></div>` : ""}${pt.mean ? `<div><span>Mean price target</span><b>$${(+pt.mean).toFixed(2)}</b></div>` : ""}${pt.low && pt.high ? `<div><span>Target range</span><b>$${(+pt.low).toFixed(0)} – $${(+pt.high).toFixed(0)}</b></div>` : ""}${s.earnings ? `<div><span>Next earnings</span><b>${esc(s.earnings.date || s.earnings)}</b></div>` : ""}</div><p class="note">Source: ${esc(s.src || s.source || "data provider")}. Nothing is estimated when a provider has no data.</p>`;
}
async function loadStreet() {
  const tk = sel; if (!tk || street[tk] || window.PT_DEMO_MODE || !window.PT_AUTH || !PT_AUTH.session()) return;
  try {
    const r = await PT_AUTH.fetch("/api/free/street", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbols: [tk] }) });
    const j = await r.json(); const d = j && (j[tk] || (j.data && j.data[tk]) || (j.items && j.items[tk]));
    street[tk] = d || { err: "No analyst data for this holding." };
  } catch (e) { street[tk] = { err: "Analyst data is unavailable right now." }; }
  if (sel === tk) { const el = host.querySelector("#dp-street"); if (el) el.innerHTML = streetHtml(street[tk]); }
}
export function mount(el) {
  host = el;
  const go = () => { const r = window.LEKHA_SHELL && LEKHA_SHELL.route(); if (r && r.t === "analysis" && r.s === "deep") { render(); loadStreet(); } };
  if (window.LEKHA_SHELL) LEKHA_SHELL.onRoute(() => go());
  go(); setInterval(() => { const r = LEKHA_SHELL.route(); if (r && r.t === "analysis" && r.s === "deep" && !host.querySelector(".dp")) go(); }, 2000);
}
