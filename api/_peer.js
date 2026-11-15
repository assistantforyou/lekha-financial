// Free-tier PEER dataset: trailing diluted EPS (SEC XBRL), latest close (cached breadth chunks) and market cap for the S&P 500.
// Built incrementally: each request refreshes at most a few stale chunks of the universe, so a page load never means 500 SEC fetches.
const { cacheGetMany, cacheSet } = require("./_lib");
const { companyFacts, cikOf } = require("./_edgar");
const { epsTtm, sharesOutstanding, peerCsv } = require("./_fundamentals");
const SP500 = require("./_data/sp500.json").stocks;

const CHUNK = 20;                     // companies per cached chunk
const TTL = 3 * 24 * 36e5;            // EPS changes quarterly; refresh a chunk every 3 days
const COOLDOWN = 15 * 6e4;            // after a failed chunk, wait before retrying it
const PER_REQUEST = 2;                // stale chunks refreshed per request (<= 40 SEC fetches)
const BR_CHUNKS = Math.ceil(SP500.length / 25);

const chunks = [];
for (let i = 0; i < SP500.length; i += CHUNK) chunks.push(SP500.slice(i, i + CHUNK));

async function refreshChunk(i) {
  const out = [];
  const list = chunks[i];
  for (let k = 0; k < list.length; k += 4) {
    await Promise.all(list.slice(k, k + 4).map(async ([tk]) => {
      try {
        const f = await companyFacts(cikOf(tk));
        const e = f ? epsTtm(f.facts) : null;
        out.push([tk, e ? e.eps : null, f ? sharesOutstanding(f.facts) : null]);
      } catch (e) { /* leave this ticker out; the chunk is retried after the cooldown if it came back empty */ }
    }));
  }
  if (out.length < list.length * 0.6) throw new Error("chunk_incomplete");
  return out;
}

async function peerHandler(res) {
  res.setHeader("Cache-Control", "no-store");
  const keys = chunks.map((_, i) => "free/pe/" + i);
  const brKeys = Array.from({ length: BR_CHUNKS }, (_, i) => "free/br/" + i);
  const have = await cacheGetMany([...keys, ...keys.map((k) => "fail/" + k), ...brKeys]);
  const now = Date.now();
  const stale = chunks.map((_, i) => i).filter((i) => {
    const h = have["free/pe/" + i], f = have["fail/free/pe/" + i];
    if (h && now - h.fetchedAt < TTL) return false;
    if (f && now - f.fetchedAt < COOLDOWN) return false;
    return true;
  }).slice(0, PER_REQUEST);
  for (const i of stale) {
    try { const rows = await refreshChunk(i); await cacheSet("free/pe/" + i, rows); have["free/pe/" + i] = { payload: rows, fetchedAt: Date.now() }; }
    catch (e) { await cacheSet("fail/free/pe/" + i, { failed: true }); }
  }
  const px = {};
  for (const k of brKeys) if (have[k]) for (const r of have[k].payload) px[r[0]] = r[3];
  const sector = Object.fromEntries(SP500);
  const rows = [], seenCik = new Map();
  for (const i in chunks) {
    const h = have["free/pe/" + i];
    if (!h) continue;
    for (const [tk, eps, sh] of h.payload) {
      const price = px[tk] != null ? px[tk] : null;
      // share classes of one company must carry the same market cap so the page can de-duplicate them: use the first class's price
      const cik = cikOf(tk);
      if (!seenCik.has(cik)) seenCik.set(cik, price);
      const base = seenCik.get(cik);
      rows.push({ t: tk, sector: sector[tk], eps, price, mcap: sh && base ? sh * base : null });
    }
  }
  if (rows.length < 400 || rows.filter((r) => r.price != null).length < 400) return res.status(204).end(); // the page needs a near-complete universe
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  return res.status(200).send(peerCsv(rows, new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC"));
}

module.exports = { peerHandler };
