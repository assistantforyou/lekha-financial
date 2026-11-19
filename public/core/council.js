/* Portfolio Terminal core: the Council. Builds the simulation input from YOUR holdings and the shared market data, runs the
   Monte Carlo engine (Web Worker when available), and turns each persona's numbers into plain-language reasons.
   Events are "priced in" like a brokerage or TradingView screen would show them: what analysts expect (rating mix, price
   target upside), what the media says (headline tone, AI impact labels), how far the stock has already run up, and the market mood.
   Those leanings shift the simulated size of each event's jump; the formulas are listed in the info panel of the screen. */
import { D, positions, totals, isCash, rateOf } from "./data.js";
import { hash, clamp, mean } from "./util.js";
import { PERSONAS, CouncilRun } from "./engine.js";
export { PERSONAS, HORIZONS } from "./engine.js";

const FOMC = ["2026-12-09"];   // decision days (the Fed publishes a year ahead; later dates are added as they are announced)
const dayMs = 864e5;
const iso = (d) => d.toISOString().slice(0, 10);
function tradingDaysBetween(from, to) { let n = 0; const d = new Date(from); while (d < to) { d.setUTCDate(d.getUTCDate() + 1); const w = d.getUTCDay(); if (w !== 0 && w !== 6) n++; } return n; }
function firstFriday(y, m) { const d = new Date(Date.UTC(y, m, 1)); while (d.getUTCDay() !== 5) d.setUTCDate(d.getUTCDate() + 1); return d; }
function midMonth(y, m) { const d = new Date(Date.UTC(y, m, 13)); while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1); return d; }

/* ---------- what the Street and the media lean towards, each in -1 .. +1 ---------- */
export function analystLean(tk) {
  const s = D.street[tk]; if (!s) return null;
  const parts = [];
  if (s.rating && s.rating.n >= 3) parts.push(((s.rating.sb * 2 + s.rating.b) - (s.rating.s + s.rating.ss * 2)) / (2 * s.rating.n));
  const px = (D.quotes[tk] && D.quotes[tk].px) || (D.stats[tk] && D.stats[tk].px);
  if (s.pt && s.pt.mean && px) parts.push(clamp((s.pt.mean / px - 1) / 0.3, -1, 1));
  return parts.length ? mean(parts) : null;
}
export function mediaLean(tk) {
  const parts = [], t = D.tnews[tk]; if (t && t.tone != null) parts.push(t.tone);
  const mine = D.news.filter((n) => (n.tickers || []).includes(tk));
  if (mine.length) parts.push(mean(mine.map((n) => (n.impact === "bullish" ? 1 : n.impact === "bearish" ? -1 : 0))));
  return parts.length ? clamp(mean(parts), -1, 1) : null;
}
const macroMedia = () => (D.news.length ? clamp(mean(D.news.map((n) => (n.impact === "bullish" ? 1 : n.impact === "bearish" ? -1 : 0))) * 1.4, -1, 1) : null);
const moodLean = () => (D.fgi ? clamp((D.fgi.score - 50) / 50, -1, 1) : null);
const avg = (a) => { const v = a.filter((x) => x != null); return v.length ? mean(v) : null; };

/* ---------- upcoming events with their leanings ---------- */
export function buildEvents(rows = positions(), maxDays = 130) {
  const now = new Date(iso(new Date()) + "T00:00:00Z"), end = new Date(+now + maxDays * dayMs), ev = [];
  const push = (e) => { const dt = new Date(e.date + "T00:00:00Z"); if (dt <= now || dt > end) return; ev.push({ ...e, calDays: Math.round((dt - now) / dayMs), day: Math.max(1, tradingDaysBetween(now, dt)) }); };
  const streetAvg = avg(rows.filter((r) => !r.cash).map((r) => analystLean(r.tk)));
  for (const d of FOMC) push({ id: "fomc-" + d, kind: "fomc", date: d, sigma: 0.011, parts: { analyst: streetAvg, media: macroMedia(), mood: moodLean() } });
  for (let k = 0; k < 5; k++) {
    const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + k, 1));
    push({ id: "jobs-" + k, kind: "jobs", date: iso(firstFriday(base.getUTCFullYear(), base.getUTCMonth())), sigma: 0.008, approx: true, parts: { analyst: streetAvg, media: macroMedia(), mood: moodLean() } });
    push({ id: "cpi-" + k, kind: "cpi", date: iso(midMonth(base.getUTCFullYear(), base.getUTCMonth())), sigma: 0.009, approx: true, parts: { analyst: streetAvg, media: macroMedia(), mood: moodLean() } });
  }
  for (const r of rows) {
    if (r.cash) continue; const e = D.earnings[r.tk]; if (!e) continue;
    const idio = D.risk[r.tk] ? D.risk[r.tk].idio : 0.3, st = D.stats[r.tk];
    push({ id: "earn-" + r.tk, kind: "earnings", tk: r.tk, date: e.date, sigma: clamp((3 * idio) / Math.sqrt(252), 0.04, 0.12), parts: { analyst: analystLean(r.tk), media: mediaLean(r.tk), runup: st && st.m1 != null ? st.m1 : null } });
  }
  for (const e of ev) {
    const p = e.parts; let lean;
    if (e.kind === "earnings") { const pen = p.runup != null ? -clamp(p.runup / 0.15, -1, 1) * 0.3 : 0; lean = 0.55 * (p.analyst || 0) + 0.45 * (p.media || 0) + pen; }
    else lean = 0.4 * (p.analyst || 0) + 0.35 * (p.media || 0) + 0.25 * (p.mood || 0);
    e.lean = clamp(lean, -1, 1);
    const have = [p.analyst, p.media, p.mood, p.runup].filter((x) => x != null).length; e.confidence = have >= 3 ? "good" : have === 2 ? "ok" : "low";
  }
  return ev.sort((a, b) => a.calDays - b.calDays);
}

/* ---------- engine input from your holdings ---------- */
export function buildInput(paths = 10000) {
  const rows = positions(), tot = totals(rows), inv = rows.filter((r) => !r.cash).sort((a, b) => b.valueUsd - a.valueUsd).slice(0, 25);
  if (!inv.length || !(tot.value > 0)) return null;
  const events = buildEvents(rows);
  const assets = inv.map((r) => {
    const rk = D.risk[r.tk] || {}, st = D.stats[r.tk] || {}, s = D.street[r.tk], px = r.px, v = D.val[r.tk];
    return { tk: r.tk, w0: r.valueUsd / tot.value, beta: rk.beta != null ? rk.beta : 1, vol: rk.vol != null ? rk.vol : 0.3, idio: rk.idio != null ? rk.idio : 0.25, upside: s && s.pt && s.pt.mean && px ? s.pt.mean / px - 1 : null, mos: v && px ? v.base / px - 1 : null, mom: rk.mom != null ? rk.mom : st.y1 != null ? st.y1 : null, dd: st.from52 != null ? st.from52 : 0, m1: st.m1 != null ? st.m1 : 0, tone: mediaLean(r.tk) || 0 };
  });
  const sumW = assets.reduce((s, a) => s + a.w0, 0), cash0 = Math.max(0, 1 - sumW);
  const ten = D.macro && D.macro.ten ? D.macro.ten.v / 100 : 0.04;
  const sig = inv.map((r) => r.tk + r.qty).sort().join(",") + iso(new Date());
  return { seed: hash(sig), paths, start: tot.value, assets, cash0, events, market: { vol: clamp(D.benchRisk ? D.benchRisk.vol : 0.16, 0.12, 0.35), rf: clamp(ten, 0.005, 0.09), erp: 0.05, mood: D.fgi ? D.fgi.score : null, vix: D.vix ? D.vix.v : null } };
}

export function runCouncil(paths, onProgress) {
  const inp = buildInput(paths);
  if (!inp) return Promise.reject(new Error("no_holdings"));
  const main = () => new Promise((res) => { const run = new CouncilRun(inp), t0 = performance.now(); const loop = () => { const done = run.step(400); onProgress && onProgress(run.done / run.paths); if (done) { const r = run.result(); r.ms = performance.now() - t0; res({ result: r, input: inp }); } else setTimeout(loop, 0); }; loop(); });
  return new Promise((res, rej) => {
    let w; try { w = new Worker("/core/sim.worker.js", { type: "module" }); } catch (e) { return main().then(res, rej); }
    let settled = false;
    w.onmessage = (e) => { if (e.data.progress != null) onProgress && onProgress(e.data.progress); if (e.data.result) { settled = true; w.terminate(); res({ result: e.data.result, input: inp }); } };
    w.onerror = () => { if (!settled) { settled = true; w.terminate(); main().then(res, rej); } };
    w.postMessage(inp);
  });
}

/* ---------- plain-language reasons (each becomes a translated sentence in the UI) ---------- */
export function reasons(result, input, id, hz) {
  const P = result.personas[id], Y = P.hz[hz], you = result.personas.you.hz[hz], out = [];
  const ups = P.tilts.filter((x) => x.d >= 1).slice(0, 2), downs = P.tilts.filter((x) => x.d <= -1).slice(0, 2);
  if (id !== "you") {
    if (ups.length || downs.length) out.push({ k: "tilts", add: ups.map((x) => `${x.tk} +${x.d.toFixed(0)}`).join(", "), trim: downs.map((x) => `${x.tk} ${x.d.toFixed(0)}`).join(", "), hasAdd: ups.length > 0, hasTrim: downs.length > 0 });
    else out.push({ k: "tiltsNone" });
  }
  out.push({ k: "cash", pct: (P.cash * 100).toFixed(0) });
  const pos = P.drivers.filter((d) => d.contrib > 0), sumPos = pos.reduce((s, d) => s + d.contrib, 0);
  if (pos.length && sumPos > 0) out.push({ k: "driver", tk: pos[0].tk, pct: Math.round((pos[0].contrib / sumPos) * 100) });
  const rk = [...P.drivers].sort((a, b) => b.riskShare - a.riskShare)[0]; if (rk && rk.riskShare > 0.2) out.push({ k: "riskDriver", tk: rk.tk, pct: Math.round(rk.riskShare * 100) });
  const ev = [...input.events].sort((a, b) => Math.abs(b.lean * b.sigma) - Math.abs(a.lean * a.sigma))[0]; if (ev) out.push({ k: "event", ev });
  if (id !== "you") out.push({ k: "vsYou", d: (Y.p50 - you.p50) * 100 });
  out.push({ k: "bad", p5: Y.p5 * 100, dd: Y.ddMed * 100 });
  return out;
}
export const summaryFor = (result, input, id, hz) => {
  const P = result.personas[id], Y = P.hz[hz], you = result.personas.you.hz[hz];
  return { persona: id, horizon: hz, summary: { p50: Y.p50 * 100, p5: Y.p5 * 100, p95: Y.p95 * 100, pGain: Y.pGain * 100, pLoss10: Y.pLoss10 * 100, maxDD: Y.ddMed * 100, vol: P.vol * 100, cash: P.cash * 100, vsYou: (Y.p50 - you.p50) * 100, tilts: P.tilts.filter((x) => Math.abs(x.d) >= 1).slice(0, 5).map((x) => ({ tk: x.tk, d: +x.d.toFixed(1) })), events: input.events.slice(0, 4).map((e) => ({ k: e.kind, tk: e.tk || null, lean: +e.lean.toFixed(2), days: e.calDays })) } };
};
