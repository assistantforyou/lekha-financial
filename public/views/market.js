/* v2 Market: the news that touches you, and the state of the wider market, one switch apart. */
import { t, fmtAgo, fmtNum } from "/core/i18n.js";
import { D, positions } from "/core/data.js";
import { sparkline } from "/core/charts.js";
import { esc } from "/core/util.js";
import { cardHead, pct, tone } from "../ui.js";
import { segHtml, bindSeg, impactPill, sectorName } from "./shared.js";

let tab = "news", mine = false;
function newsList() {
  const mineSet = new Set(positions().filter((r) => !r.cash).map((r) => r.tk));
  let list = D.news; if (mine) list = list.filter((n) => (n.tickers || []).some((x) => mineSet.has(x)));
  if (!D.news.length) return `<div class="stack"><div class="skel" style="height:4rem"></div><div class="skel" style="height:4rem"></div></div>`;
  if (!list.length) return `<div class="empty">${esc(t("No stories about your holdings right now."))}</div>`;
  return list.map((n, i) => `<div class="news-i" data-i="${i}"><button><span class="row">${impactPill(n.impact)}<span class="tiny muted">${esc(n.source)}</span>${n.at ? `<span class="tiny muted sp">${esc(fmtAgo(n.at))}</span>` : ""}</span><span class="hl">${esc(n.headline)}</span><span class="tags">${(n.tickers || []).slice(0, 5).map((x) => `<span class="tag">${esc(x)}</span>`).join("")}</span></button>
    <div class="det"><span>${esc(n.summary)}</span>${n.why ? `<span><b>${esc(t("Why it matters"))}:</b> ${esc(n.why)}</span>` : ""}${n.bull ? `<span class="up"><b>${esc(t("The upside case"))}:</b> ${esc(n.bull)}</span>` : ""}${n.bear ? `<span class="down"><b>${esc(t("The downside case"))}:</b> ${esc(n.bear)}</span>` : ""}${n.orig ? `<span class="tiny">${esc(t("Original headline"))}: ${esc(n.orig)}</span>` : ""}${n.url ? `<a href="${esc(n.url)}" target="_blank" rel="noopener noreferrer">${esc(t("Read the full story"))}</a>` : ""}</div></div>`).join("");
}
function markets() {
  const f = D.fgi, v = D.vix, m = D.macro;
  const lab = !f ? "–" : f.score < 25 ? t("Extreme fear") : f.score < 45 ? t("Fear") : f.score < 56 ? t("Neutral") : f.score < 75 ? t("Greed") : t("Extreme greed");
  const tile = (name, val, sub) => `<div class="tile"><span>${esc(name)}</span><b>${val}</b>${sub ? `<span>${sub}</span>` : ""}</div>`;
  const tiles = [
    tile(t("Fear and greed"), f ? Math.round(f.score) : "–", esc(lab)),
    tile(t("Expected swings (VIX)"), v ? v.v.toFixed(1) : "–", v ? `<span class="${tone(-(v.v - v.prev))}">${v.v >= v.prev ? "▲" : "▼"} ${Math.abs(v.v - v.prev).toFixed(1)}</span>` : ""),
    tile(t("10-year interest rate"), m && m.ten ? m.ten.v.toFixed(2) + "%" : "–", ""),
    tile(t("Fed policy rate"), m && m.fed ? m.fed.v.toFixed(2) + "%" : "–", ""),
    tile(t("Inflation (yearly)"), m && m.cpi ? m.cpi.v.toFixed(1) + "%" : "–", ""),
  ].join("");
  const maxAbs = Math.max(0.02, ...D.sectors.map((s) => Math.abs(s.rel1m || 0)));
  const sec = D.sectors.length ? D.sectors.map((s) => { const a = Math.min(1, Math.abs(s.rel1m || 0) / maxAbs) * 28 + 4, c = (s.rel1m || 0) >= 0 ? "var(--up)" : "var(--down)"; return `<div class="sec" style="background:color-mix(in srgb,${c} ${a}%,var(--card))"><b>${esc(sectorName(s.sym))}</b><span class="n ${tone(s.m1)}">${esc(pct(s.m1, 1))}</span><span class="s">${esc(t("vs market"))} ${esc(pct(s.rel1m, 1))}</span>${sparkline(s.spark, { w: 90, h: 24 })}</div>`; }).join("") : `<div class="skel" style="height:6rem;grid-column:1/-1"></div>`;
  const ranked = [...D.sectors].sort((a, b) => (b.rel1m || 0) - (a.rel1m || 0));
  const maxRel = Math.max(0.02, ...ranked.map((s) => Math.abs(s.rel1m || 0)));
  const rotation = ranked.length ? `<div class="card full">${cardHead(t("Rotation"), `<p>${esc(t("Sector strength relative to the S&P 500 over the past month. A bar to the right means the sector is beating the market; the second number is its three-month trend, so you can see what is improving rather than only what is already strong."))}</p>`)}
    <div class="stack">${ranked.map((s) => `<div class="rb"><div class="row"><span>${esc(sectorName(s.sym))}</span><span class="sp"></span><span class="small ${tone(s.m1)}">${esc(t("own {p}", { p: pct(s.m1, 1) }))}</span><b class="${(s.rel1m || 0) >= 0 ? "up" : "down"}">${esc(pct(s.rel1m, 1))}</b></div><div class="wbar"><i style="width:${Math.max(2, (Math.abs(s.rel1m || 0) / maxRel) * 100).toFixed(1)}%${(s.rel1m || 0) < 0 ? ";background:var(--down)" : ""}"></i></div><div class="tiny muted">${esc(t("3-month relative strength"))} ${s.rel3m != null ? esc(pct(s.rel3m, 1)) : "–"}</div></div>`).join("")}</div></div>` : "";
  const breadth = `<div class="card">${cardHead(t("Breadth"), `<p>${esc(t("How many sectors are beating the market."))}</p>`)}<div class="small">${esc(t("{n} of {t} sectors are positive vs market this month.", { n: D.sectors.filter((s) => (s.rel1m || 0) > 0).length, t: D.sectors.length }))}</div></div>`;
  const flows = `<div class="card">${cardHead(t("Capital flows"), `<p>${esc(t("News-driven flow read."))}</p>`)}${D.macroLine ? `<p class="small muted">${esc(D.macroLine)}</p>` : `<div class="muted small">${esc(t("Loading…"))}</div>`}</div>`;
  const ob = `<div class="card">${cardHead(t("Overbought / oversold"), `<p>${esc(t("VIX level as a proxy for stretched positioning."))}</p>`)}<div class="small">${v ? esc(v.v > 25 ? t("Oversold-leaning (high VIX)") : v.v < 15 ? t("Overbought-leaning (low VIX)") : t("Neutral")) : "–"}</div></div>`;
  return `<div class="card">${cardHead(t("The big picture"), `<p>${esc(t("Mood, expected swings, interest rates and inflation: the backdrop that moves most stocks together."))}</p><p>${esc(t("Higher interest rates usually weigh on growth stocks. Higher inflation can keep rates high."))}</p>`)}<div class="tiles">${tiles}</div></div>
   <div class="card">${cardHead(t("Which areas are leading"), `<p>${esc(t("Each tile is an area of the market over the past month. Green means it beat the overall market, red means it lagged. The big number is its own return."))}</p>`)}<div class="sectors">${sec}</div></div>
   ${rotation}${breadth}${ob}${flows}`;
  }

export default {
  render() {
    return `<div class="page"><div class="row">${segHtml("mt", [["news", t("News")], ["mkts", t("Markets")]], tab)}${tab === "news" ? `<span class="sp"></span><button class="chip" id="mine" aria-pressed="${mine}">${esc(t("Only my holdings"))}</button>` : ""}</div>
    ${tab === "news" ? `<div class="card">${cardHead(t("What is moving markets"), `<p>${esc(t("Headlines come from public finance feeds (CNBC, MarketWatch, BBC, Nasdaq, Seeking Alpha and the Federal Reserve). An AI model picks the most relevant, writes a short summary and labels the likely effect. The headline and link always come from the original source."))}</p><p>${esc(t("The AI can be wrong. Open the original story before acting."))}</p>`, D.newsBusy ? `<span class="tiny muted">${esc(t("Updating…"))}</span>` : D.newsAt ? `<span class="tiny muted">${esc(t("Updated {t}", { t: fmtAgo(D.newsAt) }))}</span>` : "")}${D.macroLine ? `<p class="small muted" style="margin:0 0 .6rem">${esc(D.macroLine)}</p>` : ""}<div id="nl">${newsList()}</div></div>` : markets()}</div>`;
  },
  mount(root, ctx) {
    bindSeg(root, "mt", (k) => { tab = k; ctx.rerender(); });
    const m = root.querySelector("#mine"); if (m) m.addEventListener("click", () => { mine = !mine; ctx.rerender(); });
    root.addEventListener("click", (e) => { const n = e.target.closest(".news-i button"); if (n) n.parentElement.classList.toggle("open"); });
  },
};
