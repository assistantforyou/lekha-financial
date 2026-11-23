/* LEKHA "Illustrative Projection Lab": a SYNTHETIC, art-directed growth scenario shown below Portfolio performance.
   Every figure comes from public/pt-projection-data.json: hand-authored design data, not a Monte Carlo run,
   not a forecast, not your portfolio. The "1B" is an interface-scale label; no billion-path job was executed.
   Visibility: Demo + Premium see the panel, Free sees a locked teaser, Paid does not see it.
   Mobile-first: the chart is drawn at the container's real pixel width (no shrinking viewBox), touch scrubs
   the tooltip, and the table stacks into cards on phones. Colours come from the app's CSS tokens, so every
   theme restyles it. Every date written here carries "". */
(function () {
  "use strict";

  var SFX = window.PT_DEMO_SFX || "";
  var DATA_URL = "pt-projection-data.json";
  var NS = "http://www.w3.org/2000/svg";
  var D = null, root = null, selected = "21D", drawn = { w: 0 };

  /* ---------- formatting ---------- */
  function money(n) { return "$" + Math.round(n).toLocaleString("en-US"); }
  function pct(n) { return (n >= 0 ? "+" : "") + n.toFixed(1) + "%"; }
  function dateOf(s) { var p = s.split("-").map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2])); }
  function fmtDate(s) { return dateOf(s).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }); }
  function fmtShort(s) { return dateOf(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }); }
  function sfx(t) { return t + " " + SFX; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function $(s) { return root.querySelector(s); }
  function svgEl(tag, attrs) {
    var x = document.createElementNS(NS, tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { x.setAttribute(k, attrs[k]); });
    return x;
  }
  function text(attrs, str) { var t = svgEl("text", Object.assign({ "font-family": "ui-monospace,Menlo,Consolas,monospace", fill: "var(--muted)" }, attrs)); t.textContent = str; return t; }

  /* ---------- markup ---------- */
  function markup() {
    return '<div class="lk">' +
      '<div class="lk-lead"><div><div class="lk-eyebrow">PROBABILISTIC INVESTMENT INTELLIGENCE</div>' +
      '<h3 class="lk-h">The future is a distribution.</h3>' +
      '<p class="note">Five portfolio outlook windows. A growth-oriented scenario with illustrative catalysts, pullbacks and recoveries.</p></div>' +
      '<div class="lk-scale"><small>SCENARIO WINDOWS</small><strong>5</strong><small>ILLUSTRATIVE</small></div></div>' +
      '<div class="lk-demo"><strong>PREMIUM SCENARIO LAB</strong><span>Illustrative bullish concept starting ' + esc(sfx(fmtDate(D.start_date))) +
      ' · seven hypothetical catalyst reactions. The curves and scenario figures are prebuilt illustrations. No actual holdings or real market data.</span></div>' +
      '<div class="lk-metrics">' +
      '<div class="lk-m"><div class="lk-ml">Starting value</div><div class="lk-mv">' + money(D.starting_portfolio_usd) + '</div><div class="lk-ms">' + esc(sfx(fmtDate(D.start_date).toUpperCase())) + ' · USD</div></div>' +
      '<div class="lk-m"><div class="lk-ml">Base-case projected value</div><div class="lk-mv lk-blue" id="lk-median">—</div><div class="lk-ms" id="lk-median-sub">—</div></div>' +
      '<div class="lk-m"><div class="lk-ml">Illustrative gain likelihood</div><div class="lk-mv lk-up" id="lk-profit">—</div><div class="lk-ms">Scenario assumption · not calibrated</div></div>' +
      '<div class="lk-m"><div class="lk-ml">Illustrative range</div><div class="lk-mv lk-range" id="lk-range">—</div><div class="lk-ms">Stylized P05–P95 · not calibrated</div></div></div>' +
      '<div class="lk-head"><div><h4>Portfolio projection · growth scenario</h4><div class="note" id="lk-selected-label">Select a projection window.</div></div>' +
      '<div class="seg lk-tabs" id="lk-tabs" role="group" aria-label="Forecast horizon">' +
      D.horizons.map(function (h) { return '<button type="button" data-h="' + h.code + '" aria-pressed="' + (h.code === selected) + '">' + esc({ "21D": "21 DAYS", "1M": "1 MONTH", "3M": "3 MONTHS", "6M": "6 MONTHS", "1Y": "1 YEAR" }[h.code] || h.code) + '</button>'; }).join("") + '</div></div>' +
      '<div class="lk-legend"><span><i class="l1"></i>Base-case trajectory</span><span><i class="l2"></i>50% &amp; 90% scenario bands</span><span><i class="l3"></i>Initial portfolio value</span>' +
      '<span class="lk-res"><b id="lk-resolution"></b> · visual detail, not forecast confidence</span></div>' +
      '<div class="lk-chartwrap" id="lk-chartwrap"><svg id="lk-chart" role="img" aria-label="Projected portfolio value with illustrative probability bands"></svg><div class="lk-tip" id="lk-tooltip" role="status"></div></div>' +
      '<div class="lk-evhead"><span>SCENARIO CATALYSTS <b>· 7 DATED MARKERS</b> · ' + esc(sfx("dates on the 18 Aug 2026 demo calendar")) + '</span><span class="note">Hypothetical market reactions · not historical results</span></div>' +
      '<div class="lk-events" id="lk-events" aria-label="Illustrative event timeline"></div>' +
      '<div class="lk-foot note"><span>Outer / inner shading: illustrative 5th–95th / 25th–75th percentile styling, not simulated frequency.</span><span class="lk-mono" id="lk-chart-window">—</span></div>' +
      '<div class="lk-two">' +
      '<div class="lk-card"><div class="lk-ch"><div><h4>Outcome scenarios</h4><div class="note">Stylized bear, base and bull scenarios for visual presentation.</div></div><span class="pill">SCENARIO VALUES</span></div>' +
      '<div class="lk-sc"><div><small>Bear / P05</small><strong id="lk-bear">—</strong><em id="lk-bear-ret">—</em></div><div><small>Base / P50</small><strong class="lk-blue" id="lk-base">—</strong><em id="lk-base-ret">—</em></div><div><small>Bull / P95</small><strong id="lk-bull">—</strong><em id="lk-bull-ret">—</em></div></div>' +
      prob("Illustrative likelihood of finishing above starting value", "gain", "up") + prob("Illustrative likelihood of a loss greater than 10%", "loss", "down") + prob("Illustrative drawdown stress score", "dd", "") + '</div>' +
      '<div class="lk-card"><div class="lk-ch"><div><h4>Terminal outcome silhouette</h4><div class="note">Analytical-style distribution silhouette (not path counts).</div></div></div>' +
      '<svg id="lk-hist" role="img" aria-label="Illustrative distribution of final portfolio values"></svg><div class="note">Median dashed line · illustrative value distribution in USD, not counted simulation outcomes.</div></div></div>' +
      '<div class="lk-card"><div class="lk-ch"><div><h4>Five-horizon scenario comparison</h4><div class="note">Tap a row to inspect that horizon in the chart above.</div></div></div>' +
      '<div class="tablebox"><table class="lk-table"><thead><tr><th>Horizon</th><th>' + esc(sfx("End date")) + '</th><th>Median</th><th>P05</th><th>P95</th><th>P(gain)</th><th>P(loss &gt;10%)</th><th>Band width*</th></tr></thead><tbody id="lk-body"></tbody></table></div>' +
      '<div class="note">*P10–P90 styling width as a percentage of starting value. All statistics here are illustrative, not calibrated probabilities.</div></div>' +
      '<details class="lk-details"><summary>Concept methodology, dates and limitations</summary>' +
      '<p><b>This panel illustrates a hypothetical scenario.</b> No billion-path job has been executed or benchmarked. The growth-oriented median line, stylized fan bands, summary probabilities, histogram silhouette and seven dated hypothetical catalysts were generated for an aesthetic demonstration. They are not the result of a newly executed Monte Carlo simulation or a validated return model.</p>' +
      '<p>Illustrative start: ' + esc(sfx("18 August 2026")) + '. The five calendar windows end 8 September 2026 (21 days), 18 September 2026 (one month), 18 November 2026 (three months), 18 February 2027 (six months) and 18 August 2027 (one year) ' + esc(SFX) + '. Weekdays approximate sessions without a holiday calendar. Event labels and impacts are hypothetical market-narrative examples, not verified central-bank meeting schedules, reported earnings or factual price reactions.</p>' +
      '<p>The 21-day view has the densest near-term visual scale, not empirically higher predictive accuracy. Percentile-style bands and displayed probabilities are design scaffolding, not observed frequencies, calibrated confidence bounds or investment forecasts. Not financial advice. Do not describe the 1B label as a completed computation.</p>' +
      '<div class="lk-btns"><button type="button" class="btn" id="lk-export-json">Export JSON data</button><button type="button" class="btn" id="lk-export-svg">Export chart SVG</button></div></details></div>';
  }
  function prob(label, key, cls) {
    return '<div class="lk-pl"><span>' + esc(label) + '</span><strong class="lk-mono ' + (cls ? "lk-" + cls : "") + '" id="lk-' + key + '-val">—</strong></div><div class="lk-track"><div class="lk-bar ' + (cls || "") + '" id="lk-' + key + '-bar"></div></div>';
  }

  /* ---------- drawing ---------- */
  function hget() { return D.horizons.filter(function (h) { return h.code === selected; })[0]; }
  function dims(wrap) {
    var w = Math.max(280, Math.round(wrap.clientWidth || 640)), mobile = w < 560;
    return { W: w, H: mobile ? Math.round(w * 0.86) : Math.round(Math.min(430, Math.max(300, w * 0.42))), left: mobile ? 46 : 68, right: mobile ? 12 : 26, top: 22, bottom: mobile ? 36 : 50, fs: mobile ? 11 : 12.5, mobile: mobile };
  }
  function drawChart() {
    var h = hget(), cutoff = h.business_days, pts = D.fan.filter(function (p) { return p.day <= cutoff; });
    var svg = $("#lk-chart"), tip = $("#lk-tooltip"), wrap = $("#lk-chartwrap"), start = D.starting_portfolio_usd;
    var d = dims(wrap), W = d.W, H = d.H, left = d.left, right = d.right, top = d.top, bottom = d.bottom;
    var plotW = W - left - right, plotH = H - top - bottom;
    drawn.w = W;
    svg.setAttribute("viewBox", "0 0 " + W + " " + H); svg.setAttribute("width", W); svg.setAttribute("height", H);
    var lo = Math.min.apply(null, pts.map(function (p) { return p.p05; }).concat(start)), hi = Math.max.apply(null, pts.map(function (p) { return p.p95; }).concat(start));
    var pad = (hi - lo) * 0.11 || 3000, minY = lo - pad, maxY = hi + pad;
    function sx(t) { return left + t / cutoff * plotW; }
    function sy(v) { return top + (maxY - v) / (maxY - minY) * plotH; }
    function line(k) { return pts.map(function (p, i) { return (i ? "L" : "M") + sx(p.day).toFixed(1) + " " + sy(p[k]).toFixed(1); }).join(" "); }
    function area(u, l) { return line(u) + " " + pts.slice().reverse().map(function (p) { return "L" + sx(p.day).toFixed(1) + " " + sy(p[l]).toFixed(1); }).join(" ") + " Z"; }
    svg.innerHTML = "";
    svg.append(svgEl("rect", { x: left, y: top, width: plotW, height: plotH, fill: "var(--panel-2)" }));
    var yt = d.mobile ? 4 : 5;
    for (var i = 0; i <= yt; i++) {
      var val = minY + i * (maxY - minY) / yt, y = sy(val);
      svg.append(svgEl("line", { x1: left, y1: y, x2: W - right, y2: y, stroke: "var(--line)", "stroke-width": 1, opacity: ".8" }));
      svg.append(text({ x: left - 8, y: y + 4, "text-anchor": "end", "font-size": d.fs }, "$" + Math.round(val / 1000) + "k"));
    }
    var t0 = dateOf(D.start_date).valueOf(), t1 = dateOf(h.end_date).valueOf(), xt = d.mobile ? 2 : 4;
    for (var j = 0; j <= xt; j++) {
      var dt = new Date(t0 + (t1 - t0) * j / xt);
      svg.append(text({ x: left + j * plotW / xt, y: H - 12, "text-anchor": j === 0 ? "start" : j === xt ? "end" : "middle", "font-size": d.fs }, dt.toLocaleDateString("en-US", { day: "numeric", month: "short", timeZone: "UTC" })));
    }
    svg.append(svgEl("path", { d: area("p95", "p05"), fill: "var(--chart)", "fill-opacity": ".14" }));
    svg.append(svgEl("path", { d: area("p75", "p25"), fill: "var(--chart)", "fill-opacity": ".25" }));
    svg.append(svgEl("line", { x1: left, y1: sy(start), x2: W - right, y2: sy(start), stroke: "var(--muted)", "stroke-dasharray": "5 6", opacity: ".8" }));
    ["p05", "p95"].forEach(function (k) { svg.append(svgEl("path", { d: line(k), stroke: "var(--chart)", "stroke-dasharray": "5 5", fill: "none", opacity: ".6" })); });
    svg.append(svgEl("path", { d: line("p50"), stroke: "var(--chart)", "stroke-width": d.mobile ? 2.6 : 3.2, "stroke-linejoin": "round", "stroke-linecap": "round", fill: "none" }));
    /* catalysts: numbered markers on top; neighbours closer than the marker width step down a row so they never overlap */
    var r = d.mobile ? 8.5 : 10.3, lastX = -99, row = 0;
    D.events.filter(function (e) { return e.day <= cutoff; }).forEach(function (e) {
      var x = sx(e.day), p = pts.filter(function (v) { return v.day === e.day; })[0]; if (!p) return;
      row = x - lastX < r * 2 + 2 ? (row + 1) % 3 : 0; lastX = x;
      var col = e.direction === "down" ? "var(--down)" : "var(--accent)", cy = top + 8 + r + row * (r * 2 + 3);
      svg.append(svgEl("line", { x1: x, y1: cy + r, x2: x, y2: H - bottom, stroke: col, "stroke-width": 1.1, "stroke-dasharray": "4 5", opacity: ".6" }));
      svg.append(svgEl("circle", { cx: x, cy: sy(p.p50), r: d.mobile ? 3.6 : 4.5, fill: col, stroke: "var(--panel)", "stroke-width": 1.6 }));
      svg.append(svgEl("circle", { cx: x, cy: cy, r: r, fill: "var(--panel)", stroke: col, "stroke-width": 1.4 }));
      svg.append(text({ x: x, y: cy + 3.6, "text-anchor": "middle", fill: col, "font-size": d.mobile ? 10 : 11, "font-weight": 700 }, String(e.id)));
    });
    svg.append(svgEl("circle", { cx: sx(cutoff), cy: sy(h.p50), r: d.mobile ? 4.6 : 5.5, fill: "var(--chart)", stroke: "var(--panel)", "stroke-width": 2.6 }));
    svg.append(text({ x: W - right - 8, y: sy(h.p50) - 12, "text-anchor": "end", fill: "var(--chart)", "font-weight": 700, "font-size": d.fs + 1 }, money(h.p50)));
    /* hover / touch scrubber */
    var cursor = svgEl("g", { visibility: "hidden" }), guide = svgEl("line", { y1: top, y2: H - bottom, stroke: "var(--fg)", "stroke-dasharray": "3 5", opacity: ".7" }),
      dot = svgEl("circle", { r: 5, fill: "var(--chart)", stroke: "var(--fg)", "stroke-width": 1.3 });
    cursor.append(guide, dot); svg.append(cursor);
    var over = svgEl("rect", { x: left, y: top, width: plotW, height: plotH, fill: "transparent", style: "cursor:crosshair" }); svg.append(over);
    function show(ev) {
      var b = svg.getBoundingClientRect(), x = (ev.clientX - b.left) / b.width * W, approx = Math.max(0, Math.min(cutoff, (x - left) / plotW * cutoff));
      var p = pts.reduce(function (acc, v) { return Math.abs(v.day - approx) < Math.abs(acc.day - approx) ? v : acc; }, pts[0]), px = sx(p.day);
      cursor.setAttribute("visibility", "visible"); guide.setAttribute("x1", px); guide.setAttribute("x2", px); dot.setAttribute("cx", px); dot.setAttribute("cy", sy(p.p50));
      var ev2 = D.events.filter(function (e) { return e.day === p.day; })[0];
      tip.innerHTML = '<b class="lk-tip-d">' + esc(fmtDate(p.date)) + '</b><div>Median <b>' + money(p.p50) + '</b> (' + pct((p.p50 / start - 1) * 100) + ')</div><div>Illustrative range ' + money(p.p05) + ' – ' + money(p.p95) + '</div>' +
        (ev2 ? '<div class="lk-tip-e">CATALYST: ' + esc(ev2.name) + '</div>' : "");
      tip.style.display = "block";
      var rel = px / W * b.width, tw = tip.offsetWidth;
      tip.style.left = Math.max(4, Math.min(rel + 12, b.width - tw - 4)) + "px"; tip.style.top = "6px";
    }
    function hide() { cursor.setAttribute("visibility", "hidden"); tip.style.display = "none"; }
    over.addEventListener("pointerdown", show); over.addEventListener("pointermove", show);
    over.addEventListener("pointerleave", function (e) { if (e.pointerType !== "touch") hide(); });
    if (!drawChart.bound) { drawChart.bound = true; document.addEventListener("pointerdown", function (e) { var t = document.getElementById("lk-tooltip"); if (t && !(e.target.closest && e.target.closest("#lk-chart"))) t.style.display = "none"; }); }
  }
  function drawHist() {
    var h = hget(), hist = D.histograms[selected], svg = $("#lk-hist"), wrap = svg.parentNode;
    var W = Math.max(260, Math.round(wrap.clientWidth || 420)), mob = W < 420, H = Math.round(Math.max(170, Math.min(250, W * 0.5)));
    var arr = hist.counts, edges = hist.edges, max = Math.max.apply(null, arr), L = mob ? 34 : 40, R = 12, T = 12, B = 34, bw = (W - L - R) / arr.length;
    svg.setAttribute("viewBox", "0 0 " + W + " " + H); svg.setAttribute("width", W); svg.setAttribute("height", H); svg.innerHTML = "";
    for (var j = 0; j < 5; j++) { var y = T + j * (H - T - B) / 4; svg.append(svgEl("line", { x1: L, y1: y, x2: W - R, y2: y, stroke: "var(--line)", opacity: ".8" })); }
    arr.forEach(function (v, i) { var bh = v / max * (H - T - B); svg.append(svgEl("rect", { x: L + i * bw + 1, y: H - B - bh, width: Math.max(bw - 2, 2), height: bh, fill: "var(--chart)", "fill-opacity": ".75", rx: ".8" })); });
    for (var k = 0; k <= 4; k++) { var x = L + k * (W - L - R) / 4, val = edges[0] + k * (edges[edges.length - 1] - edges[0]) / 4; svg.append(text({ x: x, y: H - 12, "text-anchor": "middle", "font-size": mob ? 10.5 : 11.5 }, "$" + Math.round(val / 1000) + "k")); }
    var mx = L + (h.median - edges[0]) / (edges[edges.length - 1] - edges[0]) * (W - L - R);
    svg.append(svgEl("line", { x1: mx, x2: mx, y1: T, y2: H - B, stroke: "var(--accent)", "stroke-width": 2, "stroke-dasharray": "4 3" }));
  }
  function update() {
    var h = hget(), start = D.starting_portfolio_usd;
    $("#lk-median").textContent = money(h.median);
    $("#lk-median-sub").textContent = sfx(pct(h.median_return_pct) + " by " + fmtDate(h.end_date));
    $("#lk-profit").textContent = h.prob_profit_pct.toFixed(1) + "%";
    $("#lk-range").textContent = money(h.p05) + " — " + money(h.p95);
    $("#lk-selected-label").textContent = h.label + " · " + sfx(fmtDate(D.start_date) + " to " + fmtDate(h.end_date)) + " · " + h.business_days + " weekday intervals · hypothetical";
    $("#lk-chart-window").textContent = h.code + " / " + h.end_date + " " + SFX;
    $("#lk-resolution").textContent = h.resolution;
    ["bear", "base", "bull"].forEach(function (key, i) { var v = h[["p05", "p50", "p95"][i]]; $("#lk-" + key).textContent = money(v); $("#lk-" + key + "-ret").textContent = pct((v / start - 1) * 100) + " vs start"; });
    [["gain", h.prob_profit_pct], ["loss", h.prob_loss_10_pct], ["dd", h.prob_drawdown_10_pct]].forEach(function (a) { $("#lk-" + a[0] + "-val").textContent = a[1].toFixed(1) + "%"; $("#lk-" + a[0] + "-bar").style.width = a[1] + "%"; });
    root.querySelectorAll("#lk-tabs [data-h]").forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.h === selected ? "true" : "false"); });
    $("#lk-body").innerHTML = D.horizons.map(function (r) {
      return '<tr data-h="' + r.code + '" class="' + (r.code === selected ? "on" : "") + '" tabindex="0" role="button" aria-label="Inspect ' + r.code + ' horizon">' +
        '<td data-l="Horizon"><span class="' + (r.code === selected ? "pill" : "") + '">' + r.code + '</span></td><td data-l="' + esc("End date " + SFX) + '"><span class="lk-nw">' + r.end_date + '</span></td><td data-l="Median">' + money(r.median) + '</td><td data-l="P05">' + money(r.p05) + '</td><td data-l="P95">' + money(r.p95) +
        '</td><td data-l="P(gain)" class="lk-up">' + r.prob_profit_pct.toFixed(1) + '%</td><td data-l="P(loss >10%)">' + r.prob_loss_10_pct.toFixed(1) + '%</td><td data-l="Band width">' + r.p10_p90_width_pct_of_start.toFixed(1) + '%</td></tr>';
    }).join("");
    root.querySelectorAll("tbody tr[data-h]").forEach(function (row) {
      row.addEventListener("click", function () { setH(row.dataset.h); });
      row.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setH(row.dataset.h); } });
    });
    $("#lk-events").innerHTML = D.events.filter(function (ev) { return ev.day <= h.business_days; }).map(function (ev) {
      return '<div class="lk-ev' + (ev.direction === "down" ? " lk-dn" : "") + '"><div class="lk-evt"><span>' + esc(fmtShort(ev.date)) + '</span><span>#' + ev.id + ' · SCENARIO</span></div><div class="lk-evn">' + esc(ev.name) + '</div>' +
        '<div class="lk-evt"><span>' + esc(ev.short) + '</span><span class="lk-evd">' + (ev.direction === "down" ? "▼ PULLBACK" : "▲ RALLY") + '</span></div></div>';
    }).join("") || '<div class="note">No scenario markers in this date range.</div>';
    drawChart(); drawHist();
  }
  function setH(code) { selected = code; update(); }

  function download(blob, name) {
    var url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }
  /* an exported SVG is read outside the page, so CSS variables are resolved to the current theme's colours first */
  function resolveVars(str) {
    var cs = getComputedStyle(document.documentElement);
    return str.replace(/var\((--[\w-]+)\)/g, function (m, n) { return cs.getPropertyValue(n).trim() || "#888"; });
  }
  function bind() {
    root.querySelectorAll("#lk-tabs [data-h]").forEach(function (b) { b.addEventListener("click", function () { setH(b.dataset.h); }); });
    $("#lk-export-json").addEventListener("click", function () { download(new Blob([JSON.stringify(D, null, 2)], { type: "application/json" }), "LEKHA_Synthetic_Forecast.json"); });
    $("#lk-export-svg").addEventListener("click", function () {
      var svg = $("#lk-chart").cloneNode(true); svg.setAttribute("xmlns", NS);
      svg.setAttribute("style", "background:" + (getComputedStyle(document.documentElement).getPropertyValue("--panel").trim() || "#fff"));
      download(new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n' + resolveVars(new XMLSerializer().serializeToString(svg))], { type: "image/svg+xml" }), "LEKHA_Forecast_" + selected + ".svg");
    });
    /* redraw at the new pixel width when the card is resized (rotation, window resize, split view) */
    var raf = 0, ro = typeof ResizeObserver === "function" ? new ResizeObserver(function () {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(function () { var w = $("#lk-chartwrap"); if (w && Math.abs(w.clientWidth - drawn.w) > 24) { drawChart(); drawHist(); } });
    }) : null;
    if (ro) ro.observe($("#lk-chartwrap"));
  }


  /* ---------- styles (tokens only, so every theme restyles the lab) ---------- */
  var css = document.createElement("style");
  css.textContent = [
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
    ".lk-locked{position:relative;border:1px dashed var(--line);border-radius:6px;overflow:hidden;min-height:210px;display:flex;align-items:center;justify-content:center;padding:22px 14px}",
    ".lk-ghost{position:absolute;inset:0;width:100%;height:100%;filter:blur(4px);opacity:.75}.lk-lock-c{position:relative;text-align:center;max-width:460px;display:flex;flex-direction:column;gap:10px;align-items:center;background:color-mix(in srgb,var(--panel) 84%,transparent);padding:16px;border-radius:8px}.lk-lock-t{font-weight:700;font-size:16px}",
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
  document.head.appendChild(css);

  /* ---------- mounting ---------- */
  function section() { return document.getElementById("proj-panel"); }
  function body() { return document.getElementById("proj-body"); }
  function tierNow() {
    if (window.PT_DEMO_MODE) return Promise.resolve("demo");
    var p = typeof window.PT_TIER_READY === "function" ? window.PT_TIER_READY() : Promise.resolve(null);
    return p.then(function (me) { return me && me.tier ? me.tier : null; }, function () { return null; });
  }
  function mountFull() {
    var b = body(); if (!b) return Promise.resolve();
    b.innerHTML = '<div class="empty">Loading projection…</div>';
    return fetch(DATA_URL, { cache: "force-cache" }).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }).then(function (j) {
      D = j; b.innerHTML = markup(); root = b.querySelector(".lk"); selected = "21D"; bind(); update();
    }).catch(function () { b.innerHTML = '<div class="empty">The projection demo could not be loaded.</div>'; });
  }
  function mountLocked() {
    var b = body(); if (!b) return;
    b.innerHTML = '<div class="lk-locked"><svg class="lk-ghost" viewBox="0 0 600 220" aria-hidden="true" preserveAspectRatio="none"><path d="M0 190 C60 180 90 170 140 160 S230 150 280 120 S380 110 430 70 S540 40 600 20 L600 220 L0 220 Z" fill="var(--chart)" fill-opacity=".18"/><path d="M0 190 C60 180 90 170 140 160 S230 150 280 120 S380 110 430 70 S540 40 600 20" fill="none" stroke="var(--chart)" stroke-width="4"/></svg>' +
      '<div class="lk-lock-c"><div class="lk-lock-t">Illustrative Projection Lab · Premium</div><p class="note">An interactive growth-scenario lab with five horizons, scenario bands, dated catalysts and an outcome silhouette. Available on the Premium plan.</p>' +
      '<button class="btn pri" type="button" id="lk-upgrade">Go Premium — ฿599/month</button><div class="set-msg" id="lk-lock-msg" role="status"></div></div></div>';
    var up = document.getElementById("lk-upgrade");
    up.onclick = function () {
      var msg = document.getElementById("lk-lock-msg"); msg.textContent = "Opening secure checkout…";
      window.PT_AUTH.fetch("/api/billing/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan: "premium" }) })
        .then(function (r) { return r.json(); }).then(function (j) { if (j && j.url) location.href = j.url; else msg.textContent = (j && j.error) || "Checkout is not available right now."; })
        .catch(function () { msg.textContent = "Checkout is not available right now."; });
    };
  }
  function apply() {
    var sec = section(); if (!sec) return Promise.resolve();
    return tierNow().then(function (tier) {
      if (tier === "demo" || tier === "premium") { sec.style.display = ""; sec.querySelector(".lk-tag").textContent = "PREMIUM"; return mountFull(); }
      if (tier === "free") { sec.style.display = ""; sec.querySelector(".lk-tag").textContent = "PREMIUM"; mountLocked(); return; }
      sec.remove(); /* Paid sees nothing; unknown tier (sign-in lookup failed) shows nothing rather than a wrong state */
    });
  }
  window.PT_PROJ = { apply: apply };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", apply); else apply();
})();
