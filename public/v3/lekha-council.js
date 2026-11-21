/* LEKHA V3 LLM Council: five analytical perspectives + one CEO synthesis, all from ONE model response.
   Premium (signed in, not demo): one POST /api/ai/council-v3 per explicit "Convene" click (server enforces Premium).
   Everyone else: deterministic pre-written scenarios from council-demo.json — zero AI requests, clearly labelled. */
const LENSES = [
  ["investor", "01", "The Investor", "Opportunity discovery", "Where is the best investment opportunity?", '<circle cx="12" cy="12" r="8"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>'],
  ["analyst", "02", "The Analyst", "Quantitative & fundamental", "What does the evidence actually support?", '<path d="M5 19V11M10 19V6M15 19v-5M20 19V9M3 19h19"/>'],
  ["pessimist", "03", "The Pessimist", "Downside & stress testing", "What could go wrong, and how severe?", '<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M12 8v5M12 16v.5"/>'],
  ["allocator", "04", "The Allocator", "Sizing & construction", "How much capital, if any?", '<circle cx="12" cy="12" r="8"/><path d="M12 4v8h8"/>'],
  ["optimist", "05", "The Optimist", "Long-term growth", "What could make this far more valuable?", '<path d="M4 17l6-6 4 4 6-8"/><path d="M15 7h5v5"/>'],
];
const CEO_ICON = '<path d="M4 20h16M6 20V10M10 20V10M14 20V10M18 20V10M3 10l9-6 9 6z"/>';
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const icon = (p) => `<svg viewBox="0 0 24 24" class="cn-ic" aria-hidden="true">${p}</svg>`;
const reduce = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
const isLive = () => !window.PT_DEMO_MODE && window.PT_TIER === "premium";
const nsKey = () => {
  if (window.PT_DEMO_MODE) return "ptpub.v1.demo.v3.council";
  const email = window.PT_AUTH?.session()?.email;
  if (!email) throw new Error("Account identity unavailable");
  return "ptpub.v1.v3.council." + encodeURIComponent(email.toLowerCase());
};
const store = { get() { try { return JSON.parse(localStorage.getItem(nsKey()) || "[]"); } catch (e) { return []; } }, add(r) { try { const a = store.get(); a.unshift(r); localStorage.setItem(nsKey(), JSON.stringify(a.slice(0, 20))); } catch (e) {} } };

let host, demo = null, st = { phase: "idle", report: null, err: null, q: "", scope: "portfolio", shown: 0, timers: [] };

/* ---------- evidence pack: reuses results the page already computed (no new data fetch) ---------- */
function evidence() {
  const A = window.PT_APP, S = A && A.S; if (!S || !A.lekha) return {};
  const { list, total } = A.lekha.aggregate(); const ev = { asOf: {} };
  try { if (!S.vres && S.fundLoaded) A.lekha.computeVal(); } catch (e) {}
  const res = S.vres && S.vres.res;
  if (res) ev.valuation = Object.values(res).filter((v) => v && v.px && isFinite(v.up)).sort((a, b) => (b.weight || 0) - (a.weight || 0)).slice(0, 15).map((v) => ({
    tk: v.t, price: v.px, iv: v.px * (1 + v.up), mos: v.mos != null ? v.mos * 100 : null, bear: isFinite(v.down) ? v.px * (1 + v.down) : null, base: v.px * (1 + v.up),
    bull: isFinite(v.bullUp) ? v.px * (1 + v.bullUp) : null, weightPct: v.weight != null ? v.weight * 100 : null, method: v.method, asOf: v.asOf }));
  if (total > 0) {
    const inv = list.filter((a) => a.ticker !== "CASH").sort((a, b) => b.value - a.value), w = inv.map((a) => a.value / total), cash = list.filter((a) => a.ticker === "CASH").reduce((s, a) => s + a.value, 0);
    const hhi = w.reduce((s, x) => s + (x * 100) ** 2, 0), th = {};
    inv.forEach((a) => { th[a.theme || "Other"] = (th[a.theme || "Other"] || 0) + a.value / total * 100; });
    ev.concentration = { top1Pct: (w[0] || 0) * 100, top5Pct: w.slice(0, 5).reduce((s, x) => s + x, 0) * 100, hhi, effectiveN: hhi ? 10000 / hhi : null, cashPct: cash / total * 100,
      sectors: Object.entries(th).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, pct]) => ({ name, pct })) };
  }
  const sim = window.LEKHA_SIM_LAST;
  if (sim) { ev.simulation = { model: sim.modelVersion, horizon: sim.horizon, requestedPaths: sim.requestedPaths, completedPaths: sim.completedPaths, p5Pct: sim.p5 * 100, p50Pct: sim.p50 * 100, p95Pct: sim.p95 * 100, pGainPct: sim.pGain * 100, pLoss10Pct: sim.pLoss10 * 100, medianDrawdownPct: sim.ddMedian * 100 }; ev.asOf.simulation = sim.at; }
  const spx = S.hist && S.hist["INDEXSP:.INX"] && S.hist["INDEXSP:.INX"].D; if (spx) ev.asOf.prices = new Date(spx[spx.length - 1][0]).toISOString();
  return ev;
}

/* ---------- rendering ---------- */
function holdings() { try { return window.PT_APP.lekha.aggregate().list.filter((a) => a.ticker !== "CASH").sort((a, b) => b.value - a.value).map((a) => a.ticker); } catch (e) { return []; } }
function frame() {
  const live = isLive(), samples = (demo && demo.scenarios) || [];
  host.innerHTML = `<section class="panel cn">
  <div class="sim-head"><div><p class="sim-eyebrow">LEKHA LLM COUNCIL</p><h2 class="sim-title">Five perspectives · one CEO synthesis</h2>
  <p class="sim-sub">One research question is examined through five analytical lenses in a single model response, then reconciled by the CEO into a final verdict. Dissent is kept, not averaged away.</p></div>
  <div class="sim-tags">${live ? '<span class="pill live">PREMIUM · LIVE</span>' : '<span class="pill">SAMPLE COUNCIL · DEMONSTRATION</span>'}</div></div>
  <form class="cn-form" id="cn-form"><textarea id="cn-q" rows="2" maxlength="600" placeholder="${live ? "Ask a research question about your portfolio or one holding…" : "Choose a sample question below to explore the Council"}" ${live ? "" : "readonly"}>${esc(st.q)}</textarea>
    <div class="row"><label class="note">Scope <select id="cn-scope" class="btn"${live ? "" : " disabled"}><option value="portfolio">Whole portfolio</option>${holdings().map((t) => `<option${st.scope === t ? " selected" : ""}>${esc(t)}</option>`).join("")}</select></label>
    <button class="btn pri" type="submit" id="cn-go"${live ? "" : " hidden"}>Convene the Council</button>
    ${live || window.PT_DEMO_MODE ? "" : `<span class="note">Live, personalised Council analysis is a Premium feature. <a href="#" id="cn-up">Upgrade to Premium</a></span>`}</div></form>
  <div class="cn-samples">${samples.map((s) => `<button class="btn" type="button" data-sid="${esc(s.id)}">${esc(s.question)}</button>`).join("")}</div>
  <div id="cn-board"></div></section>`;
  const sc = host.querySelector("#cn-scope"); if (sc) sc.value = st.scope;
  host.querySelector("#cn-form").onsubmit = (e) => { e.preventDefault(); convene(); };
  host.querySelectorAll("[data-sid]").forEach((b) => (b.onclick = () => playDemo(b.dataset.sid)));
  const up = host.querySelector("#cn-up"); if (up) up.onclick = (e) => { e.preventDefault(); const b = document.getElementById("tb-set"); if (b) b.click(); };
  board();
}
function board() {
  const el = host.querySelector("#cn-board"); if (!el) return;
  const r = st.report, P = r && r.perspectives, isDemo = r && r.meta && r.meta.demo;
  if (st.phase === "idle" && !r) { el.innerHTML = `<div class="cn-grid">${LENSES.map((L) => card(L, null, "idle")).join("")}</div>${links()}<div class="cn-ceo idle">${icon(CEO_ICON)}<b>THE CEO</b><span>Awaiting the five perspectives</span></div>`; return; }
  const status = (i) => st.phase === "session" ? "working" : st.phase === "error" ? "failed" : i < st.shown ? "done" : "queued";
  const ceoOn = st.phase === "done" && st.shown > LENSES.length;
  el.innerHTML = `${st.phase === "session" ? `<p class="note cn-wait">Council in session — one structured request is being answered…</p>` : ""}${st.err ? `<p class="note warn">${esc(st.err)}</p>` : ""}
  <div class="cn-grid">${LENSES.map((L, i) => card(L, P && P[L[0]], status(i), isDemo)).join("")}</div>${links(st.shown)}
  <div class="cn-ceo ${ceoOn ? "on" : ""}">${icon(CEO_ICON)}<b>THE CEO</b>${ceoOn ? `<span class="cn-verdict v-${esc((r.ceo.verdict || "").split(" ")[0].toLowerCase())}">${esc(r.ceo.verdict)}</span>` : `<span>${st.phase === "error" ? "No verdict" : "Synthesising…"}</span>`}</div>
  ${ceoOn ? report(r) : ""}`;
  el.querySelectorAll('.cn-card[role="button"]').forEach((card) => {
    card.onclick = () => card.setAttribute("aria-expanded", card.classList.toggle("open"));
    card.onkeydown = (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); card.click(); }
    };
  });
}
function card(L, p, status, isDemo) {
  const [k, n, name, role, q, ic] = L, s = { idle: "Standing by", queued: "Queued", working: "Analysing", done: p ? p.stance : "", failed: "Unavailable" }[status];
  return `<div class="cn-card ${status} ${p && status === "done" ? "st-" + esc(p.stance) : ""}" data-l="${k}" ${p && status === "done" ? 'role="button" tabindex="0" aria-expanded="false"' : ''}>
    <div class="cn-top">${icon(ic)}<span class="cn-n">JUDGE ${n}</span><span class="cn-st">${esc(s)}</span></div><b class="cn-name">${name}</b><span class="cn-role">${role}</span>
    ${p && status === "done" ? `<p class="cn-head">${esc(p.headline)}</p><div class="cn-more"><h4>${esc(q)}</h4><ul>${(p.points || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>${(p.risks || []).length ? `<h4>Risks to this view</h4><ul>${p.risks.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}</div><span class="cn-x">Details</span>` : `<p class="cn-q">${esc(q)}</p>`}</div>`;
}
function links(shown = 0) {
  const xs = [10, 30, 50, 70, 90];
  return `<svg class="cn-links" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true">${xs.map((x, i) => `<path d="M${x} 0 C ${x} 14, 50 10, 50 24" class="${i < shown ? "on" : ""}"/>`).join("")}</svg>`;
}
function report(r) {
  const c = r.ceo, m = r.meta || {}, isDemo = m.demo, sec = (t, b) => b ? `<div class="cn-sec"><h4>${t}</h4>${b}</div>` : "";
  const P = (x) => (x ? `<p>${esc(x)}</p>` : ""), UL = (a) => (a && a.length ? `<ul>${a.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "");
  const agree = UL(c.agree), dissent = c.dissent && c.dissent.length ? `<ul>${c.dissent.map((d) => `<li><b>${esc(d.lens)}:</b> ${esc(d.reason)}</li>`).join("")}</ul>` : "<p>No material dissent recorded.</p>";
  return `<article class="cn-report"><header><p class="sim-eyebrow">LEKHA INVESTMENT INTELLIGENCE REPORT</p><h3>${esc(r.question)}</h3>
    <p class="note">Scope: ${esc(r.scope === "portfolio" ? "whole portfolio" : r.scope)} · ${isDemo ? `sample report` : `generated ${esc((m.generatedAt || "").slice(0, 16).replace("T", " "))} UTC · ${m.cached ? "cached answer" : (m.llmRequests ? m.llmRequests + " model request" + (m.llmRequests === 1 ? "" : "s") : "generated report")}${m.retries ? ` (${m.retries} transport retr${m.retries > 1 ? "ies" : "y"})` : ""}${m.fallback ? ` · ${esc(m.fallback)}` : ""}`}</p></header>
    <div class="cn-exec"><span class="cn-verdict v-${esc((c.verdict || "").split(" ")[0].toLowerCase())}">${esc(c.verdict)}</span>${P(c.executive)}</div>
    <div class="cn-cols">${sec("Investment thesis", P(c.thesis))}${sec("Valuation assessment", P(c.valuation))}${sec("Bull case", P(c.bullCase))}${sec("Bear case", P(c.bearCase))}${sec("Portfolio implications", P(c.portfolio))}${sec("Council consensus", (agree ? "<h5>Agreement</h5>" + agree : "") + "<h5>Dissent</h5>" + dissent)}${sec("Confidence & evidence quality", P(c.evidenceQuality) + UL(c.limitations))}</div>
    <div class="cn-final"><h4>Final CEO verdict</h4>${P(c.final)}</div>
    ${!isDemo && m.dataAsOf ? `<p class="note">Data timestamps: ${esc(Object.entries(m.dataAsOf).map(([k, v]) => k + " " + v).join(" · "))}</p>` : ""}
    <p class="note">Five perspectives produced by one model in one structured response, then synthesised. Not investment advice.</p></article>`;
}

/* ---------- flows ---------- */
function clearTimers() { st.timers.forEach(clearTimeout); st.timers = []; }
function reveal() {
  st.shown = 0; board();
  const step = reduce() ? 0 : 420;
  for (let i = 1; i <= LENSES.length + 1; i++) st.timers.push(setTimeout(() => { st.shown = i; board(); }, step * i));
}
function playDemo(id) {
  if (!demo) return; const s = demo.scenarios.find((x) => x.id === id); if (!s) return;
  clearTimers(); st.q = s.question; st.scope = s.scope || "portfolio"; st.err = null;
  st.report = { ...s, meta: { ...(s.meta || {}), demo: true } };
  const q = host.querySelector("#cn-q"); if (q) q.value = s.question;
  host.querySelectorAll("[data-sid]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.sid === id));
  st.phase = "session"; board();
  st.timers.push(setTimeout(() => { st.phase = "done"; reveal(); }, reduce() ? 0 : 900));
}
async function convene() {
  if (!isLive()) return; /* never call the model outside Premium; the server enforces this too */
  const q = host.querySelector("#cn-q").value.trim(), scope = host.querySelector("#cn-scope").value;
  if (q.length < 3) { st.phase = "error"; st.report = null; st.err = "Type a research question first."; board(); return; }
  clearTimers(); st.q = q; st.scope = scope; st.err = null; st.report = null; st.phase = "session"; board();
  host.querySelector("#cn-go").disabled = true;
  try {
    const lang = (window.PT_I18N && PT_I18N.lang) || "en";
    const r = await PT_AUTH.fetch("/api/ai/council-v3", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q, scope, evidence: evidence(), lang }) });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j || !j.ceo) throw new Error((j && j.error) || "The council could not answer right now.");
    st.report = { ...j, question: q, scope }; st.phase = "done"; store.add({ ...st.report, savedAt: new Date().toISOString() });
    /* the saved report also becomes retrieval material for the research agent (owner-scoped) */
    try {
      const c = st.report.ceo || {}, P = st.report.perspectives || {};
      const text = [`QUESTION: ${q}`, `VERDICT: ${c.verdict || ""}`, `EXECUTIVE: ${c.executive || ""}`, `THESIS: ${c.thesis || ""}`, `VALUATION: ${c.valuation || ""}`, `BULL: ${c.bullCase || ""}`, `BEAR: ${c.bearCase || ""}`, `PORTFOLIO: ${c.portfolio || ""}`, `FINAL: ${c.final || ""}`]
        .concat(Object.keys(P).map((k) => `${k.toUpperCase()}: ${(P[k] && P[k].headline) || ""} — ${((P[k] && P[k].points) || []).join("; ")}`)).join("\n");
      if (window.PT_AUTH && PT_AUTH.session && PT_AUTH.session()) PT_AUTH.fetch("/api/rag", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "ingest", kind: "report", ref: "council:" + (st.report.savedAt || Date.now()), title: "Council report · " + q.slice(0, 80), text: text.slice(0, 18000), scope }) }).catch(() => {});
    } catch (e) {}
    reveal(); reports();
  } catch (e) { st.phase = "error"; st.err = e.message; board(); }
  finally { const g = host.querySelector("#cn-go"); if (g) g.disabled = false; }
}

/* ---------- AI Research Reports list (saved live reports + the sample reports) ---------- */
function reports() {
  const el = document.getElementById("lekha-reports"); if (!el) return;
  const saved = store.get(), samples = (demo && demo.scenarios) || [];
  el.innerHTML = `<section class="panel"><div class="ph"><h2>Council reports</h2><span class="note">Live reports are kept in this browser (last 20). Samples show what a report looks like.</span></div>
    ${saved.length ? `<ul class="cn-list">${saved.map((r, i) => `<li><button class="btn" data-rep="${i}">${esc(r.ceo && r.ceo.verdict)} · ${esc(r.question)}</button><span class="note">${esc((r.savedAt || "").slice(0, 10))}</span></li>`).join("")}</ul>` : `<p class="note">No live Council reports yet${isLive() || window.PT_DEMO_MODE ? "." : " — live reports are a Premium feature."}</p>`}
    <h3>Sample reports</h3><ul class="cn-list">${samples.map((s) => `<li><button class="btn" data-sample="${esc(s.id)}">${esc(s.ceo.verdict)} · ${esc(s.question)}</button></li>`).join("")}</ul></section>`;
  el.querySelectorAll("[data-rep]").forEach((b) => (b.onclick = () => { clearTimers(); st.report = saved[+b.dataset.rep]; st.q = st.report.question; st.phase = "done"; st.shown = LENSES.length + 1; window.LEKHA_SHELL.go("analysis/council"); frame(); }));
  el.querySelectorAll("[data-sample]").forEach((b) => (b.onclick = () => { window.LEKHA_SHELL.go("analysis/council"); playDemo(b.dataset.sample); }));
}

export function prefill(q, scope) {
  st.q = q; st.scope = scope || "portfolio"; frame();
  if (!isLive() && demo) { const s = demo.scenarios.find((x) => x.scope === scope) || demo.scenarios.find((x) => /risk/i.test(x.question)); if (s) playDemo(s.id); }
}
export async function mount(el) {
  host = el;
  try { const r = await fetch("/v3/council-demo.json"); demo = await r.json(); } catch (e) { demo = { scenarios: [] }; }
  frame(); reports();
  window.LEKHA_COUNCIL = { prefill };
  let lastLive = isLive();
  setInterval(() => { if (isLive() !== lastLive) { lastLive = isLive(); frame(); reports(); } }, 2000); /* tier resolves after sign-in */
}
