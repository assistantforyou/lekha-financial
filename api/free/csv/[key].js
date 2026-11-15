// Free tier price datasets: ROTATION / RISK (daily ETF series) and BREADTH (S&P 500 above-average flags).
// Alpaca primary, Twelve Data fallback; results cached in Supabase so a page load is normally one read.
const { cacheGetMany, cacheSet } = require("../../_lib");
const { getSeries } = require("../../_prices");
const { rotationCsv, breadthFlags, breadthCsv } = require("../../_mappers");
const { obos } = require("../../_obos");
const SP500 = require("../../_data/sp500.json").stocks;

const SETS = {
  ROTATION: ["SPY", "RSP", "SMH", "XLF", "XLV", "XLP", "ITA", "XLE"],
  RISK: ["SPY", "XLY", "XLP"],
};
const TTL = 6 * 36e5;          // refresh a cached series/chunk at most every 6h
const COOLDOWN = 15 * 6e4;     // after a failed refresh wait 15 min
const CHUNK = 25;              // 25 symbols x ~375 bars stays under Alpaca's 10,000-bar page
const PARALLEL = 7;

const chunks = [];
for (let i = 0; i < SP500.length; i += CHUNK) chunks.push(SP500.slice(i, i + CHUNK));

async function rotationLike(key, res) {
  const syms = SETS[key];
  const keys = syms.map((s) => "free/ts/" + s);
  const have = await cacheGetMany(keys.concat("fail/free/ts/" + key));
  const now = Date.now();
  const stale = syms.filter((s) => { const h = have["free/ts/" + s]; return !h || now - h.fetchedAt >= TTL; });
  const fail = have["fail/free/ts/" + key];
  if (stale.length && !(fail && now - fail.fetchedAt < COOLDOWN)) {
    try {
      const { data } = await getSeries(stale, 2000); // ~5.5 years of daily bars
      for (const s of stale) if (data[s] && data[s].length) { await cacheSet("free/ts/" + s, data[s]); have["free/ts/" + s] = { payload: data[s], fetchedAt: Date.now() }; }
    } catch (e) { await cacheSet("fail/free/ts/" + key, { failed: true }); }
  }
  const bySym = {};
  for (const s of syms) if (have["free/ts/" + s]) bySym[s] = have["free/ts/" + s].payload;
  if (!bySym.SPY) return res.status(204).end();
  const csv = rotationCsv(bySym);
  if (!csv) return res.status(204).end();
  if (syms.every((s) => bySym[s])) res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  return res.status(200).send(csv);
}

async function breadth(res) {
  const keys = chunks.map((_, i) => "free/br/" + i);
  const have = await cacheGetMany(keys.concat(keys.map((k) => "fail/" + k)));
  const now = Date.now();
  const todo = chunks.map((_, i) => i).filter((i) => {
    const h = have["free/br/" + i], f = have["fail/free/br/" + i];
    if (h && now - h.fetchedAt < TTL) return false;
    if (f && now - f.fetchedAt < COOLDOWN) return false;
    return true;
  });
  for (let b = 0; b < todo.length; b += PARALLEL) {
    await Promise.all(todo.slice(b, b + PARALLEL).map(async (i) => {
      try {
        const { data } = await getSeries(chunks[i].map((c) => c[0]), 560);
        const rows = [];
        for (const [tk, sec] of chunks[i]) {
          const s = data[tk];
          if (!s || s.length < 60) continue;
          rows.push([tk, sec, s.length, s[s.length - 1][1], breadthFlags(s.map((x) => x[1])), s[s.length - 1][0]]);
        }
        if (!rows.length) throw new Error("empty");
        await cacheSet("free/br/" + i, rows);
        have["free/br/" + i] = { payload: rows, fetchedAt: Date.now() };
      } catch (e) { await cacheSet("fail/free/br/" + i, { failed: true }); }
    }));
  }
  const all = [];
  for (let i = 0; i < chunks.length; i++) if (have["free/br/" + i]) all.push(...have["free/br/" + i].payload);
  if (all.length < 400) return res.status(204).end(); // the page needs a near-complete universe
  if (all.length >= 480) res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=3600");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  return res.status(200).send(breadthCsv(all, new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC"));
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const key = String(req.query.key || "");
  try {
    if (SETS[key]) return await rotationLike(key, res);
    if (key === "BREADTH") return await breadth(res);
    if (key === "OBOS") return await obos(res);
  } catch (e) { /* fall through */ }
  return res.status(204).end();
};
