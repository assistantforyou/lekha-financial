// Two-tier cache with per-data-class TTLs, single-flight de-duplication and stale-on-error.
//   tier 1  in-memory LRU per serverless instance (milliseconds)
//   tier 2  shared Supabase table pt_av_cache (only for classes marked `shared`; skipped when Supabase is not configured)
// A loader that throws falls back to the newest stale value of ANY age, flagged stale:true, so one provider outage never blanks a page.
const obs = require("./obs");
const H = 36e5, M = 6e4;

// TTL policy (ms). SEC filings are keyed by accession elsewhere, so statements can live for days: "cache until a new filing appears".
const TTL = {
  quote: 5e3, intraday: 60e3, crypto: 30e3, fx: H, history: H, profile: 12 * H, fundamentals: 6 * H, statements: 24 * 7 * H, facts: 12 * H, filings: 30 * M,
  news: 10 * M, earnings: 6 * H, estimates: 12 * H, macro: 6 * H, peers: 24 * H, search: 24 * H, concept: 24 * H,
};
const SHARED = new Set(["profile", "statements", "facts", "filings", "macro", "earnings", "estimates", "peers", "history", "fx", "news"]);
const MAX = 600;
const mem = new Map();          // key -> {v, at}
const flight = new Map();       // key -> Promise

function sbReady() { return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY); }
function lib() { return require("../_lib"); }
function remember(key, v) { mem.delete(key); mem.set(key, { v, at: Date.now() }); while (mem.size > MAX) mem.delete(mem.keys().next().value); }

async function cacheFetch(cls, key, loader, { ttl, shared } = {}) {
  const life = ttl != null ? ttl : TTL[cls] != null ? TTL[cls] : 5 * M, useDb = (shared != null ? shared : SHARED.has(cls)) && sbReady(), k = `fin/${cls}/${key}`;
  const m = mem.get(k);
  if (m && Date.now() - m.at < life) { obs.cache(cls, "hit"); return { value: m.v, cache: "memory", stale: false, ageMs: Date.now() - m.at }; }
  let dbHit = null;
  if (useDb) { try { dbHit = await lib().cacheGet(k); } catch (e) { dbHit = null; } if (dbHit && Date.now() - dbHit.fetchedAt < life) { remember(k, dbHit.payload); obs.cache(cls, "hit"); return { value: dbHit.payload, cache: "shared", stale: false, ageMs: Date.now() - dbHit.fetchedAt }; } }
  if (flight.has(k)) return flight.get(k);
  const p = (async () => {
    try {
      const fresh = await loader();
      if (fresh == null) throw new Error("empty");
      remember(k, fresh); obs.cache(cls, "miss");
      if (useDb) lib().cacheSet(k, fresh).catch(() => {});
      return { value: fresh, cache: "miss", stale: false, ageMs: 0 };
    } catch (e) {
      const old = m || (dbHit && { v: dbHit.payload, at: dbHit.fetchedAt });
      if (old) { obs.cache(cls, "stale"); return { value: old.v, cache: "stale", stale: true, ageMs: Date.now() - old.at, error: e && e.message }; }
      obs.cache(cls, "miss"); throw e;
    } finally { flight.delete(k); }
  })();
  flight.set(k, p);
  return p;
}

module.exports = { cacheFetch, TTL, clear: () => { mem.clear(); flight.clear(); }, size: () => mem.size };
