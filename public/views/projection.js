/* v2 Projection Lab: the 1B projection panel, native inside the app (ported from the classic terminal).
   Every figure comes from /v2/pt-projection-data.json: art-directed design data, not a Monte Carlo run and not a
   forecast. The "1B" is an interface-scale label; no billion-path job was executed. */
import { t } from "/core/i18n.js";
import { esc as escHtml } from "/core/util.js";

const SFX = window.PT_DEMO_SFX || "(Outdated date used for DEMO only)";
const DATA_URL = "/v2/pt-projection-data.json";
const NS = "http://www.w3.org/2000/svg";
let D = null, root = null, selected = "21D", drawn = { w: 0 };

/* ---------- formatting ---------- */
const money = (n) => "$" + Math.round(n).toLocaleString("en-US");
const pct = (n) => (n >= 0 ? "+" : "") + n.toFixed(1) + "%";
const dateOf = (s) => { const p = s.split("-").map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2])); };
const fmtDate = (s) => dateOf(s).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const fmtShort = (s) => dateOf(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const sfx = (x) => x + " " + SFX;
const esc = (s) => escHtml(String(s));
const $ = (s) => root.querySelector(s);
function svgEl(tag, attrs) { const x = document.createElementNS(NS, tag); if (attrs) Object.keys(attrs).forEach((k) => x.setAttribute(k, attrs[k])); return x; }
function text(attrs, str) { const n = svgEl("text", Object.assign({ "font-family": "ui-monospace,Menlo,Consolas,monospace", fill: "var(--muted)" }, attrs)); n.textContent = str; return n; }

/* ---------- markup ---------- */
function markup() {
  return '<div class="lk">' +
    '<div class="lk-lead"><div><div class="lk-eyebrow">PROBABILISTIC INVESTMENT INTELLIGENCE</div>' +
    '<h3 class="lk-h">The future is a distribution.</h3>' +
    '<p class="note">Five portfolio outlook windows. A growth-oriented scenario with illustrative catalysts, pullbacks and recoveries.</p></div>' +
    '<div class="lk-scale"><small>SIMULATION-SCALE CONCEPT</small><strong>1B</strong><small>ONE BILLION · VISUAL DEMO</small></div></div>' +
    '<div class="lk-demo"><strong>DEMO — SIMULATED DATA</strong><span>Illustrative bullish concept starting ' + esc(sfx(fmtDate(D.start_date))) +
    ' · seven hypothetical catalyst reactions. The displayed 1B scale is a design label: no billion-path computation was run; the curves and scenario figures are art-directed, not measured forecasts. No actual holdings or real market data.</span></div>' +
    '<div class="lk-metrics">' +
    '<div class="lk-m"><div class="lk-ml">Starting value</div><div class="lk-mv">' + money(D.starting_portfolio_usd) + '</div><div class="lk-ms">' + esc(sfx(fmtDate(D.start_date).toUpperCase())) + ' · USD</div></div>' +
    '<div class="lk-m"><div class="lk-ml">Base-case projected value</div><div class="lk-mv lk-blue" id="lk-median">—</div><div class="lk-ms" id="lk-median-sub">—</div></div>' +
    '<div class="lk-m"><div class="lk-ml">Illustrative gain likelihood</div><div class="lk-mv lk-up" id="lk-profit">—</div><div class="lk-ms">Scenario assumption · not calibrated</div></div>' +
    '<div class="lk-m"><div class="lk-ml">Illustrative range</div><div class="lk-mv lk-range" id="lk-range">—</div><div class="lk-ms">Stylized P05–P95 · not calibrated</div></div></div>' +
    '<div class="lk-head"><div><h4>Portfolio projection · growth scenario</h4><div class="note" id="lk-selected-label">Select a projection window.</div></div>' +
    '<div class="seg lk-tabs" id="lk-tabs" role="group" aria-label="Forecast horizon">' +
    D.horizons.map((h) => '<button type="button" data-h="' + h.code + '" aria-pressed="' + (h.code === selected) + '">' + esc({ "21D": "21 DAYS", "1M": "1 MONTH", "3M": "3 MONTHS", "6M": "6 MONTHS", "1Y": "1 YEAR" }[h.code] || h.code) + '</button>').join("") + '</div></div>' +
    '<div class="lk-legend"><span><i class="l1"></i>Base-case trajectory</span><span><i class="l2"></i>50% &amp; 90% scenario bands</span><span><i class="l3"></i>Initial portfolio value</span>' +
    '<span class="lk-res"><b id="lk-resolution"></b> · visual detail, not forecast confidence</span></div>' +
    '<div class="lk-chartwrap" id="lk-chartwrap"><svg id="lk-chart" role="img" aria-label="Projected portfolio value with illustrative probability bands"></svg><div class="lk-tip" id="lk-tooltip" role="status"></div></div>' +
    '<div class="lk-evhead"><span>SCENARIO CATALYSTS <b>· 7 DATED MARKERS</b> · ' + esc(sfx("dates on the 18 Aug 2026 demo calendar")) + '</span><span class="note">Hypothetical market reactions · not historical results</span></div>' +
    '<div class="lk-events" id="lk-events" aria-label="Illustrative event timeline"></div>' +
    '<div class="lk-foot note"><span>Outer / inner shading: illustrative 5th–95th / 25th–75th percentile styling, not simulated frequency.</span><span class="lk-mono" id="lk-chart-window">—</span></div>' +
    '<div class="lk-two">' +
    '<div class="lk-card"><div class="lk-ch"><div><h4>Outcome scenarios</h4><div class="note">Stylized bear, base and bull scenarios for visual presentation.</div></div><span class="pill">VISUAL DEMO VALUES</span></div>' +
    '<div class="lk-sc"><div><small>Bear / P05</small><strong id="lk-bear">—</strong><em id="lk-bear-ret">—</em></div><div><small>Base / P50</small><strong class="lk-blue" id="lk-base">—</strong><em id="lk-base-ret">—</em></div><div><small>Bull / P95</small><strong id="lk-bull">—</strong><em id="lk-bull-ret">—</em></div></div>' +
    prob("Illustrative likelihood of finishing above starting value", "gain", "up") + prob("Illustrative likelihood of a loss greater than 10%", "loss", "down") + prob("Illustrative drawdown stress score", "dd", "") + '</div>' +
    '<div class="lk-card"><div class="lk-ch"><div><h4>Terminal outcome silhouette</h4><div class="note">Analytical-style distribution silhouette (not path counts).</div></div></div>' +
    '<svg id="lk-hist" role="img" aria-label="Illustrative distribution of final portfolio values"></svg><div class="note">Median dashed line · illustrative value distribution in USD, not counted simulation outcomes.</div></div></div>' +
    '<div class="lk-card"><div class="lk-ch"><div><h4>Five-horizon scenario comparison</h4><div class="note">Tap a row to inspect that horizon in the chart above.</div></div></div>' +
    '<div class="tablebox"><table class="lk-table"><thead><tr><th>Horizon</th><th>' + esc(sfx("End date")) + '</th><th>Median</th><th>P05</th><th>P95</th><th>P(gain)</th><th>P(loss &gt;10%)</th><th>Band width*</th></tr></thead><tbody id="lk-body"></tbody></table></div>' +
    '<div class="note">*P10–P90 styling width as a percentage of starting value. All statistics here are illustrative, not calibrated probabilities.</div></div>' +
    '<details class="lk-details"><summary>Concept methodology, dates and limitations</summary>' +
    '<p><b>1B means a one-billion-path interface concept only.</b> No billion-path job has been executed or benchmarked. The growth-oriented median line, stylized fan bands, summary probabilities, histogram silhouette and seven dated hypothetical catalysts were generated for an aesthetic demonstration. They are not the result of a newly executed Monte Carlo simulation or a validated return model.</p>' +
    '<p>Illustrative start: ' + esc(sfx("18 August 2026")) + '. The five calendar windows end 8 September 2026 (21 days), 18 September 2026 (one month), 18 November 2026 (three months), 18 February 2027 (six months) and 18 August 2027 (one year) ' + esc(SFX) + '. Weekdays approximate sessions without a holiday calendar. Event labels and impacts are hypothetical market-narrative examples, not verified central-bank meeting schedules, reported earnings or factual price reactions.</p>' +
    '<p>The 21-day view has the densest near-term visual scale, not empirically higher predictive accuracy. Percentile-style bands and displayed probabilities are design scaffolding, not observed frequencies, calibrated confidence bounds or investment forecasts. Not financial advice. Do not describe the 1B label as a completed computation.</p>' +
    '<div class="lk-btns"><button type="button" class="btn" id="lk-export-json">Export JSON data</button><button type="button" class="btn" id="lk-export-svg">Export chart SVG</button></div></details></div>';
}
function prob(label, key, cls) {
  return '<div class="lk-pl"><span>' + esc(label) + '</span><strong class="lk-mono ' + (cls ? "lk-" + cls : "") + '" id="lk-' + key + '-val">—</strong></div><div class="lk-track"><div class="lk-bar ' + (cls || "") + '" id="lk-' + key + '-bar"></div></div>';
}

/* ---------- drawing ---------- */
const hget = () => D.horizons.filter((h) => h.code === selected)[0];
function dims(wrap) {
  const w = Math.max(280, Math.round(wrap.clientWidth || 640)), mobile = w < 560;
  return { W: w, H: mobile ? Math.round(w * 0.86) : Math.round(Math.min(430, Math.max(300, w * 0.42))), left: mobile ? 46 : 68, right: mobile ? 12 : 26, top: 22, bottom: mobile ? 36 : 50, fs: mobile ? 11 : 12.5, mobile };
}
function drawChart() {
  const h = hget(), cutoff = h.business_days, pts = D.fan.filter((p) => p.day <= cutoff);
  const svg = $("#lk-chart"), tip = $("#lk-tooltip"), wrap = $("#lk-chartwrap"), start = D.starting_portfolio_usd;
  if (!svg || !wrap) return;
  const d = dims(wrap), W = d.W, H = d.H, left = d.left, right = d.right, top = d.top, bottom = d.bottom;
  const plotW = W - left - right, plotH = H - top - bottom;
  drawn.w = W;
  svg.setAttribute("viewBox", "0 0 " + W + " " + H); svg.setAttribute("width", W); svg.setAttribute("height", H);
  const lo = Math.min.apply(null, pts.map((p) => p.p05).concat(start)), hi = Math.max.apply(null, pts.map((p) => p.p95).concat(start));
  const pad = (hi - lo) * 0.11 || 3000, minY = lo - pad, maxY = hi + pad;
  const sx = (x) => left + (x / cutoff) * plotW;
  const sy = (v) => top + ((maxY - v) / (maxY - minY)) * plotH;
  const line = (k) => pts.map((p, i) => (i ? "L" : "M") + sx(p.day).toFixed(1) + " " + sy(p[k]).toFixed(1)).join(" ");
  const area = (u, l) => line(u) + " " + pts.slice().reverse().map((p) => "L" + sx(p.day).toFixed(1) + " " + sy(p[l]).toFixed(1)).join(" ") + " Z";
  svg.innerHTML = "";
  svg.append(svgEl("rect", { x: left, y: top, width: plotW, height: plotH, fill: "var(--panel-2)" }));
  const yt = d.mobile ? 4 : 5;
  for (let i = 0; i <= yt; i++) {
    const val = minY + (i * (maxY - minY)) / yt, y = sy(val);
    svg.append(svgEl("line", { x1: left, y1: y, x2: W - right, y2: y, stroke: "var(--line)", "stroke-width": 1, opacity: ".8" }));
    svg.append(text({ x: left - 8, y: y + 4, "text-anchor": "end", "font-size": d.fs }, "$" + Math.round(val / 1000) + "k"));
  }
  const t0 = dateOf(D.start_date).valueOf(), t1 = dateOf(h.end_date).valueOf(), xt = d.mobile ? 2 : 4;
  for (let j = 0; j <= xt; j++) {
    const dt = new Date(t0 + ((t1 - t0) * j) / xt);
    svg.append(text({ x: left + (j * plotW) / xt, y: H - 12, "text-anchor": j === 0 ? "start" : j === xt ? "end" : "middle", "font-size": d.fs }, dt.toLocaleDateString("en-US", { day: "numeric", month: "short", timeZone: "UTC" })));
  }
  svg.append(svgEl("path", { d: area("p95", "p05"), fill: "var(--chart)", "fill-opacity": ".14" }));
  svg.append(svgEl("path", { d: area("p75", "p25"), fill: "var(--chart)", "fill-opacity": ".25" }));
  svg.append(svgEl("line", { x1: left, y1: sy(start), x2: W - right, y2: sy(start), stroke: "var(--muted)", "stroke-dasharray": "5 6", opacity: ".8" }));
  ["p05", "p95"].forEach((k) => { svg.append(svgEl("path", { d: line(k), stroke: "var(--chart)", "stroke-dasharray": "5 5", fill: "none", opacity: ".6" })); });
  svg.append(svgEl("path", { d: line("p50"), stroke: "var(--chart)", "stroke-width": d.mobile ? 2.6 : 3.2, "stroke-linejoin": "round", "stroke-linecap": "round", fill: "none" }));
  let r = d.mobile ? 8.5 : 10.3, lastX = -99, row = 0;
  D.events.filter((e) => e.day <= cutoff).forEach((e) => {
    const x = sx(e.day), p = pts.filter((v) => v.day === e.day)[0]; if (!p) return;
    row = x - lastX < r * 2 + 2 ? (row + 1) % 3 : 0; lastX = x;
    const col = e.direction === "down" ? "var(--down)" : "var(--accent)", cy = top + 8 + r + row * (r * 2 + 3);
    svg.append(svgEl("line", { x1: x, y1: cy + r, x2: x, y2: H - bottom, stroke: col, "stroke-width": 1.1, "stroke-dasharray": "4 5", opacity: ".6" }));
    svg.append(svgEl("circle", { cx: x, cy: sy(p.p50), r: d.mobile ? 3.6 : 4.5, fill: col, stroke: "var(--panel)", "stroke-width": 1.6 }));
    svg.append(svgEl("circle", { cx: x, cy, r, fill: "var(--panel)", stroke: col, "stroke-width": 1.4 }));
    svg.append(text({ x, y: cy + 3.6, "text-anchor": "middle", fill: col, "font-size": d.mobile ? 10 : 11, "font-weight": 700 }, String(e.id)));
  });
  svg.append(svgEl("circle", { cx: sx(cutoff), cy: sy(h.p50), r: d.mobile ? 4.6 : 5.5, fill: "var(--chart)", stroke: "var(--panel)", "stroke-width": 2.6 }));
  svg.append(text({ x: W - right - 8, y: sy(h.p50) - 12, "text-anchor": "end", fill: "var(--chart)", "font-weight": 700, "font-size": d.fs + 1 }, money(h.p50)));
  const cursor = svgEl("g", { visibility: "hidden" }), guide = svgEl("line", { y1: top, y2: H - bottom, stroke: "var(--fg)", "stroke-dasharray": "3 5", opacity: ".7" }), dot = svgEl("circle", { r: 5, fill: "var(--chart)", stroke: "var(--fg)", "stroke-width": 1.3 });
  cursor.append(guide, dot); svg.append(cursor);
  const over = svgEl("rect", { x: left, y: top, width: plotW, height: plotH, fill: "transparent", style: "cursor:crosshair" }); svg.append(over);
  const show = (ev) => {
    const b = svg.getBoundingClientRect(), x = ((ev.clientX - b.left) / b.width) * W, approx = Math.max(0, Math.min(cutoff, ((x - left) / plotW) * cutoff));
    const p = pts.reduce((acc, v) => (Math.abs(v.day - approx) < Math.abs(acc.day - approx) ? v : acc), pts[0]), px = sx(p.day);
    cursor.setAttribute("visibility", "visible"); guide.setAttribute("x1", px); guide.setAttribute("x2", px); dot.setAttribute("cx", px); dot.setAttribute("cy", sy(p.p50));
    const ev2 = D.events.filter((e) => e.day === p.day)[0];
    tip.innerHTML = '<b class="lk-tip-d">' + esc(fmtDate(p.date)) + '</b><div>Median <b>' + money(p.p50) + '</b> (' + pct((p.p50 / start - 1) * 100) + ')</div><div>Illustrative range ' + money(p.p05) + ' – ' + money(p.p95) + '</div>' + (ev2 ? '<div class="lk-tip-e">CATALYST: ' + esc(ev2.name) + '</div>' : "");
    tip.style.display = "block";
    const rel = (px / W) * b.width, tw = tip.offsetWidth;
    tip.style.left = Math.max(4, Math.min(rel + 12, b.width - tw - 4)) + "px"; tip.style.top = "6px";
  };
  const hide = () => { cursor.setAttribute("visibility", "hidden"); tip.style.display = "none"; };
  over.addEventListener("pointerdown", show); over.addEventListener("pointermove", show);
  over.addEventListener("pointerleave", (e) => { if (e.pointerType !== "touch") hide(); });
  if (!drawChart.bound) { drawChart.bound = true; document.addEventListener("pointerdown", (e) => { const x = document.getElementById("lk-tooltip"); if (x && !(e.target.closest && e.target.closest("#lk-chart"))) x.style.display = "none"; }); }
}
function drawHist() {
  const h = hget(), hist = D.histograms[selected], svg = $("#lk-hist"), wrap = svg.parentNode;
  const W = Math.max(260, Math.round(wrap.clientWidth || 420)), mob = W < 420, H = Math.round(Math.max(170, Math.min(250, W * 0.5)));
  const arr = hist.counts, edges = hist.edges, max = Math.max.apply(null, arr), L = mob ? 34 : 40, R = 12, T = 12, B = 34, bw = (W - L - R) / arr.length;
  svg.setAttribute("viewBox", "0 0 " + W + " " + H); svg.setAttribute("width", W); svg.setAttribute("height", H); svg.innerHTML = "";
  for (let j = 0; j < 5; j++) { const y = T + (j * (H - T - B)) / 4; svg.append(svgEl("line", { x1: L, y1: y, x2: W - R, y2: y, stroke: "var(--line)", opacity: ".8" })); }
  arr.forEach((v, i) => { const bh = (v / max) * (H - T - B); svg.append(svgEl("rect", { x: L + i * bw + 1, y: H - B - bh, width: Math.max(bw - 2, 2), height: bh, fill: "var(--chart)", "fill-opacity": ".75", rx: ".8" })); });
  for (let k = 0; k <= 4; k++) { const x = L + (k * (W - L - R)) / 4, val = edges[0] + (k * (edges[edges.length - 1] - edges[0])) / 4; svg.append(text({ x, y: H - 12, "text-anchor": "middle", "font-size": mob ? 10.5 : 11.5 }, "$" + Math.round(val / 1000) + "k")); }
  const mx = L + ((h.median - edges[0]) / (edges[edges.length - 1] - edges[0])) * (W - L - R);
  svg.append(svgEl("line", { x1: mx, x2: mx, y1: T, y2: H - B, stroke: "var(--accent)", "stroke-width": 2, "stroke-dasharray": "4 3" }));
}
function update() {
  const h = hget(), start = D.starting_portfolio_usd;
  $("#lk-median").textContent = money(h.median);
  $("#lk-median-sub").textContent = sfx(pct(h.median_return_pct) + " by " + fmtDate(h.end_date));
  $("#lk-profit").textContent = h.prob_profit_pct.toFixed(1) + "%";
  $("#lk-range").textContent = money(h.p05) + " — " + money(h.p95);
  $("#lk-selected-label").textContent = h.label + " · " + sfx(fmtDate(D.start_date) + " to " + fmtDate(h.end_date)) + " · " + h.business_days + " weekday intervals · hypothetical";
  $("#lk-chart-window").textContent = h.code + " / " + h.end_date + " " + SFX;
  $("#lk-resolution").textContent = h.resolution;
  ["bear", "base", "bull"].forEach((key, i) => { const v = h[["p05", "p50", "p95"][i]]; $("#lk-" + key).textContent = money(v); $("#lk-" + key + "-ret").textContent = pct((v / start - 1) * 100) + " vs start"; });
  [["gain", h.prob_profit_pct], ["loss", h.prob_loss_10_pct], ["dd", h.prob_drawdown_10_pct]].forEach((a) => { $("#lk-" + a[0] + "-val").textContent = a[1].toFixed(1) + "%"; $("#lk-" + a[0] + "-bar").style.width = a[1] + "%"; });
  root.querySelectorAll("#lk-tabs [data-h]").forEach((b) => { b.setAttribute("aria-pressed", b.dataset.h === selected ? "true" : "false"); });
  $("#lk-body").innerHTML = D.horizons.map((r) => '<tr data-h="' + r.code + '" class="' + (r.code === selected ? "on" : "") + '" tabindex="0" role="button" aria-label="Inspect ' + r.code + ' horizon">' +
    '<td data-l="Horizon"><span class="' + (r.code === selected ? "pill" : "") + '">' + r.code + '</span></td><td data-l="' + esc("End date " + SFX) + '"><span class="lk-nw">' + r.end_date + '</span></td><td data-l="Median">' + money(r.median) + '</td><td data-l="P05">' + money(r.p05) + '</td><td data-l="P95">' + money(r.p95) +
    '</td><td data-l="P(gain)" class="lk-up">' + r.prob_profit_pct.toFixed(1) + '%</td><td data-l="P(loss >10%)">' + r.prob_loss_10_pct.toFixed(1) + '%</td><td data-l="Band width">' + r.p10_p90_width_pct_of_start.toFixed(1) + '%</td></tr>').join("");
  root.querySelectorAll("tbody tr[data-h]").forEach((row) => {
    row.addEventListener("click", () => setH(row.dataset.h));
    row.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setH(row.dataset.h); } });
  });
  $("#lk-events").innerHTML = D.events.filter((ev) => ev.day <= h.business_days).map((ev) => '<div class="lk-ev' + (ev.direction === "down" ? " lk-dn" : "") + '"><div class="lk-evt"><span>' + esc(fmtShort(ev.date)) + '</span><span>#' + ev.id + ' · SCENARIO</span></div><div class="lk-evn">' + esc(ev.name) + '</div>' +
    '<div class="lk-evt"><span>' + esc(ev.short) + '</span><span class="lk-evd">' + (ev.direction === "down" ? "▼ PULLBACK" : "▲ RALLY") + '</span></div></div>').join("") || '<div class="note">No scenario markers in this date range.</div>';
  drawChart(); drawHist();
}
function setH(code) { selected = code; update(); }

function download(blob, name) {
  const url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500);
}
function resolveVars(str) {
  const cs = getComputedStyle(document.documentElement);
  return str.replace(/var\((--[\w-]+)\)/g, (m, n) => cs.getPropertyValue(n).trim() || "#888");
}
function bind() {
  root.querySelectorAll("#lk-tabs [data-h]").forEach((b) => b.addEventListener("click", () => setH(b.dataset.h)));
  $("#lk-export-json").addEventListener("click", () => download(new Blob([JSON.stringify(D, null, 2)], { type: "application/json" }), "LEKHA_Synthetic_Forecast.json"));
  $("#lk-export-svg").addEventListener("click", () => {
    const svg = $("#lk-chart").cloneNode(true); svg.setAttribute("xmlns", NS);
    svg.setAttribute("style", "background:" + (getComputedStyle(document.documentElement).getPropertyValue("--panel").trim() || "#fff"));
    download(new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n' + resolveVars(new XMLSerializer().serializeToString(svg))], { type: "image/svg+xml" }), "LEKHA_Forecast_" + selected + ".svg");
  });
  let raf = 0;
  if (typeof ResizeObserver === "function") {
    const ro = new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { const w = $("#lk-chartwrap"); if (w && Math.abs(w.clientWidth - drawn.w) > 24) { drawChart(); drawHist(); } }); });
    ro.observe($("#lk-chartwrap"));
  }
}

/* ---------- styles (tokens only, so every theme restyles the lab) ---------- */
const CSS = [
  "#proj-body{--panel:var(--card);--panel-2:var(--card2);--fg:var(--ink);--f-mono:ui-monospace,Menlo,Consolas,monospace;--f-display:inherit;min-width:0}",
  ".lk{display:flex;flex-direction:column;gap:14px;min-width:0}.lk h3,.lk h4{margin:0}.lk-mono{font-family:var(--f-mono)}",
  ".lk-lead{display:flex;justify-content:space-between;align-items:flex-end;gap:12px 16px;flex-wrap:wrap}",
  ".lk-eyebrow{letter-spacing:.15em;color:var(--accent);font-size:11px;font-weight:700;margin-bottom:6px}",
  ".lk-h{font-family:var(--f-display);font-size:clamp(24px,4.6vw,40px);line-height:1.1;letter-spacing:-.03em;margin:0 0 6px;font-weight:700}",
  ".lk-scale{text-align:right;color:var(--muted);font-size:11px;display:flex;flex-direction:column;gap:2px}.lk-scale strong{font-family:var(--f-mono);font-size:clamp(40px,7vw,64px);line-height:1;letter-spacing:-.06em;color:var(--fg)}",
  ".lk-demo{background:color-mix(in srgb,var(--accent) 12%,var(--panel));border:1px solid color-mix(in srgb,var(--accent) 38%,var(--line));border-radius:6px;padding:10px 12px;display:flex;gap:4px 14px;align-items:flex-start;flex-wrap:wrap;font-size:12.5px;line-height:1.5}",
  ".lk-demo strong{color:var(--accent);font-family:var(--f-mono);letter-spacing:.05em;white-space:nowrap}.lk-demo span{flex:1 1 260px;min-width:0}",
  ".lk-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border:1px solid var(--line);border-radius:6px;overflow:hidden}",
  ".lk-m{padding:14px 16px;border-right:1px solid var(--line);min-width:0}.lk-m:last-child{border-right:0}",
  ".lk-ml{text-transform:uppercase;color:var(--muted);font-size:11px;font-weight:700;letter-spacing:.07em}",
  ".lk-mv{font-family:var(--f-mono);font-size:clamp(20px,2.4vw,30px);font-weight:600;margin:4px 0;letter-spacing:-.03em}.lk-range{font-size:clamp(17px,1.9vw,24px)}",
  ".lk-ms{color:var(--muted);font-size:12px;line-height:1.4}.lk-blue{color:var(--chart)}.lk-up{color:var(--up)}.lk-down{color:var(--down)}",
  ".lk-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px 14px;flex-wrap:wrap}.lk-head h4{font-size:16px;margin-bottom:3px}",
  ".lk-tabs button{min-height:34px}",
  ".lk-legend{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:12px;color:var(--muted)}.lk-legend i{display:inline-block;width:18px;height:3px;margin-right:6px;vertical-align:middle;border-radius:2px;background:var(--chart)}",
  ".lk-legend i.l2{height:9px;opacity:.4}.lk-legend i.l3{background:var(--muted);height:1px}.lk-res{margin-left:auto}.lk-res b{color:var(--accent)}",
  ".lk-chartwrap{position:relative;width:100%;min-width:0}#lk-chart{display:block;width:100%;height:auto;touch-action:pan-y;overflow:visible}#lk-hist{display:block;width:100%;height:auto}",
  ".lk-tip{display:none;position:absolute;min-width:170px;max-width:calc(100% - 8px);pointer-events:none;border:1px solid var(--line);background:var(--panel);box-shadow:0 8px 24px color-mix(in srgb,#000 35%,transparent);padding:9px 11px;border-radius:5px;font-size:12px;z-index:5}",
  ".lk-tip-d{display:block;color:var(--accent);margin-bottom:4px}.lk-tip-e{margin-top:6px;color:var(--accent)}",
  ".lk-evhead{display:flex;align-items:center;justify-content:space-between;gap:6px 12px;flex-wrap:wrap;color:var(--muted);font-size:10.5px;font-weight:700;letter-spacing:.1em}.lk-evhead b{color:var(--accent)}.lk-evhead .note{letter-spacing:0;font-weight:400}",
  ".lk-events{display:grid;grid-template-columns:repeat(auto-fit,minmax(165px,1fr));gap:8px}",
  ".lk-ev{border:1px solid var(--line);background:var(--panel-2);border-radius:5px;padding:9px 11px;min-width:0;box-shadow:inset 3px 0 0 var(--accent)}.lk-ev.lk-dn{box-shadow:inset 3px 0 0 var(--down)}",
  ".lk-evt{color:var(--muted);font-family:var(--f-mono);font-size:10.5px;display:flex;gap:8px;justify-content:space-between}.lk-evn{font-size:12.5px;font-weight:650;margin:5px 0}.lk-evd{color:var(--accent)}.lk-ev.lk-dn .lk-evd{color:var(--down)}",
  ".lk-foot{display:flex;justify-content:space-between;gap:6px 16px;flex-wrap:wrap}",
  ".lk-two{display:grid;grid-template-columns:1.1fr .9fr;gap:14px;align-items:start}",
  ".lk-card{border:1px solid var(--line);border-radius:6px;padding:14px;display:flex;flex-direction:column;gap:10px;min-width:0}.lk-ch{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start}.lk-ch h4{font-size:15px;margin-bottom:2px}",
  ".lk-sc{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.lk-sc>div{border:1px solid var(--line);border-radius:5px;background:var(--panel-2);padding:10px;min-width:0}",
  ".lk-sc small{display:block;color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.07em;font-weight:700}.lk-sc strong{display:block;font-family:var(--f-mono);font-size:clamp(14px,1.7vw,19px);margin:6px 0 2px}.lk-sc em{font-style:normal;color:var(--muted);font-family:var(--f-mono);font-size:11px}",
  ".lk-pl{display:flex;justify-content:space-between;gap:12px;font-size:12px;color:var(--muted);margin-top:6px}.lk-track{height:8px;background:var(--panel-2);border-radius:3px;overflow:hidden}.lk-bar{height:100%;background:var(--chart);transition:width .18s}.lk-bar.up{background:var(--up)}.lk-bar.down{background:var(--down)}",
  ".lk-nw{white-space:nowrap}",
  ".lk-table{width:100%;min-width:0;border-collapse:collapse;white-space:nowrap;text-align:right;font-size:12.5px}.lk-table th{color:var(--muted);font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;padding:10px 9px;text-align:right;border-bottom:1px solid var(--line);white-space:normal;vertical-align:bottom}",
  ".lk-table td{padding:11px 9px;border-bottom:1px solid var(--line);font-variant-numeric:tabular-nums}.lk-table th:first-child,.lk-table td:first-child{text-align:left}.lk-table tr:last-child td{border-bottom:0}",
  ".lk-table tbody tr{cursor:pointer}.lk-table tbody tr:hover{background:var(--panel-2)}.lk-table tbody tr.on{background:var(--accent-soft)}.lk-table tbody tr:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}",
  ".lk-details{font-size:13px;color:var(--muted);line-height:1.6}.lk-details summary{cursor:pointer;color:var(--fg);font-weight:600;padding:4px 0}.lk-details p{margin:8px 0}.lk-btns{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}",
  "@media (max-width:900px){.lk-two{grid-template-columns:1fr}.lk-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.lk-m:nth-child(2){border-right:0}.lk-m:nth-child(-n+2){border-bottom:1px solid var(--line)}}",
  "@media (max-width:620px){",
  "  .lk-scale{text-align:left}.lk-m{padding:12px}.lk-card{padding:12px 10px}.lk-res{margin-left:0;flex-basis:100%}",
  "  .lk-tabs{display:flex;width:100%;overflow-x:auto;scrollbar-width:none}.lk-tabs::-webkit-scrollbar{display:none}.lk-tabs button{flex:1 0 auto;min-height:44px;padding:0 14px}",
  "  .lk-events{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;gap:8px;padding-bottom:6px;margin:0 -2px}.lk-ev{flex:0 0 74%;scroll-snap-align:start}",
  "  .lk-table-wrap,.lk .tablebox{border:0}.lk-table thead{display:none}.lk-table,.lk-table tbody{display:block;white-space:normal}",
  "  .lk-table{min-width:0;width:100%}.lk-table tr,.lk-table td{white-space:normal;min-width:0}.lk-table tr{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:2px 14px;padding:10px;border:1px solid var(--line);border-radius:6px;margin-bottom:8px}.lk-table tr.on{border-color:var(--accent)}",
  "  .lk-table td{display:flex;justify-content:space-between;align-items:baseline;gap:8px;border:0;padding:3px 0;text-align:right}.lk-table td::before{content:attr(data-l);color:var(--muted);font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;text-align:left}",
  "  .lk-table td:nth-child(-n+2){grid-column:1/-1}",
  "}",
  "@media (max-width:360px){.lk-sc{grid-template-columns:1fr}}",
].join("\n");
function injectCss() { if (document.getElementById("lk-css")) return; const s = document.createElement("style"); s.id = "lk-css"; s.textContent = CSS; document.head.appendChild(s); }

export default {
  render() {
    return `<div class="page"><div class="card">
      <div class="ch"><h2>${escHtml(t("1B Projection Lab"))}</h2><span class="pill">${escHtml(t("Demo · synthetic"))}</span></div>
      <div id="proj-body"><div class="empty">${escHtml(t("Loading projection…"))}</div></div>
    </div></div>`;
  },
  mount(el) {
    root = el.querySelector("#proj-body");
    if (!root) return;
    injectCss();
    root.innerHTML = '<div class="empty">' + escHtml(t("Loading projection…")) + '</div>';
    fetch(DATA_URL, { cache: "force-cache" })
      .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then((j) => { D = j; root.innerHTML = markup(); root = root.querySelector(".lk"); selected = "21D"; bind(); update(); })
      .catch(() => { root.innerHTML = '<div class="empty">' + escHtml(t("The projection demo could not be loaded.")) + '</div>'; });
  },
};
