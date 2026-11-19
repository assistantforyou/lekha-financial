/* Portfolio Terminal core: the "Council" Monte Carlo engine. Pure computation, no DOM, runs in a Web Worker (or the page).
   What it does, exactly:
     * simulates N independent futures of the stock market for 252 trading days (market shock + each holding's own noise,
       with calm and stormy regimes, plus jumps on dated events: Fed days, jobs, inflation, company earnings);
     * runs nine investor "personas" through the SAME futures (common random numbers), each following its own rules for
       how to hold, trim, add and keep cash. Differences between personas are therefore caused by their rules, not by luck;
     * reports real percentiles of what happened in those futures. Nothing is hard-coded or art-directed.
   The number of simulated futures reported by the UI is the number actually run. It is a scenario model, not a forecast. */
export const PERSONAS = ["you", "compounder", "growth", "momentum", "macro", "income", "contrarian", "quant", "fomo"];
export const HORIZONS = [["21D", 21], ["3M", 63], ["6M", 126], ["1Y", 252]];
const DAYS = 252, CHECK = 5, KAPPA = 0.3, COST = 0.001;
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const sd = (a) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const z = (arr) => { const v = arr.filter(Number.isFinite), m = mean(v), s = sd(v) || 1; return arr.map((x) => (Number.isFinite(x) ? (x - m) / s : 0)); };
function mulberry(a) { return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/* how much each persona leans on its scoring rule (k), how often it rebalances, and which cash policy it follows */
const RULES = {
  you: { k: 0, every: 0 }, compounder: { k: 0.5, every: 126 }, growth: { k: 0.55, every: 42 }, momentum: { k: 0.6, every: 21 },
  macro: { k: 0.5, every: 42 }, income: { k: 0.6, every: 63 }, contrarian: { k: 0.55, every: 42 }, quant: { k: 0, every: 21 }, fomo: { k: 0.8, every: 21 },
};
const capWeights = (w, invest, cap = 0.3) => { let out = w.slice(), sum = out.reduce((s, x) => s + x, 0) || 1; out = out.map((x) => (x / sum) * invest); for (let it = 0; it < 6; it++) { let over = 0, free = 0; out.forEach((x) => { if (x > cap) over += x - cap; else free += x; }); if (over < 1e-9) break; out = out.map((x) => (x > cap ? cap : x + (free ? (x / free) * over : 0))); } return out; };

/* everything that does not need random numbers: target weights, cash, analytic expectations, "why" ingredients */
export function plan(inp) {
  const A = inp.assets, N = A.length, rf = inp.market.rf, erp = inp.market.erp;
  const mu = A.map((a) => rf + a.beta * erp + clamp(a.upside == null ? 0 : a.upside, -0.4, 0.6) * 0.25 + (a.tone || 0) * 0.02);
  const val = A.map((a) => (a.mos != null ? a.mos : a.upside));
  const Z = { vol: z(A.map((a) => a.vol)), beta: z(A.map((a) => a.beta)), mom: z(A.map((a) => (a.mom != null ? a.mom : -a.dd))), m1: z(A.map((a) => a.m1)), dd: z(A.map((a) => a.dd)), val: z(val), tone: z(A.map((a) => a.tone || 0)) };
  const mood = inp.market.mood == null ? 0.3 : clamp((60 - inp.market.mood) / 60, 0, 1), vixr = inp.market.vix == null ? 0.3 : clamp((inp.market.vix - 16) / 20, 0, 1);
  const macros = inp.events.filter((e) => e.kind !== "earnings"), evr = macros.length ? clamp(-mean(macros.map((e) => e.lean)) * 1.5 + 0.3, 0, 1) : 0.3;
  const macroRisk = clamp(0.4 * mood + 0.3 * vixr + 0.3 * evr, 0, 1);
  const score = {
    compounder: A.map((_, i) => -0.45 * Z.vol[i] + 0.55 * Z.val[i]), growth: A.map((_, i) => 0.5 * Z.beta[i] + 0.5 * Z.mom[i] + 0.2 * Z.tone[i]),
    momentum: A.map((_, i) => 0.7 * Z.mom[i] + 0.3 * Z.m1[i]), macro: A.map((_, i) => -0.8 * Z.beta[i] - 0.2 * Z.vol[i]), income: A.map((_, i) => -Z.vol[i]),
    contrarian: A.map((_, i) => -0.6 * Z.dd[i] + 0.4 * Z.val[i]), fomo: A.map((_, i) => Z.m1[i]), quant: A.map(() => 0), you: A.map(() => 0),
  };
  const cash0 = inp.cash0, w0 = A.map((a) => a.w0);
  const cashFor = { you: cash0, compounder: Math.max(cash0, 0.06), growth: Math.min(cash0, 0.02), momentum: Math.min(cash0, 0.03), macro: clamp(0.08 + 0.35 * macroRisk, cash0, 0.45), income: Math.max(cash0, 0.15), contrarian: Math.max(cash0, 0.1), fomo: cash0, quant: 0 };
  const portVol = (w) => { const bp = w.reduce((s, x, i) => s + x * A[i].beta, 0), idio = Math.sqrt(w.reduce((s, x, i) => s + (x * A[i].idio) ** 2, 0)); return Math.sqrt((bp * inp.market.vol) ** 2 + idio ** 2); };
  const out = {};
  for (const id of PERSONAS) {
    let w, cash = cashFor[id];
    if (id === "you") w = w0.slice();
    else if (id === "quant") { const inv = A.map((a) => 1 / Math.max(0.05, a.vol)), raw = inv; const pre = capWeights(raw, 1); cash = clamp(1 - 0.12 / Math.max(0.02, portVol(pre)), 0, 0.6); w = capWeights(raw, 1 - cash); }
    else w = capWeights(w0.map((x, i) => Math.max(1e-6, x) * Math.exp(RULES[id].k * score[id][i])), 1 - cash);
    const sum = w.reduce((s, x) => s + x, 0) + cash; w = w.map((x) => x / sum); cash /= sum;
    const er = w.reduce((s, x, i) => s + x * mu[i], 0) + cash * rf;
    const drivers = w.map((x, i) => ({ tk: A[i].tk, w: x, contrib: x * mu[i], risk: x * A[i].beta * inp.market.vol })).sort((a, b) => b.contrib - a.contrib);
    const riskSum = drivers.reduce((s, d) => s + Math.abs(d.risk), 0) || 1;
    out[id] = { w, cash, expRet: er, vol: portVol(w), tilts: w.map((x, i) => ({ tk: A[i].tk, d: (x - w0[i]) * 100 })).sort((a, b) => Math.abs(b.d) - Math.abs(a.d)), drivers: drivers.slice(0, 4).map((d) => ({ tk: d.tk, w: d.w, contrib: d.contrib, riskShare: Math.abs(d.risk) / riskSum })), turnover: w.reduce((s, x, i) => s + Math.abs(x - w0[i]), 0) / 2 + Math.abs(cash - cash0) / 2 };
  }
  return { mu, macroRisk, personas: out };
}

/* ---------- the daily-return model, shared by CouncilRun and runStream (one copy of the model, no duplicates) ---------- */
function dailyModel(inp, A, muAnnual) {
  const byDay = new Map(); for (const e of inp.events) { if (e.day < 1 || e.day > DAYS) continue; if (!byDay.has(e.day)) byDay.set(e.day, []); byDay.get(e.day).push(e); }
  return {
    sigM: clamp(inp.market.vol, 0.1, 0.4) / Math.sqrt(DAYS) / Math.sqrt(1.336), mu: muAnnual.map((m) => m / DAYS),
    idioD: A.map((a) => Math.max(0.01, a.idio) / Math.sqrt(DAYS)), beta: A.map((a) => a.beta), byDay, idx: A.reduce((m, a, i) => (m[a.tk] = i, m), {}),
  };
}
/* standard normal (polar method, keeps the spare); S needs rnd() and spare */
function gauss(S) { if (S.spare !== null) { const s = S.spare; S.spare = null; return s; } let u, v, s; do { u = S.rnd() * 2 - 1; v = S.rnd() * 2 - 1; s = u * u + v * v; } while (s >= 1 || s === 0); const f = Math.sqrt(-2 * Math.log(s) / s); S.spare = v * f; return u * f; }
/* per-path regime: 15% of futures are "stormy" (1.8x market vol, 1.32x idiosyncratic vol) */
const regime = (S) => (S.rnd() < 0.15 ? 1.8 : 1);
/* one trading day: market shock + dated macro jumps, then each asset's beta * market + own noise + its earnings jump */
function dayReturns(S, d, sigM, idioMult, rets) {
  const N = rets.length, mu = S.mu, beta = S.beta, idioD = S.idioD;
  let m = S.norm() * sigM; const evs = S.byDay.get(d); let jumps = null;
  if (evs) for (const e of evs) { const jump = KAPPA * e.lean * e.sigma + S.norm() * e.sigma; if (e.kind === "earnings") { const i = S.idx[e.tk]; if (i != null) (jumps || (jumps = {}))[i] = (jumps && jumps[i] || 0) + jump; } else m += jump; }
  for (let i = 0; i < N; i++) rets[i] = mu[i] + beta[i] * m + S.norm() * idioD[i] * idioMult + (jumps && jumps[i] || 0);
}

export class CouncilRun {
  constructor(inp) {
    this.inp = inp; this.P = PERSONAS.length; this.N = inp.assets.length; this.paths = inp.paths; this.done = 0;
    this.plan = plan(inp); this.rnd = mulberry(inp.seed >>> 0); this.spare = null;
    const A = inp.assets, P = this.P, N = this.N;
    this.fanN = Math.min(this.paths, 4000); this.cps = Math.floor(DAYS / CHECK) + 1;
    this.fin = HORIZONS.map(() => PERSONAS.map(() => new Float32Array(this.paths)));
    this.dd = HORIZONS.map(() => PERSONAS.map(() => new Float32Array(this.paths)));
    this.fan = new Float32Array(P * this.fanN * this.cps);
    Object.assign(this, dailyModel(inp, A, this.plan.mu));
    this.vw = new Float64Array(P * N); this.vc = new Float64Array(P);
    this.target = PERSONAS.map((id) => this.plan.personas[id]);
    this.every = PERSONAS.map((id) => RULES[id].every);
    this.cost = COST;
  }
  norm() { return gauss(this); }
  step(n) {
    const { P, N, inp } = this, A = inp.assets, vw = this.vw, vc = this.vc, rf = inp.market.rf / DAYS;
    const rets = new Float64Array(N), last21 = new Float64Array(N), idxv = new Float64Array(N), peak = new Float64Array(P), mdd = new Float64Array(P), cool = new Int16Array(P);
    const end = Math.min(this.paths, this.done + n);
    for (let p = this.done; p < end; p++) {
      const storeFan = p < this.fanN, vm = regime(this), sigM = this.sigM * vm, idioMult = 0.6 + 0.4 * vm;
      for (let k = 0; k < P; k++) { const t = this.target[k]; const tr = t.turnover * this.cost * 2; for (let i = 0; i < N; i++) vw[k * N + i] = t.w[i] * (1 - tr); vc[k] = t.cash * (1 - tr); }
      peak.fill(1); mdd.fill(0); cool.fill(0); idxv.fill(1); last21.fill(1);
      for (let d = 1; d <= DAYS; d++) {
        dayReturns(this, d, sigM, idioMult, rets);
        for (let i = 0; i < N; i++) idxv[i] *= 1 + rets[i];
        for (let k = 0; k < P; k++) {
          let tot = 0, base = k * N; vc[k] *= 1 + rf;
          for (let i = 0; i < N; i++) { const v = vw[base + i] * (1 + rets[i]); vw[base + i] = v; tot += v; }
          tot += vc[k];
          if (tot > peak[k]) peak[k] = tot; const dd = 1 - tot / peak[k]; if (dd > mdd[k]) mdd[k] = dd;
          const id = PERSONAS[k], every = this.every[k];
          if (id === "fomo") {
            if (cool[k] > 0) { cool[k]--; if (cool[k] === 0) { const t = this.target[k]; for (let i = 0; i < N; i++) vw[base + i] = tot * t.w[i]; vc[k] = tot * t.cash; } }
            else if (dd > 0.12) { cool[k] = 21; for (let i = 0; i < N; i++) vw[base + i] *= 0.35; vc[k] = tot - vw.subarray(base, base + N).reduce((s, x) => s + x, 0); }
          }
          if (every && d % every === 0 && !(id === "fomo" && cool[k] > 0)) {
            const t = this.target[k]; let invest = 1 - t.cash;
            if (id === "fomo") { const r21 = A.map((_, i) => idxv[i] / last21[i] - 1), zz = z(Array.from(r21)); const raw = t.w.map((x, i) => Math.max(1e-6, x) * Math.exp(0.8 * zz[i])); const s = raw.reduce((a, b) => a + b, 0); for (let i = 0; i < N; i++) vw[base + i] = tot * invest * (raw[i] / s); vc[k] = tot * t.cash; }
            else { for (let i = 0; i < N; i++) vw[base + i] = tot * t.w[i]; vc[k] = tot * t.cash; }
            tot *= 1 - this.cost * t.turnover * 0.5;
          }
        }
        if (d % 21 === 0) for (let i = 0; i < N; i++) last21[i] = idxv[i];
        const hz = d === 21 ? 0 : d === 63 ? 1 : d === 126 ? 2 : d === 252 ? 3 : -1;
        if (hz >= 0 || (storeFan && d % CHECK === 0)) {
          for (let k = 0; k < P; k++) {
            let tot = vc[k]; for (let i = 0, b = k * N; i < N; i++) tot += vw[b + i];
            if (hz >= 0) { this.fin[hz][k][p] = tot; this.dd[hz][k][p] = mdd[k]; }
            if (storeFan && d % CHECK === 0) this.fan[(k * this.fanN + p) * this.cps + d / CHECK] = tot;
          }
        }
      }
      if (storeFan) for (let k = 0; k < P; k++) this.fan[(k * this.fanN + p) * this.cps] = 1;
    }
    this.done = end; return this.done >= this.paths;
  }
  result() {
    const q = (s, f) => s[Math.min(s.length - 1, Math.max(0, Math.round(f * (s.length - 1))))];
    const out = { paths: this.paths, days: DAYS, seed: this.inp.seed, market: this.inp.market, macroRisk: this.plan.macroRisk, personas: {} };
    PERSONAS.forEach((id, k) => {
      const hz = {};
      HORIZONS.forEach(([name], h) => {
        const f = Float32Array.from(this.fin[h][k]).sort(), s = (x) => x - 1;
        let gain = 0, loss = 0; for (let i = 0; i < f.length; i++) { if (f[i] > 1) gain++; if (f[i] < 0.9) loss++; }
        const dd = Float32Array.from(this.dd[h][k]).sort();
        hz[name] = { p5: s(q(f, 0.05)), p25: s(q(f, 0.25)), p50: s(q(f, 0.5)), p75: s(q(f, 0.75)), p95: s(q(f, 0.95)), mean: s(mean(Array.from(f))), pGain: gain / f.length, pLoss10: loss / f.length, ddMed: q(dd, 0.5), dd95: q(dd, 0.95), sd: sd(Array.from(f)) };
      });
      const fan = [];
      for (let c = 0; c < this.cps; c++) { const col = new Float32Array(this.fanN); for (let p = 0; p < this.fanN; p++) col[p] = this.fan[(k * this.fanN + p) * this.cps + c]; col.sort(); fan.push({ day: c * CHECK, p5: q(col, 0.05) - 1, p25: q(col, 0.25) - 1, p50: q(col, 0.5) - 1, p75: q(col, 0.75) - 1, p95: q(col, 0.95) - 1 }); }
      out.personas[id] = { ...this.plan.personas[id], hz, fan };
    });
    return out;
  }
}

/* ---------- streaming: the "hold your current weights" portfolio, one path at a time, nothing stored ----------
   Same daily-return model as CouncilRun (dailyModel / regime / dayReturns above). Assets you do not hold (w = 0) are left
   out: holdings are independent given the market shock, so they cannot change your portfolio, only cost time.
   onPath(p, value, dd) is called once per path with two reused Float64Array(DAYS + 1) buffers:
   value[d] = portfolio value after day d (value[0] = 1), dd[d] = worst peak-to-trough drawdown seen up to day d.
   Copy anything you need to keep; the buffers are overwritten by the next path. Returns the number of paths run. */
export const STREAM_MODEL_VERSION = "council-hold-1";
export const STREAM_DAYS = DAYS;
export function runStream(inp, seed, n, onPath) {
  const pl = plan(inp), you = pl.personas.you, keep = [];
  for (let i = 0; i < inp.assets.length; i++) if (you.w[i] > 0) keep.push(i);
  const A = keep.map((i) => inp.assets[i]), w = keep.map((i) => you.w[i]), N = A.length, cash = you.cash, rf = inp.market.rf / DAYS;
  const S = { ...dailyModel(inp, A, keep.map((i) => pl.mu[i])), rnd: mulberry(seed >>> 0), spare: null, norm() { return gauss(this); } };
  const rets = new Float64Array(N), vw = new Float64Array(N), value = new Float64Array(DAYS + 1), dd = new Float64Array(DAYS + 1);
  for (let p = 0; p < n; p++) {
    const vm = regime(S), sigM = S.sigM * vm, idioMult = 0.6 + 0.4 * vm;
    for (let i = 0; i < N; i++) vw[i] = w[i];
    let vc = cash, peak = 1, mdd = 0; value[0] = 1; dd[0] = 0;
    for (let d = 1; d <= DAYS; d++) {
      dayReturns(S, d, sigM, idioMult, rets);
      vc *= 1 + rf; let tot = vc;
      for (let i = 0; i < N; i++) { const v = vw[i] * (1 + rets[i]); vw[i] = v; tot += v; }
      if (tot > peak) peak = tot; const x = 1 - tot / peak; if (x > mdd) mdd = x;
      value[d] = tot; dd[d] = mdd;
    }
    onPath(p, value, dd);
  }
  return n;
}
