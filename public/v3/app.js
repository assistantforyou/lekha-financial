/* Portfolio Terminal v3 "Desk": every panel on one screen (holdings table, chart + analysts, news / events / market, Council strip).
   Same core, accounts, billing and dialogs as v2; a different way to look at the same portfolio. */
import { t, detectLang, setLang, getLang, fmtDate, fmtAgo } from "/core/i18n.js";
import { D, init, onData, loadNews, loadHistory, loadStreet, positions, totals, portfolioSeries } from "/core/data.js";
import * as live from "/core/live.js";
import { prefs, isDemo, signedIn } from "/core/store.js";
import { runCouncil, buildEvents } from "/core/council.js";
import { LineChart } from "/core/charts.js";
import { cacheGet, cacheSet } from "/core/cache.js";
import { esc } from "/core/util.js";
import { icon, bindInfo, money, moneySigned, pct, price, tone, curr, openSheet } from "/v2/ui.js";
import { openAuth, openAsk, openAdd, openImport, confirmRemove } from "/v2/sheets.js";
import { RANGES, rangeLabel, segHtml, bindSeg, lastN, streetBlock, impactPill, leanBar, leanLabel, leanTone, eventName, dateChip, inDays, sectorName } from "/v2/views/shared.js";
import me from "/v2/views/me.js";
import analysis from "/v2/views/analysis.js";
import { personaName, personaStyle, PERSONA_META, reasonText } from "/v2/views/outlook.js";
import { reasons, PERSONAS } from "/core/council.js";

const $ = (s) => document.querySelector(s);
let mode = "desk", sel = null, range = "1Y", feed = "news", pane = "main", C = null, chart = null, raf = 0, running = false;

function applyLook() {
  const p = prefs.get(), r = document.documentElement;
  if (p.theme === "light" || p.theme === "dark") r.setAttribute("data-theme", p.theme); else r.removeAttribute("data-theme");
  r.style.setProperty("--z", { S: 0.92, M: 1, L: 1.12, XL: 1.25 }[p.size] || 1);
}
/* ---------- bar, tape, mobile tabs ---------- */
function bar() {
  $("#bar").innerHTML = `<span class="brand">${icon("trend")} <span>Portfolio Terminal</span></span><input id="cmd" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="${esc(t("Jump to a ticker…"))}" aria-label="${esc(t("Jump to a ticker…"))}"><div class="seg" id="modes"><button data-m="desk" aria-pressed="${mode === "desk"}">${esc(t("Today"))}</button><button data-m="analysis" aria-pressed="${mode === "analysis"}">${esc(t("Analysis"))}</button></div><span class="sp"></span><span class="live" id="livepill"><b></b><span>…</span></span><button class="btn sm" id="ask">${icon("spark")} ${esc(t("Ask"))}</button><button class="iconbtn" id="cur">${curr() === "THB" ? "THB ฿" : "USD $"}</button>${signedIn() ? `<button class="iconbtn" id="acct" aria-label="${esc(t("Account"))}">${icon("me")}</button>` : `<button class="btn primary sm" id="signin">${esc(t("Sign in"))}</button><button class="iconbtn" id="acct" aria-label="${esc(t("Account"))}">${icon("me")}</button>`}`;
  $("#modes").onclick = (e) => { const b = e.target.closest("button[data-m]"); if (b) setMode(b.dataset.m); };
  $("#ask").onclick = openAsk; $("#acct").onclick = account;
  $("#cur").onclick = () => { prefs.set({ cur: curr() === "THB" ? "USD" : "THB" }); bar(); renderAll(); };
  const s = $("#signin"); if (s) s.onclick = () => openAuth("login");
  const c = $("#cmd");
  c.addEventListener("keydown", (e) => { if (e.key === "Enter") { const v = c.value.trim().toUpperCase(), r = positions().find((x) => !x.cash && x.tk.startsWith(v)); if (r) { sel = r.tk; pane = "main"; renderAll(); } c.value = ""; } if (e.key === "Escape") { c.value = ""; c.blur(); } });
  pill();
  $("#mtabs").innerHTML = [["hold", t("Holdings")], ["main", t("Price history")], ["feed", t("News")], ["council", t("Outlook")]].map(([k, l]) => `<button data-k="${k}" aria-pressed="${pane === k}">${esc(l)}</button>`).join("");
}
let anDone = false;
function setMode(m) {
  mode = m; const an = m === "analysis";
  $("#an").hidden = !an; $("#desk").hidden = an; $("#tape").hidden = an; $("#mtabs").style.display = an ? "none" : "";
  if (an && !anDone) { $("#an").innerHTML = analysis.render(); analysis.mount($("#an"), { rerender() {} }); anDone = true; }
  document.querySelectorAll("#modes button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.m === m));
}
function pill() { const el = $("#livepill"); if (!el) return; const s = D.session; el.classList.toggle("on", s === "open" || s === "pre" || s === "post"); el.lastElementChild.textContent = !D.loaded.history ? t("Loading…") : s === "open" ? t("Live") : s === "pre" || s === "post" ? t("Extended hours") : t("Market closed"); }
function tape() {
  const rows = positions().filter((r) => !r.cash), one = rows.map((r) => `<span class="t" data-tk="${esc(r.tk)}"><b>${esc(r.tk)}</b> <span data-live="px" data-tk="${esc(r.tk)}">${esc(price(r.px, r.cur))}</span> <span class="${tone(r.dayPct)}" data-live="day" data-tk="${esc(r.tk)}">${esc(pct(r.dayPct))}</span></span>`).join("");
  $("#tape").innerHTML = rows.length ? `<div class="run">${one}${one}</div>` : "";
}
/* ---------- panes ---------- */
function holdPane() {
  const rows = positions(), tot = totals(rows), inv = rows.filter((r) => !r.cash).sort((a, b) => b.valueUsd - a.valueUsd);
  if (!inv.length) return `<div class="empty"><p>${esc(t("Type a ticker and how many shares you own, or import a broker statement."))}</p><div class="row" style="justify-content:center"><button class="btn primary sm" data-act="add">${icon("plus")} ${esc(t("Add a holding"))}</button><button class="btn sm" data-act="import">${icon("file")} ${esc(t("Import a statement"))}</button></div></div>`;
  return `<div class="ch"><h2>${esc(t("Holdings"))}</h2><span class="sp row"><button class="btn sm" data-act="add">${icon("plus")}</button><button class="btn sm" data-act="import">${icon("file")}</button></span></div>
    <table class="t"><thead><tr><th>${esc(t("Ticker"))}</th><th>${esc(t("Price"))}</th><th>${esc(t("Today"))}</th><th>${esc(t("Value"))}</th><th>${esc(t("Size"))}</th><th>${esc(t("Gain"))}</th></tr></thead><tbody>
    <tr class="hr ${sel == null ? "sel" : ""}" data-tk=""><td class="k">${esc(t("Total value"))}</td><td></td><td class="${tone(tot.dayPct)}" data-live="daypct-t">${esc(pct(tot.dayPct))}</td><td data-live="total">${esc(money(tot.value, 0))}</td><td>100%</td><td class="${tone(tot.pnl)}">${tot.pnlPct != null ? esc(pct(tot.pnlPct, 1)) : "–"}</td></tr>
    ${inv.map((r) => `<tr class="hr ${sel === r.tk ? "sel" : ""}" data-tk="${esc(r.tk)}"><td class="k">${esc(r.tk)}</td><td data-live="px" data-tk="${esc(r.tk)}">${esc(price(r.px, r.cur))}</td><td class="${tone(r.dayPct)}" data-live="day" data-tk="${esc(r.tk)}">${esc(pct(r.dayPct))}</td><td data-live="val" data-tk="${esc(r.tk)}">${esc(money(r.valueUsd, 0))}</td><td>${esc(pct(r.weight, 0, false))}</td><td class="${tone(r.pnlUsd)}">${r.pnlPct != null && r.costUsd ? esc(pct(r.pnlPct, 0)) : "–"}</td></tr>`).join("")}
    ${tot.cash ? `<tr><td class="k">${esc(t("Cash"))}</td><td></td><td></td><td>${esc(money(tot.cash, 0))}</td><td>${esc(pct(tot.cash / tot.value, 0, false))}</td><td></td></tr>` : ""}</tbody></table>`;
}
function mainPane() {
  const rows = positions(), tot = totals(rows), r = sel ? rows.find((x) => x.tk === sel) : null;
  if (!rows.some((x) => !x.cash)) return "";
  const head = r ? `<div class="mh"><span class="big">${esc(r.tk)}</span><span class="big" data-live="px" data-tk="${esc(r.tk)}">${esc(price(r.px, r.cur))}</span><span class="pill ${tone(r.dayPct)}" data-live="day" data-tk="${esc(r.tk)}">${esc(pct(r.dayPct))}</span><span class="muted">${esc(r.theme || "")}</span><span class="sp row"><button class="btn sm" data-edit="${esc(r.tk)}">${esc(t("Edit"))}</button><button class="btn sm danger" data-del="${esc(r.tk)}">${esc(t("Remove"))}</button></span></div>`
    : `<div class="mh"><span class="big" data-live="total">${esc(money(tot.value, 0))}</span><span class="${tone(tot.day)}" data-live="dayusd">${esc(moneySigned(tot.day, 0))}</span><span class="pill ${tone(tot.dayPct)}" data-live="daypct">${esc(pct(tot.dayPct))}</span><span class="muted">${esc(t("Total value"))}</span></div>`;
  const st = r && r.st || {};
  const kv = r ? `<div class="kv" style="margin:.6rem 0"><div><span>${esc(t("Shares"))}</span><b>${esc(r.qty)}</b></div><div><span>${esc(t("Value"))}</span><b>${esc(money(r.valueUsd, 0))}</b></div><div><span>${esc(t("Gain or loss"))}</span><b class="${tone(r.pnlUsd)}">${r.costUsd ? esc(moneySigned(r.pnlUsd, 0)) : "–"}</b></div><div><span>${esc(t("Share of portfolio"))}</span><b>${esc(pct(r.weight, 1, false))}</b></div><div><span>${esc(t("From 1-year high"))}</span><b class="${tone(st.from52)}">${st.from52 != null ? esc(pct(st.from52, 1)) : "–"}</b></div><div><span>${esc(t("Past month"))}</span><b class="${tone(st.m1)}">${st.m1 != null ? esc(pct(st.m1, 1)) : "–"}</b></div></div>` : "";
  const heads = r ? ((D.tnews[r.tk] && D.tnews[r.tk].items) || []).slice(0, 4) : [];
  return `${head}${segHtml("rg", RANGES.map(([k]) => [k, rangeLabel(k)]), range)}<div id="mc" style="min-height:15rem;margin-top:.5rem"></div><div class="small" id="mg" style="margin:.3rem 0"></div>${kv}
    ${r ? `<div class="grid cols2"><div class="card"><h2 class="ch">${esc(t("What analysts think"))}</h2>${streetBlock(r.tk, r.px, r.cur)}</div><div class="card"><h2 class="ch">${esc(t("Latest headlines"))}</h2>${heads.length ? heads.map((n) => `<div class="news-i"><a class="hl" style="color:var(--ink);text-decoration:none" href="${esc(n.url)}" target="_blank" rel="noopener noreferrer">${esc(n.h)}</a><span class="tiny muted">${esc(n.src)}</span></div>`).join("") : `<div class="muted small">${esc(t("No recent headlines."))}</div>`}</div></div>` : ""}`;
}
function feedPane() {
  const tabs = segHtml("fd", [["news", t("News")], ["events", t("Coming up")], ["mood", t("Markets")]], feed);
  let b = "";
  if (feed === "news") b = D.news.length ? D.news.map((n) => `<div class="news-i"><button><span class="row">${impactPill(n.impact)}<span class="tiny muted">${esc(n.source)}</span></span><span class="hl">${esc(n.headline)}</span><span class="tags">${(n.tickers || []).slice(0, 4).map((x) => `<span class="tag">${esc(x)}</span>`).join("")}</span></button><div class="det"><span>${esc(n.summary)}</span>${n.why ? `<span><b>${esc(t("Why it matters"))}:</b> ${esc(n.why)}</span>` : ""}${n.url ? `<a href="${esc(n.url)}" target="_blank" rel="noopener noreferrer">${esc(t("Read the full story"))}</a>` : ""}</div></div>`).join("") : `<div class="skel" style="height:5rem"></div>`;
  else if (feed === "events") b = buildEvents().slice(0, 8).map((e) => `<div class="evt">${dateChip(e.date)}<span><b>${esc(eventName(e))}</b><br><span class="tiny muted">${esc(inDays(e.calDays))}${e.approx ? " · " + esc(t("estimated date")) : ""}</span></span><span style="width:5rem">${leanBar(e.lean)}<span class="tiny ${leanTone(e.lean)}" style="display:block;text-align:center">${esc(leanLabel(e.lean))}</span></span></div>`).join("") || `<div class="muted small">${esc(t("No dated events found yet."))}</div>`;
  else { const f = D.fgi, v = D.vix, m = D.macro; b = `<div class="tiles">${[[t("Fear and greed"), f ? Math.round(f.score) : "–"], [t("Expected swings (VIX)"), v ? v.v.toFixed(1) : "–"], [t("10-year interest rate"), m && m.ten ? m.ten.v.toFixed(2) + "%" : "–"], [t("Inflation (yearly)"), m && m.cpi ? m.cpi.v.toFixed(1) + "%" : "–"]].map(([n, v2]) => `<div class="tile"><span>${esc(n)}</span><b>${esc(v2)}</b></div>`).join("")}</div><table class="t" style="margin-top:.8rem"><tbody>${D.sectors.map((s) => `<tr><td class="k">${esc(sectorName(s.sym))}</td><td class="${tone(s.m1)}">${esc(pct(s.m1, 1))}</td><td class="${tone(s.rel1m)}">${esc(pct(s.rel1m, 1))}</td></tr>`).join("")}</tbody></table>`; }
  return `<div class="ch"><h2>${esc(feed === "news" ? t("What is moving markets") : feed === "events" ? t("Events and what is already priced in") : t("The big picture"))}</h2></div><div style="margin-bottom:.6rem">${tabs}</div>${b}`;
}
function councilPane() {
  if (!C) return `<div class="small muted">${esc(running ? t("Running {n} simulated futures…", { n: "5,000" }) : t("Loading…"))}</div>`;
  const order = [...PERSONAS].sort((a, b) => C.res.personas[b].hz["1Y"].p50 - C.res.personas[a].hz["1Y"].p50);
  let lo = 0, hi = 0; for (const id of PERSONAS) { const h = C.res.personas[id].hz["1Y"]; lo = Math.min(lo, h.p5); hi = Math.max(hi, h.p95); }
  const at = (v) => ((v - lo) / (hi - lo || 1)) * 100;
  return `<div class="cc">${order.map((id) => { const h = C.res.personas[id].hz["1Y"]; return `<button class="cm" data-p="${id}"><b style="color:${PERSONA_META[id].c}">${esc(personaName(id))}</b><span class="m ${tone(h.p50)}">${esc(pct(h.p50, 1))}</span><span class="rng"><span class="axis"></span><span class="zero" style="left:${at(0)}%"></span><span class="span" style="left:${at(h.p5)}%;width:${Math.max(1, at(h.p95) - at(h.p5))}%"></span><span class="med" style="left:${at(h.p50)}%"></span></span></button>`; }).join("")}</div>`;
}
function drawChart() {
  chart && chart.destroy(); chart = null;
  const host = $("#mc"); if (!host) return;
  const n = RANGES.find((x) => x[0] === range)[1], rows = positions(), r = sel ? rows.find((x) => x.tk === sel) : null;
  const src = r ? D.series[r.tk] : portfolioSeries(rows);
  if (!src || src.length < 2) { host.innerHTML = `<div class="empty small">${esc(t("Prices are loading…"))}</div>`; return; }
  const P = lastN(src, n), v0 = P[0][1], up = P[P.length - 1][1] >= v0, days = (P[P.length - 1][0] - P[0][0]) / 864e5, k = r ? 1 : curr() === "THB" ? D.fx.usdthb : 1;
  const series = [{ id: "a", color: "var(--chart)", pts: P, area: true }];
  if (!r && D.bench.sp.length) { const B = D.bench.sp.filter((p) => p[0] >= P[0][0]), b0 = B[0] && B[0][1]; if (b0) series.push({ id: "b", color: "var(--chart2)", pts: B.map((p) => [p[0], (p[1] / b0) * v0]), width: 1.6, dash: "5 4" }); }
  chart = LineChart(host, { series, height: 260, label: t("Price history"), xFmt: (x) => fmtDate(new Date(x), days > 500 ? { month: "short", year: "2-digit" } : { day: "numeric", month: "short" }), yFmt: (v) => (r ? price(v, r.cur) : money(v, 0)).replace(/\.00$/, ""), tip: (x, rr) => `<b>${esc(fmtDate(new Date(x), { day: "numeric", month: "short", year: "numeric" }))}</b><br>${esc(r ? price(rr[0].p[1], r.cur) : money(rr[0].p[1], 0))}${rr[1] ? `<br>${esc(t("S&P 500"))} ${esc(pct(rr[1].p[1] / v0 - 1, 1))}` : ""}` });
  const g = $("#mg"); if (g) g.innerHTML = `<span class="${tone(up ? 1 : -1)}">${esc(pct(P[P.length - 1][1] / v0 - 1, 1))}</span> ${esc(t("over this period"))}`;
}
/* ---------- render + live paint ---------- */
function put(sel2, html) { const el = $(sel2), y = el.scrollTop; el.innerHTML = html; el.scrollTop = y; }
function renderAll() {
  bar(); setMode(mode); tape(); put("#p-hold", holdPane()); put("#p-main", mainPane()); put("#p-feed", feedPane()); put("#p-council", councilPane());
  $("#desk").dataset.show = pane; if (mode === "desk") drawChart();
}
const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(renderAll); };
function flash(el, d) { if (!el || !d) return; el.classList.remove("fl-up", "fl-down"); void el.offsetWidth; el.classList.add(d > 0 ? "fl-up" : "fl-down"); }
function paint(changed = []) {
  const rows = positions(), tot = totals(rows), by = Object.fromEntries(rows.map((r) => [r.tk, r])), all = (s, fn) => document.querySelectorAll(s).forEach(fn);
  all('[data-live="total"]', (e) => (e.textContent = money(tot.value, 0))); all('[data-live="dayusd"]', (e) => { e.textContent = moneySigned(tot.day, 0); e.className = tone(tot.day); });
  all('[data-live="daypct"]', (e) => { e.textContent = pct(tot.dayPct); e.className = "pill " + tone(tot.dayPct); }); all('[data-live="daypct-t"]', (e) => { e.textContent = pct(tot.dayPct); e.className = tone(tot.dayPct); });
  all('[data-live="px"]', (e) => { const r = by[e.dataset.tk]; if (r) { const s = price(r.px, r.cur); if (e.textContent !== s) { e.textContent = s; if (changed.includes(r.tk)) { const q = D.quotes[r.tk]; flash(e, q ? Math.sign(q.px - q.was) : 0); } } } });
  all('[data-live="day"]', (e) => { const r = by[e.dataset.tk]; if (r) { e.textContent = pct(r.dayPct); e.classList.remove("up", "down"); const c = tone(r.dayPct); if (c) e.classList.add(c); } });
  all('[data-live="val"]', (e) => { const r = by[e.dataset.tk]; if (r) e.textContent = money(r.valueUsd, 0); });
  pill();
}
/* ---------- council ---------- */
async function ensureCouncil() {
  if (C || running || !D.loaded.history || !positions().some((r) => !r.cash)) return;
  running = true; renderCouncilOnly();
  const ck = "council:" + (isDemo() ? "d" : "r") + ":" + positions().map((r) => r.tk + Math.round(r.qty)).join("|") + ":5000:" + new Date().toISOString().slice(0, 10);
  try { const hit = await cacheGet(ck, 3 * 36e5); if (hit) C = { res: hit.result, inp: hit.input }; else { const o = await runCouncil(5000); C = { res: o.result, inp: o.input }; cacheSet(ck, o); } } catch (e) { /* stays empty */ }
  running = false; renderCouncilOnly();
}
const renderCouncilOnly = () => put("#p-council", councilPane());
function openPersona(id) {
  const P = C.res.personas[id], h = P.hz["1Y"], R = reasons(C.res, C.inp, id, "1Y");
  openSheet({ title: personaName(id), body: `<p class="small muted" style="margin-top:0">${esc(personaStyle(id))}</p><div id="pf" style="min-height:14rem"></div><div class="kv" style="margin:.8rem 0"><div><span>${esc(t("Chance of a gain"))}</span><b>${Math.round(h.pGain * 100)}%</b></div><div><span>${esc(t("Typical worst dip"))}</span><b>${Math.round(h.ddMed * 100)}%</b></div><div><span>${esc(t("Bad case (1 in 20)"))}</span><b class="${tone(h.p5)}">${esc(pct(h.p5, 0))}</b></div><div><span>${esc(t("Good case (1 in 20)"))}</span><b class="up">${esc(pct(h.p95, 0))}</b></div></div><h3>${esc(t("Why this outcome"))}</h3><ul class="bul">${R.map((r) => `<li>${esc(reasonText(r))}</li>`).join("")}</ul>`, onMount(el) {
    const f = P.fan, y = C.res.personas.you.fan, toV = (p, k) => [p.day, p[k] * 100], dateAt = (d) => new Date(Date.now() + d * (365 / 252) * 864e5);
    const series = [{ id: "p", color: PERSONA_META[id].c, pts: f.map((p) => toV(p, "p50")), width: 3 }]; if (id !== "you") series.push({ id: "y", color: "var(--chart2)", pts: y.map((p) => toV(p, "p50")), dash: "5 4", width: 1.6 });
    LineChart(el.querySelector("#pf"), { series, bands: [{ hi: f.map((p) => toV(p, "p95")), lo: f.map((p) => toV(p, "p5")), color: PERSONA_META[id].c, opacity: 0.12 }, { hi: f.map((p) => toV(p, "p75")), lo: f.map((p) => toV(p, "p25")), color: PERSONA_META[id].c, opacity: 0.22 }], ref: 0, height: 230, label: t("Range of simulated outcomes"), xFmt: (x) => fmtDate(dateAt(x), { day: "numeric", month: "short" }), yFmt: (v) => (v > 0 ? "+" : "") + Math.round(v) + "%", tip: (x, rr) => `<b>${esc(fmtDate(dateAt(x), { day: "numeric", month: "short" }))}</b><br>${esc(pct(rr[0].p[1] / 100, 1))}` });
  } });
}
function account() { const b = openSheet({ title: t("Account"), body: "", onMount(el) { const draw = () => { el.innerHTML = me.render(); me.mount(el, { rerender: draw }); }; draw(); } }); }

/* ---------- boot ---------- */
window.PT_V2 = { applyLook, shell: () => { bar(); renderAll(); }, async setLanguage(code) { await setLang(code); await loadNews(code, true); C = null; renderAll(); ensureCouncil(); }, async reloadData() { await loadHistory(true); C = null; loadStreet(); renderAll(); ensureCouncil(); } };
async function boot() {
  applyLook(); await setLang(detectLang(), false); bindInfo(document.body);
  document.addEventListener("click", (e) => {
    const x = e.target;
    const row = x.closest("tr.hr"); if (row) { sel = row.dataset.tk || null; if (innerWidth < 1000) pane = "main"; return renderAll(); }
    const tp = x.closest("#tape .t"); if (tp) { sel = tp.dataset.tk; pane = "main"; return renderAll(); }
    const mt = x.closest("#mtabs button"); if (mt) { pane = mt.dataset.k; $("#mtabs").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b === mt)); return ($("#desk").dataset.show = pane); }
    const a = x.closest("[data-act]"); if (a) return a.dataset.act === "add" ? openAdd() : openImport();
    const ed = x.closest("[data-edit]"); if (ed) return openAdd(ed.dataset.edit);
    const dl = x.closest("[data-del]"); if (dl) { const k = dl.dataset.del; if (sel === k) sel = null; return confirmRemove(k); }
    const ni = x.closest(".news-i button"); if (ni) return ni.parentElement.classList.toggle("open");
    const cm = x.closest(".cm"); if (cm && C) return openPersona(cm.dataset.p);
  });
  document.addEventListener("click", (e) => { const s = e.target.closest("#rg button[data-k]"); if (s) { range = s.dataset.k; document.querySelectorAll("#rg button").forEach((b) => b.setAttribute("aria-pressed", b === s)); drawChart(); } const f = e.target.closest("#fd button[data-k]"); if (f) { feed = f.dataset.k; put("#p-feed", feedPane()); } });
  document.addEventListener("keydown", (e) => { if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); $("#cmd").focus(); } });
  bar(); renderAll();
  onData((w) => { if (w === "quotes") return; if (w === "street" || w === "history") ensureCouncil(); schedule(); });
  live.subscribe(({ changed }) => paint(changed)); setInterval(pill, 15000);
  await init(getLang()); live.start(); renderAll(); ensureCouncil();
  if (/[?&]billing=success/.test(location.search)) { history.replaceState(null, "", location.pathname); const { toast } = await import("/core/util.js"); toast(t("Thank you. Your plan will update in a moment.")); setTimeout(() => location.reload(), 4000); }
}
boot();
