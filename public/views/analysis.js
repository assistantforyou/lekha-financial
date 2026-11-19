/* v2 Analysis: native (no iframe) sections covering valuation, macro, sentiment and analyst views. */
import { t } from "/core/i18n.js";
import { D, positions, totals } from "/core/data.js";
import { esc } from "/core/util.js";
import { cardHead, money, pct, tone } from "../ui.js";
import { streetBlock } from "./shared.js";

function analystSentiment() {
  const rows = positions().filter((r) => !r.cash);
  if (!rows.length) return `<div class="card"><div class="muted small">${esc(t("No holdings yet."))}</div></div>`;
  let buy = 0, hold = 0, sell = 0, w = 0, wu = 0, up = 0;
  const lines = rows.map((r) => {
    const s = D.street[r.tk]; if (!s) return "";
    if (s.rating && s.rating.n) { const n = s.rating.n; const b = (s.rating.sb + s.rating.b) / n, h = s.rating.h / n, sl = (s.rating.s + s.rating.ss) / n; buy += r.valueUsd * b; hold += r.valueUsd * h; sell += r.valueUsd * sl; w += r.valueUsd; }
    if (s.pt && s.pt.mean && r.px) { up += r.valueUsd * (s.pt.mean / r.px - 1); wu += r.valueUsd; }
    return `<div class="card flat"><b>${esc(r.tk)}</b> ${streetBlock(r.tk, r.px, r.cur)}</div>`;
  }).join("");
  const agg = w ? `<div class="rating"><i style="flex:${buy};background:var(--up)"></i><i style="flex:${hold};background:var(--chart2)"></i><i style="flex:${sell};background:var(--down)"></i></div>
    <div class="row small" style="margin:.45rem 0 .2rem"><span class="up"><b>${Math.round((buy / w) * 100)}%</b> ${esc(t("Buy"))}</span><span class="muted"><b>${Math.round((hold / w) * 100)}%</b> ${esc(t("Hold"))}</span><span class="down"><b>${Math.round((sell / w) * 100)}%</b> ${esc(t("Sell"))}</span></div>` : "";
  const tgt = wu ? `<div class="small">${esc(t("Average price target is"))} <b class="${tone(up / wu)}">${esc(pct(up / wu, 1))}</b> ${esc(t("away from today's prices."))}</div>` : "";
  return `<div class="card">${cardHead(t("Analyst sentiment (portfolio)"), `<p>${esc(t("Blended buy/hold/sell and price targets across your holdings."))}</p>`)}${agg}${tgt}</div>${lines}`;
}

function macroRegime() {
  const m = D.macro, f = D.fgi, v = D.vix;
  const tiles = [
    m && m.ten ? `<div class="tile"><span>${esc(t("10-year rate"))}</span><b>${m.ten.v.toFixed(2)}%</b></div>` : "",
    m && m.fed ? `<div class="tile"><span>${esc(t("Fed policy rate"))}</span><b>${m.fed.v.toFixed(2)}%</b></div>` : "",
    m && m.cpi ? `<div class="tile"><span>${esc(t("Inflation"))}</span><b>${m.cpi.v.toFixed(1)}%</b></div>` : "",
    f ? `<div class="tile"><span>${esc(t("Fear & Greed"))}</span><b>${Math.round(f.score)}</b></div>` : "",
    v ? `<div class="tile"><span>VIX</span><b>${v.v.toFixed(1)}</b></div>` : "",
  ].join("");
  return `<div class="card">${cardHead(t("Macro regime"), `<p>${esc(t("Rates, inflation, mood and volatility backdrop."))}</p>`)}<div class="tiles">${tiles || `<div class="skel" style="height:3rem"></div>`}</div></div>`;
}

function valuationSummary() {
  const val = D.val || {};
  const keys = Object.keys(val);
  if (!keys.length) return `<div class="card">${cardHead(t("Valuation"), `<p>${esc(t("No saved valuation snapshot yet. Open classic terminal to build one."))}</p>`)}<div class="muted small">${esc(t("Deep DCF models live in the classic terminal."))}</div></div>`;
  const rows = keys.map((k) => {
    const v = val[k];
    const r = positions().find((x) => x.tk === k);
    const px = r ? r.px : v.px;
    const mos = px && v.base ? (v.base / px - 1) : null;
    return `<div class="row"><b>${esc(k)}</b><span class="sp"></span><span>${esc(money(v.base, 0))}</span><span class="muted small">${mos != null ? esc(pct(mos, 1)) + " " + esc(t("MOS")) : ""}</span></div>`;
  }).join("");
  return `<div class="card">${cardHead(t("Valuation snapshot"), `<p>${esc(t("Saved intrinsic values from the classic terminal."))}</p>`)}<div class="stack">${rows}</div></div>`;
}

export default {
  render() {
    return `<div class="page"><div class="grid">
      ${macroRegime()}
      ${valuationSummary()}
      <div class="card full">${cardHead(t("Sentiment"), `<p>${esc(t("Fear & Greed and safe-haven mood."))}</p>`)}<div class="muted small">${esc(t("See Market tab for full mood."))}</div></div>
      ${analystSentiment()}
    </div></div>`;
  },
  mount() {}
};