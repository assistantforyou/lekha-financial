/* v2 Analysis: the numbers behind the portfolio — what drove the return, what it costs, what analysts expect
   and what is coming. Market covers the world; this page covers you. */
import { t, fmtDate } from "/core/i18n.js";
import { D, positions, totals } from "/core/data.js";
import { esc } from "/core/util.js";
import { cardHead, money, moneySigned, pct, price, tone } from "../ui.js";
import { streetBlock, inDays } from "./shared.js";

function bars(list, fmt, signed) {
  const max = Math.max(...list.map((x) => Math.abs(x.v)), 1e-9);
  return `<div class="stack">${list.map((x) => `<div class="rb"><div class="row"><span>${esc(x.label)}</span><span class="sp"></span><b class="${signed ? tone(x.v) : ""}">${esc(fmt(x.v))}</b></div><div class="wbar"><i style="width:${Math.max(2, (Math.abs(x.v) / max) * 100).toFixed(1)}%;${x.v < 0 ? "background:var(--down)" : ""}"></i></div></div>`).join("")}</div>`;
}

function perfSummary(rows, tot) {
  const w = (f) => rows.reduce((s, r) => s + r.weight * (f(r) || 0), 0);
  const day = w((r) => r.dayPct), m1 = w((r) => r.st && r.st.m1), ytd = w((r) => r.st && r.st.ytd);
  const bench1m = (() => { const s = D.bench.sp; if (!s || s.length < 22) return null; const a = s[s.length - 22][1], b = s[s.length - 1][1]; return a ? b / a - 1 : null; })();
  return `<div class="card full">${cardHead(t("Performance"), `<p>${esc(t("Weighted return of what you own, not a price index. Contributions below show which holdings did the work."))}</p>`)}
    <div class="tiles">
      <div class="tile"><span>${esc(t("Portfolio value"))}</span><b>${esc(money(tot.value, 0))}</b></div>
      <div class="tile"><span>${esc(t("Today"))}</span><b class="${tone(day)}">${esc(pct(day, 1))}</b></div>
      <div class="tile"><span>${esc(t("Past month"))}</span><b class="${tone(m1)}">${esc(pct(m1, 1))}</b>${bench1m != null ? `<span class="tiny muted">${esc(t("S&P 500 {p}", { p: pct(bench1m, 1) }))}</span>` : ""}</div>
      <div class="tile"><span>${esc(t("Since January"))}</span><b class="${tone(ytd)}">${esc(pct(ytd, 1))}</b></div>
      <div class="tile"><span>${esc(t("Unrealised gain"))}</span><b class="${tone(tot.pnl)}">${esc(moneySigned(tot.pnl, 0))}</b></div>
    </div></div>`;
}

function attribution(rows) {
  const m1 = rows.map((r) => ({ label: r.tk, v: r.weight * ((r.st && r.st.m1) || 0) })).sort((a, b) => b.v - a.v);
  const best = m1.slice(0, 5), worst = m1.slice(-3).reverse().filter((x) => x.v < 0 && !best.includes(x));
  const list = [...best, ...worst];
  return `<div class="card full">${cardHead(t("What moved the portfolio"), `<p>${esc(t("Each holding's one-month return multiplied by its weight: its actual contribution to your result, not just its own price change."))}</p>`)}${bars(list, (v) => pct(v, 2), true)}</div>`;
}

function valuation(rows) {
  const withTarget = rows.map((r) => { const s = D.street[r.tk]; const mean = s && s.pt && s.pt.mean; return { r, mean, up: mean && r.px ? mean / r.px - 1 : null }; }).filter((x) => x.up != null).sort((a, b) => b.up - a.up);
  const agg = (() => { let w = 0, s = 0; for (const x of withTarget) { w += x.r.valueUsd; s += x.r.valueUsd * x.up; } return w ? s / w : null; })();
  const mos = rows.map((r) => { const v = D.val && D.val[r.tk]; return v && v.base && r.px ? { tk: r.tk, v: v.base / r.px - 1 } : null; }).filter(Boolean);
  return `<div class="card full">${cardHead(t("Valuation and price targets"), `<p>${esc(t("Where analysts think each stock is heading over the next year, and how far today's price sits from that target. Margin of safety compares price with a modelled intrinsic value where one exists."))}</p>`)}
    ${withTarget.length ? `<div class="small" style="margin-bottom:.5rem">${esc(t("Weighted upside to analyst targets"))} <b class="${tone(agg)}">${esc(pct(agg, 1))}</b></div>
    <div class="tablebox"><table class="lk-table"><thead><tr><th>${esc(t("Stock"))}</th><th>${esc(t("Price"))}</th><th>${esc(t("Target"))}</th><th>${esc(t("Upside"))}</th><th>${esc(t("Weight"))}</th></tr></thead><tbody>
      ${withTarget.map((x) => `<tr><td>${esc(x.r.tk)}</td><td>${esc(price(x.r.px, x.r.cur))}</td><td>${esc(price(x.mean, x.r.cur))}</td><td class="${tone(x.up)}">${esc(pct(x.up, 1))}</td><td>${esc(pct(x.r.weight, 1, false))}</td></tr>`).join("")}
    </tbody></table></div>` : `<div class="muted small">${esc(t("No analyst targets for these holdings yet."))}</div>`}
    ${mos.length ? `<div class="small" style="margin-top:.6rem">${esc(t("Margin of safety"))}: ${mos.map((m) => `${esc(m.tk)} <b class="${tone(m.v)}">${esc(pct(m.v, 0))}</b>`).join(" · ")}</div>` : ""}</div>`;
}

function sentiment(rows) {
  let buy = 0, hold = 0, sell = 0, w = 0, wu = 0, up = 0;
  for (const r of rows) { const s = D.street[r.tk]; if (!s) continue; if (s.rating && s.rating.n) { const n = s.rating.n; buy += r.valueUsd * ((s.rating.sb + s.rating.b) / n); hold += r.valueUsd * (s.rating.h / n); sell += r.valueUsd * ((s.rating.s + s.rating.ss) / n); w += r.valueUsd; } if (s.pt && s.pt.mean && r.px) { up += r.valueUsd * (s.pt.mean / r.px - 1); wu += r.valueUsd; } }
  const agg = w ? `<div class="rating"><i style="flex:${buy};background:var(--up)"></i><i style="flex:${hold};background:var(--chart2)"></i><i style="flex:${sell};background:var(--down)"></i></div>
    <div class="row small" style="margin:.45rem 0 .2rem"><span class="up"><b>${Math.round((buy / w) * 100)}%</b> ${esc(t("Buy"))}</span><span class="muted"><b>${Math.round((hold / w) * 100)}%</b> ${esc(t("Hold"))}</span><span class="down"><b>${Math.round((sell / w) * 100)}%</b> ${esc(t("Sell"))}</span></div>
    <div class="small">${esc(t("Average price target is"))} <b class="${tone(up / wu)}">${esc(pct(up / wu, 1))}</b> ${esc(t("away from today's prices."))}</div>` : `<div class="muted small">${esc(t("Analyst ratings are loading…"))}</div>`;
  return `<div class="card">${cardHead(t("Analyst sentiment"), `<p>${esc(t("Buy, hold and sell ratings across your holdings, weighted by how much of the portfolio each one is. Below: the detail for each stock."))}</p>`)}${agg}</div>
    ${rows.slice(0, 6).map((r) => `<div class="card flat">${streetBlock(r.tk, r.px, r.cur)}</div>`).join("")}`;
}

function factors(rows) {
  const w = (f) => rows.reduce((s, r) => s + r.weight * (f(r) || 0), 0);
  const beta = w((r) => r.st && r.st.beta), vol = w((r) => r.st && r.st.vol), mom = w((r) => r.st && r.st.m1), dd = w((r) => r.st && r.st.from52);
  const benchVol = (D.benchRisk && D.benchRisk.vol) || 0.16;
  const row = (label, val, sub, good) => `<div class="row"><span>${esc(label)}</span><span class="sp"></span><b class="${good == null ? "" : good ? "up" : "down"}">${esc(val)}</b><span class="tiny muted">${esc(sub)}</span></div>`;
  return `<div class="card">${cardHead(t("Factor profile"), `<p>${esc(t("The style your portfolio is actually running: market sensitivity, volatility, momentum and distance from highs. These are the exposures that explain most of the ups and downs."))}</p>`)}
    <div class="stack">
      ${row(t("Market sensitivity (beta)"), beta.toFixed(2), t("1.0 = the market"), beta <= 1)}
      ${row(t("Volatility"), (vol * 100).toFixed(1) + "%", t("market {p}", { p: (benchVol * 100).toFixed(1) + "%" }), vol <= benchVol)}
      ${row(t("Momentum (1 month)"), pct(mom, 1), t("weighted"), mom >= 0)}
      ${row(t("Distance from 1-year high"), pct(dd, 1), t("weighted"), dd > -0.1)}
    </div></div>`;
}

function earnings(rows) {
  const ev = rows.map((r) => ({ r, e: D.earnings[r.tk] })).filter((x) => x.e && x.e.date).sort((a, b) => Date.parse(a.e.date) - Date.parse(b.e.date)).slice(0, 8);
  return `<div class="card">${cardHead(t("Earnings calendar"), `<p>${esc(t("Report dates for your holdings. A report can move a stock far more than a normal trading day."))}</p>`)}
    ${ev.length ? `<div class="stack">${ev.map((x) => `<div class="row"><b>${esc(x.r.tk)}</b><span class="sp"></span><span class="small">${esc(fmtDate(new Date(x.e.date + "T00:00:00Z")))}</span><span class="tiny muted">${esc(inDays(Math.max(0, Math.round((Date.parse(x.e.date) - Date.now()) / 864e5))))}</span></div>`).join("")}</div>` : `<div class="muted small">${esc(t("No report dates yet."))}</div>`}</div>`;
}

export default {
  render() {
    const rows = positions().filter((r) => !r.cash), tot = totals(rows);
    if (!rows.length) return `<div class="page"><div class="card"><div class="empty">${esc(t("Add holdings to see the analysis."))}</div></div></div>`;
    return `<div class="page"><div class="grid">
      ${perfSummary(rows, tot)}
      ${attribution(rows)}
      ${valuation(rows)}
      ${sentiment(rows)}
      ${factors(rows)}
      ${earnings(rows)}
    </div></div>`;
  },
  mount() {},
};
