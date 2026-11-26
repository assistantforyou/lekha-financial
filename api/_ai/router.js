// Cheap, deterministic planning. Every turn gets a plan in a few milliseconds; no model call is
// spent deciding what the question is about. The deep mode may still call tools itself on top.
const agent = require("../_fin/agent");
const tools = require("./tools");

const RX = {
  portfolio: /\b(my|our|i own|we own|portfolio|holding|holdings|position|positions|allocation|exposure|weight|weights|p&l|profit|loss|drawdown|hedge|rebalance)\b/i,
  macro: /\b(rate|rates|inflation|cpi|yield|yields|fed|fomc|recession|gdp|unemployment|macro|tariff|tariffs|oil price|dollar|baht)\b/i,
  compare: /\b(compare|comparison|versus|vs\.?|better|worse|peer|peers|against)\b/i,
  why: /\b(why|what happened|moved|move|fell|falling|dropped|drop|slid|slump|rallied|rally|surge|jumped|plunged)\b/i,
  brief: /\b(brief|summary|summarise|summarize|catch me up|overview of the market|what is happening)\b/i,
  risk: /\b(risk|risks|downside|stress|scenario|worst case)\b/i,
};

function flags(question) {
  const q = String(question || "");
  return {
    portfolio: RX.portfolio.test(q),
    macro: RX.macro.test(q),
    compare: RX.compare.test(q),
    why: RX.why.test(q),
    brief: RX.brief.test(q),
    risk: RX.risk.test(q),
  };
}

// Which tools to run before the model speaks. At most six so a fast turn stays fast.
const WEB = /\b(tied|tie|exposure|exposed|supplier|suppliers|customer|customers|supply chain|depend|depends|dependence|relationship|partner|partnership|stake|owns|owner|ownership|share of|revenue from|net worth|market cap|competitor|competitors|history|founded|ceo|management|explain|how does|why does|who is|what is)\b/i;

function callsFor(question, symbols, f) {
  const q = String(question || "");
  const calls = [];
  const push = (tool, args) => {
    if (calls.length >= 6) return;
    if (calls.some((c) => c.tool === tool && JSON.stringify(c.args) === JSON.stringify(args))) return;
    calls.push({ tool, args });
  };
  const first = symbols[0];
  if (first) push("get_quote", { symbol: first });
  // Every company question, and any question about a relationship or an exposure, consults the open
  // web: market feeds do not know who supplies whom or how much of a supplier's revenue one customer is.
  if (!(f.portfolio && !first) && (first || WEB.test(q))) push("web_search", { query: agent.webQuery(q, symbols), limit: 6 });
  if (WEB.test(q) && symbols.length >= 2) push("web_search", { query: `${symbols.slice(0, 2).map((x) => agent.companyName(x)).join(" ")} largest customer share of revenue`, limit: 4 });
  if (first && (f.why || f.brief)) push("get_historical_prices", { symbol: first, days: 60 });
  if (first && f.why) push("get_news", { symbol: first });
  if (first && f.compare) push("get_peer_companies", { symbol: first });
  if (first && (f.risk || /valu|dcf|intrinsic|fair value|overvalued|undervalued/i.test(q))) push("calculate_valuation", { symbol: first });
  if (first && /revenue|margin|earn|profit|growth|balance sheet|cash flow|debt/i.test(q)) push("get_financial_statements", { symbol: first, type: "annual" });
  if ((f.macro || !first) && f.macro) push("get_macro_data", { ids: ["FEDFUNDS", "DGS10", "T10Y2Y", "CPIAUCSL", "UNRATE"] });
  if (!first && (f.brief || f.macro)) push("get_news", { category: "macro" });
  // Live data comes first on every turn: the market snapshot is fetched for every question, and a question
  // about the book or the market also gets live headlines. Nothing is answered from memory.
  if (!first || f.portfolio || f.macro || f.brief) push("get_market_pulse", {});
  if (!first && (f.portfolio || f.risk)) push("get_news", { category: "macro" });
  if (!calls.length && first) push("get_company_profile", { symbol: first });
  return calls;
}

// The plan for one turn: what the router believes, which symbols, which evidence to fetch.
async function plan({ question, symbol, mode }) {
  const q = String(question || "").slice(0, 2000);
  const f = flags(q);
  // A question about "my portfolio" names no company: ordinary words in it ("outlook") must never be searched as company names.
  const symbols = await agent.resolveSymbols(q, symbol, { names: !f.portfolio }).catch(() => []);
  const kind = symbols.length ? "company" : f.portfolio ? "portfolio" : f.macro ? "macro" : "general";
  const calls = callsFor(q, symbols, f);
  const guidance = [];
  if (kind === "portfolio") guidance.push("The user is asking about their own portfolio: use the PORTFOLIO block, quote its weights and values, and never invent a position that is not listed.");
  if (kind === "company" && symbols.length) guidance.push(`The question is about ${symbols.join(", ")}. Use the evidence for those tickers before general knowledge.`);
  if (kind === "macro") guidance.push("The question is about markets or macro: prefer the MARKET block and macro evidence over general commentary.");
  if (WEB.test(q)) guidance.push("The WEB EVIDENCE items are dated public reporting: use them for relationships, supply chains, ownership, management or a share of revenue, name the publisher, and mark a figure you derive from two sources as a calculation rather than a reported fact.");
  if (mode === "deep") guidance.push("You may call tools for anything the retrieved evidence does not cover. Stop calling tools once the question can be answered.");
  return { question: q, flags: f, symbols, kind, calls, mode: mode === "deep" ? "deep" : "fast", guidance };
}

// Run the planned tools in parallel and return evidence in a stable order.
async function prefetch(p, { timeoutMs = 12000 } = {}) {
  if (!p.calls.length) return [];
  const out = await Promise.all(p.calls.map((c) => tools.run(c.tool, c.args, { timeoutMs })));
  return tools.evidenceOf(out);
}

module.exports = { plan, prefetch, flags, callsFor };
