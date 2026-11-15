// ETF primary-market flow source, keyless issuer data.
//  - State Street (SPDR): daily NAV + shares outstanding history .xlsx per fund (years of history) -> backfills immediately.
//  - iShares: product page (latest shares outstanding + NAV only, no history) -> accumulates one point per trading day.
// Snapshots are stored one document per trading day in pt_av_cache under free/etf/YYYY-MM-DD, shape
// {date, at, items:{TICKER:{so (millions), nav, asOf, aum, src}}} -- what the page's flEtf() reads.
const zlib = require("zlib");
const { cacheGet, cacheGetMany, cacheSet } = require("./_lib");

const UA = { "User-Agent": "portfolio-terminal personal-dashboard" };
const SSGA_FUNDS = ["XLK", "XLC", "XLY", "XLP", "XLV", "XLF", "XLI", "XLE", "XLU", "XLB", "XLRE", "SPY", "XBI"];
const ISHARES = {
  SOXX: "239705/ishares-phlx-semiconductor-etf",
  IBB: "239699/ishares-nasdaq-biotechnology-etf",
  ITA: "239502/ishares-us-aerospace-defense-etf",
};
const KEEP_DAYS = 100; // the page's longest window is 84 calendar days
const MON = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
const pad = (n) => String(n).padStart(2, "0");

// ---- minimal zip + xlsx reader (no dependencies) ----
function unzipEntry(buf, name) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 70000); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("zip_eocd");
  const n = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let k = 0; k < n; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("zip_cd");
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nl = buf.readUInt16LE(p + 28), el = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32);
    const lho = buf.readUInt32LE(p + 42), fname = buf.toString("utf8", p + 46, p + 46 + nl);
    if (fname === name) {
      const lnl = buf.readUInt16LE(lho + 26), lel = buf.readUInt16LE(lho + 28);
      const data = buf.subarray(lho + 30 + lnl + lel, lho + 30 + lnl + lel + csize);
      return method === 0 ? data : zlib.inflateRawSync(data);
    }
    p += 46 + nl + el + cl;
  }
  throw new Error("zip_missing_" + name);
}
const unesc = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");

// -> array of rows, each an array of cell strings (by column index)
function xlsxRows(buf) {
  const sst = unzipEntry(buf, "xl/sharedStrings.xml").toString("utf8");
  const strings = [];
  for (const m of sst.matchAll(/<si>([\s\S]*?)<\/si>/g)) strings.push(unesc([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join("")));
  const sheet = unzipEntry(buf, "xl/worksheets/sheet1.xml").toString("utf8");
  const rows = [];
  for (const rm of sheet.matchAll(/<row [^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];
    for (const cm of rm[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const v = /<v>([\s\S]*?)<\/v>/.exec(cm[3] || "");
      if (!v) continue;
      const col = cm[1].charCodeAt(0) - 65;
      row[col] = /t="s"/.test(cm[2]) ? strings[Number(v[1])] : v[1];
    }
    rows.push(row);
  }
  return rows;
}

// "12-Nov-2026" -> "2026-11-12"
function ssgaDate(s) {
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(String(s || "").trim());
  return m && MON[m[2]] ? `${m[3]}-${pad(MON[m[2]])}-${pad(+m[1])}` : null;
}

// SSGA navhist rows -> [{asOf, nav, so (millions), aum}] newest first, finite positives only
function parseSsga(buf, limit = 130) {
  const out = [];
  for (const r of xlsxRows(buf)) {
    const asOf = ssgaDate(r[0]);
    if (!asOf) continue;
    const nav = Number(r[1]), sh = Number(r[2]), aum = Number(r[3]);
    if (!(nav > 0) || !(sh > 0)) continue;
    out.push({ asOf, nav, so: sh / 1e6, aum: aum > 0 ? aum : sh * nav });
    if (out.length >= limit) break;
  }
  return out;
}

// iShares product page -> {asOf, nav, so (millions)} | null. Values come from the page's own JSON-LD / key facts.
function parseIshares(html) {
  const so = /webqc-datapoint="keyFundFacts-sharesOutstanding">([\d,]+)</.exec(html);
  const sod = /keyFundFacts-sharesOutstanding-asOf">[\s\S]*?([A-Z][a-z]{2}) (\d{1,2}), (\d{4})/.exec(html);
  const nv = /"name":"NAV as of","value":"([\d.]+)"[^]*?"As of Dates","value":"([A-Z][a-z]{2}) (\d{1,2}), (\d{4})"/.exec(html);
  if (!so || !sod || !nv) return null;
  const shares = Number(so[1].replace(/,/g, "")), nav = Number(nv[1]);
  const d1 = `${sod[3]}-${pad(MON[sod[1]] || 0)}-${pad(+sod[2])}`, d2 = `${nv[4]}-${pad(MON[nv[2]] || 0)}-${pad(+nv[3])}`;
  // shares and NAV must refer to the same day, otherwise flow = delta shares x NAV would mix dates
  if (!(shares > 0) || !(nav > 0) || d1 !== d2 || !/^\d{4}-\d{2}-\d{2}$/.test(d1)) return null;
  return { asOf: d1, nav, so: shares / 1e6, aum: shares * nav };
}

async function get(url, binary) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(25000), redirect: "follow" });
  if (!r.ok) throw new Error("http_" + r.status);
  return binary ? Buffer.from(await r.arrayBuffer()) : r.text();
}

// fetch every fund; returns {obs:{TICKER:[{asOf,nav,so,aum,src}]}, failed:[tickers]}
async function fetchAll() {
  const obs = {}, failed = [];
  const jobs = [
    ...SSGA_FUNDS.map((t) => async () => {
      const rows = parseSsga(await get(`https://www.ssga.com/library-content/products/fund-data/etfs/us/navhist-us-en-${t.toLowerCase()}.xlsx`, true));
      if (!rows.length) throw new Error("empty");
      obs[t] = rows.map((r) => ({ ...r, src: "SSGA" }));
    }),
    ...Object.entries(ISHARES).map(([t, path]) => async () => {
      const x = parseIshares(await get("https://www.ishares.com/us/products/" + path));
      if (!x) throw new Error("unparsed");
      obs[t] = [{ ...x, src: "iShares" }];
    }),
  ];
  const tickers = [...SSGA_FUNDS, ...Object.keys(ISHARES)];
  for (let i = 0; i < jobs.length; i += 4) {
    await Promise.all(jobs.slice(i, i + 4).map((j, k) => j().catch(() => failed.push(tickers[i + k]))));
  }
  return { obs, failed };
}

const dayKey = (d) => "free/etf/" + d;
const cutoff = () => new Date(Date.now() - KEEP_DAYS * 864e5).toISOString().slice(0, 10);
function recentDates() {
  const out = [];
  for (let i = 0; i <= KEEP_DAYS; i++) out.push(new Date(Date.now() - i * 864e5).toISOString().slice(0, 10));
  return out;
}

// merge fresh observations into per-day docs; returns docs that changed (pure, testable)
function mergeDocs(existing, obs, nowIso) {
  const byDate = {}; // date -> items
  const from = cutoff();
  for (const [t, rows] of Object.entries(obs)) for (const r of rows) {
    if (r.asOf < from) continue;
    (byDate[r.asOf] = byDate[r.asOf] || {})[t] = { so: r.so, nav: r.nav, asOf: r.asOf, aum: r.aum, src: r.src };
  }
  const changed = [];
  for (const [date, items] of Object.entries(byDate)) {
    const old = existing[date];
    const merged = { ...(old ? old.items : {}), ...items };
    if (old && JSON.stringify(old.items) === JSON.stringify(merged)) continue;
    changed.push({ date, at: nowIso, items: merged });
  }
  return changed.sort((a, b) => (a.date < b.date ? -1 : 1));
}

async function loadDocs() {
  const keys = recentDates().map(dayKey);
  const hit = await cacheGetMany(keys);
  const docs = {};
  for (const [k, v] of Object.entries(hit)) if (v.payload && v.payload.items) docs[k.slice(9)] = v.payload;
  return docs;
}

// the cron / lazy job: fetch all issuers, store changed day docs. Returns a summary (no secrets).
async function runEtf() {
  const { obs, failed } = await fetchAll();
  const existing = await loadDocs();
  const changed = mergeDocs(existing, obs, new Date().toISOString());
  for (let i = 0; i < changed.length; i += 8) await Promise.all(changed.slice(i, i + 8).map((d) => cacheSet(dayKey(d.date), d)));
  await cacheSet("free/etf/last", { at: new Date().toISOString(), failed, written: changed.length });
  return { written: changed.length, failed, funds: Object.keys(obs).length, newest: changed.length ? changed[changed.length - 1].date : null };
}

// lazy refresh on read: only if the newest stored day is stale and nobody started a refresh in the last 30 minutes
async function maybeRefresh(docs) {
  const dates = Object.keys(docs).sort();
  const newest = dates[dates.length - 1] || "";
  const age = newest ? (Date.now() - Date.parse(newest)) / 864e5 : 99;
  if (age <= 3.5) { // weekend + one reporting-day lag is normal
    const last = await cacheGet("free/etf/last");
    if (last && Date.now() - last.fetchedAt < 20 * 36e5) return false;
  }
  const lock = await cacheGet("free/etf/lock");
  if (lock && Date.now() - lock.fetchedAt < 30 * 60 * 1000) return false;
  await cacheSet("free/etf/lock", { at: new Date().toISOString() });
  await runEtf().catch(() => {});
  return true;
}

async function etfCollection() {
  let docs = await loadDocs();
  if (await maybeRefresh(docs)) docs = await loadDocs();
  return Object.keys(docs).sort().map((d) => ({ id: d, data: { date: d, at: docs[d].at, items: docs[d].items } }));
}

module.exports = { runEtf, etfCollection, parseSsga, parseIshares, xlsxRows, mergeDocs, ssgaDate, loadDocs };
