/* v2 Holdings: one tidy list. Tap a row and its details open right underneath it (chart, your position, what analysts think,
   headlines), so what you tap and what it shows are never far apart. */
import { t, fmtDate, fmtNum } from "/core/i18n.js";
import { D, positions, totals, rateOf } from "/core/data.js";
import { LineChart } from "/core/charts.js";
import { esc } from "/core/util.js";
import { icon, cardHead, money, moneySigned, pct, price, tone, curr } from "../ui.js";
import { RANGES, rangeLabel, segHtml, bindSeg, lastN, streetBlock, impactPill, inDays } from "./shared.js";
import { openAdd, openImport, confirmRemove } from "../sheets.js";

let sort = "value", open = null, charts = {}, hrange = {};
const COLORS = ["var(--chart)", "var(--chart3)", "#6b7bd6", "#c4568a", "#4aa3c7", "#8f6f3a", "#7aa35c", "#b55d4a"];
const sorters = { value: (a, b) => b.valueUsd - a.valueUsd, day: (a, b) => b.dayPct - a.dayPct, pnl: (a, b) => (b.pnlPct ?? -9) - (a.pnlPct ?? -9), weight: (a, b) => b.weight - a.weight };

function allocation(rows) {
  const by = {}; for (const r of rows) { const k = r.cash ? t("Cash") : r.theme || t("Other"); by[k] = (by[k] || 0) + r.valueUsd; }
  const tot = Object.values(by).reduce((s, x) => s + x, 0) || 1, list = Object.entries(by).sort((a, b) => b[1] - a[1]);
  return `<div class="alloc" role="img" aria-label="${esc(t("Allocation by theme"))}">${list.map(([k, v], i) => `<i style="flex:${v};background:${COLORS[i % COLORS.length]}" title="${esc(k)}"></i>`).join("")}</div>
    <div class="legend">${list.map(([k, v], i) => `<span><i style="background:${COLORS[i % COLORS.length]};height:.6rem;width:.6rem;border-radius:50%"></i>${esc(k)} ${esc(pct(v / tot, 0, false))}</span>`).join("")}</div>`;
}
function rowHtml(r) {
  const isOpen = open === r.tk, nat = r.cur;
  return `<div class="hrow ${isOpen ? "open" : ""}" data-tk="${esc(r.tk)}" id="h-${esc(r.tk)}">
    <button class="hhead" aria-expanded="${isOpen}"><span><span class="tk">${esc(r.tk)}</span><span class="sub">${esc(r.theme || "")}${r.acct ? " · " + esc(r.acct) : ""}</span></span>
      <span><span class="px" data-live="px" data-tk="${esc(r.tk)}" style="display:block">${esc(price(r.px, nat))}</span><span class="sub" style="display:block;text-align:right"><span class="${tone(r.dayPct)}" data-live="day" data-tk="${esc(r.tk)}">${esc(pct(r.dayPct))}</span> · <span data-live="val" data-tk="${esc(r.tk)}">${esc(money(r.valueUsd, 0))}</span></span></span>
      <span class="chev">${icon("chev")}</span></button>
    <div class="wbar" title="${esc(t("Share of portfolio"))}"><i style="width:${Math.min(100, r.weight * 100).toFixed(1)}%"></i></div>
    <div class="hbody" id="b-${esc(r.tk)}"></div></div>`;
}
function body(r) {
  const nat = r.cur, avg = r.qty ? (D.holdings.items.find((h) => h.tk === r.tk) || {}).cost / r.qty : null, st = r.st || {}, tn = D.tnews[r.tk], earn = D.earnings[r.tk];
  const heads = ((tn && tn.items) || []).slice(0, 3), mine = D.news.filter((n) => (n.tickers || []).includes(r.tk)).slice(0, 2);
  const hl = [...mine.map((n) => ({ h: n.headline, url: n.url, src: n.source, tone: n.impact })), ...heads.map((n) => ({ h: n.h, url: n.url, src: n.src, tone: null }))].slice(0, 4);
  return `<div class="stack">
      <div class="row">${segHtml("r-" + r.tk, RANGES.filter((x) => x[0] !== "6M").map(([k]) => [k, rangeLabel(k)]), hrange[r.tk] || "1Y")}</div>
      <div id="c-${esc(r.tk)}" style="min-height:12rem"></div>
      <div class="kv">
        <div><span>${esc(t("Shares"))}</span><b>${esc(fmtNum(r.qty, r.qty % 1 ? 2 : 0))}</b></div>
        <div><span>${esc(t("Average cost"))}</span><b>${avg ? esc(price(avg, nat)) : "–"}</b></div>
        <div><span>${esc(t("Value"))}</span><b>${esc(money(r.valueUsd, 0))}</b></div>
        <div><span>${esc(t("Gain or loss"))}</span><b class="${tone(r.pnlUsd)}">${r.costUsd ? esc(moneySigned(r.pnlUsd, 0)) + " · " + esc(pct(r.pnlPct, 1)) : "–"}</b></div>
        <div><span>${esc(t("Share of portfolio"))}</span><b>${esc(pct(r.weight, 1, false))}</b></div>
        <div><span>${esc(t("From 1-year high"))}</span><b class="${tone(st.from52)}">${st.from52 != null ? esc(pct(st.from52, 1)) : "–"}</b></div>
        <div><span>${esc(t("Past month"))}</span><b class="${tone(st.m1)}">${st.m1 != null ? esc(pct(st.m1, 1)) : "–"}</b></div>
        <div><span>${esc(t("Since January"))}</span><b class="${tone(st.ytd)}">${st.ytd != null ? esc(pct(st.ytd, 1)) : "–"}</b></div>
      </div></div>
    <div class="stack"><div>${cardHead(t("What analysts think"), `<p>${esc(t("How many analysts say Buy, Hold or Sell, and where they think the price is heading over the next year."))}</p>`).replace('class="ch"', 'class="ch" style="margin-bottom:.4rem"')}${streetBlock(r.tk, r.px, nat)}</div>
      ${earn ? `<div class="pill" style="justify-self:start">${esc(t("Earnings {when}", { when: inDays(Math.max(0, Math.round((Date.parse(earn.date) - Date.now()) / 864e5))) }))} · ${esc(fmtDate(new Date(earn.date + "T00:00:00Z")))}</div>` : ""}
      <div><h3 style="margin-bottom:.3rem">${esc(t("Latest headlines"))}</h3>${hl.length ? hl.map((n) => `<div class="news-i"><span class="row">${n.tone ? impactPill(n.tone) : ""}<span class="tiny muted">${esc(n.src || "")}</span></span>${n.url ? `<a class="hl" style="color:var(--ink);text-decoration:none" href="${esc(n.url)}" target="_blank" rel="noopener noreferrer">${esc(n.h)}</a>` : `<span class="hl">${esc(n.h)}</span>`}</div>`).join("") : `<div class="muted small">${esc(t("No recent headlines."))}</div>`}</div></div>
    <div class="row wide"><button class="btn sm" data-edit="${esc(r.tk)}">${esc(t("Edit"))}</button><button class="btn sm danger" data-del="${esc(r.tk)}">${esc(t("Remove"))}</button></div>`;
}
function drawChart(tk) {
  const host = document.getElementById("c-" + tk); if (!host) return;
  const s = D.series[tk]; if (!s || s.length < 2) { host.innerHTML = `<div class="empty small">${esc(t("No price history for this stock."))}</div>`; return; }
  const r = positions().find((x) => x.tk === tk), n = RANGES.find((x) => x[0] === (hrange[tk] || "1Y"))[1], P = lastN(s, n), rate = 1, up = P[P.length - 1][1] >= P[0][1];
  const days = (P[P.length - 1][0] - P[0][0]) / 864e5;
  const opts = { series: [{ id: tk, color: up ? "var(--up)" : "var(--down)", pts: P, area: true }], height: 210, label: t("Price history"), xFmt: (x) => fmtDate(new Date(x), days > 500 ? { month: "short", year: "2-digit" } : { day: "numeric", month: "short" }), yFmt: (v) => price(v * rate, r ? r.cur : "USD").replace(/\.00$/, ""), tip: (x, rr) => `<b>${esc(fmtDate(new Date(x), { day: "numeric", month: "short", year: "numeric" }))}</b><br>${esc(price(rr[0].p[1], r ? r.cur : "USD"))}` };
  if (charts[tk]) charts[tk].destroy(); charts[tk] = LineChart(host, opts);
}
function openRow(root, tk) {
  const el = root.querySelector(`#h-${CSS.escape(tk)}`); if (!el) return;
  const was = open; open = open === tk ? null : tk;
  root.querySelectorAll(".hrow.open").forEach((x) => { x.classList.remove("open"); x.querySelector(".hhead").setAttribute("aria-expanded", "false"); });
  if (open) {
    const r = positions().find((x) => x.tk === tk); const b = el.querySelector(".hbody"); b.innerHTML = body(r); el.classList.add("open"); el.querySelector(".hhead").setAttribute("aria-expanded", "true");
    bindSeg(b, "r-" + tk, (k) => { hrange[tk] = k; drawChart(tk); }); drawChart(tk);
    requestAnimationFrame(() => el.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  }
}
export default {
  render() {
    const rows = positions(), tot = totals(rows).value;
    if (!rows.length) return `<div class="page"><div class="card"><div class="empty"><h2>${esc(t("No holdings yet"))}</h2><p>${esc(t("Add them one by one or import a broker statement."))}</p><div class="row" style="justify-content:center"><button class="btn primary" data-act="add">${icon("plus")} ${esc(t("Add a holding"))}</button><button class="btn" data-act="import">${icon("file")} ${esc(t("Import a statement"))}</button></div></div></div></div>`;
    const list = [...rows].sort(sorters[sort]);
    return `<div class="page">
      <div class="card">${cardHead(t("Where your money is"), `<p>${esc(t("Your holdings grouped by theme. A single colour taking up most of the bar means your results depend heavily on that one area."))}</p>`, `<button class="btn sm" data-act="add">${icon("plus")} ${esc(t("Add"))}</button><button class="btn sm" data-act="import">${icon("file")} ${esc(t("Import"))}</button>`)}${allocation(rows)}</div>
      <div class="row">${segHtml("srt", [["value", t("Value")], ["day", t("Today")], ["pnl", t("Gain")], ["weight", t("Size")]], sort)}<span class="small muted sp">${esc(t("{n} holdings · {v}", { n: rows.filter((r) => !r.cash).length, v: money(tot, 0) }))}</span></div>
      <div class="stack" id="hlist">${list.map((r) => (r.cash ? "" : rowHtml(r))).join("")}${list.filter((r) => r.cash).map((r) => `<div class="card flat row"><b>${esc(t("Cash"))}</b><span class="muted small">${esc(r.cur)}</span><b class="sp">${esc(money(r.valueUsd, 0))}</b></div>`).join("")}</div></div>`;
  },
  mount(root, ctx) {
    charts = {};
    bindSeg(root, "srt", (k) => { sort = k; ctx.rerender(); });
    root.addEventListener("click", (e) => {
      const h = e.target.closest(".hhead"); if (h) return openRow(root, h.parentElement.dataset.tk);
      const a = e.target.closest("[data-act]"); if (a) return a.dataset.act === "add" ? openAdd() : openImport();
      const ed = e.target.closest("[data-edit]"); if (ed) return openAdd(ed.dataset.edit);
      const dl = e.target.closest("[data-del]"); if (dl) return confirmRemove(dl.dataset.del);
    });
    const want = ctx.param || open;
    if (want) { open = null; const r = positions().find((x) => x.tk === want); if (r) openRow(root, want); }
  },
};
