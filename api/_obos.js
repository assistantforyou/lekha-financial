// Overbought/oversold dataset for the free tier (Alpaca bars, Twelve Data fallback), cached in Supabase.
const { cacheGetMany, cacheSet } = require("./_lib");
const { getSeries } = require("./_prices");
const { obCodes, obosCsv } = require("./_mappers");
const SP500 = require("./_data/sp500.json").stocks;

const ETFS = ["SPY", "XLC", "XLY", "XLP", "XLE", "XLF", "XLV", "XLI", "XLK", "XLB", "XLRE", "XLU", "SMH", "ITA"];
const K = 135;                 // sessions encoded per stock (the page uses the last 130)
const TTL = 6 * 36e5, COOLDOWN = 15 * 6e4, CHUNK = 25, PARALLEL = 7;
const chunks = [];
for (let i = 0; i < SP500.length; i += CHUNK) chunks.push(SP500.slice(i, i + CHUNK));

async function obos(res) {
  const now = Date.now();
  const keys = ["free/ob/etf", ...chunks.map((_, i) => "free/ob/" + i)];
  const have = await cacheGetMany(keys.concat(keys.map((k) => "fail/" + k)));
  const fresh = (k) => have[k] && now - have[k].fetchedAt < TTL;
  const cooling = (k) => have["fail/" + k] && now - have["fail/" + k].fetchedAt < COOLDOWN;

  // 1) ETFs: also gives the SPY session calendar every stock is aligned to
  if (!fresh("free/ob/etf") && !cooling("free/ob/etf")) {
    try {
      const { data } = await getSeries(ETFS, 560);
      const trimmed = {};
      for (const s of ETFS) if (data[s] && data[s].length) trimmed[s] = data[s].slice(-300);
      if (!trimmed.SPY) throw new Error("no spy");
      await cacheSet("free/ob/etf", trimmed);
      have["free/ob/etf"] = { payload: trimmed, fetchedAt: Date.now() };
    } catch (e) { await cacheSet("fail/free/ob/etf", { failed: true }); }
  }
  const etf = have["free/ob/etf"] && have["free/ob/etf"].payload;
  if (!etf || !etf.SPY) return res.status(204).end();
  const cal = etf.SPY.map((b) => b[0]).slice(-K);
  const calLast = cal[cal.length - 1];

  // 2) stocks in chunks; a chunk is stale if old or encoded against an older calendar
  const todo = chunks.map((_, i) => i).filter((i) => {
    const k = "free/ob/" + i, h = have[k];
    if (h && now - h.fetchedAt < TTL && h.payload.calLast === calLast) return false;
    return !cooling(k);
  });
  for (let b = 0; b < todo.length; b += PARALLEL) {
    await Promise.all(todo.slice(b, b + PARALLEL).map(async (i) => {
      try {
        const { data } = await getSeries(chunks[i].map((c) => c[0]), 560);
        const rows = [];
        for (const [tk, sec] of chunks[i]) if (data[tk] && data[tk].length >= 60) rows.push([tk, sec, "", obCodes(data[tk], cal)]);
        if (!rows.length) throw new Error("empty");
        const payload = { calLast, rows };
        await cacheSet("free/ob/" + i, payload);
        have["free/ob/" + i] = { payload, fetchedAt: Date.now() };
      } catch (e) { await cacheSet("fail/free/ob/" + i, { failed: true }); }
    }));
  }
  const stocks = [];
  for (let i = 0; i < chunks.length; i++) { const h = have["free/ob/" + i]; if (h && h.payload.calLast === calLast) stocks.push(...h.payload.rows); }
  if (stocks.length < 400) return res.status(204).end(); // page needs a near-complete universe
  if (stocks.length >= 480) res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=3600");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  return res.status(200).send(obosCsv(stocks, etf, new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC"));
}

module.exports = { obos };
