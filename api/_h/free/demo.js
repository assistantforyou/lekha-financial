// GET /api/free/demo?k=HISTORY|FACTOR|VALIN|fund|rev|quotes|street
// The sample portfolio on REAL data, for visitors who have not signed in. The ticker list is fixed on the server (nothing comes
// from the request), so this is one shared, cached answer for everybody: prices, history, valuations, analysts and earnings
// dates all come from the same providers as a signed-in account. It calls the normal per-user handlers on a synthetic request
// (`__demoPublic`, a property only this file can set), so there is no second code path to keep in step.
const { rateHit } = require("../../_lib");
const { clientId } = require("../../_history");
const { fxRates } = require("../../_intl");
const { estimatesFor, revDoc } = require("../../_estimates");

const SYMBOLS = ["NVDA", "AMD", "AVGO", "SMH", "MSFT", "AAPL", "0700.HK", "TSLA", "JPM", "XOM", "PTT.BK", "JNJ", "PEP"];
const TTL = { HISTORY: 10 * 6e4, FACTOR: 30 * 6e4, VALIN: 30 * 6e4, fund: 6 * 36e5, rev: 6 * 36e5, street: 30 * 6e4, quotes: 4000 };
const mem = new Map(), flight = new Map();

// run a handler (req,res) -> {code, body|json|empty, type}
function call(handler, body = {}) {
  return new Promise((resolve) => {
    const req = { method: "POST", body, query: {}, headers: { "x-forwarded-for": "demo-public" }, __demoPublic: true };
    const res = { headers: {}, code: 200, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(o) { resolve({ code: this.code, json: o }); return this; }, send(b) { resolve({ code: this.code, body: b, type: this.headers["Content-Type"] }); return this; }, end() { resolve({ code: this.code, empty: true }); return this; } };
    Promise.resolve(handler(req, res)).catch(() => resolve({ code: 500, empty: true }));
  });
}
async function build(k) {
  const b = { symbols: SYMBOLS };
  if (k === "HISTORY") return call((q, s) => require("../../_history").history(q, s, { days: null }), b);
  if (k === "FACTOR") return call(require("../../_factor").factor, b);
  if (k === "VALIN") return call((q, s) => require("../../_valuation").valinCsvHandler(q, s, { max: null }), b);
  if (k === "fund") return call((q, s) => require("../../_valuation").fundCollection(q, s, { max: null }), b);
  if (k === "rev") { const doc = revDoc(await estimatesFor(SYMBOLS.filter((s) => !/\.(HK|BK)$/.test(s)), { fresh: 2, overview: false })); return { code: 200, json: doc ? [doc] : [] }; }
  if (k === "street") return call(require("./street"), b);
  if (k === "quotes") { const r = await call(require("./quotes"), b); if (r.json) r.json.fx = await fxRates().catch(() => null); return r; }
  return { code: 404, empty: true };
}
module.exports = async (req, res) => {
  const k = String((req.query && req.query.k) || "");
  if (!TTL[k]) return res.status(404).json({ error: "Unknown dataset." });
  res.setHeader("Cache-Control", "no-store");
  const hit = mem.get(k);
  if (!(hit && Date.now() - hit.at < TTL[k])) {
    // only people who actually need a fresh build count against the limit; everything else is served from the shared cache
    if (!(await rateHit(`rl/demo/${clientId(req)}/${Math.floor(Date.now() / 6e5)}`, 120))) return res.status(429).json({ error: "Too many requests." });
    if (!flight.has(k)) flight.set(k, build(k).then((r) => { if (r && r.code === 200) mem.set(k, { at: Date.now(), r }); flight.delete(k); return r; }, () => { flight.delete(k); return { code: 502, empty: true }; }));
    var out = mem.get(k) ? mem.get(k).r : await flight.get(k);
  } else out = hit.r;
  res.setHeader("Cache-Control", `public, s-maxage=${Math.max(2, Math.floor(TTL[k] / 2000))}, stale-while-revalidate=${Math.floor(TTL[k] / 1000)}`);
  if (!out || out.code !== 200 || out.empty) return res.status(out && out.code === 200 ? 204 : 502).end();
  if (out.json !== undefined) return res.status(200).json(out.json);
  res.setHeader("Content-Type", out.type || "text/csv; charset=utf-8");
  return res.status(200).send(out.body);
};
module.exports.SYMBOLS = SYMBOLS;
