/* v2 views: pieces used by more than one screen */
import { t, fmtDate, fmtIn } from "/core/i18n.js";
import { D, positions } from "/core/data.js";
import { esc } from "/core/util.js";
import { pct, price, tone } from "../ui.js";

export const RANGES = [["1M", 21], ["3M", 63], ["6M", 126], ["1Y", 252], ["5Y", 1260], ["All", 99999]];
export const rangeLabel = (k) => ({ "1M": t("1M"), "3M": t("3M"), "6M": t("6M"), "1Y": t("1Y"), "5Y": t("5Y"), All: t("All") }[k] || k);
export function segHtml(id, opts, cur) { return `<div class="seg" id="${id}" role="group">${opts.map(([k, label]) => `<button data-k="${esc(k)}" aria-pressed="${k === cur}">${esc(label)}</button>`).join("")}</div>`; }
export function bindSeg(root, id, fn) { const s = root.querySelector("#" + id); if (!s) return; s.addEventListener("click", (e) => { const b = e.target.closest("button[data-k]"); if (!b) return; s.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b)); fn(b.dataset.k); }); }
export const lastN = (pts, n) => (n >= pts.length ? pts : pts.slice(-n));
export const leanLabel = (l) => (l > 0.25 ? t("leans bullish") : l < -0.25 ? t("leans bearish") : t("mixed"));
export const leanTone = (l) => (l > 0.25 ? "up" : l < -0.25 ? "down" : "");
export const leanBar = (l) => `<div class="lean" role="img" aria-label="${esc(leanLabel(l))}"><i style="left:${Math.round(50 + l * 46)}%"></i></div>`;
export function eventName(e) {
  return e.kind === "fomc" ? t("Fed interest-rate decision") : e.kind === "jobs" ? t("US jobs report") : e.kind === "cpi" ? t("US inflation report") : t("{tk} earnings", { tk: e.tk });
}
export function dateChip(dateIso) { const d = new Date(dateIso + "T00:00:00Z"); return `<span class="date"><span>${esc(fmtDate(d, { month: "short" }))}</span><b>${esc(fmtDate(d, { day: "numeric" }))}</b></span>`; }
export const inDays = (n) => (n === 0 ? t("today") : n === 1 ? t("tomorrow") : fmtIn(n));
export const sectorName = (sym) => ({ XLK: t("Technology"), XLF: t("Financials"), XLE: t("Energy"), XLV: t("Health care"), XLP: t("Consumer staples"), XLY: t("Consumer discretionary"), XLI: t("Industrials"), XLU: t("Utilities"), XLB: t("Materials"), XLC: t("Communication"), XLRE: t("Real estate"), SMH: t("Semiconductors"), ITA: t("Aerospace & defense"), RSP: t("Equal-weight S&P 500"), SPY: t("S&P 500"), QQQ: t("Nasdaq 100") }[sym] || sym);
export const impactPill = (i) => `<span class="pill ${i === "bullish" ? "up" : i === "bearish" ? "down" : ""}">${esc(i === "bullish" ? t("Good for stocks") : i === "bearish" ? t("Bad for stocks") : t("Mixed"))}</span>`;
export function streetBlock(tk, px, cur) {
  const s = D.street[tk];
  if (!s || (!s.pt && !s.rating)) return `<div class="muted small">${esc(t("No analyst data for this stock yet."))}</div>`;
  let h = "";
  if (s.rating && s.rating.n) {
    const r = s.rating, n = r.n, buy = r.sb + r.b, sell = r.s + r.ss, p = (x) => Math.round((x / n) * 100);
    h += `<div class="rating" role="img" aria-label="${esc(t("{n} analysts: {b}% buy, {h}% hold, {s}% sell", { n, b: p(buy), h: p(r.h), s: p(sell) }))}"><i style="flex:${r.sb};background:var(--up)"></i><i style="flex:${r.b};background:color-mix(in srgb,var(--up) 55%,var(--card))"></i><i style="flex:${r.h};background:var(--chart2)"></i><i style="flex:${r.s};background:color-mix(in srgb,var(--down) 55%,var(--card))"></i><i style="flex:${r.ss};background:var(--down)"></i></div>
      <div class="row small" style="margin-top:.4rem"><span class="up"><b>${p(buy)}%</b> ${esc(t("Buy"))}</span><span class="muted"><b>${p(r.h)}%</b> ${esc(t("Hold"))}</span><span class="down"><b>${p(sell)}%</b> ${esc(t("Sell"))}</span><span class="muted sp">${esc(t("{n} analysts", { n }))}</span></div>`;
  }
  if (s.pt && s.pt.mean) {
    const m = s.pt.mean, up = px ? m / px - 1 : null, lo = s.pt.low, hi = s.pt.high;
    h += `<div style="margin-top:.9rem"><div class="row small"><span class="muted">${esc(t("Average price target"))}</span><b>${esc(price(m, cur))}</b>${up != null ? `<span class="pill ${tone(up)}">${esc(pct(up, 1))}</span>` : ""}</div>`;
    if (lo && hi && px) {
      const a = Math.min(lo, px) * 0.97, b = Math.max(hi, px) * 1.03, at = (v) => ((v - a) / (b - a)) * 100;
      h += `<div class="range" role="img" aria-label="${esc(t("Target range {lo} to {hi}", { lo: price(lo, cur), hi: price(hi, cur) }))}"><span class="span" style="left:${at(lo)}%;width:${at(hi) - at(lo)}%"></span><span class="lb t" style="left:${at(lo)}%">${esc(price(lo, cur))}</span><span class="lb t" style="left:${at(hi)}%">${esc(price(hi, cur))}</span><span class="mk" style="left:${at(px)}%"></span><span class="lb b" style="left:${at(px)}%">${esc(t("Now"))} ${esc(price(px, cur))}</span></div><div class="tiny muted">${esc(t("Low, high and today's price. The bar is the range analysts expect."))}</div>`;
    } else h += `<div class="tiny muted" style="margin-top:.3rem">${esc(t("Only the average target is available for this stock."))}</div>`;
    h += `</div>`;
  }
  if (s.src && s.src.length) h += `<div class="tiny muted" style="margin-top:.6rem">${esc(t("Source: {s}", { s: s.src.join(", ") }))}</div>`;
  return h;
}
export const holdingsOnly = () => positions().filter((r) => !r.cash);
