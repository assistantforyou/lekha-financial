/* v2 Outlook: "The Council". Nine investor personas run through the same thousands of simulated futures of YOUR portfolio.
   Upcoming events carry what analysts, the media and recent price action say, and that shifts their simulated size.
   Every number on this screen is produced by core/engine.js in your browser; the count of futures shown is the count run. */
import { t, fmtDate, fmtNum, getLang } from "/core/i18n.js";
import { D, positions } from "/core/data.js";
import { buildEvents, runCouncil, reasons, summaryFor, PERSONAS, HORIZONS } from "/core/council.js";
import { LineChart } from "/core/charts.js";
import { ai, tierName, isDemo, me as getMe } from "/core/store.js";
import { esc } from "/core/util.js";
import { cacheGet, cacheSet } from "/core/cache.js";
import { icon, cardHead, pct, tone } from "../ui.js";
import { segHtml, bindSeg, leanBar, leanLabel, leanTone, eventName, dateChip, inDays } from "./shared.js";
import { openAuth } from "../sheets.js";

let hz = "1Y", paths = 5000, res = null, inp = null, running = false, prog = 0, error = "", openP = null, openE = null, sig = "", aiOut = {}, chart = null, ctxRef = null;
const META = {
  you: { c: "#5b6572" }, compounder: { c: "#0a7a6a" }, growth: { c: "#6b4fd6" }, momentum: { c: "#d6641f" }, macro: { c: "#2f6fc4" },
  income: { c: "#8a7a2a" }, contrarian: { c: "#b3407a" }, quant: { c: "#1f8aa6" }, fomo: { c: "#c63a2f" },
};
const name = (id) => ({ you: t("You, as is"), compounder: t("The Compounder"), growth: t("The Growth Hunter"), momentum: t("The Momentum Rider"), macro: t("The Macro Strategist"), income: t("The Steady Earner"), contrarian: t("The Contrarian"), quant: t("The Systematic Quant"), fomo: t("The Emotional Trader") }[id]);
const style = (id) => ({ you: t("Your holdings exactly as they are today."), compounder: t("Buys quality cheaply and holds for years."), growth: t("Pays up for fast-growing companies and rides the swings."), momentum: t("Buys what is rising and sells what is fading."), macro: t("Cuts risk when rates, inflation or mood look shaky."), income: t("Prefers calm stocks and keeps a cash cushion."), contrarian: t("Buys what others have beaten down."), quant: t("Sizes every position by its risk and aims for steady swings."), fomo: t("Chases winners and panic-sells after big drops.") }[id]);
const hzLabel = (k) => ({ "21D": t("1 month"), "3M": t("3 months"), "6M": t("6 months"), "1Y": t("1 year") }[k]);
const hzDays = () => HORIZONS.find((h) => h[0] === hz)[1];
const leanWord = (l) => (l > 0.25 ? t("bullish") : l < -0.25 ? t("bearish") : t("mixed"));
const dateAt = (day) => new Date(Date.now() + day * (365 / 252) * 864e5);

function reasonText(r, extra) {
  switch (r.k) {
    case "tilts": return r.hasAdd && r.hasTrim ? t("Adds to {add}; trims {trim} (percentage points of your portfolio).", { add: r.add, trim: r.trim }) : r.hasAdd ? t("Adds to {add} (percentage points of your portfolio).", { add: r.add }) : t("Trims {trim} (percentage points of your portfolio).", { trim: r.trim });
    case "tiltsNone": return t("Keeps your positions as they are.");
    case "cash": return t("Keeps about {pct}% in cash.", { pct: r.pct });
    case "driver": return t("{tk} drives about {pct}% of the expected gain.", { tk: r.tk, pct: r.pct });
    case "riskDriver": return t("{tk} is behind about {pct}% of the ups and downs.", { tk: r.tk, pct: r.pct });
    case "event": return t("Biggest event to watch: {name} ({when}). {lean}.", { name: eventName(r.ev), when: inDays(r.ev.calDays), lean: leanLabel(r.ev.lean) });
    case "vsYou": return r.d >= 0 ? t("In the middle of the simulated futures it ends {x} points ahead of doing nothing.", { x: Math.abs(r.d).toFixed(1) }) : t("In the middle of the simulated futures it ends {x} points behind doing nothing.", { x: Math.abs(r.d).toFixed(1) });
    case "bad": return t("In 1 of 20 bad futures it loses {p5}% or more, and the worst dip along the way is typically {dd}%.", { p5: Math.abs(Math.min(0, r.p5)).toFixed(0), dd: Math.abs(r.dd).toFixed(0) });
  }
  return "";
}
function eventsCard() {
  const ev = buildEvents().slice(0, 6);
  const part = (label, v, note) => `<div class="row" style="align-items:center"><span class="small" style="width:7.5rem">${esc(label)}</span><span style="flex:1;min-width:6rem">${v == null ? `<span class="tiny muted">${esc(t("not available"))}</span>` : leanBar(v)}</span><span class="tiny muted" style="flex-basis:100%">${esc(note)}</span></div>`;
  return `<div class="card">${cardHead(t("Events and what is already priced in"), `<p>${esc(t("Big dates can move prices a lot. Before each one we look at what analysts expect (ratings and price targets), what the news says, how far the price has already run, and the market mood."))}</p><p>${esc(t("If everyone is already bullish, good news may do little: it is 'priced in'. We nudge each event's simulated jump toward the lean (about 30% of its typical size), and shrink it when the stock has already run up. Dates marked 'estimated' follow the usual calendar and may shift by a few days."))}</p>`)}
    ${ev.length ? ev.map((e) => { const p = e.parts, o = openE === e.id; return `<div data-ev="${esc(e.id)}"><button class="evt" aria-expanded="${o}">${dateChip(e.date)}<span><b>${esc(eventName(e))}</b><br><span class="tiny muted">${esc(inDays(e.calDays))}${e.approx ? " · " + esc(t("estimated date")) : ""} · ${esc(t("typical swing ±{x}%", { x: (e.sigma * 100).toFixed(1) }))}</span></span><span style="width:5.5rem">${leanBar(e.lean)}<span class="tiny ${leanTone(e.lean)}" style="display:block;text-align:center;margin-top:.2rem">${esc(leanLabel(e.lean))}</span></span></button>
      ${o ? `<div class="stack" style="padding:.2rem 0 .9rem 3.7rem">${part(t("Analysts"), p.analyst, e.kind === "earnings" ? t("Rating mix and price-target upside for this stock.") : t("Average of analyst leanings across your holdings."))}${part(t("News and media"), p.media, e.kind === "earnings" ? t("Tone of recent headlines about this stock.") : t("Whether today's market stories are good or bad for stocks."))}${e.kind === "earnings" ? (p.runup != null ? `<div class="small">${esc(t("The stock moved {x} over the past month. A big run-up means good news may already be priced in.", { x: pct(p.runup, 1) }))}</div>` : "") : part(t("Market mood"), p.mood, t("From the fear and greed score."))}<div class="tiny muted">${esc(t("Used in the simulation: the event's jump is shifted toward this lean."))}</div></div>` : ""}</div>`; }).join("") : `<div class="muted small">${esc(D.loaded.street ? t("No dated events found yet.") : t("Loading events…"))}</div>`}</div>`;
}
function rangeBar(h, lo, hi) {
  const at = (v) => ((v - lo) / (hi - lo || 1)) * 100;
  return `<span class="rng"><span class="axis"></span><span class="zero" style="left:${at(0)}%"></span><span class="span" style="left:${at(h.p5)}%;width:${Math.max(1, at(h.p95) - at(h.p5))}%"></span><span class="med" style="left:${at(h.p50)}%"></span></span>`;
}
function personaRow(id, lo, hi) {
  const P = res.personas[id], h = P.hz[hz], o = openP === id;
  const letter = { you: "Y", compounder: "C", growth: "G", momentum: "M", macro: "A", income: "S", contrarian: "R", quant: "Q", fomo: "E" }[id];
  return `<div class="per ${o ? "open" : ""}" data-p="${id}"><button class="phead" aria-expanded="${o}"><span class="av" style="background:${META[id].c}">${letter}</span><span class="pn"><span class="nm" style="display:block">${esc(name(id))}</span><span class="st" style="display:block">${esc(style(id))}</span></span><span class="pmed ${tone(h.p50)}">${esc(pct(h.p50, 1))}</span>${rangeBar(h, lo, hi)}</button><div class="pbody" id="pb-${id}"></div></div>`;
}
function trades(id) {
  const P = res.personas[id]; if (!P || !inp) return "";
  const rows = inp.assets.map((a, i) => ({ tk: a.tk, now: a.w0 || 0, to: (P.w && P.w[i]) || 0 })).map((x) => ({ ...x, d: x.to - x.now })).filter((x) => Math.abs(x.d) >= 0.004).sort((a, b) => b.d - a.d);
  if (!rows.length) return `<div class="small muted">${esc(t("No positions change under this style."))}</div>`;
  const line = (x, buy) => `<div class="row"><b>${esc(x.tk)}</b><span class="sp"></span><span class="tiny muted">${esc(pct(x.now, 1, false))} → ${esc(pct(x.to, 1, false))}</span><span class="${buy ? "up" : "down"} small">${esc(buy ? t("Buy") : x.to <= 0.001 ? t("Exit") : t("Trim"))} ${esc(pct(Math.abs(x.d), 1, false))}</span></div>`;
  const buys = rows.filter((x) => x.d > 0).slice(0, 6), sells = rows.filter((x) => x.d < 0).slice(0, 6);
  return `<div class="stack"><h3>${esc(t("What they would do"))}</h3><div class="small muted">${esc(t("Target weights for the next 12 months from today's portfolio. The universe is your holdings plus index and sector ETFs, so a style can move money into areas you do not own yet."))}</div>
    <div class="kv2"><div><div class="tiny muted">${esc(t("Would buy"))}</div>${buys.map((x) => line(x, true)).join("") || `<div class="tiny muted">–</div>`}</div>
    <div><div class="tiny muted">${esc(t("Would trim or exit"))}</div>${sells.map((x) => line(x, false)).join("") || `<div class="tiny muted">–</div>`}</div></div></div>`;
}
function personaBody(id) {
  const P = res.personas[id], h = P.hz[hz], R = reasons(res, inp, id, hz), out = aiOut[id + hz + getLang()];
  const aiBlock = out ? `<div class="aiout"><b>${esc(out.headline)}</b><ul class="bul">${out.why.map((x) => `<li>${esc(x)}</li>`).join("")}</ul><div class="small"><b>${esc(t("What could go wrong"))}:</b> ${esc(out.risk)}</div><div class="small"><b>${esc(t("What would change this"))}:</b> ${esc(out.change)}</div></div>`
    : out === false ? `<div class="err small">${esc(t("Could not write the explanation right now. Try again in a moment."))}</div>` : "";
  return `<div class="stack"><div id="fan-${id}" style="min-height:14rem"></div><div class="legend"><span><i style="background:${META[id].c}"></i>${esc(t("Middle outcome"))}</span><span><i style="background:${META[id].c};opacity:.35;height:.5rem"></i>${esc(t("Likely range (middle 50%)"))}</span><span><i style="background:${META[id].c};opacity:.15;height:.5rem"></i>${esc(t("Wide range (90%)"))}</span>${id !== "you" ? `<span><i style="background:var(--chart2)"></i>${esc(t("Doing nothing"))}</span>` : ""}</div>
    <div class="kv"><div><span>${esc(t("Chance of a gain"))}</span><b class="${tone(h.pGain - 0.5)}">${Math.round(h.pGain * 100)}%</b></div><div><span>${esc(t("Chance of losing over 10%"))}</span><b>${Math.round(h.pLoss10 * 100)}%</b></div><div><span>${esc(t("Typical worst dip"))}</span><b>${Math.round(h.ddMed * 100)}%</b></div><div><span>${esc(t("Bad case (1 in 20)"))}</span><b class="${tone(h.p5)}">${esc(pct(h.p5, 0))}</b></div><div><span>${esc(t("Good case (1 in 20)"))}</span><b class="up">${esc(pct(h.p95, 0))}</b></div><div><span>${esc(t("Cash held"))}</span><b>${Math.round(P.cash * 100)}%</b></div></div></div>
    <div class="stack"><h3>${esc(t("Why this outcome"))}</h3><ul class="bul">${R.map((r) => `<li>${esc(reasonText(r))}</li>`).join("")}</ul>${trades(id)}${aiBlock}<div id="aibox-${id}">${aiButton(id)}</div></div>`;
}
function aiButton(id) {
  const tier = tierName(D.me);
  if (tier === "premium") return `<button class="btn" data-ai="${id}">${icon("spark")} ${esc(t("Explain in plain words with AI"))}</button>`;
  return `<div class="ailock">${icon("lock")} ${esc(t("An AI-written explanation of this persona is part of the Premium plan."))} <a href="#/me">${esc(t("See plans"))}</a></div>`;
}
function drawFan(id) {
  const host = document.getElementById("fan-" + id); if (!host || !res) return;
  const P = res.personas[id], Y = res.personas.you, cut = hzDays(), f = P.fan.filter((p) => p.day <= cut), y = Y.fan.filter((p) => p.day <= cut), toV = (p, k) => [p.day, p[k] * 100];
  const evs = inp.events.filter((e) => e.day <= cut).slice(0, 7).map((e, i) => ({ x: e.day, label: String(i + 1), tone: e.lean > 0.25 ? "up" : e.lean < -0.25 ? "down" : "" }));
  const series = [{ id: "p", color: META[id].c, pts: f.map((p) => toV(p, "p50")), width: 3 }]; if (id !== "you") series.push({ id: "y", color: "var(--chart2)", pts: y.map((p) => toV(p, "p50")), width: 1.8, dash: "5 4" });
  const opts = { series, bands: [{ hi: f.map((p) => toV(p, "p95")), lo: f.map((p) => toV(p, "p5")), color: META[id].c, opacity: 0.12 }, { hi: f.map((p) => toV(p, "p75")), lo: f.map((p) => toV(p, "p25")), color: META[id].c, opacity: 0.22 }], ref: 0, height: 250, markers: evs, label: t("Range of simulated outcomes"), xFmt: (x) => fmtDate(dateAt(x), { day: "numeric", month: "short" }), yFmt: (v) => (v > 0 ? "+" : "") + Math.round(v) + "%", tip: (x, r) => `<b>${esc(fmtDate(dateAt(x), { day: "numeric", month: "short", year: "numeric" }))}</b><br>${esc(t("Middle outcome"))} ${esc(pct(r[0].p[1] / 100, 1))}${(() => { const q = f.find((p) => p.day === r[0].p[0]); return q ? `<br>${esc(t("Range"))} ${esc(pct(q.p5, 0))} … ${esc(pct(q.p95, 0))}` : ""; })()}` };
  if (chart && chart.id === id) chart.c.update(opts); else { chart && chart.c.destroy(); chart = { id, c: LineChart(host, opts) }; }
}
async function start(rerender) {
  if (running) return; running = true; error = ""; prog = 0;
  const rows = positions().filter((r) => !r.cash);
  if (!rows.length) { running = false; return; }
  const ck = "council:" + (isDemo() ? "d" : "r") + ":" + positions().map((r) => r.tk + Math.round(r.qty)).join("|") + ":" + paths + ":" + new Date().toISOString().slice(0, 10);
  try {
    const hit = await cacheGet(ck, 3 * 36e5);
    if (hit) { res = hit.result; inp = hit.input; }
    else { const out = await runCouncil(paths, (p) => { prog = p; const b = document.querySelector("#runbar i"); if (b) b.style.width = Math.round(p * 100) + "%"; }); res = out.result; inp = out.input; cacheSet(ck, out); }
    sig = signature();
  } catch (e) { error = String(e && e.message || e); }
  running = false; rerender();
}
const signature = () => positions().map((r) => r.tk + Math.round(r.qty)).join("|") + "|" + paths + "|" + Object.keys(D.street).length + "|" + D.news.length;
function runCard() {
  if (running) return `<div class="card"><div class="small"><b>${esc(t("Running {n} simulated futures…", { n: fmtNum(paths) }))}</b></div><div class="runbar" id="runbar" style="margin-top:.5rem"><i style="width:${Math.round(prog * 100)}%"></i></div></div>`;
  if (error) return `<div class="card"><div class="err">${esc(t("The simulation could not run. Add some holdings and try again."))}</div></div>`;
  if (!res) return `<div class="card"><div class="small"><b>${esc(t("Preparing the simulation…"))}</b></div><div class="skel" style="height:2.4rem;margin-top:.5rem"></div></div>`;
  const sizes = [5000, 10000, 25000, 50000];
  return `<div class="card flat">${cardHead(t("How this was calculated"), `<p>${esc(t("We simulate {n} different ways the next year could unfold. Each one has a random market move every day, extra shock days around the events above, and noise in each of your stocks, using each stock's own past ups and downs. All nine personas live through the same futures, so differences come from their rules, not luck.", { n: fmtNum(res.paths) }))}</p><p>${esc(t("Expected returns are the interest rate plus market risk, nudged by analyst targets and news tone. It is a what-if model, not a forecast or advice."))}</p><p>${esc(t("Starting point: {mood}. Market swings assumed: {vol}% a year.", { mood: D.fgi ? t("mood score {s}", { s: Math.round(D.fgi.score) }) : t("mood unknown"), vol: (res.market.vol * 100).toFixed(0) }))}</p>`)}
    <div class="small muted">${esc(t("{n} futures × {d} trading days × 9 personas, run in {s} seconds on this device.", { n: fmtNum(res.paths), d: res.days, s: (res.ms / 1000).toFixed(1) }))}</div>
    <div class="row" style="margin-top:.6rem"><span class="small muted">${esc(t("Run more futures"))}:</span>${sizes.map((n) => `<button class="chip" data-paths="${n}" aria-pressed="${n === paths}">${fmtNum(n)}</button>`).join("")}</div></div>`;
}
function accuracyCard() {
  return `<div class="card flat">${cardHead(t("How accurate is this?"), `<p>${esc(t("Each of the nine investors is a rule set, not a real person or a fund: how much it tilts towards cheap, growing, trending or defensive stocks, how often it rebalances, and how much cash it holds. They all live through the same simulated futures, so the differences are the rules."))}</p>`)}
    <ul class="bul">
      <li>${esc(t("The futures are a Monte Carlo model, not a forecast. It uses each stock's past volatility, its sensitivity to the market and its recent trend, plus dated events. It cannot know earnings surprises, wars or policy changes."))}</li>
      <li>${esc(t("More runs make the numbers steadier, not truer: the sampling error falls with the square root of the number of paths, but the model's assumptions still set the answer."))}</li>
      <li>${esc(t("Probabilities are the share of simulated futures, not a measured chance. Treat the middle outcome as a centre of gravity and the range as the honest part."))}</li>
      <li>${esc(t("Costs, taxes, spreads and slippage are not modelled. Real rebalancing keeps less than the simulation shows."))}</li>
      <li>${esc(t("Every persona can only buy your holdings plus index and sector ETFs. It is a realistic menu, not the whole US market."))}</li>
    </ul></div>`;
}

export default {
  render() {
    const rows = positions().filter((r) => !r.cash);
    if (!rows.length) return `<div class="page"><div class="card"><div class="empty">${esc(t("Add holdings to see what could happen next."))}</div></div></div>`;
    if (running && !res || !res && !error) return `<div class="page">${eventsCard()}${runCard() || `<div class="card"><div class="skel" style="height:6rem"></div></div>`}</div>`;
    let lo = 0, hi = 0; for (const id of PERSONAS) { const h = res.personas[id].hz[hz]; lo = Math.min(lo, h.p5); hi = Math.max(hi, h.p95); }
    const order = [...PERSONAS].sort((a, b) => res.personas[b].hz[hz].p50 - res.personas[a].hz[hz].p50);
    return `<div class="page">${eventsCard()}
      <div class="card">${cardHead(t("Nine investors, one portfolio"), `<p>${esc(t("What if nine different kinds of investors managed your exact holdings? Each follows its own rules for what to hold, trim and avoid. Tap one to see its range of outcomes and the reasons behind them."))}</p><p>${esc(t("The bar shows the wide range (90% of futures fall inside it). The thick tick is the middle outcome. The thin line marks breaking even."))}</p>`)}
        <div class="row" style="margin-bottom:.8rem">${segHtml("hz", HORIZONS.map(([k]) => [k, hzLabel(k)]), hz)}${running ? `<span class="small muted sp">${esc(t("Updating…"))}</span>` : ""}</div>
        <div class="stack" id="plist">${order.map((id) => personaRow(id, lo, hi)).join("")}</div></div>${accuracyCard()}${runCard()}</div>`;
  },
  mount(root, ctx) {
    ctxRef = ctx; chart = null;
    const need = !res || (sig !== signature() && D.loaded.history);
    if (need && !running) start(ctx.rerender);
    bindSeg(root, "hz", (k) => { hz = k; ctx.rerender(); });
    if (openP && res) { const b = root.querySelector("#pb-" + openP); if (b) { b.innerHTML = personaBody(openP); drawFan(openP); } }
    root.addEventListener("click", async (e) => {
      const ev = e.target.closest("[data-ev] .evt"); if (ev) { const id = ev.parentElement.dataset.ev; openE = openE === id ? null : id; return ctx.rerender(); }
      const ph = e.target.closest(".phead"); if (ph) { const id = ph.parentElement.dataset.p; openP = openP === id ? null : id; ctx.rerender(); requestAnimationFrame(() => { const el = document.querySelector(`[data-p="${id}"]`); el && openP && el.scrollIntoView({ block: "nearest", behavior: "smooth" }); }); return; }
      const pc = e.target.closest("[data-paths]"); if (pc) { paths = +pc.dataset.paths; res = null; return start(ctx.rerender); }
      const ab = e.target.closest("[data-ai]"); if (ab) {
        const id = ab.dataset.ai; ab.disabled = true; ab.textContent = t("Writing…");
        const r = await ai("council", { ...summaryFor(res, inp, id, hz), lang: getLang() });
        aiOut[id + hz + getLang()] = r.ok && r.j.why ? r.j : false; ctx.rerender();
      }
    });
  },
  invalidate() { res = null; sig = ""; },
};
export { name as personaName, style as personaStyle, META as PERSONA_META, reasonText };
