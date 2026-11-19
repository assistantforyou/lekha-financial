/* v2 Risk: what could hurt you — concentration, drawdown, volatility, beta and where the risk actually comes from. */
import { t, fmtDate } from "/core/i18n.js";
import { D, positions, totals, portfolioSeries } from "/core/data.js";
import { LineChart } from "/core/charts.js";
import { esc } from "/core/util.js";
import { cardHead, money, moneySigned, pct, tone } from "../ui.js";
import { lastN } from "./shared.js";

let chart = null;

function bars(list, fmt) {
  const max = Math.max(...list.map((x) => x.v), 1e-9);
  return `<div class="stack">${list.map((x) => `<div class="rb"><div class="row"><span>${esc(x.label)}</span><span class="sp"></span><b>${esc(fmt(x.v))}</b></div><div class="wbar"><i style="width:${Math.max(2, (x.v / max) * 100).toFixed(1)}%${x.tone ? `;background:var(--${x.tone})` : ""}"></i></div></div>`).join("")}</div>`;
}

export default {
  render() {
    const rows = positions().filter((r) => !r.cash);
    const tot = totals(rows).value || 1;
    if (!rows.length) return `<div class="page"><div class="card"><div class="empty">${esc(t("No holdings yet."))}</div></div></div>`;
    const sortedVal = [...rows].sort((a, b) => b.valueUsd - a.valueUsd);
    const top3 = sortedVal.slice(0, 3), top3w = top3.reduce((s, r) => s + r.weight, 0);
    const wBeta = rows.reduce((s, r) => s + r.weight * ((r.st && r.st.beta) || 1), 0);
    const wVol = rows.reduce((s, r) => s + r.weight * ((r.st && r.st.vol) || 0), 0);
    const worst = rows.reduce((m, r) => Math.min(m, r.st && r.st.from52 != null ? r.st.from52 : 0), 0);
    const losers = [...rows].filter((r) => r.dayPct < -0.05).sort((a, b) => a.dayPct - b.dayPct);
    const movers = [...rows].sort((a, b) => Math.abs(b.dayPct) - Math.abs(a.dayPct)).slice(0, 8);
    const byTheme = {};
    for (const r of rows) { const k = r.theme || t("Other"); (byTheme[k] = byTheme[k] || 0); byTheme[k] += r.valueUsd; }
    const themeRows = Object.entries(byTheme).map(([label, v]) => ({ label, v: v / tot })).sort((a, b) => b.v - a.v);
    /* risk share = weight x volatility: the position that dominates the portfolio's swings */
    const riskRows = rows.map((r) => ({ label: r.tk, v: r.weight * ((r.st && r.st.vol) || 0), tk: r.tk })).sort((a, b) => b.v - a.v).slice(0, 8);
    const riskTot = riskRows.reduce((s, x) => s + x.v, 0) || 1;
    const volRows = [...rows].sort((a, b) => ((b.st && b.st.vol) || 0) - ((a.st && a.st.vol) || 0));
    const drawdowns = rows.filter((r) => r.st && r.st.from52 != null && r.st.from52 < -0.2).sort((a, b) => a.st.from52 - b.st.from52);
    const pf = portfolioSeries(rows), benchVol = (D.benchRisk && D.benchRisk.vol) || 0.16;

    return `<div class="page"><div class="grid">
      <div class="card full">${cardHead(t("Risk at a glance"), `<p>${esc(t("How much of your portfolio depends on a few positions, and how violently it tends to move."))}</p>`)}
        <div class="tiles">
          <div class="tile"><span>${esc(t("Portfolio value"))}</span><b>${esc(money(tot, 0))}</b></div>
          <div class="tile"><span>${esc(t("Top 3 weight"))}</span><b class="${top3w > 0.5 ? "down" : ""}">${esc(pct(top3w, 1, false))}</b><span class="tiny muted">${esc(t("concentration"))}</span></div>
          <div class="tile"><span>${esc(t("Beta vs S&P 500"))}</span><b>${wBeta.toFixed(2)}</b><span class="tiny muted">${esc(t("1.0 moves with the market"))}</span></div>
          <div class="tile"><span>${esc(t("Portfolio volatility"))}</span><b>${(wVol * 100).toFixed(1)}%</b><span class="tiny muted">${esc(t("market {p}", { p: (benchVol * 100).toFixed(1) + "%" }))}</span></div>
          <div class="tile"><span>${esc(t("Worst below 1-year high"))}</span><b class="${worst < -0.2 ? "down" : ""}">${esc(pct(worst, 1))}</b></div>
        </div></div>

      <div class="card full">${cardHead(t("Drawdown from your peak"), `<p>${esc(t("How far below the portfolio's previous high it has traded. Deep, long dips are what risk actually feels like."))}</p>`)}<div id="dd-chart" style="min-height:12rem"></div></div>

      <div class="card">${cardHead(t("Where the risk comes from"), `<p>${esc(t("Weight multiplied by each holding's volatility: the positions that dominate your swings, not just your value."))}</p>`)}${bars(riskRows.map((x) => ({ label: x.label, v: x.v / riskTot })), (v) => pct(v, 1, false))}</div>
      <div class="card">${cardHead(t("Concentration"), `<p>${esc(t("Share of the portfolio in each position. A single large slice means one company's news becomes your result."))}</p>`)}${bars(sortedVal.slice(0, 8).map((r) => ({ label: r.tk, v: r.weight })), (v) => pct(v, 1, false))}
        <div class="small muted" style="margin-top:.5rem">${esc(t("Top holding {a} · top 3 {b}", { a: pct(sortedVal[0].weight, 1, false), b: pct(top3w, 1, false) }))}</div></div>

      <div class="card">${cardHead(t("By theme"), `<p>${esc(t("Exposure grouped by theme."))}</p>`)}${bars(themeRows, (v) => pct(v, 1, false))}</div>
      <div class="card">${cardHead(t("Volatility and beta"), `<p>${esc(t("Annualised volatility and sensitivity to the market. Beta above 1 amplifies market moves."))}</p>`)}
        <div class="stack">${volRows.map((r) => `<div class="row"><b>${esc(r.tk)}</b><span class="sp"></span><span class="muted small">${esc(t("vol"))} ${r.st && r.st.vol != null ? (r.st.vol * 100).toFixed(0) + "%" : "–"}</span><span class="small">${esc(t("beta"))} ${r.st && r.st.beta != null ? r.st.beta.toFixed(2) : "–"}</span></div>`).join("")}</div></div>

      <div class="card">${cardHead(t("Drawdown alerts"), `<p>${esc(t("Holdings more than 20% below their 1-year high."))}</p>`)}${drawdowns.length ? `<div class="stack">${drawdowns.map((r) => `<div class="row"><b>${esc(r.tk)}</b><span class="sp"></span><span class="down">${esc(pct(r.st.from52, 1))}</span></div>`).join("")}</div>` : `<div class="muted small">${esc(t("None right now."))}</div>`}</div>
      <div class="card">${cardHead(t("Top movers"), `<p>${esc(t("Largest absolute moves today."))}</p>`)}<div class="stack">${movers.map((r) => `<div class="row"><b>${esc(r.tk)}</b><span class="sp"></span><span class="${tone(r.dayPct)}">${esc(pct(r.dayPct))}</span></div>`).join("")}</div></div>
      <div class="card full">${cardHead(t("Biggest losers today"), `<p>${esc(t("Holdings down more than 5% today."))}</p>`)}${losers.length ? `<div class="stack">${losers.map((r) => `<div class="row"><b>${esc(r.tk)}</b><span class="sp"></span><span class="down">${esc(pct(r.dayPct))}</span><span class="muted small">${esc(moneySigned(r.dayUsd, 0))}</span></div>`).join("")}</div>` : `<div class="muted small">${esc(t("None today."))}</div>`}</div>
    </div></div>`;
  },
  mount(root) {
    const host = root.querySelector("#dd-chart"); if (!host) return;
    const rows = positions().filter((r) => !r.cash), pf = lastN(portfolioSeries(rows), 252);
    if (pf.length < 2) { host.innerHTML = `<div class="empty small">${esc(t("Prices are loading…"))}</div>`; return; }
    let peak = -Infinity;
    const pts = pf.map(([x, v]) => { peak = Math.max(peak, v); return [x, (v / peak - 1) * 100]; });
    const opts = { series: [{ id: "dd", color: "var(--down)", pts, area: true }], height: 220, yPad: 0.12, label: t("Drawdown from peak"), xFmt: (x) => fmtDate(new Date(x), { month: "short", year: "2-digit" }), yFmt: (v) => v.toFixed(0) + "%", tip: (x, rr) => `<b>${esc(fmtDate(new Date(x), { day: "numeric", month: "short", year: "numeric" }))}</b><br>${esc(pct(rr[0].p[1] / 100, 1))} ${esc(t("from peak"))}` };
    if (chart) chart.destroy(); chart = LineChart(host, opts);
  },
};
