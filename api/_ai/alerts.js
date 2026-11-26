"use strict";
// Proactive checks: price and news alerts the user saved, upcoming earnings for
// names they hold or watch, and a short daily digest of movers. Everything is
// written to the in-app inbox, which is the only delivery channel the product
// has (there is no mail provider configured).
//
// Deterministic by design: this job never calls a model. A brief that costs a
// model call belongs in the briefing surface, where the user asked for it.

const svc = require("../_fin/service");
const actions = require("./actions");
const inbox = require("./inbox");
let store = require("../_state");
const setStore = (s) => { store = s; };

const MAX_SYMBOLS = 12, MAX_USERS = 200, EARNINGS_DAYS = 7;
const big = (v) => { const n = Number(v); if (!Number.isFinite(n)) return "-"; const a = Math.abs(n); if (a >= 1e12) return (n / 1e12).toFixed(2) + "T"; if (a >= 1e9) return (n / 1e9).toFixed(2) + "B"; if (a >= 1e6) return (n / 1e6).toFixed(2) + "M"; return n.toLocaleString("en-US", { maximumFractionDigits: 2 }); };
const pct = (v) => (Number.isFinite(Number(v)) ? `${Number(v) >= 0 ? "+" : ""}${Number(v).toFixed(2)}%` : "-");
const day = (d) => new Date(d).toISOString().slice(0, 10);
const uniq = (a) => [...new Set(a.filter(Boolean))];

async function docs(userId) {
  const rows = await store.listState(userId).catch(() => []);
  const get = (k, d) => { const r = (rows || []).find((x) => x.key === k); return r && r.data && typeof r.data === "object" ? r.data : d; };
  return { alerts: get(actions.ALERTS, { items: [] }), holdings: get("holdings/all", { items: [] }), watch: get(actions.WATCH, { items: [] }) };
}

async function quoteOf(symbol) {
  const r = await svc.getQuote(symbol).catch(() => null);
  const d = r && r.data ? r.data : null;
  return d && Number.isFinite(Number(d.price)) ? d : null;
}

// One user, one pass. Returns how many inbox items were added.
async function checkUser(userId, { asOf = new Date(), budgetMs = 8000 } = {}) {
  const t0 = Date.now(), { alerts, holdings, watch } = await docs(userId);
  const active = (alerts.items || []).filter((a) => a && a.active && a.symbol);
  const held = (holdings.items || []).map((h) => h && h.tk).filter(Boolean);
  const watched = (watch.items || []).map((w) => w && w.symbol).filter(Boolean);
  const names = uniq([...active.map((a) => a.symbol), ...held, ...watched]).slice(0, MAX_SYMBOLS);
  if (!names.length) return { added: 0, checked: 0, symbols: 0 };

  const quotes = {};
  for (const s of names) {
    if (Date.now() - t0 > budgetMs) break;
    const q = await quoteOf(s);
    if (q) quotes[s] = q;
  }
  let added = 0;
  const fire = async (item) => { const row = await inbox.add(userId, item).catch(() => null); if (row) added++; };

  // Saved alerts.
  for (const a of active) {
    const q = quotes[a.symbol];
    if (!q) continue;
    const px = Number(q.price), at = Number(a.value);
    if (a.kind === "price_above" && px >= at) {
      await fire({ kind: "alert", symbol: a.symbol, dedupe: `alert:${a.id}`, title: `${a.symbol} rose above ${big(at)}`, body: `Last price ${big(px)} ${q.currency || "USD"} (${pct(q.changePct)}). Alert set at ${big(at)}${a.note ? `: ${a.note}` : "."}` });
    } else if (a.kind === "price_below" && px <= at) {
      await fire({ kind: "alert", symbol: a.symbol, dedupe: `alert:${a.id}`, title: `${a.symbol} fell below ${big(at)}`, body: `Last price ${big(px)} ${q.currency || "USD"} (${pct(q.changePct)}). Alert set at ${big(at)}${a.note ? `: ${a.note}` : "."}` });
    } else if (a.kind === "news") {
      const n = await svc.getNews({ symbol: a.symbol, limit: 2 }).catch(() => null);
      const first = n && n.data && n.data[0];
      if (first && first.title) await fire({ kind: "alert", symbol: a.symbol, dedupe: `news:${a.id}:${first.title}`, title: `${a.symbol}: ${String(first.title).slice(0, 140)}`, body: `${first.publisher || first.source || "News"}${first.publishedAt ? `, ${day(first.publishedAt)}` : ""}.${first.url ? ` ${first.url}` : ""}` });
    }
  }

  // Upcoming earnings, only when a real scheduled date is in the feed.
  for (const s of uniq([...held, ...watched]).slice(0, 8)) {
    if (Date.now() - t0 > budgetMs + 4000) break;
    const e = await svc.getEarnings(s).catch(() => null);
    const rows = (e && e.data) || [];
    const next = rows.map((r) => ({ ...r, when: new Date(r.date) })).filter((r) => r.when > asOf && (r.when - asOf) / 86400000 <= EARNINGS_DAYS).sort((a, b) => a.when - b.when)[0];
    if (next) await fire({ kind: "earnings", symbol: s, dedupe: `earnings:${s}:${day(next.date)}`, title: `${s} reports on ${day(next.date)}`, body: `Scheduled earnings date from ${next.source || "the data feed"}${next.fiscalPeriod ? ` for ${next.fiscalPeriod}` : ""}. The date can move; check the company's own release.` });
  }

  // A short digest when something in the book or watchlist actually moved.
  const moves = names.map((s) => ({ s, q: quotes[s] })).filter((x) => x.q && Number.isFinite(Number(x.q.changePct)) && Math.abs(Number(x.q.changePct)) >= 3);
  if (moves.length) {
    moves.sort((a, b) => Math.abs(Number(b.q.changePct)) - Math.abs(Number(a.q.changePct)));
    await fire({ kind: "digest", dedupe: "moves", title: `${moves.length} name${moves.length === 1 ? "" : "s"} moved more than 3%`, body: moves.slice(0, 6).map((m) => `${m.s}: ${big(m.q.price)} ${m.q.currency || "USD"}, ${pct(m.q.changePct)}`).join("\n") });
  }
  return { added, checked: active.length, symbols: Object.keys(quotes).length };
}

// The cron entry point: every user who has alerts, a watchlist or a saved book.
async function runAlerts({ budgetMs = 45000, maxUsers = MAX_USERS } = {}) {
  const t0 = Date.now();
  const ids = new Set();
  for (const key of [actions.ALERTS, actions.WATCH, "holdings/all"]) {
    if (Date.now() - t0 > budgetMs * 0.25) break;
    const r = await require("../_lib").sb(`pt_user_state?select=user_id&key=eq.${encodeURIComponent(key)}&limit=${maxUsers}`).catch(() => null);
    if (!r || !r.ok) continue;
    const rows = await r.json().catch(() => []);
    for (const row of rows) if (row && row.user_id) ids.add(row.user_id);
  }
  const users = [...ids].slice(0, maxUsers);
  let added = 0, done = 0, failed = 0;
  for (const id of users) {
    if (Date.now() - t0 > budgetMs) break;
    try { const r = await checkUser(id, { budgetMs: 6000 }); added += r.added; done++; }
    catch (e) { failed++; console.error(JSON.stringify({ event: "alerts_user_failed", code: e && e.message || "error" })); }
  }
  return { users: users.length, done, failed, added, ms: Date.now() - t0 };
}

module.exports = { checkUser, runAlerts, setStore, MAX_SYMBOLS, EARNINGS_DAYS };
