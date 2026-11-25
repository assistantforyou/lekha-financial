// POST /api/ai/simulate — Premium only (feature "simulation"). Deterministic Monte Carlo + stress tests on the user's
// REAL holdings: per-holding weekly returns and betas come from the same price series the app
// serves (Alpaca/Twelve Data + intl sources, via _history.seriesFor), the RNG is seeded from
// user + day + symbols so the same request always returns the same paths. Math is free; the
// short narrative is one budgeted LLM call and is optional.
const { requireFeature } = require("../../_auth");
const { rateHit } = require("../../_lib");
const { generateJson } = require("../../_llm");
const { fence, guard } = require("../../_ai_safe");
const { langOf, withLang } = require("./_lang");
const { seriesFor, cleanSymbols } = require("../../_history");
const { userContext } = require("./_ctx");

const DAY = 864e5;
const HORIZONS = [0.5, 1, 2, 5]; // years
const PATHS = 2000, WEEKS_LOOKBACK = 104;

function fnv1a(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gaussOf(rng) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
function variance(a) { const m = mean(a); return a.length ? a.reduce((s, x) => s + (x - m) * (x - m), 0) / a.length : 0; }
function covariance(a, b) { const ma = mean(a), mb = mean(b), n = Math.min(a.length, b.length); let s = 0; for (let i = 0; i < n; i++) s += (a[i] - ma) * (b[i] - mb); return n ? s / n : 0; }

// daily closes -> weekly returns (last close per ISO-ish week bucket of 7 calendar days)
function weeklyReturns(rows, maxWeeks) {
  const out = [];
  let prev = null;
  for (let i = 1; i < rows.length; i++) {
    const wk = Math.floor(Date.parse(rows[i][0] + "T00:00:00Z") / (7 * DAY));
    const pw = prev ? Math.floor(Date.parse(rows[i - 1][0] + "T00:00:00Z") / (7 * DAY)) : null;
    if (prev != null && wk !== pw) {
      if (prev > 0) out.push(rows[i - 1][1] / prev - 1);
      prev = rows[i - 1][1];
    } else if (prev == null) prev = rows[i - 1][1];
  }
  if (prev > 0 && rows.length) out.push(rows[rows.length - 1][1] / prev - 1);
  return out.slice(-maxWeeks);
}

const NARRATIVE_SYSTEM = "You write one short paragraph interpreting a Monte Carlo simulation of the user's real portfolio. Use ONLY the supplied numbers; never invent figures. Plain analysis, not advice. 3-5 sentences maximum.";
const NARRATIVE_SCHEMA = { type: "OBJECT", properties: { narrative: { type: "STRING" } }, required: ["narrative"] };

const STRESS = [
  { name: "Rate shock (+100bp)", move: -0.05, semi: 0, note: "Higher discount rates compress equity multiples; long-duration growth hit hardest." },
  { name: "Tech / semis drawdown", move: -0.12, semi: -0.1, note: "Semiconductor and megacap-tech themes take an additional hit." },
  { name: "Risk-off rotation", move: -0.08, semi: 0, note: "Broad de-risking proportional to each holding's market beta." },
  { name: "Recession scenario", move: -0.18, semi: -0.04, note: "Cyclical drawdown; high-beta holdings fall further." },
];

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only." });
  const p = await requireFeature(req, res, "simulation");
  if (!p) return;
  res.setHeader("Cache-Control", "no-store");
  try {
    const body = (req.body && typeof req.body === "object") ? req.body : {};
    const years = HORIZONS.includes(Number(body.years)) ? Number(body.years) : 1;
    const lang = langOf(body.lang);

    const uid = p.user_id;
    const ok = await rateHit(`ai/sim/${uid}/${Math.floor(Date.now() / DAY)}`, 10);
    if (!ok) return res.status(429).json({ error: "Daily simulation limit reached (10/day on Premium).", code: "ai_limit" });

    const ctx = await userContext(uid);
    if (!ctx) return res.status(400).json({ error: "Add holdings to your portfolio first.", code: "no_holdings" });
    const syms = cleanSymbols(ctx.rows.map((r) => r.tk)).slice(0, 25);
    if (!syms.length) return res.status(400).json({ error: "No priced holdings to simulate.", code: "no_holdings" });

    const data = await seriesFor([...syms, "SPY"]);
    const mktW = weeklyReturns(data.SPY || [], WEEKS_LOOKBACK);
    const varM = variance(mktW);
    const items = [];
    for (const s of syms) {
      const w = weeklyReturns(data[s] || [], WEEKS_LOOKBACK);
      const n = Math.min(w.length, mktW.length);
      if (n < 30) continue; // not enough history: excluded from the paths, shown as-is
      const beta = varM > 0 ? covariance(w.slice(-n), mktW.slice(-n)) / varM : 0.8;
      const idio = Math.max(0.015, Math.sqrt(Math.max(0, variance(w) - beta * beta * varM)));
      const row = ctx.rows.find((r) => r.tk === s);
      items.push({ tk: s, beta: Math.round(beta * 100) / 100, idio, weight: row ? row.valUsd : 0, theme: row ? row.theme : "" });
    }
    const wSum = items.reduce((s, x) => s + x.weight, 0);
    if (!(wSum > 0)) return res.status(422).json({ error: "A priced holding with sufficient return history is required.", code: "insufficient_history" });
    for (const x of items) x.weightPct = Math.round((x.weight / wSum) * 1000) / 10;

    const weeks = Math.round(years * 52);
    const rng = mulberry32(fnv1a(uid + "|" + new Date().toISOString().slice(0, 10) + "|" + syms.join(",")));
    const finals = [];
    for (let path = 0; path < PATHS; path++) {
      let v = 1;
      for (let wk = 0; wk < weeks; wk++) {
        const m = gaussOf(rng) * Math.sqrt(Math.max(varM, 1e-6));
        let r = 0;
        for (const x of items) r += (x.weight / wSum) * (x.beta * m + gaussOf(rng) * x.idio);
        v *= 1 + r;
      }
      finals.push(v);
    }
    finals.sort((a, b) => a - b);
    const q = (pct) => Math.round(finals[Math.min(finals.length - 1, Math.floor(pct * finals.length))] * 1000) / 1000;
    const percentiles = { p5: q(0.05), p25: q(0.25), p50: q(0.5), p75: q(0.75), p95: q(0.95) };
    const probLoss = Math.round((finals.filter((v) => v < 1).length / finals.length) * 1000) / 10;

    const stress = STRESS.map((sc) => {
      let impact = 0;
      for (const x of items) {
        const semi = /semiconductor|megacap|tech|ai/i.test(x.theme || "") ? sc.semi : 0;
        impact += (x.weight / wSum) * (x.beta * sc.move + semi);
      }
      return { name: sc.name, movePct: Math.round(sc.move * 100), impactPct: Math.round(impact * 1000) / 10, note: sc.note };
    });

    let narrative = "";
    try {
      const ff = fence(`Portfolio (real holdings, weights of invested part): ${items.map((x) => `${x.tk} ${x.weightPct}% beta ${x.beta}`).join("; ")}\nHorizon: ${years}y, ${PATHS} seeded paths.\nOutcome multipliers: p5 ${percentiles.p5}, p25 ${percentiles.p25}, median ${percentiles.p50}, p75 ${percentiles.p75}, p95 ${percentiles.p95}. Probability of a loss: ${probLoss}%.\nStress impacts: ${stress.map((s) => `${s.name} ${s.impactPct}%`).join("; ")}.`, "simulation", 8000);
      const ai = await generateJson({
        system: withLang(NARRATIVE_SYSTEM + "\n\n" + guard([ff.tag]), lang), job: "ai-sim", timeoutMs: 30000,
        user: ff.wrapped + "\nWrite the narrative.",
        schema: NARRATIVE_SCHEMA,
      });
      narrative = String(ai.narrative || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 700);
    } catch { narrative = "AI commentary is currently unavailable. The simulation results are calculated independently."; }

    return res.status(200).json({
      seed: "deterministic (user+day+holdings)", years, paths: PATHS, weeks,
      percentiles, probLoss, stress,
      holdings: items.map(({ tk, beta, weightPct }) => ({ tk, beta, weightPct })),
      narrative,
      methodology: "Seeded Monte Carlo on ~2y of weekly returns per holding (market beta + idiosyncratic vol from your own price history). Deterministic: the same day and portfolio always produce the same paths.",
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    if (e && e.status === 503) return res.status(503).json({ error: "AI simulations are not configured on this site yet.", code: "not_configured" });
    return res.status(502).json({ error: "Could not run the simulation right now. Try again in a moment.", code: "upstream" });
  }
};
