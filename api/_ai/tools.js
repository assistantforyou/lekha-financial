// Tool surface for the chat loop. The finance tools already exist and are tested in
// api/_fin/agent.js; this module only translates them into the OpenAI function-calling shape
// and normalises every result into numbered evidence the model may cite.
const agent = require("../_fin/agent");
const svc = require("../_fin/service");
const actions = require("./actions");
const memory = require("./memory");

const TYPES = {
  string: { type: "string" },
  "string?": { type: "string" },
  number: { type: "number" },
  "number?": { type: "number" },
  "string[]": { type: "array", items: { type: "string" } },
  "number[]": { type: "array", items: { type: "number" } },
};

function parameters(args) {
  const props = {}, required = [];
  for (const [name, t] of Object.entries(args || {})) {
    const base = String(t || "string");
    props[name] = TYPES[base] || { type: "string" };
    if (!base.endsWith("?")) required.push(name);
  }
  return { type: "object", properties: props, ...(required.length ? { required } : {}), additionalProperties: false };
}

// A symbol lookup the router cannot do alone (company names, product names, ambiguities).
const EXTRA = {
  search_symbol: {
    desc: "Look up a company, ETF or product by name to get its ticker symbol. Use when the user names something whose symbol is not obvious.",
    args: { query: "string" },
    run: async ({ query }) => {
      const r = await svc.search(String(query || "").slice(0, 60), { limit: 5 });
      const rows = ((r && r.data && r.data.results) || []).filter((x) => x && x.symbol).slice(0, 5);
      if (!rows.length) return { label: `Symbol search: ${query}`, source: "Symbol search", kind: "calculated", lines: [`No instrument matched "${query}".`], data: [] };
      return {
        label: `Symbol search: ${query}`,
        source: "Symbol search",
        kind: "calculated",
        lines: rows.map((x) => `${x.symbol} — ${x.name || "unknown"}${x.exchange ? ` (${x.exchange})` : ""}${x.type ? `, ${x.type}` : ""}`),
        data: rows,
      };
    },
  },
};

const PULSE = [["SPY", "S&P 500 (SPY)"], ["QQQ", "Nasdaq 100 (QQQ)"], ["DIA", "Dow Jones (DIA)"], ["IWM", "Russell 2000 (IWM)"]];
const pctText = (x) => (Number.isFinite(x) ? `${x >= 0 ? "+" : ""}${(Math.round(x * 10000) / 100).toFixed(2)}%` : "n/a");
EXTRA.get_market_pulse = {
  desc: "Live broad-market snapshot: S&P 500, Nasdaq 100, Dow and Russell 2000 ETFs with today's move. Fetched on every call, never from memory.",
  args: {},
  run: async () => {
    const { data: qs } = await svc.getQuotes(PULSE.map((p) => p[0]));
    const rows = PULSE.filter(([s]) => qs[s] && qs[s].price > 0);
    if (!rows.length) throw new Error("no_market_quotes");
    const stamp = rows.map(([s]) => qs[s].timestamp).filter(Boolean).sort().pop() || null;
    return {
      label: "Live market snapshot",
      source: qs[rows[0][0]].source || "market data",
      asOf: stamp,
      kind: "fact",
      lines: rows.map(([s, name]) => `${name}: ${Number(qs[s].price).toFixed(2)} USD, ${pctText(qs[s].changePercent)} vs previous close${qs[s].meta && qs[s].meta.freshness ? ` (${qs[s].meta.freshness})` : ""}`),
      data: rows.map(([s, name]) => ({ symbol: s, name, price: qs[s].price, changePercent: qs[s].changePercent })),
    };
  },
};

function catalog() {
  const out = {};
  for (const [name, t] of Object.entries(agent.TOOLS)) out[name] = { desc: t.desc, args: t.args };
  for (const [name, t] of Object.entries(EXTRA)) out[name] = { desc: t.desc, args: t.args };
  for (const [name, t] of Object.entries(actions.TOOLS)) if (!out[name]) out[name] = { desc: t.desc, args: t.args };
  for (const [name, t] of Object.entries(memory.TOOLS)) if (!out[name]) out[name] = { desc: t.desc, args: t.args };
  return out;
}

function schemas() {
  return Object.entries(catalog()).map(([name, t]) => ({
    type: "function",
    function: { name, description: String(t.desc || "").slice(0, 500), parameters: parameters(t.args) },
  }));
}

function names() {
  return Object.keys(catalog());
}

// Arguments arrive as a JSON string from the model: parse defensively, never throw at the model.
function parseArgs(raw) {
  if (raw && typeof raw === "object") return raw;
  const s = String(raw || "").trim();
  if (!s) return {};
  try { const v = JSON.parse(s); return v && typeof v === "object" ? v : {}; } catch (e) { return {}; }
}

function clean(text) {
  return String(text == null ? "" : text).replace(/\s+/g, " ").trim();
}

// One tool call, bounded, with failures returned as data instead of thrown.
async function run(name, args, { timeoutMs = 25000, userId = null } = {}) {
  const t = (agent.TOOLS && agent.TOOLS[name]) || EXTRA[name] || actions.TOOLS[name] || memory.TOOLS[name];
  if (!t) return { ok: false, name, error: "unknown_tool", lines: [`Unknown tool ${name}.`], label: name, source: "tool", kind: "calculated" };
  const input = parseArgs(args);
  try {
    const r = await Promise.race([
      t.run(input, { userId }),
      new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error("timeout"), { code: "timeout" })), timeoutMs)),
    ]);
    const lines = (Array.isArray(r.lines) ? r.lines : []).map(clean).filter(Boolean).slice(0, 24).map((l) => l.slice(0, 400));
    return {
      ok: true,
      name,
      args: input,
      label: clean(r.label) || name,
      source: clean(r.source) || "FinancialDataService",
      asOf: r.asOf || null,
      kind: r.kind || "fact",
      url: r.url || null,
      lines: lines.length ? lines : ["No data returned."],
      data: r.data == null ? null : r.data,
    };
  } catch (e) {
    const code = String(e.code || e.message || "error");
    return {
      ok: false,
      name,
      args: input,
      error: code,
      label: name,
      source: "tool",
      kind: "calculated",
      // A failed tool must still say why. An empty line list makes the model report "a reference with
      // no data", which reads like a bug in the answer rather than a missing feed.
      lines: [`${name} could not return data (${code}). Say this figure is unavailable; do not substitute one.`],
    };
  }
}

// Evidence block the model sees: stable ids, source, date and the tool that produced it.
function evidenceOf(list) {
  return list.map((r, i) => ({ id: `E${i + 1}`, ...r }));
}

function evidenceBlock(evidence) {
  if (!evidence.length) return "EVIDENCE: none retrieved.";
  return "EVIDENCE\n" + evidence
    .map((e) => [
      `[${e.id}] ${e.ok === false ? `${e.name || e.label} (unavailable)` : e.label} — ${e.source}${e.asOf ? `, as of ${e.asOf}` : ""}${e.ok === false ? "" : e.kind ? `, ${e.kind}` : ""}`,
      ...(e.ok === false && !e.lines.length ? [`  This feed did not answer. Treat the figure as unavailable.`] : e.lines.map((l) => `  ${l}`)),
    ].join("\n"))
    .join("\n\n");
}

// The currency a listing trades in, from its suffix. Used only to label a chart.
const currencyOf = (s) => (/\.BK$/.test(s) ? "THB" : /\.HK$/.test(s) ? "HKD" : /\.(T|TO|AX|L|PA|DE|AS|SW|MI|MC|SI|KS)$/.test(s) ? null : "USD");

// A price chart for the answer, drawn from the same feed the evidence quotes. This is not a model tool:
// the model does not choose the data, it only writes the sentence that goes above the picture.
async function chartFor(symbol, { days = 180 } = {}) {
  try {
    const { data: bars } = await svc.getHistoricalPrices(String(symbol).toUpperCase(), { days });
    const pts = (bars || [])
      .filter((b) => Number.isFinite(b[4]) && b[4] > 0)
      .slice(-120)
      .map((b) => [String(b[0]).slice(0, 10), Number(b[4].toFixed(4))]);
    if (pts.length < 5) return null;
    return { type: "chart", kind: "price", symbol: String(symbol).toUpperCase(), currency: currencyOf(String(symbol).toUpperCase()), points: pts, asOf: pts[pts.length - 1][0], source: "market data" };
  } catch (e) { return null; }
}

/* Several symbols on one axis, each rebased to 100 at the first common session, so relative performance reads at a glance. */
async function compareChartFor(symbols, { days = 180 } = {}) {
  try {
    const list = [...new Set((symbols || []).map((x) => String(x).toUpperCase()))].slice(0, 4);
    if (list.length < 2) return null;
    const got = await Promise.all(list.map(async (s) => {
      try { const { data } = await svc.getHistoricalPrices(s, { days }); return [s, (data || []).filter((b) => Number.isFinite(b[4]) && b[4] > 0).map((b) => [String(b[0]).slice(0, 10), b[4]])]; } catch (e) { return [s, []]; }
    }));
    const ok = got.filter(([, p]) => p.length >= 5);
    if (ok.length < 2) return null;
    const common = ok.map(([, p]) => new Set(p.map((x) => x[0]))).reduce((a, b) => new Set([...a].filter((d) => b.has(d))));
    const dates = [...common].sort().slice(-120);
    if (dates.length < 5) return null;
    const series = ok.map(([s, p]) => { const m = new Map(p), base = m.get(dates[0]); return { label: s, points: dates.map((d) => [d, Math.round((m.get(d) / base) * 10000) / 100]) }; });
    return { type: "chart", kind: "lines", title: "Relative performance, rebased to 100", unit: "index", series, asOf: dates[dates.length - 1], source: "market data" };
  } catch (e) { return null; }
}

/* Portfolio charts come straight from the priced holdings the model was shown, so the picture and the text cannot disagree. */
function portfolioCharts(ctx) {
  if (!ctx || !Array.isArray(ctx.rows)) return [];
  const priced = ctx.rows.filter((r) => r.priced !== false && r.valUsd > 0);
  const total = priced.reduce((a, r) => a + r.valUsd, 0);
  if (!priced.length || !(total > 0)) return [];
  const out = [];
  const sorted = [...priced].sort((a, b) => b.valUsd - a.valUsd);
  const top = sorted.slice(0, 10), rest = sorted.slice(10).reduce((a, r) => a + r.valUsd, 0);
  const items = top.map((r) => ({ label: r.tk, value: Math.round(r.valUsd * 100) / 100, pct: Math.round((r.valUsd / total) * 1000) / 10 }));
  if (rest > 0) items.push({ label: "Other", value: Math.round(rest * 100) / 100, pct: Math.round((rest / total) * 1000) / 10 });
  const unpriced = ctx.rows.filter((r) => r.priced === false).length;
  out.push({ type: "chart", kind: "donut", title: "Allocation by priced holding", unit: "USD", items, asOf: ctx.fetchedAt ? String(ctx.fetchedAt).slice(0, 16).replace("T", " ") + " UTC" : null, source: "live quotes" + (unpriced ? `; ${unpriced} unpriced position${unpriced > 1 ? "s" : ""} excluded` : "") });
  const pl = priced.filter((r) => r.tk !== "CASH" && r.costUsd > 0).map((r) => ({ label: r.tk, value: Math.round(((r.valUsd - r.costUsd) / r.costUsd) * 10000) / 100 })).sort((a, b) => b.value - a.value);
  if (pl.length >= 2) out.push({ type: "chart", kind: "bar", title: "Unrealized return on cost", unit: "%", items: pl.slice(0, 14), asOf: ctx.fetchedAt ? String(ctx.fetchedAt).slice(0, 16).replace("T", " ") + " UTC" : null, source: "live quotes against recorded cost basis" });
  return out;
}

module.exports = { schemas, names, catalog, run, parseArgs, evidenceOf, evidenceBlock, chartFor, compareChartFor, portfolioCharts };
