// FX from Frankfurter (ECB euro reference rates, keyless, open). Rates are daily reference fixes, not tradable quotes.
const { request } = require("../http");
const S = require("../schemas");
const obs = require("../obs");
const name = "frankfurter";
async function rates(base = "USD", symbols = ["THB", "EUR", "GBP", "JPY", "HKD", "CNY", "SGD"], date = null) {
  return obs.timed(name, "latest", async () => {
    const j = await request(name, `https://api.frankfurter.dev/v1/${date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "latest"}?base=${encodeURIComponent(base)}&symbols=${symbols.join(",")}`);
    if (!j || !j.rates) throw new Error("frankfurter_empty");
    return { base: j.base, date: j.date, rates: j.rates, source: "ECB via Frankfurter", meta: S.meta({ source: "ECB via Frankfurter", asOf: j.date, freshness: "delayed", currency: null, unit: "rate" }) };
  });
}
async function history(base, quoteCcy, days = 365) {
  return obs.timed(name, "series", async () => {
    const start = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10), j = await request(name, `https://api.frankfurter.dev/v1/${start}..?base=${base}&symbols=${quoteCcy}`);
    if (!j || !j.rates) throw new Error("frankfurter_empty");
    return Object.entries(j.rates).map(([d, r]) => [d, r[quoteCcy]]);
  });
}
module.exports = { name, configured: () => true, license: "Open data (ECB reference rates).", rates, history };
