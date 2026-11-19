// CoinGecko public API (keyless demo tier, ~30 calls/min). Attribution to CoinGecko is required when displayed.
const { request } = require("../http");
const S = require("../schemas");
const obs = require("../obs");
const name = "coingecko";
const IDS = { BTC: "bitcoin", ETH: "ethereum", SOL: "solana", XRP: "ripple", ADA: "cardano", DOGE: "dogecoin", BNB: "binancecoin", AVAX: "avalanche-2", LTC: "litecoin", DOT: "polkadot", LINK: "chainlink", TRX: "tron", MATIC: "matic-network", USDT: "tether", USDC: "usd-coin" };
async function idFor(sym) {
  const s = String(sym).toUpperCase().replace(/-USD$/, "");
  if (IDS[s]) return IDS[s];
  const j = await obs.timed(name, "search", () => request(name, `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(s)}`));
  const hit = ((j && j.coins) || []).find((c) => String(c.symbol).toUpperCase() === s) || (j && j.coins && j.coins[0]); return hit ? hit.id : null;
}
async function quote(sym) {
  const id = await idFor(sym); if (!id) throw new Error("coingecko_unknown");
  return obs.timed(name, "price", async () => {
    const j = await request(name, `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true&include_last_updated_at=true`), x = j && j[id];
    if (!x || !(x.usd > 0)) throw new Error("coingecko_empty");
    return S.quote({ symbol: String(sym).toUpperCase(), name: id, price: x.usd, changePercent: x.usd_24h_change != null ? x.usd_24h_change / 100 : null, marketCap: x.usd_market_cap, volume: x.usd_24h_vol,
      timestamp: x.last_updated_at ? new Date(x.last_updated_at * 1000) : new Date(), freshness: "realtime", source: "CoinGecko", exchange: "crypto" });
  });
}
async function history(sym, { days = 365 } = {}) {
  const id = await idFor(sym); if (!id) throw new Error("coingecko_unknown");
  return obs.timed(name, "market_chart", async () => {
    const j = await request(name, `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${Math.min(days, 365)}&interval=daily`);
    if (!j || !j.prices) throw new Error("coingecko_empty");
    return j.prices.map((p) => S.bar(new Date(p[0]).toISOString().slice(0, 10), null, null, null, p[1], null));
  });
}
async function search(q, limit = 5) {
  return obs.timed(name, "search", async () => { const j = await request(name, `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`, { timeoutMs: 6000 }); return ((j && j.coins) || []).slice(0, limit).map((c) => ({ symbol: String(c.symbol).toUpperCase() + "-USD", name: c.name, exchange: "Crypto", type: "crypto", source: "CoinGecko" })); });
}
module.exports = { name, configured: () => true, license: "Free demo tier; attribution to CoinGecko required.", quote, history, search };
