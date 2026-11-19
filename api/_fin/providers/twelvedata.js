// Twelve Data (free key, ~800 credits/day, 8/min): fallback for daily history and quotes. Display licensing: free plan is for personal use.
const { request, notConfigured } = require("../http");
const S = require("../schemas");
const obs = require("../obs");
const name = "twelvedata";
const configured = () => !!process.env.TWELVEDATA_API_KEY;
async function history(symbol, { days = 365 } = {}) {
  if (!configured()) throw notConfigured(name);
  return obs.timed(name, "time_series", async () => {
    const size = Math.min(5000, Math.ceil(days * 0.72) + 5), j = await request(name, `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=1day&outputsize=${size}&apikey=${process.env.TWELVEDATA_API_KEY}`);
    if (!j || j.status === "error" || !Array.isArray(j.values)) throw new Error("twelvedata_error");
    return j.values.map((v) => S.bar(v.datetime.slice(0, 10), v.open, v.high, v.low, v.close, v.volume)).reverse();
  });
}
async function quote(symbol) {
  if (!configured()) throw notConfigured(name);
  return obs.timed(name, "quote", async () => {
    const j = await request(name, `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbol)}&apikey=${process.env.TWELVEDATA_API_KEY}`);
    if (!j || j.status === "error" || !j.close) throw new Error("twelvedata_error");
    return S.quote({ symbol, name: j.name, price: j.close, previousClose: j.previous_close, open: j.open, high: j.high, low: j.low, volume: j.volume, currency: j.currency, exchange: j.exchange,
      timestamp: j.timestamp ? new Date(j.timestamp * 1000) : null, freshness: j.is_market_open ? "delayed" : "historical", source: "Twelve Data" });
  });
}
module.exports = { name, configured, license: "Free plan is for personal use; redistribution needs a paid plan.", history, quote };
