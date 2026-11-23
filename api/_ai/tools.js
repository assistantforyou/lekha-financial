// Tool surface for the chat loop. The finance tools already exist and are tested in
// api/_fin/agent.js; this module only translates them into the OpenAI function-calling shape
// and normalises every result into numbered evidence the model may cite.
const agent = require("../_fin/agent");
const svc = require("../_fin/service");

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

function catalog() {
  const out = {};
  for (const [name, t] of Object.entries(agent.TOOLS)) out[name] = { desc: t.desc, args: t.args };
  for (const [name, t] of Object.entries(EXTRA)) out[name] = { desc: t.desc, args: t.args };
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
async function run(name, args, { timeoutMs = 25000 } = {}) {
  const t = (agent.TOOLS && agent.TOOLS[name]) || EXTRA[name];
  if (!t) return { ok: false, name, error: "unknown_tool", lines: [`Unknown tool ${name}.`], label: name, source: "tool", kind: "calculated" };
  const input = parseArgs(args);
  try {
    const r = await Promise.race([
      t.run(input),
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
    return { type: "chart", symbol: String(symbol).toUpperCase(), currency: currencyOf(String(symbol).toUpperCase()), points: pts, asOf: pts[pts.length - 1][0], source: "market data" };
  } catch (e) { return null; }
}

module.exports = { schemas, names, catalog, run, parseArgs, evidenceOf, evidenceBlock, chartFor };
