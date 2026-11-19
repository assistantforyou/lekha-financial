/* v2 Risk: portfolio risk surface — concentration, themes, drawdown alerts, top movers, biggest losers. */
import { t } from "/core/i18n.js";
import { D, positions, totals } from "/core/data.js";
import { esc } from "/core/util.js";
import { cardHead, money, pct, tone, price } from "../ui.js";

export default {
  render() {
    const rows = positions().filter((r) => !r.cash);
    const tot = totals(rows).value || 1;
    if (!rows.length) return `<div class="page"><div class="card"><div class="empty">${esc(t("No holdings yet."))}</div></div></div>`;
    const sortedVal = [...rows].sort((a, b) => b.valueUsd - a.valueUsd);
    const top3 = sortedVal.slice(0, 3);
    const top3w = top3.reduce((s, r) => s + r.weight, 0);
    const losers = [...rows].filter((r) => r.dayPct < -0.05).sort((a, b) => a.dayPct - b.dayPct);
    const movers = [...rows].sort((a, b) => Math.abs(b.dayPct) - Math.abs(a.dayPct)).slice(0, 8);
    const byTheme = {};
    for (const r of rows) { const k = r.theme || t("Other"); (byTheme[k] = byTheme[k] || []).push(r); }
    const themeRows = Object.entries(byTheme).map(([k, arr]) => ({ k, w: arr.reduce((s, r) => s + r.weight, 0), v: arr.reduce((s, r) => s + r.valueUsd, 0), n: arr.length })).sort((a, b) => b.w - a.w);
    const drawdowns = rows.filter((r) => (r.st && r.st.from52 != null && r.st.from52 < -0.25)).sort((a, b) => a.st.from52 - b.st.from52);
    return `<div class="page"><div class="grid">
      <div class="card full">${cardHead(t("Largest positions"), `<p>${esc(t("Your biggest holdings by value. Heavy concentration raises risk if one stock falls."))}</p>`)}
        <div class="stack">${top3.map((r) => `<div class="row"><b>${esc(r.tk)}</b><span class="sp"></span><span>${esc(pct(r.weight, 1, false))}</span><span class="muted small">${esc(money(r.valueUsd, 0))}</span></div>`).join("")}
        <div class="small muted" style="margin-top:.4rem">${esc(t("Top 3 = {p}% of portfolio", { p: Math.round(top3w * 100) }))}</div></div></div>
      <div class="card">${cardHead(t("By theme"), `<p>${esc(t("Exposure grouped by theme."))}</p>`)}<div class="stack">${themeRows.map((r) => `<div class="row"><span>${esc(r.k)}</span><span class="sp"></span><b>${esc(pct(r.w, 1, false))}</b><span class="muted small">${r.n}</span></div>`).join("")}</div></div>
      <div class="card">${cardHead(t("Drawdown alerts"), `<p>${esc(t("Holdings more than 25% below their 1-year high."))}</p>`)}${drawdowns.length ? `<div class="stack">${drawdowns.map((r) => `<div class="row"><b>${esc(r.tk)}</b><span class="sp"></span><span class="down">${esc(pct(r.st.from52, 1))}</span></div>`).join("")}</div>` : `<div class="muted small">${esc(t("None right now."))}</div>`}</div>
      <div class="card">${cardHead(t("Top movers"), `<p>${esc(t("Largest absolute moves today."))}</p>`)}<div class="stack">${movers.map((r) => `<div class="row"><b>${esc(r.tk)}</b><span class="sp"></span><span class="${tone(r.dayPct)}">${esc(pct(r.dayPct))}</span></div>`).join("")}</div></div>
      <div class="card">${cardHead(t("Biggest losers today"), `<p>${esc(t("Holdings down more than 5% today."))}</p>`)}${losers.length ? `<div class="stack">${losers.map((r) => `<div class="row"><b>${esc(r.tk)}</b><span class="sp"></span><span class="down">${esc(pct(r.dayPct))}</span><span class="muted small">${esc(moneySigned(r.dayUsd, 0))}</span></div>`).join("")}</div>` : `<div class="muted small">${esc(t("None today."))}</div>`}</div>
      <div class="card full">${cardHead(t("Concentration"), `<p>${esc(t("Share of portfolio in your top holding and top 3."))}</p>`)}<div class="stack"><div class="row"><span>${esc(t("Top holding"))}</span><span class="sp"></span><b>${esc(sortedVal[0] ? pct(sortedVal[0].weight, 1, false) : "–")}</b><span class="muted small">${esc(sortedVal[0] ? sortedVal[0].tk : "")}</span></div><div class="row"><span>${esc(t("Top 3"))}</span><span class="sp"></span><b>${esc(pct(top3w, 1, false))}</b></div></div></div>
    </div></div>`;
  },
  mount() {}
};