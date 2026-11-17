/* pt-analyst.js — AI Portfolio Analyst panel (Premium tier).
   One product, tier-driven:
   - DEMO mode (window.PT_DEMO_MODE): a fully SIMULATED analyst experience — canned,
     deterministic answers that match the simulated demo portfolio. No /api calls.
   - Signed in, tier "premium": live chat (POST /api/ai/ask), daily briefing
     (GET /api/ai/briefing), Monte Carlo + stress simulations (POST /api/ai/simulate).
   - Signed in, free/paid: a teaser card explaining what Premium adds, with an
     upgrade button. The rest of the terminal stays fully usable.
   All entitlement enforcement is server-side (/api/ai/* verifies tier); this UI only
   decides what to render. */
(function () {
  "use strict";
  var MODE = null; /* null=boot, "demo", "live", "teaser" */
  var lastBriefing = null;
  var lastSim = null;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function jget(r) { return r.text().then(function (t) { try { return JSON.parse(t); } catch (e) { return null; } }); }
  function tierNow() { try { return window.PT_TIER || null; } catch (e) { return null; } }
  function demoNow() { try { return !!window.PT_DEMO_MODE; } catch (e) { return false; } }
  function signedIn() { try { var s = window.PT_AUTH && PT_AUTH.session && PT_AUTH.session(); return !!(s && s.access_token); } catch (e) { return false; } }

  /* ---------------- mount ---------------- */
  var SEC = document.createElement("section");
  SEC.className = "panel";
  SEC.id = "h-ai";
  SEC.setAttribute("aria-labelledby", "h-ai-t");
  SEC.innerHTML =
    '<div class="ph"><h2 id="h-ai-t">AI Portfolio Analyst</h2><span class="pill" id="ai-badge">…</span></div>' +
    '<p class="note" id="ai-note" hidden></p>' +
    '<div id="ai-body"><div class="empty">Loading…</div></div>';
  function mount() {
    var host = document.getElementById("tab-ov");
    if (host && !document.getElementById("h-ai")) host.appendChild(SEC);
  }
  mount();

  function badge(txt, cls) {
    var b = document.getElementById("ai-badge");
    if (!b) return;
    b.textContent = txt;
    b.className = "pill" + (cls ? " " + cls : "");
  }
  function body(html) {
    var b = document.getElementById("ai-body");
    if (b) b.innerHTML = html;
  }

  /* ---------------- DEMO: simulated analyst ---------------- */
  var DEMO_BRIEF = {
    headline: "Simulated daily briefing — semis-led rally, concentration rising",
    sections: [
      { title: "What moved", body: "Your simulated portfolio rose 1.1% today, led by NVDA (+2.0%) and AVGO (+1.6%). Technology-linked names are now about 43% of portfolio value, so single-sector swings dominate your day-to-day results. TSLA (-0.8%) remains the largest detractor and is still ~35% below its average cost." },
      { title: "Risk check", body: "The largest single-position risk is NVDA at roughly 18% of value with a 1.6 beta — it contributes disproportionately to portfolio volatility. The drawdown alert on TSLA (35% under water) is still active. Cash covers about 8% of the portfolio, a modest buffer." },
      { title: "Valuation watch", body: "In the simulated valuation set, JNJ and PEP trade below their base-case intrinsic value, while NVDA prices in aggressive growth. Earnings revisions improved for NVDA and AVGO this week and deteriorated slightly for TSLA and JNJ." }
    ]
  };
  var DEMO_QA = {
    "Why did my portfolio fall today?": "In this simulated session, the portfolio actually rose about 1.1%: NVDA (+2.0%) and AVGO (+1.6%) outweighed TSLA (-0.8%) and JNJ (-0.4%). On days the index drops, expect the portfolio to fall harder — its heavy semiconductor weighting gives it an effective beta near 1.3.",
    "Which position is my biggest risk?": "NVDA. It is ~18% of portfolio value with a computed beta of ~1.6, so it alone drives roughly a third of your simulated portfolio volatility. The concentration is amplified because AMD, AVGO and SMH move with the same semiconductor cycle.",
    "Which holdings have the best margin of safety?": "In the simulated valuation set: JNJ and PEP trade below their base-case intrinsic value (positive margin of safety), while NVDA prices in sustained >20% FCF growth. TSLA sits below base-case value, but with deteriorating earnings revisions the estimate confidence is low.",
    "Am I too concentrated in technology?": "Yes, by any simple standard: Semiconductors + megacap tech add up to about 43% of the simulated portfolio's value. A semiconductor-cycle downturn would hit most of your largest positions at once. The financials, energy and staples sleeves are too small to offset it.",
    "What are the biggest risks in my portfolio?": "Three stand out in the simulation: (1) sector concentration — 43% in tech/semis; (2) single-name risk — NVDA at 18% of value; (3) a deep underwater position — TSLA is 35% below cost with negative revisions. None are catastrophic alone; together they make the portfolio's outcome track the semiconductor cycle."
  };
  var DEMO_SIM = {
    years: 1, paths: 2000, seed: "demo",
    percentiles: { p5: 0.82, p25: 0.97, p50: 1.08, p75: 1.22, p95: 1.45 },
    probLoss: 38,
    stress: [
      { name: "Rate shock", movePct: -5, impactPct: -6.4, note: "High-beta tech leads the decline." },
      { name: "Tech drawdown", movePct: -12, impactPct: -14.9, note: "Semis + megacap concentration amplifies." },
      { name: "Risk-off", movePct: -8, impactPct: -9.7, note: "Defensive staples/health too small to buffer." },
      { name: "Recession", movePct: -18, impactPct: -21.8, note: "Cyclicals (semis, energy, financials) all fall." }
    ],
    holdings: [
      { tk: "NVDA", beta: 1.60, weightPct: 18.2 }, { tk: "AMD", beta: 1.90, weightPct: 7.1 },
      { tk: "AVGO", beta: 1.55, weightPct: 5.2 }, { tk: "SMH", beta: 1.52, weightPct: 9.1 },
      { tk: "MSFT", beta: 1.10, weightPct: 8.0 }, { tk: "AAPL", beta: 1.05, weightPct: 11.6 },
      { tk: "TSLA", beta: 2.05, weightPct: 4.8 }, { tk: "JPM", beta: 1.02, weightPct: 9.1 },
      { tk: "XOM", beta: 0.78, weightPct: 5.1 }, { tk: "JNJ", beta: 0.55, weightPct: 4.8 },
      { tk: "PEP", beta: 0.48, weightPct: 5.9 }
    ],
    narrative: "The simulation is dominated by a ~1.3 effective beta: expect wider swings than the index. Cash and staples dampen the tail only slightly.",
    methodology: "Deterministic Monte Carlo over weekly returns of the simulated holdings (2000 paths)."
  };

  function renderDemo() {
    MODE = "demo";
    badge("SIMULATED", "stale");
    var note = document.getElementById("ai-note");
    if (note) { note.hidden = false; note.textContent = "This is a canned, simulated demonstration of the Premium AI analyst. Its answers are about the demo portfolio, not real market data. Premium subscribers get live answers computed from their actual holdings."; }
    body(
      '<div class="ai-tabs seg" role="group" aria-label="Analyst view">' +
      '<button data-v="chat" aria-pressed="true">Ask the analyst</button>' +
      '<button data-v="brief" aria-pressed="false">Daily briefing</button>' +
      '<button data-v="sim" aria-pressed="false">Simulations</button></div>' +
      '<div id="ai-view"></div>'
    );
    wireTabs(true);
    viewChat(true);
  }

  /* ---------------- teaser (free / paid) ---------------- */
  function renderTeaser(tier) {
    MODE = "teaser";
    badge(tier === "paid" ? "PREMIUM UPGRADE" : "PREMIUM", "");
    body(
      '<div class="ai-teaser">' +
      '<p><b>Your personal investment analyst, built into the terminal.</b></p>' +
      '<ul class="ai-feats">' +
      '<li><b>Ask anything about your portfolio</b> — “Why did my portfolio fall today?”, “Which position is my biggest risk?”, “Am I too concentrated in technology?” — answered from your actual holdings, P&amp;L, risk and valuation data.</li>' +
      '<li><b>Daily briefing</b> — a short written summary of what moved, what changed, and what to watch in your portfolio.</li>' +
      '<li><b>Monte Carlo &amp; stress simulations</b> — forward return distributions and rate-shock / tech-drawdown / recession scenarios computed from your holdings’ own history.</li>' +
      '</ul>' +
      '<p class="ai-cta-row"><button class="btn" id="ai-up">' + (tier === "paid" ? "Upgrade to Premium — ฿1,299/month" : "Go Premium — ฿1,299/month") + '</button></p>' +
      '<p class="note">Everything else in the terminal keeps working on your current plan — Premium adds the intelligence layer on top.</p>' +
      '</div>'
    );
    var up = document.getElementById("ai-up");
    if (up) up.onclick = function () {
      if (!signedIn() || demoNow()) {
        var t = document.getElementById("tb-set"); if (t) t.click(); return;
      }
      PT_AUTH.fetch("/api/billing/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan: "premium" }) })
        .then(jget).then(function (j) {
          if (j && j.url) location.href = j.url;
          else say((j && j.error) || "Checkout is not available right now.");
        }).catch(function () { say("Checkout is not available right now."); });
    };
  }

  /* ---------------- live (premium) ---------------- */
  function renderLive() {
    MODE = "live";
    badge("LIVE — PREMIUM", "live");
    var note = document.getElementById("ai-note");
    if (note) { note.hidden = true; }
    body(
      '<div class="ai-tabs seg" role="group" aria-label="Analyst view">' +
      '<button data-v="chat" aria-pressed="true">Ask the analyst</button>' +
      '<button data-v="brief" aria-pressed="false">Daily briefing</button>' +
      '<button data-v="sim" aria-pressed="false">Simulations</button></div>' +
      '<div id="ai-msg" class="note" hidden></div>' +
      '<div id="ai-view"></div>'
    );
    wireTabs(false);
    viewChat(false);
  }

  function say(msg) {
    var m = document.getElementById("ai-msg");
    if (!m) return;
    m.hidden = false;
    m.textContent = msg;
  }

  function wireTabs(demo) {
    var tabs = SEC.querySelectorAll(".ai-tabs button");
    for (var i = 0; i < tabs.length; i++) (function (b) {
      b.onclick = function () {
        for (var j = 0; j < tabs.length; j++) tabs[j].setAttribute("aria-pressed", String(tabs[j] === b));
        if (b.dataset.v === "chat") viewChat(demo);
        else if (b.dataset.v === "brief") viewBrief(demo);
        else viewSim(demo);
      };
    })(tabs[i]);
  }
  function activate(view) {
    var tabs = SEC.querySelectorAll(".ai-tabs button");
    for (var j = 0; j < tabs.length; j++) tabs[j].setAttribute("aria-pressed", String(tabs[j].dataset.v === view));
  }

  /* ---- chat ---- */
  var PRESETS = [
    "Why did my portfolio fall today?",
    "Which position is my biggest risk?",
    "Which holdings have the best margin of safety?",
    "Am I too concentrated in technology?",
    "What are the biggest risks in my portfolio?"
  ];
  function viewChat(demo) {
    var v = document.getElementById("ai-view");
    if (!v) return;
    activate("chat");
    v.innerHTML =
      '<div class="ai-presets">' + PRESETS.map(function (p) { return '<button class="btn ai-preset" data-q="' + esc(p) + '">' + esc(p) + "</button>"; }).join("") + "</div>" +
      '<form id="ai-ask-form" class="ai-askrow"><input id="ai-q" maxlength="600" placeholder="Ask about your portfolio — holdings, risk, valuation, anything…" autocomplete="off">' +
      '<button class="btn" type="submit">Ask</button></form>' +
      '<div id="ai-out"></div>';
    var out = document.getElementById("ai-out");
    function chips() {
      v.querySelectorAll(".ai-preset").forEach(function (b) { b.onclick = function () { ask(b.dataset.q); }; });
    }
    chips();
    var form = document.getElementById("ai-ask-form");
    if (form) form.onsubmit = function (ev) {
      ev.preventDefault();
      var q = (document.getElementById("ai-q") || {}).value || "";
      if (q.trim()) ask(q.trim());
    };
    function ask(q) {
      if (demo) {
        var canned = DEMO_QA[q];
        out.innerHTML = answerHtml({
          answer: canned || "In this simulated demo the analyst answers a fixed set of questions. Try one of the preset questions above to see how it explains holdings, risk and valuation from your portfolio data.",
          points: canned ? [] : [{ title: "Preset questions are wired", detail: "Pick any preset chip above — the demo analyst answers from the simulated portfolio." }],
          tickers: [], demo: true
        });
        return;
      }
      out.innerHTML = '<div class="empty">Thinking…</div>';
      if (document.getElementById("ai-msg")) document.getElementById("ai-msg").hidden = true;
      PT_AUTH.fetch("/api/ai/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q }) })
        .then(function (r) { return jget(r).then(function (j) { return { s: r.status, j: j }; }); })
        .then(function (x) {
          if (x.s === 200 && x.j && x.j.answer) { out.innerHTML = answerHtml(x.j); return; }
          if (x.s === 429) { say("Daily question limit reached (40/day on Premium). It resets tomorrow."); out.innerHTML = ""; return; }
          if (x.s === 400 && x.j && x.j.code === "no_holdings") { say("Add some holdings first — the analyst only knows what is in your portfolio."); out.innerHTML = ""; return; }
          if (x.s === 503) { say("The AI service is not configured on this deployment."); out.innerHTML = ""; return; }
          say((x.j && x.j.error) || "The analyst could not answer right now.");
          out.innerHTML = "";
        })
        .catch(function () { say("Network error talking to the analyst."); out.innerHTML = ""; });
    }
  }
  function answerHtml(j) {
    var h = '<div class="ai-answer">';
    if (j.demo) h += '<span class="pill stale">SIMULATED ANSWER</span> ';
    h += "<p>" + esc(j.answer).replace(/\n/g, "<br>") + "</p>";
    if (j.points && j.points.length) {
      h += "<ul>";
      j.points.forEach(function (p) { h += "<li><b>" + esc(p.title) + "</b> — " + esc(p.detail) + "</li>"; });
      h += "</ul>";
    }
    if (j.tickers && j.tickers.length) {
      h += '<p class="note">Holdings referenced: ' + j.tickers.map(function (t) { return "<b>" + esc(t) + "</b>"; }).join(" · ") + "</p>";
    }
    h += "</div>";
    return h;
  }

  /* ---- briefing ---- */
  function viewBrief(demo) {
    var v = document.getElementById("ai-view");
    if (!v) return;
    activate("brief");
    var note = document.getElementById("ai-msg");
    if (note) note.hidden = true;
    v.innerHTML = '<div id="ai-brief"><div class="empty">Preparing your briefing…</div></div>';
    var host = document.getElementById("ai-brief");
    function show(b, cached) {
      var h = '<div class="ai-brief">';
      if (demo) h += '<span class="pill stale">SIMULATED</span> ';
      if (!demo && cached) h += '<span class="pill live">CACHED TODAY</span> ';
      h += "<h3>" + esc(b.headline) + "</h3>";
      (b.sections || []).forEach(function (s) { h += "<h4>" + esc(s.title) + "</h4><p>" + esc(s.body) + "</p>"; });
      h += "</div>";
      host.innerHTML = h;
    }
    if (demo) { show(DEMO_BRIEF, false); return; }
    PT_AUTH.fetch("/api/ai/briefing", {})
      .then(function (r) { return jget(r).then(function (j) { return { s: r.status, j: j }; }); })
      .then(function (x) {
        if (x.s === 200 && x.j && x.j.briefing) { lastBriefing = x.j.briefing; show(x.j.briefing, !!x.j.cached); return; }
        if (x.s === 429) { host.innerHTML = '<div class="empty">Briefing generation limit reached for today (3/day). Try again tomorrow.</div>'; return; }
        if (x.s === 400 && x.j && x.j.code === "no_holdings") { host.innerHTML = '<div class="empty">Add some holdings first — the briefing is computed from your portfolio.</div>'; return; }
        if (x.s === 503) { host.innerHTML = '<div class="empty">The AI service is not configured on this deployment.</div>'; return; }
        host.innerHTML = '<div class="empty">' + esc((x.j && x.j.error) || "The briefing could not be generated right now.") + "</div>";
      })
      .catch(function () { host.innerHTML = '<div class="empty">Network error fetching the briefing.</div>'; });
  }

  /* ---- simulations ---- */
  function viewSim(demo) {
    var v = document.getElementById("ai-view");
    if (!v) return;
    activate("sim");
    var note = document.getElementById("ai-msg");
    if (note) note.hidden = true;
    v.innerHTML =
      '<div class="ai-simhead"><div class="seg" role="group" aria-label="Simulation horizon">' +
      ["6M", "1Y", "2Y", "5Y"].map(function (y, i) { return '<button data-y="' + [{ "6M": 0.5 }, { "1Y": 1 }, { "2Y": 2 }, { "5Y": 5 }][i][y] + '" aria-pressed="' + (y === "1Y") + '">' + y + "</button>"; }).join("") +
      '</div><button class="btn" id="ai-sim-run">Run simulation</button></div>' +
      '<div id="ai-simout"></div>';
    var out = document.getElementById("ai-simout");
    var yrs = 1;
    v.querySelectorAll(".ai-simhead .seg button").forEach(function (b) {
      b.onclick = function () {
        yrs = parseFloat(b.dataset.y) || 1;
        v.querySelectorAll(".ai-simhead .seg button").forEach(function (o) { o.setAttribute("aria-pressed", String(o === b)); });
      };
    });
    var run = document.getElementById("ai-sim-run");
    if (run) run.onclick = function () {
      if (demo) { lastSim = JSON.parse(JSON.stringify(DEMO_SIM)); lastSim.years = yrs; showSim(lastSim, true); return; }
      out.innerHTML = '<div class="empty">Simulating…</div>';
      PT_AUTH.fetch("/api/ai/simulate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ years: yrs }) })
        .then(function (r) { return jget(r).then(function (j) { return { s: r.status, j: j }; }); })
        .then(function (x) {
          if (x.s === 200 && x.j && x.j.percentiles) { lastSim = x.j; showSim(x.j, false); return; }
          if (x.s === 429) { out.innerHTML = '<div class="empty">Simulation limit reached for today (10/day).</div>'; return; }
          if (x.s === 400 && x.j && x.j.code === "no_holdings") { out.innerHTML = '<div class="empty">Add some holdings first — the simulation runs on your actual positions.</div>'; return; }
          if (x.s === 503) { out.innerHTML = '<div class="empty">The AI service is not configured on this deployment.</div>'; return; }
          out.innerHTML = '<div class="empty">' + esc((x.j && x.j.error) || "The simulation could not run right now.") + "</div>";
        })
        .catch(function () { out.innerHTML = '<div class="empty">Network error running the simulation.</div>'; });
    };
    /* auto-run once on entering the tab */
    if (demo) { lastSim = JSON.parse(JSON.stringify(DEMO_SIM)); showSim(lastSim, true); }
    else if (lastSim) showSim(lastSim, false);
  }

  function showSim(sim, demo) {
    var out = document.getElementById("ai-simout");
    if (!out) return;
    var p = sim.percentiles || {};
    var bands = [["5th", p.p5], ["25th", p.p25], ["Median", p.p50], ["75th", p.p75], ["95th", p.p95]];
    var lo = 0.5, hi = 1.6;
    bands.forEach(function (b) { if (b[1] != null) { lo = Math.min(lo, b[1]); hi = Math.max(hi, b[1]); } });
    var h = '<div class="ai-sim">';
    if (demo) h += '<span class="pill stale">SIMULATED RESULT</span>';
    h += "<h3>" + esc(sim.years) + "-year forward distribution</h3>";
    h += '<div class="ai-bands">';
    bands.forEach(function (b) {
      if (b[1] == null) return;
      var w = ((b[1] - lo) / (hi - lo)) * 100;
      var up = b[1] >= 1;
      h += '<div class="ai-band"><span class="ai-bl">' + esc(b[0]) + "</span>" +
        '<div class="ai-track"><div class="ai-fill' + (up ? " up" : " dn") + '" style="width:' + Math.max(2, Math.min(100, w)).toFixed(1) + '%"></div></div>' +
        '<span class="ai-bv' + (up ? " up" : " dn") + '">' + (b[1] * 100).toFixed(0) + "%</span></div>";
    });
    h += "</div>";
    h += "<p><b>Probability of a loss over the horizon: " + esc(sim.probLoss) + "%</b> <span class='note'>(" + esc(sim.paths) + " Monte Carlo paths from your holdings' own weekly return history)</span></p>";
    if (sim.stress && sim.stress.length) {
      h += "<h4>Stress scenarios</h4><div class='tablebox'><table class='kv'><thead><tr><th class='l'>Scenario</th><th>Market move</th><th>Est. portfolio impact</th><th class='l'>Why</th></tr></thead><tbody>";
      sim.stress.forEach(function (s) {
        h += "<tr><th class='l'>" + esc(s.name) + "</th><td>" + esc(s.movePct) + "%</td><td class='" + (s.impactPct < 0 ? "dn" : "up") + "'>" + esc(s.impactPct) + "%</td><td>" + esc(s.note) + "</td></tr>";
      });
      h += "</tbody></table></div>";
    }
    if (sim.holdings && sim.holdings.length) {
      h += "<h4>Your risk drivers</h4><p class='note'>";
      sim.holdings.slice(0, 8).forEach(function (x) {
        h += "<b>" + esc(x.tk) + "</b> β " + (x.beta != null ? x.beta.toFixed ? x.beta.toFixed(2) : esc(x.beta) : "–") + " · " + esc(x.weightPct) + "% weight &nbsp; ";
      });
      h += "</p>";
    }
    if (sim.narrative) h += "<p class='ai-narr'><b>Analyst note:</b> " + esc(sim.narrative) + "</p>";
    if (sim.methodology) h += "<p class='note'>" + esc(sim.methodology) + "</p>";
    h += "</div>";
    out.innerHTML = h;
  }

  /* ---------------- boot / tier resolution ---------------- */
  var tries = 0;
  function boot() {
    tries++;
    if (demoNow()) { renderDemo(); return; }
    if (!signedIn()) { /* anonymous non-demo shouldn't happen (anon = demo), but stay quiet */ SEC.hidden = true; return; }
    var t = tierNow();
    if (!t && tries < 20) { setTimeout(boot, 400); return; }
    if (t === "premium") { SEC.hidden = false; renderLive(); }
    else { SEC.hidden = false; renderTeaser(t || "free"); }
  }
  boot();

  /* re-check when auth state changes (login/logout from settings) */
  document.addEventListener("pt:state-hydrated", function () { tries = 0; boot(); });
  document.addEventListener("pt:state-synced", function () {
    /* a fresh /api/auth/me may have updated PT_TIER after a plan switch */
    if (!demoNow() && MODE === "teaser" && tierNow() === "premium") { tries = 0; boot(); }
  });

  /* panel CSS */
  var st = document.createElement("style");
  st.textContent =
    "#h-ai .ai-tabs{margin-bottom:10px}" +
    "#h-ai .ai-presets{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}" +
    "#h-ai .ai-askrow{display:flex;gap:8px;margin-bottom:12px}" +
    "#h-ai .ai-askrow input{flex:1;font:inherit;padding:6px 10px;background:var(--panel-2);border:1px solid var(--line);border-radius:4px;color:var(--fg)}" +
    "#h-ai .ai-answer{border:1px solid var(--line);border-radius:8px;padding:10px 14px;background:var(--panel-2);line-height:1.55}" +
    "#h-ai .ai-answer ul{margin:8px 0 0;padding-left:18px}" +
    "#h-ai .ai-feats{margin:8px 0;padding-left:18px;line-height:1.6}" +
    "#h-ai .ai-cta-row{margin:12px 0 4px}" +
    "#h-ai .ai-brief h3,#h-ai .ai-sim h3{margin:8px 0 6px}" +
    "#h-ai .ai-brief h4,#h-ai .ai-sim h4{margin:10px 0 4px}" +
    "#h-ai .ai-bands{display:flex;flex-direction:column;gap:6px;margin:10px 0;max-width:520px}" +
    "#h-ai .ai-band{display:flex;align-items:center;gap:10px;font-family:var(--f-mono);font-size:12px}" +
    "#h-ai .ai-bl{width:44px;color:var(--muted)}" +
    "#h-ai .ai-track{flex:1;height:10px;background:var(--panel-2);border:1px solid var(--line);border-radius:3px;overflow:hidden}" +
    "#h-ai .ai-fill{height:100%}" +
    "#h-ai .ai-fill.up{background:color-mix(in srgb,var(--up) 55%,var(--panel))}" +
    "#h-ai .ai-fill.dn{background:color-mix(in srgb,var(--down) 55%,var(--panel))}" +
    "#h-ai .ai-bv{width:48px;text-align:right}" +
    "#h-ai .ai-simhead{display:flex;gap:10px;align-items:center;margin-bottom:10px;flex-wrap:wrap}" +
    "#h-ai .ai-narr{border-left:3px solid var(--accent);padding:6px 12px;margin:10px 0;line-height:1.5}" +
    "#h-ai .up{color:var(--up)}#h-ai .dn{color:var(--down)}";
  document.head.appendChild(st);
})();
