import { Activity, BarChart3, BookOpen, Bot, Brain, Building2, CircleUser, Compass, Cpu, Gauge, Globe, LayoutDashboard, LayoutGrid, LineChart, Newspaper, PieChart, Radar, Scale, Settings2, Shield, Sparkles, Star, Stethoscope, Swords, TrendingUp, Upload, Users, Wallet, CreditCard, Layers, FlaskConical, ScrollText } from "lucide-react"

/* The whole app as one tree. `panes` = classic V2/V3 panels moved into view; `page` = a React screen.
   Route keys keep the V3 spelling (portfolio/overview, sector/rrg ...) because the classic modules navigate by them. */
export const TREE = [
  { id: "portfolio", title: "My Portfolio", icon: Wallet, items: [
    { id: "overview", title: "Overview", icon: LayoutDashboard, panes: ["tab-pf-overview"], desc: "Total value, today's move, unrealized P&L, a plain-language summary and performance against the S&P 500 and Nasdaq." },
    { id: "holdings", title: "Holdings & ledger", icon: Layers, panes: ["tab-pf-holdings"], desc: "Add, edit and import positions. Every lot with cost, value and weight; import broker statements (PDF, screenshot, CSV)." },
    { id: "risk", title: "Risk", icon: Shield, panes: ["tab-pf-risk"], desc: "Largest positions, themes, drawdown alerts, top movers and biggest losers." },
    { id: "watchlist", title: "Watchlist", icon: Star, page: "watchlist", desc: "Symbols you follow, with live prices and a jump to each company workspace. Synced to your account when signed in." },
  ] },
  { id: "research", title: "Research", icon: Compass, items: [
    { id: "company", title: "Company workspace", icon: Building2, page: "company", desc: "Search any company, ETF, index or crypto. One workspace for price, financials, valuation, growth, news, filings, earnings, peers and the AI analyst." },
    { id: "agent", title: "AI research agent", icon: Bot, page: "agent", desc: "Ask in plain language. The agent retrieves quotes, filings, news and macro data first, then answers with citations and labels fact, calculation, interpretation and speculation." },
    { id: "news", title: "News search", icon: Newspaper, page: "news", desc: "Company, market, earnings, M&A, regulatory and macro headlines from every source, de-duplicated." },
  ] },
  { id: "simulation", title: "Simulation", icon: Cpu, items: [
    { id: "main", title: "Monte Carlo simulation", icon: Cpu, panes: ["tab-sim"], desc: "Monte Carlo on your actual holdings: fan chart, return distribution, VaR, catalysts. Up to 1M paths on worker threads." },
    { id: "projection", title: "Projection lab", icon: FlaskConical, panes: ["tab-sim-proj"], desc: "The original V2 growth-scenario lab with five horizons and dated catalysts." },
  ] },
  { id: "macro", title: "Macro & markets", icon: Globe, items: [
    { id: "dashboard", title: "Macro dashboard", icon: Gauge, page: "macro", desc: "Fed funds, Treasury yields, CPI, PPI, unemployment, payrolls, GDP, consumer sentiment and M2 from FRED, with the yield-curve read-through." },
    { id: "regime", title: "Macro regime", icon: Activity, panes: ["tab-mac-regime"], desc: "Rates, inflation and the regime model, with implied dispersion and index-futures positioning." },
    { id: "rotation", title: "Market rotation", icon: Radar, panes: ["tab-mac-rotation"], desc: "Relative strength across sectors and styles, plus capital flows." },
    { id: "intel", title: "Market intelligence", icon: Sparkles, panes: ["tab-mac-intel"], desc: "The day's AI-labelled market briefing from public headlines." },
    { id: "appetite", title: "Risk appetite", icon: Gauge, panes: ["tab-mac-appetite"], desc: "XLY/XLP, fear and greed and safe-haven demand." },
  ] },
  { id: "analysis", title: "Deep analysis & council", icon: Brain, items: [
    { id: "value", title: "Intrinsic value & MOS", icon: Scale, panes: ["tab-val"], desc: "DCF and residual-income models per holding, margin of safety, valuation dispersion and history." },
    { id: "deep", title: "Holdings deep analysis", icon: Stethoscope, panes: ["tab-an-deep"], desc: "One holding at a time: price, position, risk, valuation, analysts and headlines." },
    { id: "council", title: "LLM council", icon: Users, panes: ["tab-an-council"], desc: "Five perspectives and a CEO synthesis, written as one report." },
    { id: "reports", title: "AI research reports", icon: ScrollText, panes: ["lekha-reports"], desc: "Every saved council report, plus sample reports." },
    { id: "ask", title: "Ask the analyst", icon: Bot, panes: ["v3-ai-host"], analyst: "chat", desc: "Ask anything about your holdings and get an answer computed from your live portfolio: positions, weights, P&L, concentration, drawdown and what would change the view." },
    { id: "briefing", title: "Daily briefing", icon: BookOpen, panes: ["v3-ai-host"], analyst: "brief", desc: "What moved, what changed and what to watch in your portfolio today." },
    { id: "stress", title: "Stress test", icon: Swords, panes: ["v3-ai-host"], analyst: "sim", desc: "Monte Carlo plus rate-shock, tech-drawdown and recession scenarios on your holdings." },
  ] },
  { id: "sector", title: "Sector rotation", icon: PieChart, items: [
    { id: "now", title: "Rotation & relative strength", icon: TrendingUp, panes: ["tab-sec-now", "tab-sec-rrg"], desc: "Where money is flowing today, the sector summary and the relative rotation graph with quadrants and trails, in one view." },
    { id: "lead", title: "Leadership quality", icon: LineChart, panes: ["tab-sec-lead"], desc: "Factor-adjusted strength and earnings revisions." },
    { id: "breadth", title: "Sector breadth", icon: BarChart3, panes: ["tab-sec-breadth"], desc: "Constituent breadth, RSI bands and overbought/oversold detection. Click any sector to plot it on the rotation graph." },
  ] },
  { id: "account", title: "Account & settings", icon: CircleUser, items: [
    { id: "profile", title: "Profile", icon: CircleUser, page: "profile", desc: "Who you are, your plan and your session." },
    { id: "preferences", title: "Preferences", icon: Settings2, page: "preferences", desc: "Language, theme (100), text size, density, currency and start screen." },
    { id: "plans", title: "Plans & billing", icon: CreditCard, page: "plans", desc: "Compare Demo, Free, Paid and Premium; manage your subscription." },
    { id: "layout", title: "Dashboard layout", icon: LayoutGrid, page: "layout", desc: "Show, hide and reorder panels on every screen." },
    { id: "data", title: "Data & import", icon: Upload, page: "data", desc: "Import statements, export your data and check sync status." },
    { id: "diagnostics", title: "Diagnostics (admin)", icon: Stethoscope, page: "diagnostics", admin: true, desc: "Provider health, latency, cache hit rate, tool failures, token use and running costs." },
    { id: "audit", title: "Audit log (admin)", icon: ScrollText, page: "audit", admin: true, desc: "Traffic, failures, rate limits and the sign-up to AI funnel per route, from the audit table." },
  ] },
]
export const FLAT = TREE.flatMap((g) => g.items.map((i) => ({ ...i, group: g.id, groupTitle: g.title, key: `${g.id}/${i.id}` })))
export const BY_KEY = Object.fromEntries(FLAT.map((i) => [i.key, i]))
export const DEFAULT_ROUTE = "portfolio/overview"
// "portfolio/overview" | "company/AAPL?tab=news" -> {key, param, query}
const ALIAS = { "sector/rrg": "sector/now", "account/security": "account/profile", "account/legal": "account/profile", "account/about": "account/profile" }
export function parseHash(h) {
  const m = /^#\/?([^?]*)(?:\?(.*))?$/.exec(h || ""), parts = (m && m[1] ? m[1] : "").split("/").filter(Boolean), q = new URLSearchParams((m && m[2]) || "")
  if (parts[0] === "research" && parts[1] === "company" && parts[2]) parts.splice(0, 2)   // research/company/AAPL is the same page as company/AAPL
  if (parts[0] === "company") return { key: "research/company", param: parts[1] ? decodeURIComponent(parts[1]) : null, query: q, t: "company", s: parts[1] || "" }
  const raw = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : parts.length === 1 ? (FLAT.find((i) => i.group === parts[0]) || {}).key : null
  const key = ALIAS[raw] || raw
  const item = BY_KEY[key]
  if (!item) return { key: DEFAULT_ROUTE, param: null, query: q, t: "portfolio", s: "overview", fallback: true }
  return { key, param: null, query: q, t: item.group, s: item.id }
}
export const hrefOf = (key) => "#/" + key
