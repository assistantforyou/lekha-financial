// Alpha Vantage (last-resort fallback only). The free key has 25 calls/day and that budget is shared with the existing valuation/estimates features
// (see api/_lib.js DAILY_LIMIT), so this provider is never first in a chain and refuses to run when the budget is gone.
const { av } = require("../../_lib");
const S = require("../schemas");
const obs = require("../obs");
const name = "alphavantage";
const configured = () => !!process.env.AV_API_KEY && !!process.env.SUPABASE_URL;
async function quote(sym) {
  return obs.timed(name, "GLOBAL_QUOTE", async () => {
    const j = await av({ function: "GLOBAL_QUOTE", symbol: sym }), g = j["Global Quote"]; if (!g || !g["05. price"]) throw new Error("alphavantage_empty");
    return S.quote({ symbol: sym, price: g["05. price"], previousClose: g["08. previous close"], open: g["02. open"], high: g["03. high"], low: g["04. low"], volume: g["06. volume"], timestamp: g["07. latest trading day"], freshness: "historical", source: "Alpha Vantage" });
  });
}
async function cryptoQuote(sym) {
  return obs.timed(name, "CURRENCY_EXCHANGE_RATE", async () => { const j = await av({ function: "CURRENCY_EXCHANGE_RATE", from_currency: String(sym).replace(/-USD$/, ""), to_currency: "USD" }), x = j["Realtime Currency Exchange Rate"]; if (!x) throw new Error("alphavantage_empty"); return S.quote({ symbol: sym, price: x["5. Exchange Rate"], timestamp: x["6. Last Refreshed"] + "Z", freshness: "realtime", source: "Alpha Vantage" }); });
}
module.exports = { name, configured, license: "Free key: 25 calls/day, personal use. Paid plans required for redistribution.", quote, cryptoQuote };
