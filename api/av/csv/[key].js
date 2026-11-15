const { av, cacheGetMany, cacheSet } = require("../../_lib");
const { dailyFrom, rotationCsv } = require("../../_mappers");

// Which daily series each dataset is built from (free tier: 1 call per symbol, compact = ~100 trading days).
const SETS = {
  ROTATION: ["SPY", "RSP", "SMH", "XLF", "XLV", "XLP", "ITA", "XLE"],
  RISK: ["SPY", "XLY", "XLP"],
};
const TTL = 20 * 36e5;        // refresh a symbol at most once per ~20h
const COOLDOWN = 30 * 6e4;    // after a failed refresh, wait 30 min before retrying that symbol
const MAX_REFRESH = 4;        // per request: 4 calls * 1.2s spacing stays inside the function time limit

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const syms = SETS[String(req.query.key || "")];
  if (!syms) return res.status(204).end(); // not provided by Alpha Vantage: panel stays in "no source" state
  try {
    const keys = syms.map((s) => "ts/" + s);
    const have = await cacheGetMany(keys.concat(keys.map((k) => "fail/" + k)));
    const now = Date.now();
    const todo = syms.filter((s) => {
      const hit = have["ts/" + s], fail = have["fail/ts/" + s];
      if (hit && now - hit.fetchedAt < TTL) return false;
      if (fail && now - fail.fetchedAt < COOLDOWN) return false;
      return true;
    }).slice(0, MAX_REFRESH);
    for (const s of todo) {
      try {
        const rows = dailyFrom(await av({ function: "TIME_SERIES_DAILY", symbol: s, outputsize: "compact" }));
        if (!rows) throw new Error("empty");
        await cacheSet("ts/" + s, rows);
        have["ts/" + s] = { payload: rows, fetchedAt: Date.now() };
      } catch (e) {
        await cacheSet("fail/ts/" + s, { failed: true });
        if (String(e.message).includes("daily_budget")) break;
      }
    }
    const bySym = {};
    for (const s of syms) if (have["ts/" + s]) bySym[s] = have["ts/" + s].payload;
    if (!bySym.SPY) return res.status(204).end(); // rotation needs SPY as its base
    const csv = rotationCsv(bySym);
    if (!csv) return res.status(204).end();
    // only let the CDN hold the response once every symbol is present; partial sets must keep filling in
    if (syms.every((s) => bySym[s])) res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    return res.status(200).send(csv);
  } catch (e) {
    return res.status(204).end();
  }
};
