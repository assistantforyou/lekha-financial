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
  const px = {};
  if (vh && vh.items) for (const [t, v] of Object.entries(vh.items)) if (v && num(v.px) > 0) px[t] = v;
  const rows = [];
  for (const it of items) {
    const tk = cleanTk(it.tk);
    if (!tk) continue;
    const cur = ["USD", "THB", "HKD"].includes(String(it.cur).toUpperCase()) ? String(it.cur).toUpperCase() : "USD";
    const rate = cur === "THB" ? 1 / fx.usdthb : cur === "HKD" ? fx.hkdusd : 1;
    const qty = Number(it.qty) || 0;
    const cost = Number(it.cost) || 0;
    if (tk === "CASH") { rows.push({ tk, cur, theme: "Cash", valUsd: qty * rate, costUsd: qty * rate, qty }); continue; }
    const p = px[tk] && num(px[tk].px);
    const valUsd = p ? qty * p * rate : cost ? cost * rate : 0;
    rows.push({
      tk, cur, qty, theme: String(it.theme || "").slice(0, 40),
      valUsd: Math.round(valUsd * 100) / 100, costUsd: Math.round(cost * rate * 100) / 100,
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
  for (const r of ctx.rows) {
    let s = `${r.tk} — ${r.weightPct}% of portfolio, value $${Math.round(r.valUsd).toLocaleString("en-US")} (${r.cur}), theme ${r.theme || "n/a"}`;
    if (r.base != null) {
      const mos = r.px ? Math.round(((r.base - r.px) / r.px) * 1000) / 10 : null;
      s += `, last valuation price ${r.px}, base-case intrinsic value ${r.base}, margin of safety ${mos != null ? mos + "%" : "n/a"}, range ${r.bear}–${r.bull}`;
    }
    lines.push(s);
  }
  return [
    `Total portfolio value: ~$${Math.round(ctx.total).toLocaleString("en-US")} (invested $${Math.round(ctx.invested).toLocaleString("en-US")}, cash $${Math.round(ctx.cash).toLocaleString("en-US")}).`,
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
