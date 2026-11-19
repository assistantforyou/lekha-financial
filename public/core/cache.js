/* Portfolio Terminal core: a small browser cache (IndexedDB, with a memory fallback) for data that is the same
   for everybody or changes slowly (company facts, analyst views, news, macro). Each entry has a time-to-live;
   swr() hands back what is stored straight away (even if stale) and refreshes in the background, so screens paint
   instantly and the network is only asked when something is actually old. */
const mem = new Map();
let dbp = null;
function db() {
  if (dbp) return dbp;
  dbp = new Promise((res) => {
    try {
      const rq = indexedDB.open("pt-core", 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore("kv");
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => res(null);
    } catch (e) { res(null); }
  });
  return dbp;
}
async function idbGet(k) { const d = await db(); if (!d) return mem.get(k); return new Promise((r) => { try { const q = d.transaction("kv").objectStore("kv").get(k); q.onsuccess = () => r(q.result); q.onerror = () => r(undefined); } catch (e) { r(undefined); } }); }
async function idbSet(k, v) { mem.set(k, v); const d = await db(); if (!d) return; try { d.transaction("kv", "readwrite").objectStore("kv").put(v, k); } catch (e) { /* quota */ } }
export async function cacheGet(key, ttlMs) { const e = await idbGet(key); return e && (ttlMs == null || Date.now() - e.at < ttlMs) ? e.v : undefined; }
export async function cacheStale(key) { const e = await idbGet(key); return e ? { v: e.v, at: e.at } : null; }
export const cacheSet = (key, v) => idbSet(key, { v, at: Date.now() });
export async function cacheDel(key) { mem.delete(key); const d = await db(); if (d) try { d.transaction("kv", "readwrite").objectStore("kv").delete(key); } catch (e) { /* ignore */ } }
/* stale-while-revalidate: onData(value, {stale}) may be called twice (cached, then fresh). Resolves with the best value. */
export async function swr(key, ttlMs, fetcher, onData) {
  const hit = await cacheStale(key);
  const fresh = hit && Date.now() - hit.at < ttlMs;
  if (hit && onData) onData(hit.v, { stale: !fresh });
  if (fresh) return hit.v;
  try { const v = await fetcher(); if (v != null) { await cacheSet(key, v); if (onData) onData(v, { stale: false }); return v; } } catch (e) { if (!hit) throw e; }
  return hit ? hit.v : null;
}
