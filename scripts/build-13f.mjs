#!/usr/bin/env node
// Quarterly 13F holder breadth for S&P 500 sectors, from SEC's Form 13F data sets (free, ~100 MB zip per quarter).
// Too large for a 60-second serverless function, so run it on any machine (home server cron, laptop) after each
// SEC release (published after the end of Feb, May, Aug and Nov):
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/build-13f.mjs
//
// Steps: download the two latest data sets -> count distinct 13F filers holding each CUSIP (common shares, no options,
// original 13F-HR reports only, one report per filer and quarter) -> map CUSIPs to tickers with OpenFIGI (free, keyless)
// -> per S&P 500 stock, change in holder count quarter over quarter, minus the cross-sectional median
// -> sector = median of its stocks -> upload doc to pt_av_cache key free/meta/f13 (served as meta/f13).
import { execFileSync, spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const UA = process.env.SEC_USER_AGENT || "PortfolioTerminal assistantforyou999@gmail.com";
const WORK = process.env.F13_DIR || join(process.env.TMPDIR || "/tmp", "pt-13f");
const SP = JSON.parse(readFileSync(join(ROOT, "api/_data/sp500.json"), "utf8")).stocks; // [[ticker, GICS sector]]
const SECTOR = Object.fromEntries(SP);
const KEY = { "Information Technology": "Tech", "Communication Services": "Comm", "Consumer Discretionary": "Disc", "Consumer Staples": "Stap", "Health Care": "Hlth", Financials: "Fin", Industrials: "Ind", Energy: "Ener", Utilities: "Util", Materials: "Mat", "Real Estate": "RE" };
const MIN_HOLDERS = 300; // CUSIPs below this are not large caps; skip mapping them
mkdirSync(WORK, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const median = (a) => { const s = [...a].sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };

async function latestZips() {
  const html = await (await fetch("https://www.sec.gov/data-research/sec-markets-data/form-13f-data-sets", { headers: { "User-Agent": UA } })).text();
  const links = [...html.matchAll(/href="([^"]*form13f\.zip)"/g)].map((m) => m[1]);
  return [...new Set(links)].slice(0, 2).map((p) => (p.startsWith("http") ? p : "https://www.sec.gov" + p));
}

function download(url) {
  const file = join(WORK, url.split("/").pop());
  if (!existsSync(file)) { console.log("downloading", url); execFileSync("curl", ["-sfL", "-A", UA, "-o", file, url]); }
  return file;
}

function lines(zip, member, onRow) {
  return new Promise((resolve, reject) => {
    const p = spawn("unzip", ["-p", zip, member]);
    const rl = createInterface({ input: p.stdout });
    let head = null;
    rl.on("line", (l) => { const c = l.split("\t"); if (!head) { head = Object.fromEntries(c.map((h, i) => [h, i])); return; } onRow(c, head); });
    rl.on("close", resolve); p.on("error", reject);
  });
}

// holder counts per CUSIP for one quarter's data set
async function quarter(zip) {
  const amend = new Set();
  await lines(zip, "COVERPAGE.tsv", (c, h) => { if (c[h.ISAMENDMENT] === "Y") amend.add(c[h.ACCESSION_NUMBER]); });
  const subs = [];
  await lines(zip, "SUBMISSION.tsv", (c, h) => { if (c[h.SUBMISSIONTYPE] === "13F-HR" && !amend.has(c[h.ACCESSION_NUMBER])) subs.push({ acc: c[h.ACCESSION_NUMBER], cik: c[h.CIK], period: c[h.PERIODOFREPORT], filed: c[h.FILING_DATE] }); });
  const periods = {};
  for (const s of subs) periods[s.period] = (periods[s.period] || 0) + 1;
  const period = Object.entries(periods).sort((a, b) => b[1] - a[1])[0][0];
  const byCik = new Map();
  for (const s of subs) if (s.period === period) { const p = byCik.get(s.cik); if (!p || Date.parse(s.filed) > Date.parse(p.filed)) byCik.set(s.cik, s); }
  const keep = new Set([...byCik.values()].map((s) => s.acc));
  const count = new Map(), names = new Map();
  let cur = null, seen = new Set();
  await lines(zip, "INFOTABLE.tsv", (c, h) => {
    const acc = c[h.ACCESSION_NUMBER];
    if (!keep.has(acc) || c[h.PUTCALL] || c[h.SSHPRNAMTTYPE] !== "SH") return;
    if (acc !== cur) { cur = acc; seen = new Set(); }
    const cusip = (c[h.CUSIP] || "").toUpperCase();
    if (cusip.length !== 9 || seen.has(cusip)) return;
    seen.add(cusip);
    count.set(cusip, (count.get(cusip) || 0) + 1);
    if (!names.has(cusip)) names.set(cusip, c[h.NAMEOFISSUER]);
  });
  console.log("period", period, "filers", keep.size, "cusips", count.size);
  return { period, filers: keep.size, count, names };
}

// CUSIP -> US ticker via OpenFIGI (keyless: 25 requests/minute, 10 ids per request); cached on disk
async function mapCusips(cusips) {
  const file = join(WORK, "figi.json");
  const map = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  const todo = cusips.filter((c) => !(c in map));
  console.log("OpenFIGI lookups", todo.length);
  for (let i = 0; i < todo.length; i += 10) {
    const batch = todo.slice(i, i + 10);
    let r;
    try { r = await fetch("https://api.openfigi.com/v3/mapping", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(batch.map((c) => ({ idType: "ID_CUSIP", idValue: c, exchCode: "US" }))) }); }
    catch (e) { await sleep(5000); i -= 10; continue; } // network blip: retry this batch
    if (r.status === 429) { await sleep(61000); i -= 10; continue; }
    const j = await r.json();
    batch.forEach((c, k) => { const d = j[k] && j[k].data && j[k].data[0]; map[c] = d ? d.ticker.replace("/", ".") : null; });
    writeFileSync(file, JSON.stringify(map));
    await sleep(2500);
  }
  return map;
}

const qLabel = (p) => { const d = new Date(p.replace(/(\d+)-([A-Z]{3})-(\d+)/, "$2 $1 $3")); return d.getUTCFullYear() + "Q" + (Math.floor(d.getUTCMonth() / 3) + 1); };

async function main() {
  const [newZip, oldZip] = (await latestZips()).map(download);
  const A = await quarter(newZip), B = await quarter(oldZip);
  const big = [...A.count.entries()].filter(([, n]) => n >= MIN_HOLDERS).map(([c]) => c);
  const figi = await mapCusips(big);
  // ticker -> CUSIP with the most holders (picks the primary share class)
  const best = {};
  for (const c of big) { const t = figi[c]; if (!t || !SECTOR[t]) continue; if (!best[t] || A.count.get(c) > A.count.get(best[t])) best[t] = c; }
  const chg = {};
  for (const [t, c] of Object.entries(best)) { const n1 = A.count.get(c), n0 = B.count.get(c); if (n0 >= 50 && n1) chg[t] = n1 / n0 - 1; }
  // filer counts rise every quarter (new filers): demean so the sector numbers are relative
  const med = median(Object.values(chg));
  const one = {}, members = {};
  for (const [t, v] of Object.entries(chg)) { const k = KEY[SECTOR[t]]; if (!k) continue; (members[k] || (members[k] = [])).push(v - med); }
  for (const [k, a] of Object.entries(members)) one[k] = Math.round(median(a) * 1e5) / 1e5;
  const flags = [];
  const missing = SP.filter(([t]) => !best[t]).map(([t]) => t);
  if (missing.length) flags.push(`${missing.length} S&P 500 tickers had no matching CUSIP with ${MIN_HOLDERS}+ holders.`);
  const doc = {
    latest: { q: qLabel(A.period), prev: qLabel(B.period), known: Object.keys(chg).length, one, median: med, filers: [A.filers, B.filers] },
    sample: Object.keys(chg).sort(), flags, backtest: null,
    src: "SEC Form 13F data sets; CUSIPs mapped with OpenFIGI", builtAt: new Date().toISOString(),
  };
  console.log(JSON.stringify(doc.latest, null, 1));
  const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = process.env;
  if (!url || !key) { writeFileSync(join(WORK, "f13.json"), JSON.stringify(doc)); console.log("no Supabase env: wrote", join(WORK, "f13.json")); return; }
  const r = await fetch(`${url}/rest/v1/pt_av_cache`, { method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ key: "free/meta/f13", payload: doc, fetched_at: new Date().toISOString() }) });
  console.log("upload", r.status);
}

main().catch((e) => { console.error(e); process.exit(1); });
