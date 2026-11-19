/* Portfolio Terminal core: data loading and the derived numbers every screen shares.
   Sources (all through the same adapters as the classic terminal, so plans, limits and caching rules still apply):
     prices & history  PT_DATA_SOURCE HISTORY csv (Alpaca / Yahoo, server side)       live quotes  core/live.js
     news              /api/free/collection/news?lang=  (RSS headlines, summarised by an AI model, translated per language)
     analysts, ticker headlines, earnings dates   /api/free/street
   Data that is the same for everyone (news, macro, sector table, analyst view) is kept in the browser cache with a
   time-to-live, so a repeat visit paints instantly and the network is only asked when something is stale.
   When no one is signed in the same shapes are filled from a built-in sample portfolio (no network). */
import { swr, cacheGet } from "./cache.js";
import { isDemo, loadHoldings, me as getMe } from "./store.js";
import { t } from "./i18n.js";
import { hash, rng, mean, stdev, sum } from "./util.js";
import { nextReport } from "./calendar.js";

export const D = {
  holdings: { items: [] }, fx: { usdthb: 34.5, hkdusd: 0.128 }, series: {}, bench: { sp: [], nq: [] }, stats: {}, risk: {},
  quotes: {}, news: [], newsAt: 0, macro: null, fgi: null, vix: null, sectors: [], street: {}, tnews: {}, earnings: {}, val: {},
  me: null, loaded: {}, errors: {}, session: "closed",
};
const bus = new EventTarget();
export const onData = (fn) => { const h = (e) => fn(e.detail); bus.addEventListener("data", h); return () => bus.removeEventListener("data", h); };
export const emit = (what) => bus.dispatchEvent(new CustomEvent("data", { detail: what }));

const today = () => new Date().toISOString().slice(0, 10);
export const symOf = (h) => (typeof window.PT_QUOTE_SYM === "function" ? window.PT_QUOTE_SYM(h) : String(h.tk).toUpperCase());
export const isCash = (h) => h.tk === "CASH";
export const rateOf = (cur) => (cur === "THB" ? 1 / D.fx.usdthb : cur === "HKD" ? D.fx.hkdusd : 1);

/* ---------- csv -> series ---------- */
export function parseGroups(text) {
  const lines = String(text || "").split("\n"), head = (lines[0] || "").split(","), row1 = (lines[1] || "").split(","), out = {};
  const cols = lines.slice(2).map((l) => l.split(","));
  for (let j = 0; j < head.length; j++) {
    const m = /^D\|(.+)$/.exec(head[j]); if (!m) continue;
    const pts = [];
    for (const c of cols) { const d = parseFloat(c[j]), v = parseFloat(c[j + 1]); if (Number.isFinite(d) && Number.isFinite(v) && v > 0) pts.push([(Math.floor(d) - 25569) * 864e5, v]); }
    const li = head.indexOf("LIVE|" + m[1]), live = li >= 0 ? parseFloat(row1[li]) : NaN;
    out[m[1]] = { pts, live: Number.isFinite(live) ? live : null };
  }
  return out;
}
function statsOf(pts) {
  const n = pts.length; if (n < 2) return null;
  const px = pts[n - 1][1], at = (b) => (n - 1 - b >= 0 ? pts[n - 1 - b][1] : null), rel = (b) => (b ? px / b - 1 : null);
  const yr = new Date(pts[n - 1][0]).getUTCFullYear(); let prevYear = null;
  for (let i = n - 1; i >= 0; i--) if (new Date(pts[i][0]).getUTCFullYear() < yr) { prevYear = pts[i][1]; break; }
  let hi = 0, lo = Infinity; for (let i = Math.max(0, n - 252); i < n; i++) { if (pts[i][1] > hi) hi = pts[i][1]; if (pts[i][1] < lo) lo = pts[i][1]; }
  return { px, prev: at(1), day: rel(at(1)), w1: rel(at(5)), m1: rel(at(21)), m3: rel(at(63)), y1: rel(at(252)), ytd: rel(prevYear), hi52: hi, lo52: lo, from52: hi ? px / hi - 1 : null, asOf: pts[n - 1][0] };
}
function dailyReturns(pts, n = 252) { const a = pts.slice(-n - 1), r = []; for (let i = 1; i < a.length; i++) r.push(a[i][1] / a[i - 1][1] - 1); return r; }
function riskOf(pts, spyR) {
  const r = dailyReturns(pts), m = spyR.slice(-r.length), k = Math.min(r.length, m.length);
  if (k < 40) return null;
  const a = r.slice(-k), b = m.slice(-k), mb = mean(b), ma = mean(a);
  let cov = 0, vb = 0; for (let i = 0; i < k; i++) { cov += (a[i] - ma) * (b[i] - mb); vb += (b[i] - mb) ** 2; }
  const beta = vb ? cov / vb : 1, vol = stdev(a) * Math.sqrt(252), resid = a.map((x, i) => x - ma - beta * (b[i] - mb)), idio = stdev(resid) * Math.sqrt(252);
  return { vol, beta: Math.max(0, Math.min(3, beta)), idio, mom: pts.length > 260 ? pts[pts.length - 22][1] / pts[pts.length - 253][1] - 1 : null };
}

/* ---------- derived portfolio numbers ---------- */
export function positions() {
  const rows = [];
  for (const h of D.holdings.items) {
    const r = rateOf(h.cur);
    if (isCash(h)) { rows.push({ tk: "CASH", cash: true, cur: h.cur, theme: h.theme || "Cash", acct: h.acct, qty: h.qty, px: 1, valueUsd: h.qty * r, costUsd: h.qty * r, pnlUsd: 0, pnlPct: 0, dayUsd: 0, dayPct: 0 }); continue; }
    const st = D.stats[h.tk], q = D.quotes[h.tk];
    const px = (q && q.px) || (st && st.px) || h.px || (h.qty ? h.cost / h.qty : 0);
    const prev = (q && q.prev) || (st && st.prev) || px;
    const valueUsd = h.qty * px * r, costUsd = (h.cost || 0) * r;
    rows.push({ tk: h.tk, cur: h.cur, theme: h.theme || "", acct: h.acct, qty: h.qty, px, prev, valueUsd, costUsd, pnlUsd: valueUsd - costUsd, pnlPct: costUsd ? valueUsd / costUsd - 1 : null, dayUsd: h.qty * (px - prev) * r, dayPct: prev ? px / prev - 1 : 0, st, live: !!q, sym: symOf(h) });
  }
  const total = sum(rows, (x) => x.valueUsd) || 1;
  rows.forEach((x) => { x.weight = x.valueUsd / total; });
  return rows;
}
export function totals(rows = positions()) {
  const value = sum(rows, (x) => x.valueUsd), cost = sum(rows, (x) => x.costUsd), day = sum(rows, (x) => x.dayUsd);
  const inv = rows.filter((x) => !x.cash);
  return { value, cost, pnl: value - cost, pnlPct: cost ? value / cost - 1 : null, day, dayPct: value - day ? day / (value - day) : 0, cash: sum(rows.filter((x) => x.cash), (x) => x.valueUsd), count: inv.length };
}
/* what the current holdings would have been worth on each past day (a "same positions" look-back) */
export function portfolioSeries(rows = positions()) {
  const inv = rows.filter((x) => !x.cash && D.series[x.tk] && D.series[x.tk].length > 1);
  if (!inv.length) return [];
  const base = inv.reduce((a, b) => (D.series[b.tk].length > D.series[a.tk].length ? b : a));
  const cash = sum(rows.filter((x) => x.cash), (x) => x.valueUsd), noHist = sum(rows.filter((x) => !x.cash && !(D.series[x.tk] && D.series[x.tk].length > 1)), (x) => x.valueUsd);
  const idx = Object.fromEntries(inv.map((x) => [x.tk, 0]));
  const out = [];
  for (const [ms] of D.series[base.tk]) {
    let v = cash + noHist;
    for (const x of inv) { const s = D.series[x.tk]; while (idx[x.tk] + 1 < s.length && s[idx[x.tk] + 1][0] <= ms) idx[x.tk]++; if (s[idx[x.tk]][0] <= ms + 864e5 * 4) v += x.qty * s[idx[x.tk]][1] * rateOf(x.cur); }
    out.push([ms, v]);
  }
  return out;
}

/* ---------- loading ---------- */
async function csv(key) { try { return await window.PT_DATA_SOURCE.fetchCsv(key); } catch (e) { D.errors[key] = e && (e.code || e.message) || "error"; return null; } }
const EXTRA = new Set();
function rebuildSeries(text) {
  const g = parseGroups(text), items = D.holdings.items.filter((h) => !isCash(h));
  D.series = {}; D.stats = {}; D.risk = {};
  const spy = g["INDEXSP:.INX"] ? g["INDEXSP:.INX"].pts : [];
  const spyR = dailyReturns(spy);
  for (const h of items) { const s = g[symOf(h)]; if (s && s.pts.length > 1) { D.series[h.tk] = s.pts; D.stats[h.tk] = statsOf(s.pts); const rk = riskOf(s.pts, spyR); if (rk) D.risk[h.tk] = rk; } }
  D.bench.sp = spy; D.bench.nq = g["INDEXNASDAQ:.IXIC"] ? g["INDEXNASDAQ:.IXIC"].pts : [];
  D.benchRisk = { vol: spyR.length ? stdev(spyR) * Math.sqrt(252) : 0.16 };
}
export async function loadHistory(force) {
  D.holdings = loadHoldings();
  const items = D.holdings.items.filter((h) => !isCash(h));
  if (!items.length) { D.series = {}; D.stats = {}; D.loaded.history = true; emit("history"); return; }
  const sig = (isDemo() ? "dl:" : "r:") + items.map((h) => symOf(h) + h.qty).sort().join(",");
  const text = await swr("hist:" + sig, force ? 0 : 10 * 6e4, () => csv("HISTORY"), (v) => { if (v && !D.loaded.history) { rebuildSeries(v); D.loaded.history = true; emit("history"); } });
  if (text) { rebuildSeries(text); D.loaded.history = true; emit("history"); }
}
async function loadFx() {
  const hd = D.holdings;
  if (hd.usdthb > 0) D.fx.usdthb = hd.usdthb; if (hd.hkdusd > 0) D.fx.hkdusd = hd.hkdusd;
  if (isDemo()) { try { const x = window.PT_DEMO.extras(); if (x.fx) { D.fx.usdthb = x.fx.usdthb; D.fx.hkdusd = x.fx.hkdusd; } } catch (e) { /* defaults */ } return; }
  try {
    const v = await swr("fx", 6 * 36e5, async () => { const r = await window.PT_AUTH.fetch("/api/free/extras", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbols: [] }) }); return r.ok ? (await r.json()).fx : null; });
    if (v && v.usdthb > 0) { D.fx.usdthb = v.usdthb; D.fx.hkdusd = v.hkdusd || D.fx.hkdusd; D.fx.asOf = v.asOf; }
  } catch (e) { /* keep defaults */ }
}

/* ----- news ----- */
const IMPACT = { bullish: "bullish", bearish: "bearish", mixed: "mixed" };
function normNews(docs) {
  const out = [];
  for (const d of (docs || []).slice(0, 2)) for (const it of (d.data && d.data.items) || []) {
    out.push({ headline: it.headline, orig: it.orig || null, url: /^https?:/i.test(it.url || "") ? it.url : "", source: it.source || "", summary: it.summary || "", why: it.why || "", bull: it.bull || "", bear: it.bear || "", impact: IMPACT[String(it.impact || "").toLowerCase()] || "mixed", tickers: it.tickers || [], date: d.id });
  }
  const seen = new Set(); return out.filter((x) => { const k = x.headline.toLowerCase().slice(0, 50); if (seen.has(k)) return false; seen.add(k); return true; });
}
function demoNews() {
  const mk = (h, s, w, imp, tk, minsAgo) => ({ headline: h, orig: null, url: "", source: t("Market Desk"), summary: s, why: w, bull: "", bear: "", impact: imp, tickers: tk, date: today(), at: Date.now() - minsAgo * 6e4 });
  return [
    mk(t("Chipmakers extend rally as datacenter demand keeps climbing"), t("Leading chip stocks rose for a third straight session on strong orders for AI servers."), t("Chips are your biggest group, so this lifts your portfolio the most."), "bullish", ["NVDA", "AMD", "AVGO", "SMH"], 24),
    mk(t("Rate-cut hopes build after cooler inflation data"), t("Consumer prices rose less than expected, which makes lower interest rates more likely next year."), t("Lower rates usually help growth stocks and the whole market."), "bullish", ["MSFT", "AAPL"], 55),
    mk(t("EV maker slips as deliveries miss forecasts"), t("Quarterly deliveries came in below what analysts expected, and the stock fell."), t("This is your deepest losing position, so it matters for your total."), "bearish", ["TSLA"], 95),
    mk(t("Defensive stocks lag as investors favour growth"), t("Staples and healthcare names trailed the market while tech led."), t("Your safer holdings are small, so they cushion little on a down day."), "mixed", ["JNJ", "PEP"], 140),
    mk(t("Oil steadies as traders weigh supply outlook"), t("Crude held a narrow range as supply worries balanced slower demand."), t("Energy is a small part of your portfolio."), "mixed", ["XOM", "PTT.BK"], 210),
    mk(t("Big banks report steady lending but rising loan losses"), t("Large lenders beat profit forecasts, though they set aside more for bad loans."), t("Banks are a medium-size slice of your portfolio."), "mixed", ["JPM"], 300),
    mk(t("Hong Kong tech rebounds on stimulus hopes"), t("Large internet names rallied after new support measures were hinted at."), t("Your Hong Kong holding tends to move on China policy news."), "bullish", ["0700.HK"], 380),
  ];
}
export async function loadNews(lang = "en", force) {
  const get = (l) => swr("news:" + l, force ? 0 : 5 * 6e4, async () => { const r = await fetch(`${location.origin}/api/free/collection/news?lang=${encodeURIComponent(l)}`); return r.ok ? r.json() : null; }, (v) => Array.isArray(v) && apply(v));
  const apply = (docs) => { const n = normNews(docs); if (n.length) { D.news = n; D.newsAt = Date.now(); D.macroLine = docs[0].data.macro || ""; D.loaded.news = true; emit("news"); } };
  try {
    /* a language's first translation can take ~20 s on the server: show the English briefing straight away, swap when ready */
    if (lang !== "en" && !(await cacheGet("news:" + lang, 5 * 6e4))) { D.newsBusy = true; get("en").catch(() => {}); }
    await get(lang); D.newsBusy = false;
  } catch (e) { D.errors.news = "x"; D.newsBusy = false; }
  if (!D.news.length && isDemo()) { D.news = demoNews(); D.newsAt = Date.now(); D.macroLine = t("Stocks are firmer, bond yields are easing and investors are leaning towards risk."); D.loaded.news = true; emit("news"); }
}

/* ----- macro, mood, volatility, sectors (market-wide, cached) ----- */
const lastTwo = (a) => (Array.isArray(a) && a.length ? { v: a[a.length - 1][1], prev: a.length > 1 ? a[a.length - 2][1] : null, date: a[a.length - 1][0] } : null);
export async function loadMarket() {
  const ds = window.PT_DATA_SOURCE;
  const doc = (p, ttl) => swr("doc:" + (isDemo() ? "dl:" : "r:") + p, ttl, () => ds.getDoc(p)).catch(() => null);
  const [m, f, vol, rot] = await Promise.all([doc("meta/macro", 6 * 36e5), doc("meta/fgi", 3 * 36e5), swr("csv:" + (isDemo() ? "dl:" : "r:") + "VOL", 6 * 36e5, () => csv("VOLATILITY")).catch(() => null), swr("csv:" + (isDemo() ? "dl:" : "r:") + "ROT", 36e5, () => csv("ROTATION")).catch(() => null)]);
  if (m) D.macro = { cpi: lastTwo(m.cpiYoY), fed: lastTwo(m.fedFunds), ten: lastTwo(m.tenYear) };
  if (f && f.fgi) D.fgi = { score: f.fgi.score, prev: f.fgi.prevClose, w1: f.fgi.prev1w, m1: f.fgi.prev1m };
  if (vol) {
    const row = vol.split("\n").find((l) => l.startsWith("VIX,")); if (row) { const pts = (row.split(",")[2] || "").split(";").filter(Boolean).map((x) => parseFloat(x.split(":")[1])).filter(Number.isFinite); if (pts.length > 1) D.vix = { v: pts[pts.length - 1], prev: pts[pts.length - 2] }; }
  }
  if (rot) {
    const g = parseGroups(rot), spy = g.SPY && statsOf(g.SPY.pts), out = [];
    for (const [sym, v] of Object.entries(g)) { if (sym === "SPY" || sym === "RSP" || v.pts.length < 30) continue; const s = statsOf(v.pts); if (s) out.push({ sym, ...s, rel1m: spy && s.m1 != null && spy.m1 != null ? s.m1 - spy.m1 : null, rel3m: spy && s.m3 != null && spy.m3 != null ? s.m3 - spy.m3 : null, spark: v.pts.slice(-60).map((p) => p[1]) }); }
    D.sectors = out.sort((a, b) => (b.rel1m || 0) - (a.rel1m || 0)); D.spy = spy;
  }
  D.loaded.market = true; emit("market");
}

/* ----- analysts, ticker headlines, earnings ----- */
function demoStreet(rows) {
  const st = {}, news = {}, earn = {};
  for (const r of rows) {
    if (r.cash) continue;
    const rnd = rng(hash("street:" + r.tk)), up = (r.tk === "TSLA" ? -0.05 : r.tk === "NVDA" ? 0.22 : r.tk === "JNJ" || r.tk === "PEP" ? 0.12 : -0.04) + (rnd() - 0.35) * 0.3, n = 18 + Math.floor(rnd() * 24);
    const mean = r.px * (1 + up), lo = mean * (0.72 + rnd() * 0.08), hi = mean * (1.18 + rnd() * 0.15);
    const bias = clamp01(0.55 + up * 1.4), sb = Math.round(n * bias * 0.45), b = Math.round(n * bias * 0.5), s = Math.round(n * (1 - bias) * 0.18), ss = Math.round(n * (1 - bias) * 0.07), h = Math.max(0, n - sb - b - s - ss);
    st[r.tk] = { name: null, pt: { mean, median: mean * (0.99 + rnd() * 0.02), high: hi, low: lo }, rating: { sb, b, h, s, ss, n: sb + b + h + s + ss }, src: [], asOf: today() };
    const tone = clampN(up * 2.2 + (rnd() - 0.5) * 0.4, -0.9, 0.9);
    news[r.tk] = { tone, items: [] };
    /* the company's real reporting slot, anchored to the demo clock; never a random day */
    const anchor = (window.PT_DEMO && window.PT_DEMO.DEMO_DATE) || today();
    const rep = nextReport(r.tk, anchor);
    if (rep) earn[r.tk] = { date: rep, eps: null };
  }
  return { street: st, news, earnings: earn };
}
const clamp01 = (x) => Math.max(0.1, Math.min(0.92, x)), clampN = (x, a, b) => Math.max(a, Math.min(b, x));
export async function loadStreet() {
  const rows = positions().filter((r) => !r.cash);
  if (!rows.length) return;
  if (isDemo()) {
    try { const r = await fetch(`${location.origin}/api/free/demo?k=street`); if (!r.ok) throw 0; const j = await r.json(); Object.assign(D.street, j.street || {}); Object.assign(D.tnews, j.news || {}); Object.assign(D.earnings, j.earnings || {}); D.loaded.street = true; emit("street"); return; }
    catch (e) { const d = demoStreet(rows); Object.assign(D.street, d.street); Object.assign(D.tnews, d.news); Object.assign(D.earnings, d.earnings); D.loaded.street = true; emit("street"); return; }
  }
  const syms = rows.map((r) => r.tk).filter((s) => /^[A-Z][A-Z\-]{0,5}$/.test(s)).slice(0, 25);
  if (!syms.length) return;
  const apply = (j) => { if (!j) return; Object.assign(D.street, j.street || {}); Object.assign(D.tnews, j.news || {}); Object.assign(D.earnings, j.earnings || {}); D.loaded.street = true; emit("street"); };
  try { await swr("street:" + syms.sort().join(","), 3 * 36e5, async () => { const r = await window.PT_AUTH.fetch("/api/free/street", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbols: syms }) }); return r.ok ? r.json() : null; }, apply); } catch (e) { D.errors.street = "x"; }
}
/* the saved valuation snapshot (written by the classic terminal's valuation tab), if there is one */
export function loadValuation() {
  try {
    const pre = (isDemo() ? "ptpub.v1.demo." : "ptpub.v1.") + "db.valhist/"; let best = null;
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(pre)) { const v = JSON.parse(localStorage.getItem(k)); if (v && v.items && (!best || String(v.date) > String(best.date))) best = v; } }
    if (best) D.val = Object.fromEntries(Object.entries(best.items).filter(([, v]) => v && v.base > 0).map(([k, v]) => [k, { base: v.base, bear: v.bear, bull: v.bull, px: v.px, date: best.date }]));
  } catch (e) { /* none */ }
}

export async function init(lang) {
  if (isDemo() && window.PT_DEMO && window.PT_DEMO._today) window.PT_DEMO._today(today());
  D.holdings = loadHoldings();
  D.me = await getMe().catch(() => null);
  await loadFx();
  loadValuation();
  const first = loadHistory().then(() => { loadFx(); });
  loadMarket(); loadNews(lang);
  await first;
  loadStreet();
}
export const fresh = () => ({ at: D.newsAt });
