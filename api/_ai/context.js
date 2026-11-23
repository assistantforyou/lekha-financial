// Server-side context for a chat turn: the user's own portfolio and the shared market state.
// Both are read from documents and cached feeds, never from the request body.
const { userContext, portfolioBlock, marketBlock } = require("../_h/ai/_ctx");

// Deterministic trim: the model gets the shape of the portfolio, not an unbounded dump.
function trimPortfolio(ctx) {
  if (!ctx || !Array.isArray(ctx.rows) || !ctx.rows.length) return null;
  if (ctx.rows.length <= 30) return ctx;
  const rows = [...ctx.rows].sort((a, b) => (b.valUsd || 0) - (a.valUsd || 0)).slice(0, 30);
  const total = ctx.total || rows.reduce((s, r) => s + (r.valUsd || 0), 0);
  return { ...ctx, rows, total, trimmed: ctx.rows.length - rows.length };
}

function marketLines(m) {
  if (!m) return [];
  const out = [];
  if (m.macro) {
    const parts = [];
    if (m.macro.fedFunds != null) parts.push(`fed funds ${m.macro.fedFunds}%`);
    if (m.macro.tenYear != null) parts.push(`10-year ${m.macro.tenYear}%`);
    if (m.macro.cpiYoY != null) parts.push(`CPI ${m.macro.cpiYoY}% y/y`);
    if (parts.length) out.push(`Macro${m.macro.asOf ? ` (${m.macro.asOf})` : ""}: ${parts.join(", ")}.`);
  }
  if (m.news && Array.isArray(m.news.headlines) && m.news.headlines.length) {
    out.push(`Headlines${m.news.date ? ` (${m.news.date})` : ""}:`);
    for (const h of m.news.headlines.slice(0, 6)) out.push(`- ${String(h).slice(0, 220)}`);
  }
  return out;
}

// One text block, ordered portfolio first because it is the most specific context.
async function build({ userId, demo }) {
  const lines = [];
  let ctx = null;
  try { ctx = await userContext(demo ? "demo" : userId); } catch (e) { ctx = null; }
  const trimmed = trimPortfolio(ctx);
  if (trimmed) {
    lines.push("PORTFOLIO", portfolioBlock(trimmed));
    if (trimmed.trimmed) lines.push(`(${trimmed.trimmed} smaller positions are omitted from this list.)`);
  } else {
    lines.push("PORTFOLIO", "No holdings are saved for this account yet. Do not assume any positions.");
  }
  let market = null;
  try { market = await marketBlock(); } catch (e) { market = null; }
  const ml = marketLines(market);
  if (ml.length) lines.push("", "MARKET", ...ml);
  return { block: lines.join("\n"), ctx: trimmed, market };
}

module.exports = { build, trimPortfolio, marketLines };
