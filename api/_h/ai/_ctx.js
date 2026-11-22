// Shared context assembly for the Premium AI group. Everything here is read server-side from
// the authenticated user's OWN documents (pt_user_state) plus shared cached market docs —
// nothing is taken from the request, and no other user's data is ever reachable.
const { listState } = require("../../_state");
const { cacheGet } = require("../../_lib");
const { newsDocs } = require("../../_news");

const FX_DEF = { usdthb: 34.5, hkdusd: 0.128 };
const cleanTk = (t) => String(t || "").trim().toUpperCase().slice(0, 12);
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

// The public demo has no Supabase rows: the same sample portfolio the browser shows is built here,
// so the AI analyst and the stress test answer about something real instead of refusing.
const DEMO_ROWS = [
  ["NVDA", 60, 186.4, 66.57, "USD", "Semiconductors"], ["AMD", 40, 142.3, 152.0, "USD", "Semiconductors"],
  ["AVGO", 25, 168.5, 128.4, "USD", "Semiconductors"], ["SMH", 30, 245.2, 210.0, "USD", "Semiconductors"],
  ["MSFT", 15, 428.9, 342.5, "USD", "Megacap tech"], ["AAPL", 40, 232.1, 195.4, "USD", "Megacap tech"],
  ["0700.HK", 100, 415.0, 362.0, "HKD", "Megacap tech"], ["TSLA", 18, 214.6, 331.2, "USD", "Electric vehicles"],
  ["JPM", 30, 244.8, 210.1, "USD", "Financials"], ["XOM", 35, 118.4, 108.2, "USD", "Energy"],
  ["PTT.BK", 200, 34.25, 32.1, "THB", "Energy"], ["JNJ", 25, 154.9, 162.3, "USD", "Health Care"],
  ["PEP", 30, 158.2, 142.8, "USD", "Consumer staples"], ["CASH", 12000, 1, 1, "USD", "Cash"],
];
function demoContext() {
  const fx = { usdthb: 34.25, hkdusd: 0.1282 };
  const rows = DEMO_ROWS.map(([tk, qty, px, cost, cur, theme]) => {
    const rate = cur === "THB" ? 1 / fx.usdthb : cur === "HKD" ? fx.hkdusd : 1;
    return { tk, cur, qty, theme, valUsd: +(qty * px * rate).toFixed(2), costUsd: +(qty * cost * rate).toFixed(2), px: px || null };
  });
  for (const r of rows) if (r.tk === "CASH") r.priced = true;
  const invested = rows.filter((r) => r.tk !== "CASH").reduce((s, r) => s + r.valUsd, 0);
  const cash = rows.filter((r) => r.tk === "CASH").reduce((s, r) => s + r.valUsd, 0);
  const total = invested + cash;
  for (const r of rows) r.weightPct = total > 0 ? Math.round((r.valUsd / total) * 1000) / 10 : 0;
  return { rows, invested, cash, total, fx, valDate: null, dispersion: null, demo: true };
}

// The user's own rows: holdings + latest valuation snapshot + weights, all derived one way.
async function userContext(userId) {
  if (userId === "demo") return demoContext();
  const docs = await listState(userId);
  const hDoc = docs.find((d) => d.key === "holdings/all");
  const items = hDoc && hDoc.data && Array.isArray(hDoc.data.items) ? hDoc.data.items : [];
  if (!items.length) return null;
  const fx = { usdthb: num(hDoc.data.usdthb) || FX_DEF.usdthb, hkdusd: num(hDoc.data.hkdusd) || FX_DEF.hkdusd };
  const vh = docs.filter((d) => /^valhist\//.test(d.key) && d.data)
    .map((d) => d.data).sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))[0] || null;
  // live prices first: the saved valuation snapshot may not exist yet (new accounts) or may be days old
  let live = {};
  try {
    const svc = require("../../_fin/service"), tks = [...new Set(items.map((i) => cleanTk(i.tk)).filter((t) => t && t !== "CASH"))].slice(0, 40);
    if (tks.length) live = (await Promise.race([svc.getQuotes(tks), new Promise((_, rej) => setTimeout(() => rej(new Error("quote_timeout")), 7000))])).data || {};
  } catch (e) { /* fall back to the snapshot; unknown prices are reported as unknown below, never replaced by cost */ }
  const px = {};
  if (vh && vh.items) for (const [t, v] of Object.entries(vh.items)) if (v && num(v.px) > 0) px[t] = v;
  const rows = [];
  for (const it of items) {
    const tk = cleanTk(it.tk);
    if (!tk) continue;
    const cur = ["USD", "THB", "HKD"].includes(String(it.cur).toUpperCase()) ? String(it.cur).toUpperCase() : "USD";
    const rate = cur === "THB" ? 1 / fx.usdthb : cur === "HKD" ? fx.hkdusd : 1;
    const qty = Number(it.qty) || 0;
    const cost = it.cost == null || it.cost === "" ? null : Number(it.cost);
    if (tk === "CASH") { rows.push({ tk, cur, theme: "Cash", valUsd: qty * rate, costUsd: qty * rate, qty }); continue; }
    const lq = live[tk] && live[tk].price > 0 ? live[tk] : null, p = (lq && lq.price) || (px[tk] && num(px[tk].px));
    const valUsd = p ? qty * p * rate : 0;   // no price = unknown value (NOT the cost basis: that made weights and P&L wrong)
    rows.push({
      tk, cur, qty, theme: String(it.theme || "").slice(0, 40), priced: !!p, priceSource: lq ? "live quote" : p ? "valuation snapshot" : null, dayPct: lq && Number.isFinite(lq.changePercent) ? Math.round(lq.changePercent * 10000) / 100 : null,
      valUsd: Math.round(valUsd * 100) / 100, costUsd: Number.isFinite(cost) ? Math.round(cost * rate * 100) / 100 : null,
      base: px[tk] && num(px[tk].base), bear: px[tk] && num(px[tk].bear), bull: px[tk] && num(px[tk].bull),
      px,
    });
    rows[rows.length - 1].px = p || null;
  }
  const invested = rows.filter((r) => r.tk !== "CASH").reduce((s, r) => s + r.valUsd, 0);
  const cash = rows.filter((r) => r.tk === "CASH").reduce((s, r) => s + r.valUsd, 0);
  const total = invested + cash;
  for (const r of rows) r.weightPct = total > 0 ? Math.round((r.valUsd / total) * 1000) / 10 : 0;
  return { rows, invested, cash, total, fx, valDate: vh ? vh.date : null, dispersion: vh && vh.disp || null };
}

// Compact, LLM-friendly text block of the snapshot (the model never sees raw user ids).
function portfolioBlock(ctx) {
  const lines = [];
  const partial = ctx.rows.some(r => r.priced === false);
  for (const r of ctx.rows) {
    const costLabel = r.costUsd == null ? "unknown" : "$" + Math.round(r.costUsd).toLocaleString("en-US");
    let s = r.priced === false
      ? `${r.tk} — value unknown (no price available right now; cost basis ${costLabel}), theme ${r.theme || "n/a"}`
      : `${r.tk} — ${r.weightPct}% of ${partial ? "priced holdings and cash" : "portfolio"}, value $${Math.round(r.valUsd).toLocaleString("en-US")} (${r.cur}${r.priceSource ? ", " + r.priceSource : ""}${r.dayPct != null ? `, ${r.dayPct >= 0 ? "+" : ""}${r.dayPct}% today` : ""}), cost basis ${costLabel}, theme ${r.theme || "n/a"}`;
    if (r.base != null) {
      const mos = r.px > 0 && r.base > 0 ? Math.round(((r.base - r.px) / r.base) * 1000) / 10 : null;
      s += `, price used ${r.px}, base-case intrinsic value ${r.base}, margin of safety ${mos != null ? mos + "%" : "n/a"}, range ${r.bear}–${r.bull}`;
    }
    lines.push(s);
  }
  return [
    `${partial ? "Priced subtotal" : "Total portfolio value"}: ~$${Math.round(ctx.total).toLocaleString("en-US")} (invested $${Math.round(ctx.invested).toLocaleString("en-US")}, cash $${Math.round(ctx.cash).toLocaleString("en-US")}).`,
    ctx.demo ? "Simulated sample prices and FX. These figures illustrate the demo portfolio." : partial ? "Some positions have no price right now: their value is unknown and they are left out of the total and the weights." : "All positions are priced from live quotes (or the saved valuation snapshot where noted).",
    ctx.valDate ? `Valuation snapshot date: ${ctx.valDate}.` : "No valuation snapshot saved yet.",
    lines.join("\n"),
  ].join("\n");
}

// Latest shared market docs (already cached by the free endpoints; read-only here).
async function marketBlock() {
  const out = { macro: null, news: [] };
  try {
    const m = await cacheGet("free/meta/macro");
    if (m && m.payload) {
      const last = (a) => (Array.isArray(a) && a.length ? a[a.length - 1] : null);
      out.macro = {
        cpiYoY: last(m.payload.cpiYoY), fedFunds: last(m.payload.fedFunds), tenYear: last(m.payload.tenYear),
        asOf: m.payload.asOf || null,
      };
    }
  } catch (e) { /* macro is optional context */ }
  try {
    const news = await newsDocs(); // shared cached briefing, newest first
    const d = Array.isArray(news) && news[0] && news[0].data;
    if (d) out.news = { date: d.date, macro: d.macro, headlines: (d.items || []).slice(0, 8).map((i) => i.headline) };
  } catch (e) { /* news is optional context */ }
  return out;
}

module.exports = { userContext, portfolioBlock, marketBlock, cleanTk };
