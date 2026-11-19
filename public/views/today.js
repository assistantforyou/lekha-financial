/* v2 Today: the ten-second answer. How much, how it moved, why, what is next. Everything else is one tap away. */
import { t, fmtDate, fmtAgo } from "/core/i18n.js";
import { D, positions, totals, portfolioSeries } from "/core/data.js";
import { buildEvents } from "/core/council.js";
import { LineChart } from "/core/charts.js";
import { esc, sum } from "/core/util.js";
import { icon, cardHead, money, moneySigned, pct, tone, price } from "../ui.js";
import { RANGES, rangeLabel, segHtml, bindSeg, lastN, leanBar, leanLabel, leanTone, eventName, dateChip, inDays, impactPill } from "./shared.js";
import { openAdd, openImport } from "../sheets.js";

let range = "1Y", chart = null, cmp = true;

function why(rows, tot) {
  if (!rows.some((r) => !r.cash)) return "";
  const inv = rows.filter((r) => !r.cash && r.dayUsd), best = [...inv].sort((a, b) => b.dayUsd - a.dayUsd)[0], worst = [...inv].sort((a, b) => a.dayUsd - b.dayUsd)[0];
  if (!best) return "";
  if (Math.abs(tot.dayPct) < 0.001 && Math.abs(best.dayPct) < 0.01) return t("A quiet day. Your portfolio has barely moved.");
  if (worst && worst.dayUsd < 0 && best.dayUsd > 0) return t("{a} helped most ({x}). {b} held you back most ({y}).", { a: best.tk, x: moneySigned(best.dayUsd, 0), b: worst.tk, y: moneySigned(worst.dayUsd, 0) });
  if (best.dayUsd > 0) return t("{a} helped most today ({x}).", { a: best.tk, x: moneySigned(best.dayUsd, 0) });
  return t("{b} held you back most today ({y}).", { b: worst.tk, y: moneySigned(worst.dayUsd, 0) });
}
function streetCard(rows) {
  let w = 0, buy = 0, up = 0, wu = 0, hold = 0, sell = 0;
  for (const r of rows) { if (r.cash) continue; const s = D.street[r.tk]; if (!s) continue; if (s.rating && s.rating.n) { const n = s.rating.n; buy += r.valueUsd * ((s.rating.sb + s.rating.b) / n); hold += r.valueUsd * (s.rating.h / n); sell += r.valueUsd * ((s.rating.s + s.rating.ss) / n); w += r.valueUsd; } if (s.pt && s.pt.mean && r.px) { up += r.valueUsd * (s.pt.mean / r.px - 1); wu += r.valueUsd; } }
  const body = !w && !wu ? `<div class="muted small">${esc(D.loaded.street ? t("No analyst data for your holdings yet.") : t("Loading analyst views…"))}</div>` : `
    ${w ? `<div class="rating"><i style="flex:${buy};background:var(--up)"></i><i style="flex:${hold};background:var(--chart2)"></i><i style="flex:${sell};background:var(--down)"></i></div>
    <div class="row small" style="margin:.45rem 0 .2rem"><span class="up"><b>${Math.round((buy / w) * 100)}%</b> ${esc(t("Buy"))}</span><span class="muted"><b>${Math.round((hold / w) * 100)}%</b> ${esc(t("Hold"))}</span><span class="down"><b>${Math.round((sell / w) * 100)}%</b> ${esc(t("Sell"))}</span></div>` : ""}
    ${wu ? `<div class="small">${esc(t("Average price target is"))} <b class="${tone(up / wu)}">${esc(pct(up / wu, 1))}</b> ${esc(t("away from today's prices."))}</div>` : ""}`;
  return `<div class="card">${cardHead(t("What analysts think"), `<p>${esc(t("Professional analysts rate each stock Buy, Hold or Sell and publish a price target. This blends them across your holdings, weighted by how much you own of each."))}</p><p>${esc(t("Targets are opinions, not promises."))}</p>`)}${body}</div>`;
}
function moodCard() {
  const f = D.fgi, v = D.vix;
  const lab = !f ? "" : f.score < 25 ? t("Extreme fear") : f.score < 45 ? t("Fear") : f.score < 56 ? t("Neutral") : f.score < 75 ? t("Greed") : t("Extreme greed");
  return `<div class="card">${cardHead(t("Market mood"), `<p>${esc(t("A 0 to 100 score of how nervous or greedy investors are. Low means fear, high means greed. Extremes often come before turning points, but not always."))}</p><p>${esc(t("VIX is the market's expected swing over the next month. Higher means more nervous."))}</p>`)}
    ${f ? `<div class="gauge"><b>${Math.round(f.score)}</b><span class="muted">${esc(lab)}</span></div><div class="fgbar"><i style="left:${Math.max(3, Math.min(97, f.score))}%"></i></div>` : `<div class="skel" style="height:3rem"></div>`}
    ${v ? `<div class="row small" style="margin-top:.5rem"><span class="muted">VIX</span><b>${v.v.toFixed(1)}</b><span class="${tone(-(v.v - v.prev))}">${v.v >= v.prev ? "▲" : "▼"} ${Math.abs(v.v - v.prev).toFixed(1)}</span></div>` : ""}</div>`;
}
function nextCard() {
  const ev = buildEvents().slice(0, 3);
  return `<div class="card">${cardHead(t("Coming up"), `<p>${esc(t("Dates that can move your holdings. The bar shows which way analysts and the news lean going in. A strongly bullish lean can already be priced in."))}</p>`, `<a class="small" href="#/outlook">${esc(t("See outlook"))}</a>`)}
    ${ev.length ? ev.map((e) => `<button class="evt" data-go="#/outlook/${esc(e.id)}">${dateChip(e.date)}<span><b>${esc(eventName(e))}</b><br><span class="tiny muted">${esc(inDays(e.calDays))}${e.approx ? " · " + esc(t("estimated date")) : ""}</span></span><span style="width:5.5rem">${leanBar(e.lean)}<span class="tiny ${leanTone(e.lean)}" style="display:block;text-align:center;margin-top:.2rem">${esc(leanLabel(e.lean))}</span></span></button>`).join("") : `<div class="muted small">${esc(t("No dated events found yet."))}</div>`}</div>`;
}
function storyCard() {
  const n = D.news[0];
  return `<div class="card">${cardHead(t("Top story"), `<p>${esc(t("The news is collected from public finance feeds, ranked and summarised by an AI model. Tap the story to see why it matters to you."))}</p>`, D.newsAt ? `<span class="tiny muted">${esc(fmtAgo(D.newsAt))}</span>` : "")}
    ${n ? `<div class="news-i" data-news><button><span class="row">${impactPill(n.impact)}<span class="tiny muted">${esc(n.source)}</span></span><span class="hl">${esc(n.headline)}</span></button><div class="det"><span>${esc(n.summary)}</span>${n.why ? `<span><b>${esc(t("Why it matters"))}:</b> ${esc(n.why)}</span>` : ""}${n.url ? `<a href="${esc(n.url)}" target="_blank" rel="noopener noreferrer">${esc(t("Read the full story"))}</a>` : ""}</div></div><a class="small" href="#/market">${esc(t("More news"))}</a>` : `<div class="skel" style="height:4rem"></div>`}</div>`;
}

function drawChart(root) {
  const host = root.querySelector("#pf-chart"); if (!host) return;
  const rows = positions(), pf = portfolioSeries(rows); if (pf.length < 2) { host.innerHTML = `<div class="empty">${esc(t("Prices are loading…"))}</div>`; return; }
  const n = RANGES.find((r) => r[0] === range)[1], P = lastN(pf, n), t0 = P[0][0], v0 = P[0][1], k = (v) => (curr() === "THB" ? v * D.fx.usdthb : v);
  const series = [{ id: "pf", label: t("You"), color: "var(--chart)", pts: P.map((p) => [p[0], p[1]]), area: true }];
  let sp = null;
  if (cmp && D.bench.sp.length) { const B = D.bench.sp.filter((p) => p[0] >= t0), b0 = B[0] && B[0][1]; if (b0) { sp = B.map((p) => [p[0], (p[1] / b0) * v0]); series.push({ id: "sp", label: t("S&P 500"), color: "var(--chart2)", pts: sp, width: 1.8, dash: "5 4" }); } }
  const hostDays = (P[P.length - 1][0] - t0) / 864e5, xf = (x) => fmtDate(new Date(x), hostDays > 500 ? { month: "short", year: "2-digit" } : { day: "numeric", month: "short" });
  const opts = { series, label: t("Portfolio value over time"), xFmt: xf, yFmt: (v) => money(v, 0).replace(/\.00$/, ""), tip: (x, r) => `<b>${esc(fmtDate(new Date(x), { day: "numeric", month: "short", year: "numeric" }))}</b><br>${esc(t("You"))} ${esc(money(r[0].p[1], 0))} (${esc(pct(r[0].p[1] / v0 - 1, 1))})${r[1] ? `<br>${esc(t("S&P 500"))} ${esc(pct(r[1].p[1] / v0 - 1, 1))}` : ""}` };
  if (chart) chart.update(opts); else chart = LineChart(host, opts);
  const end = P[P.length - 1][1], gain = end / v0 - 1, el = root.querySelector("#pf-gain");
  if (el) el.innerHTML = `<span class="${tone(gain)}">${esc(pct(gain, 1))}</span> ${esc(t("over this period"))}${sp ? ` · <span class="muted">${esc(t("S&P 500"))} ${esc(pct(sp[sp.length - 1][1] / v0 - 1, 1))}</span>` : ""}`;
}
import { curr } from "../ui.js";

export default {
  render() {
    const rows = positions(), tot = totals(rows);
    if (!rows.some((r) => !r.cash)) return `<div class="page"><div class="card"><div class="empty"><h2>${esc(t("Add your first holding"))}</h2><p>${esc(t("Type a ticker and how many shares you own, or import a broker statement."))}</p><div class="row" style="justify-content:center"><button class="btn primary" data-act="add">${icon("plus")} ${esc(t("Add a holding"))}</button><button class="btn" data-act="import">${icon("file")} ${esc(t("Import a statement"))}</button></div></div></div></div>`;
    const inv = rows.filter((r) => !r.cash && r.valueUsd), gain = [...inv].sort((a, b) => b.dayPct - a.dayPct).slice(0, 3), lose = [...inv].sort((a, b) => a.dayPct - b.dayPct).slice(0, 3).filter((r) => r.dayPct < 0 && !gain.includes(r));
    const mv = (r) => `<button class="mv" data-go="#/holdings/${esc(r.tk)}"><b>${esc(r.tk)}</b><span class="${tone(r.dayPct)}" data-live="day" data-tk="${esc(r.tk)}">${esc(pct(r.dayPct))}</span></button>`;
    return `<div class="page">
      <div class="grid">
        <div class="card hero full">
          <div class="row"><span class="muted small">${esc(t("Total value"))}</span></div>
          <div class="val" data-live="total">${esc(money(tot.value, 0))}</div>
          <div class="chg"><span class="${tone(tot.day)}" data-live="dayusd">${esc(moneySigned(tot.day, 0))}</span><span class="pill ${tone(tot.dayPct)}" data-live="daypct">${esc(pct(tot.dayPct))}</span><span class="muted small">${esc(t("today"))}</span></div>
          <p class="small muted" style="margin:.5rem 0 .9rem">${esc(why(rows, tot))}</p>
          <div class="row" style="margin-bottom:.5rem">${segHtml("rg", RANGES.map(([k]) => [k, rangeLabel(k)]), range)}<label class="chip sp" style="cursor:pointer"><input type="checkbox" id="cmp" ${cmp ? "checked" : ""} style="accent-color:var(--accent)"> ${esc(t("vs S&P 500"))}</label></div>
          <div id="pf-chart" style="min-height:14rem"></div>
          <div class="small" id="pf-gain" style="margin-top:.4rem"></div>
          <div class="small muted" style="margin-top:.2rem">${esc(t("Shows how today's holdings would have performed, not your actual past trades."))}</div>
        </div>
        <div class="card full">${cardHead(t("Biggest moves today"), `<p>${esc(t("Your best and worst performers since yesterday's close. Tap one to open it."))}</p>`)}<div class="movers">${gain.map(mv).join("")}${lose.map(mv).join("")}</div></div>
        ${nextCard()}${streetCard(rows)}${moodCard()}${storyCard()}<div class="card full row"><a class="btn" href="/v2">${esc(t("Projection Lab"))}</a><span class="small muted">${esc(t("1B portfolio projection and stress tests."))}</span></div>
      </div></div>`;
  },
  mount(root) {
    chart = null; drawChart(root);
    bindSeg(root, "rg", (k) => { range = k; drawChart(root); });
    const c = root.querySelector("#cmp"); if (c) c.addEventListener("change", () => { cmp = c.checked; drawChart(root); });
    root.addEventListener("click", (e) => {
      const n = e.target.closest("[data-news] button"); if (n) n.parentElement.classList.toggle("open");
      const a = e.target.closest("[data-act]"); if (a) (a.dataset.act === "add" ? openAdd() : openImport());
    });
  },
};
