// Generates every ad slide (HTML), renders PNGs with Playwright and writes a preview page.
// Run from the repo root: node marketing/ads/build.mjs  (needs Chromium + playwright)
// Palette: LEKHA Light (login page + LEKHA Teal Light accent). Type: Inter. Logo: public/login/lekha.png (navy, transparent copy in assets/).
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, "src"), OUT = join(here, "out");
rmSync(SRC, { recursive: true, force: true }); rmSync(OUT, { recursive: true, force: true });
mkdirSync(SRC, { recursive: true }); mkdirSync(OUT, { recursive: true });
const LOGO = "data:image/png;base64," + readFileSync(join(here, "assets", "lekha-logo-navy.png")).toString("base64");

/* ---------- Pricing facts ---------- */
const FX = 32.7; // THB per USD (Stripe checkout conversion, docs/LAUNCH_GAP_PLAN.md)
const PAID = 299, PREM = 599;
const usd = (thb) => (Math.round((thb / FX) * 100) / 100).toFixed(2);
const baht = (n) => "฿" + Math.round(n).toLocaleString("en-US");
const money = (n) => "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
// Monthly USD. Bloomberg $31,980 a year per third-party reports (one terminal); Seeking Alpha $299 a year (own site).
const PLATFORMS = [
  { n: "Bloomberg Terminal", list: "$31,980 / yr", v: 31980 / 12, focus: "Institutional terminal" },
  { n: "Koyfin Premium", list: "$79 / mo", v: 79, focus: "Research and dashboards" },
  { n: "TradingView Premium", list: "$69.95 / mo", v: 69.95, focus: "Charting and screening" },
  { n: "TIKR Pro", list: "$54.95 / mo", v: 54.95, focus: "Global financials and valuation" },
  { n: "Finviz Elite", list: "$39.50 / mo", v: 39.5, focus: "Screening and charts" },
  { n: "Koyfin Plus", list: "$39 / mo", v: 39, focus: "Research and dashboards" },
  { n: "Morningstar Investor", list: "$34.95 / mo", v: 34.95, focus: "Ratings and portfolio tools" },
  { n: "TIKR Plus", list: "$24.95 / mo", v: 24.95, focus: "Global financials and valuation" },
  { n: "Seeking Alpha Premium", list: "$299 / yr", v: 299 / 12, focus: "Analyst ratings and news" },
  { n: "LEKHA Premium", list: "฿599 / mo", v: Number(usd(PREM)), us: 1, thb: PREM, focus: "Portfolio, filings, valuation, macro, AI" },
  { n: "Stock Analysis Pro", list: "$9.99 / mo", v: 9.99, focus: "Financial statements and data" },
  { n: "LEKHA Paid", list: "฿299 / mo", v: Number(usd(PAID)), us: 1, thb: PAID, focus: "Portfolio, filings, valuation, macro, AI" },
];
for (const p of PLATFORMS) p.t = p.us ? p.thb : Math.round(p.v * FX);
const SRC_NOTE = `Monthly price in baht at list price on monthly billing, checked 23 Nov 2026. USD list prices converted at 1 USD = ${FX.toFixed(2)} THB. Seeking Alpha is $299 a year and Bloomberg is $31,980 a year per third-party reports (one terminal), both divided by 12. Annual billing lowers several competitor prices.`;
const DISC = "Analysis software, not investment advice. Data may be delayed. Prices in THB, billed monthly through Stripe, renew until cancelled.";

/* ---------- Design tokens: LEKHA Light ---------- */
const CSS = `
:root{--bg:#FCF7F0;--panel:#FFFFFF;--line:#E3DCCF;--fg:#17223B;--muted:#6E685C;--accent:#0A7A6A;--soft:#DFF0EC;--bar:#B9B3A6}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--fg);font-family:Inter,"Noto Sans Thai",system-ui,sans-serif;-webkit-font-smoothing:antialiased;overflow:hidden;position:relative}
.mono{font-family:"IBM Plex Mono",ui-monospace,Menlo,monospace;font-variant-numeric:tabular-nums}
.pad{position:absolute;inset:0;padding:84px 84px 72px;display:flex;flex-direction:column}
.top{display:flex;justify-content:space-between;align-items:center;padding-bottom:26px;border-bottom:1px solid var(--line)}
.logo{height:54px;width:auto;display:block}
.tag{font-size:20px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);font-weight:500}
h1{font-size:82px;line-height:1.06;font-weight:700;letter-spacing:-.03em}
h2{font-size:58px;line-height:1.1;font-weight:700;letter-spacing:-.025em}
.lead{font-size:31px;line-height:1.42;color:var(--muted)}
.acc{color:var(--accent)}
.grow{flex:1}
.rule{height:1px;background:var(--line)}
.foot{font-size:19px;line-height:1.45;color:var(--muted);border-top:1px solid var(--line);padding-top:18px;margin-top:26px}
.eyebrow{font-size:20px;letter-spacing:.16em;text-transform:uppercase;color:var(--accent);font-weight:600}
.btn{display:inline-block;background:var(--fg);color:#FCF7F0;font-weight:600;font-size:30px;padding:24px 44px;letter-spacing:.01em}
table{width:100%;border-collapse:collapse}
th{font-size:18px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);font-weight:500;text-align:left;padding:0 0 14px;border-bottom:1.5px solid var(--fg)}
td{padding:13px 0;border-bottom:1px solid var(--line);font-size:23px;vertical-align:top;line-height:1.25}
.num{font-variant-numeric:tabular-nums}
.def{display:grid;grid-template-columns:96px 1fr;gap:0 24px;padding:38px 0;border-bottom:1px solid var(--line)}
.def .n{font-size:22px;color:var(--accent);font-weight:600;letter-spacing:.08em;padding-top:8px}
.def h3{font-size:40px;font-weight:700;letter-spacing:-.015em;margin-bottom:8px}
.def p{font-size:28px;line-height:1.45;color:var(--muted)}
.fig{font-size:120px;font-weight:700;letter-spacing:-.04em;line-height:1}
`;
const page = (w, h, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>LEKHA ad</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>${CSS}body{width:${w}px;height:${h}px}</style></head><body>${body}<script>document.querySelectorAll(".pad[data-center]").forEach(function(p){var k=Array.prototype.slice.call(p.children),top=k[0],foot=k.filter(function(x){return x.classList.contains("foot")})[0],mid=k.filter(function(x){return x!==top&&x!==foot&&!x.classList.contains("grow")});k.filter(function(x){return x.classList.contains("grow")}).forEach(function(x){x.remove()});var e=function(x){return x&&!x.textContent.trim()&&!x.querySelector("img,svg,table")&&x.style.height};while(mid.length&&e(mid[0])){mid[0].remove();mid.shift()}while(mid.length&&e(mid[mid.length-1])){mid[mid.length-1].remove();mid.pop()}var w=document.createElement("div");w.style.cssText="flex:1;display:flex;flex-direction:column;justify-content:center";mid.forEach(function(x){w.appendChild(x)});top.after(w)});</script></body></html>`;
const head = (tag) => `<div class="top"><img class="logo" src="${LOGO}" alt="LEKHA Financials"><span class="tag">${tag}</span></div>`;
const sp = (n) => `<div style="height:${n}px"></div>`;

/* ---------- Chart: monthly price, log axis, every axis labelled ---------- */
function chart(W, rowH = 68, fs = 23) {
  const L = 330, PW = W - L - 140, top = 54, n = PLATFORMS.length, ph = rowH * n, H = top + ph + 96;
  const X = (v) => L + ((Math.log10(v) - 2) / 3) * PW; // 100 .. 100,000
  const ticks = [100, 1000, 10000, 100000];
  const grid = ticks.map((t) => `<line x1="${X(t)}" y1="${top - 8}" x2="${X(t)}" y2="${top + ph}" stroke="#E3DCCF" stroke-width="1.5"/><text x="${X(t)}" y="${top + ph + 34}" text-anchor="middle" font-size="21" fill="#6E685C" font-family="Inter">${baht(t)}</text><line x1="${X(t)}" y1="${top + ph}" x2="${X(t)}" y2="${top + ph + 8}" stroke="#17223B" stroke-width="1.5"/>`).join("");
  const rows = PLATFORMS.map((p, i) => {
    const y = top + i * rowH, bh = rowH * 0.6, by = y + (rowH - bh) / 2, x1 = X(p.t);
    const label = baht(p.t);
    return `<text x="${L - 20}" y="${y + rowH / 2 + fs * 0.34}" text-anchor="end" font-size="${fs}" font-weight="${p.us ? 700 : 500}" fill="${p.us ? "#0A7A6A" : "#17223B"}" font-family="Inter">${p.n}</text>
<rect x="${L}" y="${by}" width="${x1 - L}" height="${bh}" fill="${p.us ? "#0A7A6A" : "#B9B3A6"}"/>
<text x="${x1 + 14}" y="${y + rowH / 2 + fs * 0.34}" font-size="${fs}" font-weight="${p.us ? 700 : 500}" fill="${p.us ? "#0A7A6A" : "#17223B"}" font-family="IBM Plex Mono">${label}</text>`;
  }).join("");
  const axes = `<line x1="${L}" y1="${top - 8}" x2="${L}" y2="${top + ph}" stroke="#17223B" stroke-width="2"/><line x1="${L}" y1="${top + ph}" x2="${X(100000)}" y2="${top + ph}" stroke="#17223B" stroke-width="2"/>
<text x="${L - 20}" y="22" text-anchor="end" font-size="17" letter-spacing="2" fill="#6E685C" font-family="Inter">PLAN</text>
<text x="${(L + W) / 2}" y="${top + ph + 80}" text-anchor="middle" font-size="20" fill="#6E685C" font-family="Inter">Thai baht per month, logarithmic scale</text>`;
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${grid}${axes}${rows}</svg>`;
}

const S = {};
const CENTER = new Set(["A4-plans", "A6-agent", "B2-sources", "B3-reach", "A-story1", "C-story3", "B-story2"]);
const add = (name, w, h, set, body) => (S[name] = { w, h, set, html: page(w, h, CENTER.has(name) ? body.replace('class="pad"', 'class="pad" data-center') : body) });
const W = 1080, H = 1350, SH = 1920;
const sPad = (inner) => `<div class="pad" style="padding:250px 84px 270px">${inner}</div>`;

/* ================= SET A: paid subscription ================= */
add("A1-hook", W, H, "A", `<div class="pad">${head("Investment intelligence")}${sp(170)}
<h1>Institutional-grade research.<br><span class="acc">From ฿${PAID} a month.</span></h1>${sp(40)}
<p class="lead">Portfolio, filings, valuation, macro data and a cited AI analyst in one workspace.</p><div class="grow"></div>
<div style="display:flex;gap:0;border-top:1.5px solid var(--fg)">
${[["29", "research pages"], ["13", "data tools in the AI agent"], ["10", "languages"]].map(([a, b], i) => `<div style="flex:1;padding:26px 0 0 ${i ? 28 : 0}px;${i ? "border-left:1px solid var(--line)" : ""}"><div class="fig" style="font-size:104px">${a}</div><div style="font-size:24px;color:var(--muted);margin-top:10px;line-height:1.3;padding-bottom:14px">${b}</div></div>`).join("")}</div>
<div class="foot">${DISC}</div></div>`);

add("A2-problem", W, H, "A", `<div class="pad">${head("The problem")}<div class="grow"></div><h2>A professional terminal costs</h2>
<div class="fig" style="font-size:128px;letter-spacing:-.02em;margin:30px 0 24px">฿1,045,746</div><h2>a year.</h2>${sp(40)}
<p class="lead">Most independent investors never get that depth of data and analysis. LEKHA Financials is built to close the gap at a fraction of the price.</p>
<div class="grow"></div><div class="foot">Bloomberg Terminal, one terminal, $31,980 a year per third-party reports, converted at 1 USD = ${FX.toFixed(2)} THB. Bloomberg does not publish a rate card.</div></div>`);

add("A3-prices", W, H, "A", `<div class="pad">${head("Monthly price compared")}${sp(50)}<h2>LEKHA Paid is priced below<br><span class="acc">every platform shown.</span></h2>${sp(24)}
${chart(W - 168, 55, 21)}<div class="grow"></div><div class="foot">${SRC_NOTE}</div></div>`);

add("A4-plans", W, H, "A", `<div class="pad">${head("Plans")}${sp(56)}<h2>Two plans.<br>One clear monthly price.</h2>${sp(40)}
<div style="display:flex;gap:28px">
${[["Paid", PAID, ["Unlimited holdings", "Full price history", "Unlimited valuation symbols", "Cited research agent", "SEC filings, news and macro", "Sector rotation analysis"]],
   ["Premium", PREM, ["Everything in Paid", "AI analyst and daily briefing", "Monte Carlo, up to 1M paths", "Stress tests", "LLM council reports", "80 research requests a day"]]].map(([nm, p, li], i) => `
<div style="flex:1;background:var(--panel);border:1px solid ${i ? "var(--accent)" : "var(--line)"};border-top:4px solid ${i ? "var(--accent)" : "var(--fg)"};padding:34px 32px 28px">
<div class="eyebrow">${nm}</div><div class="fig" style="font-size:84px;margin:14px 0 4px">฿${p}</div><div style="font-size:22px;color:var(--muted)">per month</div>
<div class="rule" style="margin:24px 0 8px"></div>${li.map((t) => `<div style="font-size:24px;line-height:1.35;padding:11px 0;border-bottom:1px solid var(--line)">${t}</div>`).join("")}</div>`).join("")}</div>
<div class="grow"></div><div class="foot">${DISC}</div></div>`);

add("A5-compare", W, H, "A", `<div class="pad">${head("How they compare")}${sp(40)}<h2>Different tools.<br><span class="acc">One workspace.</span></h2>${sp(26)}
<table><tr><th>Platform</th><th>Primary focus</th><th style="text-align:right">List price</th><th style="text-align:right">THB / month</th></tr>
${PLATFORMS.map((p) => `<tr${p.us ? ' style="color:var(--accent);font-weight:700"' : ""}><td style="width:290px;padding-right:16px">${p.n}</td><td style="color:${p.us ? "inherit" : "var(--muted)"};font-size:19px;padding-right:12px">${p.focus}</td><td class="num" style="text-align:right;width:140px;font-size:19px">${p.list}</td><td class="num" style="text-align:right;width:120px">${baht(p.t)}</td></tr>`).join("")}</table>
<div class="grow"></div><div class="foot">${SRC_NOTE} Focus areas are summaries, not complete feature lists.</div></div>`);

add("A6-agent", W, H, "A", `<div class="pad">${head("Cited AI research")}${sp(60)}<h1 style="font-size:72px">An analyst that<br>shows its work.</h1>${sp(30)}
<p class="lead">Every answer retrieves quotes, filings, news and macro data first. Every number is checked against the evidence it cites.</p>${sp(34)}
${[["Fact", "Reported by the source"], ["Calculated", "Computed by the engine, never by the language model"], ["Interpretation", "A reading of the evidence"], ["Speculation", "A historical tendency, not a forecast"]].map(([a, b], i) => `<div class="def" style="grid-template-columns:70px 300px 1fr;align-items:baseline;padding:22px 0"><div class="n">0${i + 1}</div><div style="font-size:30px;font-weight:700">${a}</div><div style="font-size:24px;color:var(--muted);line-height:1.4">${b}</div></div>`).join("")}
<div class="grow"></div><div class="foot">${DISC}</div></div>`);

add("A7-cta", W, H, "A", `<div class="pad">${head("Get started")}<div class="grow"></div><h1>Start from<br><span class="acc">฿${PAID} a month.</span></h1>${sp(36)}
<p class="lead">Premium is ฿${PREM}. Explore the live demo first, no account needed. Cancel any time.</p>${sp(48)}<div><span class="btn">lekhafinancial.com</span></div><div class="grow"></div><div class="foot">${DISC}</div></div>`);

add("A-story1", W, SH, "A", sPad(`${head("Investment intelligence")}${sp(100)}<h1 style="font-size:92px">Institutional-grade research.<br><span class="acc">From ฿${PAID} a month.</span></h1>${sp(44)}<p class="lead">Portfolio, filings, valuation, macro data and a cited AI analyst in one workspace.</p><div class="grow"></div>`));
add("A-story2", W, SH, "A", sPad(`${head("Monthly price compared")}${sp(50)}<h2>LEKHA Paid is priced below<br><span class="acc">every platform shown.</span></h2>${sp(34)}${chart(W - 168, 80, 23)}<div class="grow"></div><div class="foot">${SRC_NOTE}</div>`));
add("A-story3", W, SH, "A", sPad(`${head("Get started")}<div class="grow"></div><h1 style="font-size:92px">฿${PAID} a month.<br><span class="acc">฿${PREM} for Premium.</span></h1>${sp(50)}<div><span class="btn">lekhafinancial.com</span></div><div class="grow"></div><div class="foot">${DISC}</div>`));
add("A-square", W, W, "A", `<div class="pad" style="padding:64px 72px 56px">${head("Monthly price compared")}${sp(26)}<h2 style="font-size:46px">LEKHA Paid is priced below<br><span class="acc">every platform shown.</span></h2>${sp(4)}${chart(W - 144, 38, 18)}<div class="grow"></div><div class="foot" style="font-size:16px;margin-top:8px;padding-top:12px">${SRC_NOTE}</div></div>`);

/* ================= SET B: brand awareness ================= */
add("B1-intro", W, H, "B", `<div class="pad">${head("LEKHA Financials")}<div class="grow"></div><h1>One workspace for the<br>whole <span class="acc">research process.</span></h1>${sp(36)}
<p class="lead">Portfolio, companies, filings, news, macro data and an AI analyst that cites its sources.</p><div class="grow"></div><div class="foot">Analysis software, not investment advice.</div></div>`);
add("B2-sources", W, H, "B", `<div class="pad">${head("Research")}${sp(70)}<h1 style="font-size:72px">Answers that<br>show their sources.</h1>${sp(34)}<p class="lead">Ask in plain language. The agent retrieves the evidence first, then labels each claim as fact, calculation, interpretation or speculation.</p>${sp(40)}
${[["13", "data tools", "Quotes, SEC filings, news, macro, peers, ratios and valuation."], ["100%", "of cited numbers checked", "Each figure is verified against the evidence it cites."], ["0", "arithmetic by the model", "Calculations run in a tested engine."]].map(([a, b, c]) => `<div style="display:flex;align-items:baseline;gap:30px;padding:24px 0;border-top:1px solid var(--line)"><div class="fig" style="font-size:64px;width:210px;color:var(--accent)">${a}</div><div><div style="font-size:28px;font-weight:700">${b}</div><div style="font-size:23px;color:var(--muted);margin-top:4px">${c}</div></div></div>`).join("")}<div class="grow"></div></div>`);
add("B3-reach", W, H, "B", `<div class="pad">${head("Made for you")}${sp(70)}<h1 style="font-size:78px"><span class="acc">100</span> themes.<br><span class="acc">10</span> languages.</h1>${sp(34)}
<p class="lead">English, Thai, Chinese (Simplified and Traditional), Japanese, Korean, Spanish, Hindi, Vietnamese and French. The AI analyst answers in yours.</p>${sp(44)}
<div style="display:flex;gap:20px">${[["LEKHA Light", "#F6F4EF", "#FFFFFF", "#0E1A2E", "#8F6410"], ["LEKHA Teal Light", "#F3F1EA", "#FFFFFF", "#14171C", "#0A7A6A"], ["LEKHA Navy", "#0B1220", "#121B2B", "#F5F7FA", "#D9A441"], ["LEKHA Teal", "#0B0E11", "#13181D", "#EDF0F3", "#3DCDAA"]].map(([n, bg, pn, fg, ac]) => `<div style="flex:1;background:${bg};border:1px solid #CFC8BA;padding:16px"><div style="height:52px;background:${pn};display:flex;align-items:center;gap:10px;padding:0 12px"><div style="width:14px;height:14px;border-radius:50%;background:${ac}"></div><div style="height:8px;flex:1;background:${fg};opacity:.6"></div></div><div style="font-size:18px;font-weight:600;color:${fg};margin-top:12px">${n}</div></div>`).join("")}</div><div class="grow"></div></div>`);
add("B4-follow", W, H, "B", `<div class="pad">${head("LEKHA Financials")}<div class="grow"></div><h1>Follow for<br><span class="acc">market intelligence.</span></h1>${sp(36)}<p class="lead">@lekha_financials on Instagram<br>lekhafinancial.com</p>${sp(48)}<div><span class="btn">Follow</span></div><div class="grow"></div><div class="foot">Analysis software, not investment advice.</div></div>`);
add("B-story1", W, SH, "B", sPad(`${head("LEKHA Financials")}<div class="grow"></div><h1 style="font-size:92px">One workspace for the whole <span class="acc">research process.</span></h1>${sp(40)}<p class="lead">Portfolio, filings, news, macro data and a cited AI analyst.</p><div class="grow"></div>`));
add("B-story2", W, SH, "B", sPad(`${head("Follow")}<div class="grow"></div><h1 style="font-size:92px">Follow<br><span class="acc">@lekha_financials</span></h1>${sp(40)}<p class="lead">Market intelligence, explained with sources.</p><div class="grow"></div><div class="foot">Analysis software, not investment advice.</div>`));
add("B-square", W, W, "B", `<div class="pad" style="padding:72px 84px">${head("LEKHA Financials")}<div class="grow"></div><h1 style="font-size:76px">Research that<br><span class="acc">shows its sources.</span></h1>${sp(26)}<p class="lead" style="font-size:28px">lekhafinancial.com</p><div class="grow"></div></div>`);

/* ================= SET C: features ================= */
const feat = (name, tag, title, intro, items, note) => add(name, W, H, "C", `<div class="pad">${head(tag)}${sp(54)}<h2>${title}</h2>${sp(18)}<p class="lead" style="font-size:30px">${intro}</p>${sp(26)}
${items.map(([h, p], i) => `<div class="def" style="flex:1;align-content:center${i === items.length - 1 ? ";border-bottom:none" : ""}"><div class="n">0${i + 1}</div><div><h3>${h}</h3><p>${p}</p></div></div>`).join("")}<div class="foot">${note || "Analysis software, not investment advice. Data may be delayed."}</div></div>`);

add("C1-cover", W, H, "C", `<div class="pad">${head("The LEKHA toolkit")}<div class="grow"></div><h1>Everything a<br><span class="acc">research desk</span><br>needs.</h1>${sp(40)}<p class="lead">Seven capabilities, one workspace, one account. Swipe through the toolkit.</p><div class="grow"></div><div class="foot">${DISC}</div></div>`);
feat("C2-portfolio", "01 · Portfolio", "Your holdings, measured.", "Value, performance and risk, written in plain language.", [
  ["Overview and ledger", "Total value, daily move and unrealized P&amp;L against the S&amp;P 500 and Nasdaq. Every lot with cost, value and weight."],
  ["Risk", "Largest positions, concentration, drawdown alerts, top movers and biggest losers."],
  ["Import", "Broker statements as PDF, screenshot or CSV. Export your data at any time."]]);
feat("C3-company", "02 · Company research", "One workspace per company.", "Search any company, ETF, index or crypto asset.", [
  ["Nine research views", "Price, financials, valuation, growth, news, filings, earnings, peers and the AI analyst."],
  ["Primary-source fundamentals", "Statements and filings from SEC EDGAR for US filers, with the filing date and source shown."],
  ["Ratios and growth", "CAGR, margins, ROE, ROIC, leverage, free cash flow and earnings yield, calculated by the engine."]]);
feat("C4-valuation", "03 · Valuation", "Intrinsic value, explicit.", "Models you can inspect, not a single opaque number.", [
  ["DCF and residual income", "Per-holding fair value with WACC, CAPM and stated assumptions."],
  ["Margin of safety", "Distance between price and intrinsic value, with valuation dispersion and history."],
  ["Deep analysis", "One holding at a time: price, position, risk, valuation, analysts and headlines."]]);
feat("C5-macro", "04 · Macro and rotation", "Context for every position.", "Rates, inflation and where money is moving.", [
  ["Macro dashboard", "Fed funds, Treasury yields, CPI, PPI, unemployment, payrolls, GDP and M2 from FRED."],
  ["Relative rotation graph", "Sector quadrants with trails: leading, weakening, lagging and improving."],
  ["Breadth and leadership", "Constituent breadth, RSI bands, overbought and oversold detection, factor-adjusted strength."]]);
feat("C6-simulation", "05 · Simulation", "Probabilities, not point estimates.", "Run scenarios on your actual holdings.", [
  ["Monte Carlo", "Up to 1M paths on worker threads: fan chart, return distribution and value at risk."],
  ["Stress tests", "Rate shock, technology drawdown and recession scenarios on your portfolio."],
  ["Projection lab", "Growth scenarios across five horizons with dated catalysts."]], "Monte Carlo, stress tests and council reports are Premium features. Simulations are hypothetical.");
feat("C7-ai", "06 · AI research", "An analyst that cites its sources.", "Thirteen tools, evidence first, answer second.", [
  ["Retrieval before writing", "Quotes, filings, news, macro and peers are fetched before any answer is drafted."],
  ["Typed claims", "Every claim is labelled fact, calculated, interpretation or speculation."],
  ["Verified numbers", "Each figure in a fact or calculated claim is checked against its cited evidence."]]);
feat("C8-access", "07 · Built for you", "Your workspace, your way.", "Configured once, available everywhere you sign in.", [
  ["Ten languages", "English, Thai, Chinese, Japanese, Korean, Spanish, Hindi, Vietnamese and French."],
  ["One hundred themes", "Light and dark, with a contrast check on every theme."],
  ["Guided start", "A ten-step tour, a command palette and a live demo that needs no account."]]);
add("C9-cta", W, H, "C", `<div class="pad">${head("Get started")}<div class="grow"></div><h1>See it for<br><span class="acc">yourself.</span></h1>${sp(36)}<p class="lead">Open the live demo, then choose Paid at ฿${PAID} or Premium at ฿${PREM} a month.</p>${sp(48)}<div><span class="btn">lekhafinancial.com</span></div><div class="grow"></div><div class="foot">${DISC}</div></div>`);
add("C-story1", W, SH, "C", sPad(`${head("The LEKHA toolkit")}<div class="grow"></div><h1 style="font-size:92px">Everything a <span class="acc">research desk</span> needs.</h1>${sp(40)}<p class="lead">Portfolio, company research, valuation, macro, simulation and cited AI.</p><div class="grow"></div>`));
add("C-story2", W, SH, "C", sPad(`${head("Seven capabilities")}<div style="flex:1;display:flex;flex-direction:column;margin-top:10px">${[["01", "Portfolio and risk"], ["02", "Company research"], ["03", "Valuation"], ["04", "Macro and rotation"], ["05", "Simulation"], ["06", "Cited AI research"], ["07", "Ten languages, 100 themes"]].map(([a, b], i, all) => `<div style="flex:1;display:flex;gap:28px;align-items:center;${i < all.length - 1 ? "border-bottom:1px solid var(--line)" : ""}"><span style="font-size:24px;font-weight:600;color:var(--accent)">${a}</span><span style="font-size:44px;font-weight:700;letter-spacing:-.02em">${b}</span></div>`).join("")}</div>`));
add("C-story3", W, SH, "C", sPad(`${head("Get started")}<div class="grow"></div><h1 style="font-size:92px">See it for <span class="acc">yourself.</span></h1>${sp(44)}<div><span class="btn">lekhafinancial.com</span></div><div class="grow"></div><div class="foot">${DISC}</div>`));
add("C-square", W, W, "C", `<div class="pad" style="padding:72px 84px">${head("The LEKHA toolkit")}<div class="grow"></div><h1 style="font-size:72px">Everything a research desk needs.</h1>${sp(26)}<p class="lead" style="font-size:28px">Portfolio · Company research · Valuation<br>Macro · Simulation · Cited AI</p><div class="grow"></div></div>`);

/* ---------- write + render ---------- */
for (const [n, s] of Object.entries(S)) writeFileSync(join(SRC, n + ".html"), s.html);
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require("playwright")); } catch { ({ chromium } = require(join(process.env.NODE_PATH || "", "playwright"))); }
const browser = await chromium.launch();
for (const [n, s] of Object.entries(S)) {
  const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.goto("file://" + join(SRC, n + ".html"), { waitUntil: "load" }).catch(() => {});
  await p.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
  await p.waitForTimeout(300);
  const bad = await p.evaluate(() => { const pad = document.querySelector(".pad"), r = [], W = innerWidth, H = innerHeight;
    if (pad.scrollHeight > pad.clientHeight + 1) r.push("pad overflows by " + (pad.scrollHeight - pad.clientHeight));
    for (const e of document.querySelectorAll("body *")) { if (e.classList.contains("pad")) continue; const b = e.getBoundingClientRect(); if (b.width && (b.right > W - 40 || b.left < 40 && e.tagName !== "svg" || b.bottom > H - 40)) { if (!e.closest("svg") || e.tagName === "text") r.push(e.tagName + " " + Math.round(b.left) + "," + Math.round(b.top) + "," + Math.round(b.right) + "," + Math.round(b.bottom) + " " + (e.textContent || "").slice(0, 30)); } }
    return r.slice(0, 6); });
  if (bad.length) console.log("CHECK", n, JSON.stringify(bad));
  await p.screenshot({ path: join(OUT, n + ".png") });
  await ctx.close();
}
await browser.close();
const names = { A: "Set A: paid subscription", B: "Set B: brand awareness", C: "Set C: feature explainer" };
const sections = ["A", "B", "C"].map((k) => `<h2>${names[k]}</h2><div class="g">${Object.entries(S).filter(([, s]) => s.set === k).map(([n, s]) => `<figure><img src="out/${n}.png" loading="lazy"><figcaption>${n} · ${s.w}x${s.h}</figcaption></figure>`).join("")}</div>`).join("");
writeFileSync(join(here, "index.html"), `<!doctype html><meta charset="utf-8"><title>LEKHA ad set preview</title><style>body{background:#FCF7F0;color:#17223B;font-family:Inter,system-ui,sans-serif;margin:0;padding:40px}h2{margin:40px 0 16px}img{width:100%;border:1px solid #E3DCCF}figure{margin:0}figcaption{font-size:13px;color:#6E685C;margin:6px 0 22px}.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:20px}</style><h1>LEKHA Financials ad set</h1>${sections}`);
console.log("rendered", Object.keys(S).length, "slides");
