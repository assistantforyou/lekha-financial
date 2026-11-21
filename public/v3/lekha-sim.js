/* LEKHA V3 Intelligent Simulation ("LEKHA 1 BILLION SIMULATION ENGINE" is the product name).
   Real Monte Carlo from core/engine.js via sim-runner.js. Each run is capped at 1,000,000 paths and the UI always shows the
   number of paths actually completed. Inputs come from the classic engine state (PT_APP.S): no second data fetch. */
import { run, MAX_PATHS, MODEL_VERSION, DEFAULT_HORIZONS } from "./sim-runner.js";
import { FOMC, CPI, JOBS, nextReport } from "../core/calendar.js";

const SPX = "INDEXSP:.INX", DAY = 864e5;
const PRESETS = [[10000, "10K"], [100000, "100K"], [1000000, "1M"]];
const HZ = DEFAULT_HORIZONS.map(([c]) => c);
const HZ_LABEL = { "21D": "21 days", "1M": "1 month", "3M": "3 months", "6M": "6 months", "1Y": "1 year" };
const LO = -3, W = 5 / 2500, RB = 2502; // must match sim-aggregate.js histogram layout
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pc = (x, d = 1, sign = true) => x == null || !isFinite(x) ? "–" : (sign && x > 0 ? "+" : x < 0 ? "−" : "") + Math.abs(x * 100).toFixed(d) + "%";
const iso = (d) => new Date(d).toISOString().slice(0, 10);
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
function tradingDays(from, to) { let n = 0; for (let t = from + DAY; t <= to; t += DAY) { const g = new Date(t).getUTCDay(); if (g && g < 6) n++; } return n; }

/* ---------- engine input from classic state ---------- */
function rets(series, since) {
  const m = new Map(); let prev = null;
  for (const [t, c] of series || []) { const d = Math.floor(t / DAY); if (prev && c > 0 && prev[1] > 0 && t >= since) m.set(d, Math.log(c / prev[1])); prev = [t, c]; }
  return m;
}
function riskOf(sym, mkt, S) {
  const h = S.hist && S.hist[sym] && S.hist[sym].D; if (!h || h.length < 60) return null;
  const since = h[h.length - 1][0] - 370 * DAY, a = rets(h, since), x = [], y = [];
  for (const [d, r] of a) if (mkt.has(d)) { x.push(mkt.get(d)); y.push(r); }
  if (y.length < 40) return null;
  const mx = x.reduce((s, v) => s + v, 0) / x.length, my = y.reduce((s, v) => s + v, 0) / y.length;
  let cov = 0, vx = 0, vy = 0; for (let i = 0; i < y.length; i++) { cov += (x[i] - mx) * (y[i] - my); vx += (x[i] - mx) ** 2; vy += (y[i] - my) ** 2; }
  const beta = vx ? cov / vx : 1, vol = Math.sqrt(vy / (y.length - 1) * 252), mvol = Math.sqrt(vx / (x.length - 1) * 252);
  const first = h.find((p) => p[0] >= since), y1 = first ? h[h.length - 1][1] / first[1] - 1 : null;
  return { beta: clamp(beta, -0.5, 3), vol: clamp(vol, 0.05, 1.5), idio: clamp(Math.sqrt(Math.max(vol * vol - beta * beta * mvol * mvol, 0.0025)), 0.05, 1.2), y1 };
}
/* one-year beta / volatility / stock-specific volatility vs the S&P 500, from the page's price history */
export function tickerRisk(sym) {
  const S = window.PT_APP && PT_APP.S, spx = S && S.hist && S.hist[SPX] && S.hist[SPX].D; if (!spx) return null;
  return riskOf(sym, rets(spx, spx[spx.length - 1][0] - 370 * DAY), S);
}
export function buildSimInput() {
  const A = window.PT_APP, S = A && A.S; if (!S || !A.lekha) return { err: "The portfolio engine is still loading." };
  const { list, total } = A.lekha.aggregate();
  const inv = list.filter((a) => a.ticker !== "CASH" && a.value > 0).sort((a, b) => b.value - a.value).slice(0, 25);
  if (!inv.length || !(total > 0)) return { err: "Add holdings in My Portfolio to run a projection." };
  const spx = S.hist && S.hist[SPX] && S.hist[SPX].D; if (!spx) return { err: "Waiting for price history…" };
  const mkt = rets(spx, spx[spx.length - 1][0] - 370 * DAY), mv = [...mkt.values()], mm = mv.reduce((s, v) => s + v, 0) / mv.length;
  const mvol = Math.sqrt(mv.reduce((s, v) => s + (v - mm) ** 2, 0) / (mv.length - 1) * 252);
  const vres = S.vres && S.vres.res, missing = [];
  const assets = inv.map((a) => {
    const r = riskOf(a.symbol || a.ticker, mkt, S); if (!r) missing.push(a.ticker);
    const v = vres && vres[a.ticker];
    return { tk: a.ticker, w0: a.value / total, beta: r ? r.beta : 1, vol: r ? r.vol : 0.3, idio: r ? r.idio : 0.25, upside: null, mos: v && isFinite(v.up) ? v.up : null, mom: r && r.y1 != null ? r.y1 : a.ytd ?? null, dd: a.from52 ?? 0, m1: a.m1 ?? 0, tone: 0 };
  });
  const cash0 = Math.max(0, 1 - assets.reduce((s, a) => s + a.w0, 0));
  const now = Date.now(), today = Date.parse(iso(now) + "T00:00:00Z"), end = today + 370 * DAY, events = [];
  const push = (e) => { const t = Date.parse(e.date + "T00:00:00Z"); if (t <= today || t > end) return; const day = tradingDays(today, t); if (day >= 1 && day <= 252) events.push({ ...e, day, calDays: Math.round((t - today) / DAY), lean: 0 }); };
  FOMC.forEach((d) => push({ id: "fomc-" + d, kind: "fomc", label: "FOMC decision", date: d, sigma: 0.011, status: "scheduled" }));
  CPI.forEach((d) => push({ id: "cpi-" + d, kind: "cpi", label: "CPI release", date: d, sigma: 0.009, status: "scheduled" }));
  JOBS.forEach((d) => push({ id: "jobs-" + d, kind: "jobs", label: "Jobs report", date: d, sigma: 0.008, status: "scheduled" }));
  assets.forEach((a) => { const d = nextReport(a.tk, iso(today)); if (d) push({ id: "earn-" + a.tk, kind: "earnings", tk: a.tk, label: a.tk + " earnings", date: d, sigma: clamp(3 * a.idio / Math.sqrt(252), 0.04, 0.12), status: "estimated" }); });
  events.sort((a, b) => a.day - b.day);
  const rf = clamp((S.tnx != null ? S.tnx : 4) / 100, 0.005, 0.09), mood = S.fgi && S.fgi.fgi ? S.fgi.fgi.score : null;
  const seed = hash(inv.map((a) => a.ticker + ":" + Math.round(a.shares * 1000)).sort().join(",") + iso(now));
  return { input: { seed, start: total, assets, cash0, events, market: { vol: clamp(mvol, 0.12, 0.35), rf, erp: 0.05, mood, vix: null } },
    meta: { start: total, rf, rfLive: S.tnx != null, mood, missing, asOf: iso(spx[spx.length - 1][0]), holdings: inv.length } };
}

/* ---------- rendering ---------- */
let host, st = { hz: "1Y", paths: 100000, job: null, res: null, prog: null, meta: null, input: null, err: null, auto: false };
const money = (usd) => { const A = window.PT_APP; return A && A.lekha ? A.lekha.money(usd, 0) : "$" + Math.round(usd).toLocaleString("en-US"); };
const demo = () => !!window.PT_DEMO_MODE;

function shell() {
  host.innerHTML = `<section class="panel sim">
  <div class="sim-head"><div><p class="sim-eyebrow">LEKHA 1 BILLION SIMULATION ENGINE</p><h2 class="sim-title">LEKHA INTELLIGENT SIMULATION</h2>
  <p class="sim-sub">Probability-driven portfolio projections, scenario analysis, and forward-looking risk intelligence.</p></div>
  <div class="sim-tags" id="sim-tags"></div></div>
  <div class="sim-ctrls"><div class="seg" id="sim-hz" role="group" aria-label="Projection horizon">${HZ.map((h) => `<button data-h="${h}">${HZ_LABEL[h]}</button>`).join("")}</div>
  <div class="seg" id="sim-n" role="group" aria-label="Paths per run">${PRESETS.map(([n, l]) => `<button data-n="${n}">${l} paths</button>`).join("")}</div>
  <button class="btn pri" id="sim-go" type="button">Run simulation</button><button class="btn" id="sim-stop" type="button" hidden>Stop</button></div>
  <div class="sim-prog" id="sim-prog" hidden><i></i><span></span></div>
  <div id="sim-out"><div class="empty">Preparing your portfolio inputs…</div></div></section>`;
  host.querySelector("#sim-hz").onclick = (e) => { const b = e.target.closest("[data-h]"); if (b) { st.hz = b.dataset.h; paint(); } };
  host.querySelector("#sim-n").onclick = (e) => { const b = e.target.closest("[data-n]"); if (b && !st.job) { st.paths = +b.dataset.n; seg(); } };
  host.querySelector("#sim-go").onclick = start;
  host.querySelector("#sim-stop").onclick = () => st.job && st.job.stop();
  seg();
}
function seg() {
  host.querySelectorAll("#sim-hz button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.h === st.hz));
  host.querySelectorAll("#sim-n button").forEach((b) => { b.setAttribute("aria-pressed", +b.dataset.n === st.paths); b.disabled = !!st.job; });
  host.querySelector("#sim-tags").innerHTML =  `<span class="pill">Model ${esc(MODEL_VERSION)}</span>`;
}
function start() {
  if (st.job) return;
  const b = buildSimInput(); if (b.err) { st.err = b.err; paint(); return; }
  st.input = b.input; st.meta = b.meta; st.err = null; st.prog = { completedPaths: 0, simulatedPaths: 0, requestedPaths: st.paths, fraction: 0 };
  const seed = b.input.seed;
  try { st.job = run({ input: b.input, paths: Math.min(st.paths, MAX_PATHS), seed, onProgress: (p) => { st.prog = p; progress(); } }); }
  catch (e) { st.err = "The simulation could not start: " + e.message; st.job = null; paint(); return; }
  seg(); progress(); host.querySelector("#sim-go").hidden = true; host.querySelector("#sim-stop").hidden = false;
  st.job.promise.then((r) => { st.res = { ...r, at: new Date().toISOString() }; window.LEKHA_SIM_LAST = simSummary(); })
    .catch((e) => { st.err = "Simulation failed: " + (e && e.message || e); })
    .finally(() => { st.job = null; seg(); host.querySelector("#sim-go").hidden = false; host.querySelector("#sim-stop").hidden = true; host.querySelector("#sim-prog").hidden = true; paint(); });
}
function progress() {
  const el = host.querySelector("#sim-prog"), p = st.prog; if (!el || !p) return; el.hidden = false;
  el.querySelector("i").style.width = (100 * clamp(p.fraction || 0, 0, 1)).toFixed(1) + "%";
  el.querySelector("span").textContent = `${(p.simulatedPaths || 0).toLocaleString("en-US")} of ${p.requestedPaths.toLocaleString("en-US")} paths simulated · ${p.workers || 0} workers`;
}
/* compact summary other modules (Council evidence) can use — always carries the true completed count */
export function simSummary() {
  if (!st.res) return null; const h = st.res.summary.horizons["1Y"] || {};
  return { engine: "LEKHA 1 Billion Simulation Engine", completedPaths: st.res.completedPaths, requestedPaths: st.res.requestedPaths, stopped: st.res.stopped, modelVersion: st.res.modelVersion, at: st.res.at,
    horizon: "1Y", p5: h.p5, p50: h.p50, p95: h.p95, mean: h.mean, pGain: h.pGain, pLoss10: h.pLoss10, cvar5: h.cvar5, ddMedian: h.dd && h.dd.median, dd95: h.dd && h.dd.p95 };
}

function fanSvg(sum, hz, startV, events) {
  const days = sum.horizons[hz].days, rows = sum.fan.filter((r) => r.day <= days); if (rows.length < 2) return "";
  const Wd = 900, H = 300, L = 70, R = 70, T = 16, B = 30, v = (r) => startV * (1 + r);
  const lo = Math.min(...rows.map((r) => v(r.p5))), hi = Math.max(...rows.map((r) => v(r.p95))), pad = (hi - lo) * 0.06;
  const y0 = lo - pad, y1 = hi + pad, X = (d) => L + (d / days) * (Wd - L - R), Y = (val) => T + (1 - (val - y0) / (y1 - y0)) * (H - T - B);
  const band = (a, b) => rows.map((r) => `${X(r.day).toFixed(1)},${Y(v(r[a])).toFixed(1)}`).join(" ") + " " + rows.slice().reverse().map((r) => `${X(r.day).toFixed(1)},${Y(v(r[b])).toFixed(1)}`).join(" ");
  const line = (k) => rows.map((r, i) => `${i ? "L" : "M"}${X(r.day).toFixed(1)},${Y(v(r[k])).toFixed(1)}`).join("");
  const ticks = []; for (let i = 0; i <= 4; i++) { const val = y0 + (i / 4) * (y1 - y0); ticks.push(`<line x1="${L}" x2="${Wd - R}" y1="${Y(val)}" y2="${Y(val)}" class="gl"/><text x="${L - 8}" y="${Y(val) + 4}" text-anchor="end" class="ax">${esc(money(val))}</text>`); }
  const ev = events.filter((e) => e.day <= days).map((e) => `<g class="sim-ev ${e.status}"><line x1="${X(e.day)}" x2="${X(e.day)}" y1="${T}" y2="${H - B}"/><title>${esc(e.label)} · ${esc(e.date)} · ${e.status === "scheduled" ? "scheduled (official calendar)" : "estimated date (usual reporting slot)"}</title></g>`).join("");
  const last = rows[rows.length - 1], lab = (k, t) => `<text x="${Wd - R + 6}" y="${Y(v(last[k])) + 4}" class="ax lab-${k}">${t}</text>`;
  return `<svg viewBox="0 0 ${Wd} ${H}" class="sim-fan" role="img" aria-label="Projected portfolio value, percentile bands">${ticks.join("")}${ev}
    <polygon points="${band("p95", "p5")}" class="b90"/><polygon points="${band("p75", "p25")}" class="b50"/>
    <line x1="${L}" x2="${Wd - R}" y1="${Y(startV)}" y2="${Y(startV)}" class="now"/>
    <path d="${line("p90")}" class="bull"/><path d="${line("p10")}" class="bear"/><path d="${line("p50")}" class="med"/>
    ${lab("p90", "Bull P90")}${lab("p50", "Base P50")}${lab("p10", "Bear P10")}
    <text x="${L}" y="${H - 8}" class="ax">Today</text><text x="${Wd - R}" y="${H - 8}" text-anchor="end" class="ax">+${days} trading days</text>
    <g class="hov" aria-hidden="true"><line class="hov-cross" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/><circle class="hov-dot" r="3.5" cx="0" cy="0" visibility="hidden"/><circle class="hov-dot" r="3" cx="0" cy="0" opacity=".55" visibility="hidden"/><rect class="hov-hit" x="${L}" y="${T}" width="${Wd - L - R}" height="${H - T - B}"/></g></svg>`;
}

/* Hover on the fan chart: crosshair + readout of the percentile band and any catalyst on that day. */
function attachFanHover(svg, res, hz, startV, events) {
  const days = res.horizons[hz].days, rows = res.fan.filter((r) => r.day <= days); if (!svg || rows.length < 2) return;
  const Wd = 900, H = 300, L = 70, R = 70, T = 16, B = 30, v = (r) => startV * (1 + r);
  const lo = Math.min(...rows.map((r) => v(r.p5))), hi = Math.max(...rows.map((r) => v(r.p95))), pad = (hi - lo) * 0.06;
  const y0 = lo - pad, y1 = hi + pad, X = (d) => L + (d / days) * (Wd - L - R), Y = (val) => T + (1 - (val - y0) / (y1 - y0)) * (H - T - B);
  const chart = svg.closest(".chart"), cross = svg.querySelector(".hov-cross"), dot = svg.querySelectorAll(".hov-dot");
  if (!chart || !cross) return;
  const tip = document.createElement("div"); tip.className = "sim-tip"; tip.hidden = true; chart.appendChild(tip);
  const day2date = (d) => { const t = new Date(); t.setDate(t.getDate() + Math.round((d * 7) / 5)); return t.toISOString().slice(0, 10); };
  const pctIn = (x) => (x >= 0 ? "+" : "") + (x * 100).toFixed(1) + "%";
  const move = (e) => {
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const m = svg.getScreenCTM(); if (!m) return; const p = pt.matrixTransform(m.inverse());
    if (p.x < L || p.x > Wd - R) { tip.hidden = true; cross.setAttribute("visibility", "hidden"); dot.forEach((n) => n.setAttribute("visibility", "hidden")); return; }
    const day = Math.round(((p.x - L) / (Wd - L - R)) * days), row = rows.reduce((a, b) => (Math.abs(b.day - day) < Math.abs(a.day - day) ? b : a), rows[0]);
    const val = v(row.p50), cx = X(row.day), cy = Y(val);
    cross.setAttribute("x1", cx); cross.setAttribute("x2", cx); cross.setAttribute("visibility", "visible");
    dot[0].setAttribute("cx", cx); dot[0].setAttribute("cy", cy); dot[0].setAttribute("visibility", "visible");
    const near = (events || []).filter((ev) => Math.abs(ev.day - row.day) <= 1).slice(0, 3);
    const b90 = v(row.p95) - v(row.p5), b50 = v(row.p75) - v(row.p25);
    tip.innerHTML = `<div class="tt-d">Day ${row.day} · ${day2date(row.day)}</div>` +
      `<div class="tt-r"><span>Median</span><b>${esc(money(val))} <em>${pctIn(row.p50)}</em></b></div>` +
      `<div class="tt-r"><span>P25–P75</span><span>${esc(money(v(row.p25)))} – ${esc(money(v(row.p75)))}</span></div>` +
      `<div class="tt-r"><span>P5–P95</span><span>${esc(money(v(row.p5)))} – ${esc(money(v(row.p95)))}</span></div>` +
      `<div class="tt-r"><span>Band width</span><span>${esc(money(b50))} / ${esc(money(b90))}</span></div>` +
      (near.length ? near.map((ev) => `<div class="tt-e"><b>${esc(ev.label)}</b><em>${esc(ev.date)} · ${ev.status === "scheduled" ? "scheduled (official calendar)" : "estimated earnings date"}</em></div>`).join("") : "");
    tip.hidden = false;
    const box = chart.getBoundingClientRect(), s = box.width / Wd;
    let left = cx * s + 14; if (left + 230 > box.width) left = Math.max(4, cx * s - 224);
    tip.style.left = left.toFixed(0) + "px"; tip.style.top = Math.max(4, cy * s - 8).toFixed(0) + "px";
  };
  svg.addEventListener("pointermove", move);
  svg.addEventListener("pointerleave", () => { tip.hidden = true; cross.setAttribute("visibility", "hidden"); dot.forEach((n) => n.setAttribute("visibility", "hidden")); });
}
function histSvg(agg, hIdx, o) {
  const off = hIdx * RB, lo = Math.log(1 + o.p5 * 1.4 - 0.02 * (o.p5 < 0)), hi = Math.log(1 + o.p95 * 1.2 + 0.02), N = 48, bk = new Array(N).fill(0);
  const a = Math.max(1, Math.floor((Math.min(lo, Math.log(1 + o.p5) - 0.05) - LO) / W)), b = Math.min(2500, Math.ceil((Math.max(hi, Math.log(1 + o.p95) + 0.05) - LO) / W));
  for (let i = a; i <= b; i++) { const k = Math.min(N - 1, Math.floor(((i - a) / (b - a + 1)) * N)); bk[k] += agg.ret[off + i]; }
  const mx = Math.max(...bk) || 1, Wd = 900, H = 120, bw = Wd / N;
  const ret = (k) => Math.exp(LO + (a + ((k + 0.5) / N) * (b - a + 1)) * W) - 1;
  return `<svg viewBox="0 0 ${Wd} ${H + 18}" class="sim-hist" role="img" aria-label="Distribution of ${o.days}-day returns">${bk.map((c, k) => { const r = ret(k), h = (c / mx) * H; return `<rect x="${(k * bw + 1).toFixed(1)}" y="${(H - h).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${h.toFixed(1)}" class="${r < 0 ? "neg" : "pos"}"><title>${pc(r)} · ${(c / o.n * 100).toFixed(2)}% of paths</title></rect>`; }).join("")}
    <text x="0" y="${H + 14}" class="ax">${pc(ret(0), 0)}</text><text x="${Wd}" y="${H + 14}" text-anchor="end" class="ax">${pc(ret(N - 1), 0)}</text></svg>`;
}
function paint() {
  seg(); const out = host.querySelector("#sim-out"); if (!out) return;
  if (st.err && !st.res) { out.innerHTML = `<div class="empty">${esc(st.err)}</div>`; return; }
  if (!st.res) { out.innerHTML = `<div class="empty">Choose a horizon and path count, then run. Everything is computed in your browser from your holdings, their price history and the live 10-year yield.</div>`; return; }
  if (!st.res.completedPaths) {
    out.innerHTML = '<div class="empty">Simulation stopped. 0 paths completed. Run again to calculate results.</div>';
    return;
  }
  const r = st.res, s = r.summary, o = s.horizons[st.hz], sv = st.meta.start, hIdx = DEFAULT_HORIZONS.findIndex(([c]) => c === st.hz);
  const kpi = (l, v, sub, cls = "") => `<div class="kpi"><span class="lbl">${l}</span><span class="val ${cls}">${v}</span><span class="sub">${sub}</span></div>`;
  const tone = (x) => (x > 0 ? "up" : x < 0 ? "down" : "");
  const evs = st.input.events.filter((e) => e.day <= o.days);
  out.innerHTML = `${st.err ? `<p class="note warn">${esc(st.err)}</p>` : ""}
  <div class="kpis sim-kpis">${kpi("Current value", esc(money(sv)), "start of every path")}${kpi("Median projection", esc(money(sv * (1 + o.p50))), pc(o.p50) + " · " + HZ_LABEL[st.hz], tone(o.p50))}
    ${kpi("Bull case (P90)", esc(money(sv * (1 + o.p90))), pc(o.p90), "up")}${kpi("Bear case (P10)", esc(money(sv * (1 + o.p10))), pc(o.p10), "down")}${kpi("Probability of gain", (o.pGain * 100).toFixed(1) + "%", "loss: " + (o.pLoss * 100).toFixed(1) + "%")}</div>
  <div class="chart">${fanSvg(s, st.hz, sv, st.input.events)}</div>
  <div class="legend"><span><i class="sw b90"></i>P5–P95</span><span><i class="sw b50"></i>P25–P75</span><span><i class="sw med"></i>Median</span><span><i class="sw ev scheduled"></i>Scheduled event</span><span><i class="sw ev estimated"></i>Estimated earnings date</span></div>
  <div class="sim-grid"><div><h3>Distribution at ${HZ_LABEL[st.hz]}</h3>${histSvg(r.aggregate, hIdx, o)}</div>
    <div><h3>Risk intelligence</h3><table class="kv"><tbody>
    <tr><td class="l">Expected return (mean)</td><td class="${tone(o.mean)}">${pc(o.mean)}</td></tr><tr><td class="l">Median return</td><td class="${tone(o.p50)}">${pc(o.p50)}</td></tr>
    <tr><td class="l">P5 / P95</td><td>${pc(o.p5)} / ${pc(o.p95)}</td></tr><tr><td class="l">Probability of a loss over 10%</td><td>${(o.pLoss10 * 100).toFixed(1)}%</td></tr>
    <tr><td class="l">Value at risk (5%)</td><td class="down">${pc(-o.var5)} · ${esc(money(sv * o.var5))}</td></tr><tr><td class="l">Expected shortfall / CVaR (5%)</td><td class="down">${pc(-o.cvar5)} · ${esc(money(sv * o.cvar5))}</td></tr>
    <tr><td class="l">Max drawdown, median path</td><td>${pc(-o.dd.median)}</td></tr><tr><td class="l">Max drawdown, worst 5% of paths</td><td>${pc(-o.dd.p95)}</td></tr><tr><td class="l">Probability of a 10%+ drawdown</td><td>${(o.dd.pOver10 * 100).toFixed(1)}%</td></tr></tbody></table></div></div>
  <h3>All horizons</h3><div class="tablebox"><table class="kv"><thead><tr><th class="l">Horizon</th><th>Bear P10</th><th>Median</th><th>Bull P90</th><th>Mean</th><th>P(gain)</th><th>CVaR 5%</th><th>Median max DD</th></tr></thead><tbody>
    ${HZ.map((h) => { const x = s.horizons[h]; return `<tr${h === st.hz ? ' class="sel"' : ""}><td class="l">${HZ_LABEL[h]}</td><td class="down">${pc(x.p10)}</td><td class="${tone(x.p50)}">${pc(x.p50)}</td><td class="up">${pc(x.p90)}</td><td>${pc(x.mean)}</td><td>${(x.pGain * 100).toFixed(1)}%</td><td class="down">${pc(-x.cvar5)}</td><td>${pc(-x.dd.median)}</td></tr>`; }).join("")}</tbody></table></div>
  <h3>Catalysts inside this horizon</h3>${evs.length ? `<div class="sim-cats">${evs.slice(0, 18).map((e) => `<div class="sim-cat ${e.status}"><b>${esc(e.label)}</b><span>${esc(e.date)} · day ${e.day}</span><span class="tag">${e.status === "scheduled" ? "Scheduled · official calendar" : "Estimated date · usual reporting slot"}</span></div>`).join("")}</div>` : `<p class="note">No scheduled catalysts in this window.</p>`}
  <p class="note">Event shocks are a <b>model assumption</b>: each event adds a one-day jump with the volatility shown in its tooltip and no directional lean. They are not forecasts of how the market will react.</p>
  <details class="method"><summary>Execution details &amp; methodology</summary><ul>
    <li><b>Paths completed:</b> ${r.completedPaths.toLocaleString("en-US")} of ${r.requestedPaths.toLocaleString("en-US")} requested${r.stopped ? " (stopped early; every number above uses only the completed paths)" : ""}. Engine capacity per run: ${MAX_PATHS.toLocaleString("en-US")} paths.</li>
    <li><b>Run:</b> ${r.workers} parallel workers · ${(r.ms / 1000).toFixed(1)} s · seed ${r.seed} (same holdings, day and seed reproduce these numbers) · model ${esc(r.modelVersion)} · computed ${esc(r.at.slice(0, 19).replace("T", " "))} UTC.</li>
    <li><b>Data:</b> ${st.meta.holdings} holdings, prices to ${esc(st.meta.asOf)}; risk-free rate ${(st.meta.rf * 100).toFixed(2)}% ${st.meta.rfLive ? "(live US 10-year)" : "(fallback assumption, not live)"}; equity risk premium 5% (assumption)${st.meta.missing.length ? `; default risk used for ${esc(st.meta.missing.join(", "))} (not enough history)` : ""}.</li>
    <li><b>Model:</b> daily returns = expected return + beta × market shock + stock-specific noise; 15% of paths are a high-volatility regime; beta and volatility estimated from one year of daily prices against the S&amp;P 500; expected return = risk-free + beta × ERP. Weights are held as today (no rebalancing); cash earns the risk-free rate.</li>
    <li><b>Statistics:</b> streamed into fixed-width histograms (≈0.2% return resolution) so a million paths never sit in memory; percentiles interpolate within a bin; mean, CVaR and probabilities are exact over the completed paths.</li>
    <li>A simulation describes a range of outcomes under these assumptions. It is not a prediction or investment advice.</li></ul>
    <div class="row"><button class="btn" id="sim-json" type="button">Export JSON</button><button class="btn" id="sim-svg" type="button">Export chart SVG</button></div></details>`;
  try { attachFanHover(out.querySelector(".sim-fan"), s, st.hz, sv, st.input.events); } catch (e) { console.warn("[sim] hover failed", e && e.message); }
  out.querySelector("#sim-json").onclick = () => dl("lekha-simulation.json", "application/json", JSON.stringify({ ...simSummary(), horizons: s.horizons, fan: s.fan, events: st.input.events, assumptions: st.meta }, null, 2));
  out.querySelector("#sim-svg").onclick = () => { const svg = out.querySelector(".sim-fan"); if (svg) dl("lekha-projection.svg", "image/svg+xml", svg.outerHTML.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"')); };
}
function dl(name, type, text) { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }

export function mount(el) {
  host = el; shell(); paint();
  /* first visit: one 100K run once the portfolio is priced (local computation only, no network) */
  const tryAuto = () => { if (st.auto || st.job || st.res) return; const r = window.LEKHA_SHELL && LEKHA_SHELL.route(); if (!r || r.t !== "simulation") return;
    const b = buildSimInput(); if (b.err) { st.err = b.err; paint(); return setTimeout(tryAuto, 1500); } st.auto = true; start(); };
  if (window.LEKHA_SHELL) LEKHA_SHELL.onRoute((r) => { if (r.t === "simulation") tryAuto(); });
  tryAuto();
}
