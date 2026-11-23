/* Portfolio Terminal UI layer: Settings tab, display preferences, customizable layout, plain-language panel
   subtitles, account (email + password), plans (Free ฿0 / Paid ฿399 / Premium ฿599), admin Costs, and extra charts.
   Loaded after index.html's main script; uses its globals (S, $, esc, setTab, render*) and pt-datasource.js
   (PT_AUTH, PT_DEMO_MODE, PT_TIER). Preferences are stored in this browser and, when signed in, synced to the account. */
(function () {
  "use strict";
  var LS = function (k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem("ptpub.v1." + k) || "null"); localStorage.setItem("ptpub.v1." + k, JSON.stringify(v)); } catch (e) { return null; } };
  var h = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var el = function (id) { return document.getElementById(id); };
  var AUTH = window.PT_AUTH, APP = window.PT_APP || {};
  var DEMO = function () { return !!window.PT_DEMO_MODE; };
  var S = APP.S || { tab: "ov", rows: [], news: [] }, setTab = APP.setTab || function () {};

  /* ================= display preferences ================= */
  var DEF_PREFS = { theme: "auto", size: "M", density: "comfortable", lang: "en" };
  var ZOOM = { S: 0.92, M: 1, L: 1.12, XL: 1.25 };
  function prefs() { return Object.assign({}, DEF_PREFS, LS("prefs") || {}); }
  function applyPrefs(p) {
    var r = document.documentElement, T = window.PT_THEMES;
    if (T) T.clear();
    if (T && T.has(p.theme)) T.apply(p.theme); /* one of the 100 editor-style themes: sets data-theme + colour tokens */
    else if (p.theme === "light" || p.theme === "dark") r.setAttribute("data-theme", p.theme); else r.removeAttribute("data-theme");
    r.style.setProperty("--zoom", ZOOM[p.size] || 1);
    r.setAttribute("data-density", p.density === "compact" ? "compact" : "comfortable");
  }
  function setPref(k, v) { var p = prefs(); p[k] = v; LS("prefs", p); applyPrefs(p); syncPrefs(); redrawCharts(); if (window.PT_THEMES && PT_THEMES.label) PT_THEMES.label(); }
  applyPrefs(prefs());

  /* ================= panel registry + plain-language subtitles ================= */
  var WHY = {
    "h-hold": "Type in what you own (or import a statement). Everything else on the page is calculated from this list.",
    "h-perf": "How your portfolio's value moved over time, compared with the S&P 500 and Nasdaq.",
    "h-proj": "A synthetic growth scenario with five horizons, scenario bands and dated catalysts. Design data only, not a forecast.",
    "h-risk": "Where your money is concentrated, which themes dominate, and what moved most today.",
    "h-macro": "Interest rates and inflation, and which economic regime the data points to. Rising real rates usually pressure stock valuations.",
    "h-rot": "Which parts of the market are leading or lagging the S&P 500 right now.",
    "h-rrg": "Sectors placed by strength and momentum: top-right is leading, bottom-left lagging. Tails show the recent path.",
    "h-lead": "Whether sector leadership is backed by fundamentals: factor scores and analysts raising or cutting earnings estimates.",
    "h-flow": "Where institutional money is moving: ETF creations, insider buying, 13F holder changes and futures positioning.",
    "h-br": "How many stocks in each sector are above their averages (breadth), and which are stretched (overbought) or washed out (oversold).",
    "h-ra": "Risk appetite: consumer discretionary vs staples, plus volatility. Discretionary outperforming means investors are taking risk.",
    "h-ledger": "Every position with price, change, value and profit. Tap a row for its price chart.",
    "h-news": "Today's market-moving headlines, summarised, with the holdings they touch.",
    "h-vala": "Each holding's estimated fair value range (bear, base, bull) against today's price.",
    "h-valb": "How far below fair value each price is. Above the black tick means the required safety margin is met.",
    "h-vals": "The safety margin you require before a stock counts as cheap, by category.",
    "h-valc": "The full cash-flow model for one holding: assumptions, scenarios and sensitivity.",
    "h-vald": "How cheap or expensive each sector is versus its own history and peers.",
    "h-valt": "All valuation results in one table.",
  };
  var NAMES = { kpis: "Portfolio summary", intel: "Market intelligence heading", "val-kpis": "Valuation summary", "val-src": "Data status" };
  function pidOf(node) {
    if (node.id === "kpis" || node.id === "val-kpis" || node.id === "intel") return node.id;
    if (node.classList.contains("intel-head")) return node.id || "val-src";
    var lb = node.getAttribute("aria-labelledby"); if (lb) return lb;
    if (node.classList.contains("method")) return "val-method";
    return null;
  }
  function titleOf(pid) { var t = el(pid); return NAMES[pid] || (pid === "val-method" ? "Method and assumptions" : t ? t.textContent.trim() : pid); }
  var DEFAULT_HALF = { "h-perf": 1, "h-risk": 1, "h-valb": 1, "h-vals": 1 };
  var PRESETS = {
    ov: {
      Default: null,
      "Portfolio first": ["kpis", "h-ledger", "h-perf", "h-proj", "h-risk", "h-hold", "h-news", "h-macro", "h-rot", "intel", "h-rrg", "h-lead", "h-flow", "h-br", "h-ra"],
      "Markets first": ["h-macro", "h-rot", "h-news", "intel", "h-rrg", "h-ra", "h-br", "h-flow", "h-lead", "kpis", "h-perf", "h-proj", "h-risk", "h-ledger", "h-hold"],
    },
    val: { Default: null },
  };
  var defaults = {};
  function setupTab(tab) {
    var pane = el("tab-" + tab); if (!pane || pane.querySelector(":scope > .lay")) return;
    var items = [];
    Array.prototype.forEach.call(pane.children, function (c) {
      if (c.classList.contains("grid2") || c.classList.contains("grid2v")) Array.prototype.forEach.call(c.children, function (x) { items.push(x); });
      else items.push(c);
    });
    var lay = document.createElement("div"); lay.className = "lay"; lay.dataset.tab = tab;
    items.forEach(function (n) {
      var pid = pidOf(n); if (!pid) return;
      n.dataset.pid = pid; n.classList.add("lay-item");
      var ph = n.querySelector(":scope > .ph");
      if (ph && WHY[pid] && !ph.querySelector(".why")) { var p = document.createElement("p"); p.className = "why"; p.textContent = WHY[pid]; ph.appendChild(p); }
      if (ph && !ph.querySelector(".lay-col")) {
        var b = document.createElement("button"); b.type = "button"; b.className = "lay-col"; b.title = "Collapse or expand this panel"; b.setAttribute("aria-label", "Collapse or expand");
        b.textContent = "▾"; b.onclick = function () { toggleCollapse(tab, pid); };
        ph.insertBefore(b, ph.firstChild);
      }
      lay.appendChild(n);
    });
    Array.prototype.slice.call(pane.children).forEach(function (c) { if ((c.classList.contains("grid2") || c.classList.contains("grid2v")) && !c.children.length) c.remove(); });
    pane.insertBefore(lay, pane.firstChild);
    defaults[tab] = Array.prototype.map.call(lay.children, function (n) { return n.dataset.pid; });
    applyLayout(tab);
  }
  function layout(tab) {
    var all = LS("layout") || {}; var L = all[tab] || {};
    return { order: L.order || defaults[tab] || [], hidden: L.hidden || [], collapsed: L.collapsed || [], half: L.half || Object.keys(DEFAULT_HALF).filter(function (k) { return (defaults[tab] || []).indexOf(k) >= 0; }) };
  }
  function saveLayout(tab, L) { var all = LS("layout") || {}; all[tab] = L; LS("layout", all); syncPrefs(); }
  function applyLayout(tab) {
    var lay = document.querySelector('.lay[data-tab="' + tab + '"]'); if (!lay) return;
    var L = layout(tab), nodes = {};
    Array.prototype.forEach.call(lay.children, function (n) { nodes[n.dataset.pid] = n; });
    var order = L.order.filter(function (p) { return nodes[p]; });
    /* a panel the saved layout has never seen (a newly shipped one) goes right after the panel that precedes it
       in the default layout, not at the end of the page; anything still unplaced is appended */
    var def = defaults[tab] || [];
    def.forEach(function (p, i) {
      if (!nodes[p] || order.indexOf(p) >= 0) return;
      for (var j = i - 1; j >= 0; j--) { var k = order.indexOf(def[j]); if (k >= 0) { order.splice(k + 1, 0, p); return; } }
      order.push(p);
    });
    Object.keys(nodes).forEach(function (p) { if (order.indexOf(p) < 0) order.push(p); });
    order.forEach(function (p) {
      var n = nodes[p]; lay.appendChild(n);
      n.classList.toggle("lay-half", L.half.indexOf(p) >= 0);
      n.classList.toggle("lay-hidden", L.hidden.indexOf(p) >= 0);
      n.classList.toggle("lay-collapsed", L.collapsed.indexOf(p) >= 0);
    });
    if (editing) decorate(tab);
  }
  function toggleIn(arr, v) { var i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v); return arr; }
  function toggleCollapse(tab, pid) { var L = layout(tab); toggleIn(L.collapsed, pid); saveLayout(tab, L); applyLayout(tab); redrawCharts(); }
  function currentOrder(tab) { var lay = document.querySelector('.lay[data-tab="' + tab + '"]'); return lay ? Array.prototype.map.call(lay.children, function (n) { return n.dataset.pid; }) : []; }

  /* ---- edit mode: drag to reorder (desktop), arrow buttons (touch), width, hide ---- */
  var editing = false, dragPid = null;
  function decorate(tab) {
    var lay = document.querySelector('.lay[data-tab="' + tab + '"]'); if (!lay) return;
    Array.prototype.forEach.call(lay.children, function (n) {
      var bar = n.querySelector(":scope > .lay-bar");
      if (!editing) { if (bar) bar.remove(); n.draggable = false; return; }
      var pid = n.dataset.pid, L = layout(tab), half = L.half.indexOf(pid) >= 0, hid = L.hidden.indexOf(pid) >= 0;
      if (!bar) { bar = document.createElement("div"); bar.className = "lay-bar"; n.insertBefore(bar, n.firstChild); }
      bar.innerHTML = "<span class='lay-grip' title='Drag to move'>⠿</span><b>" + h(titleOf(pid)) + "</b>" +
        "<button type='button' data-a='up' title='Move up'>↑</button><button type='button' data-a='down' title='Move down'>↓</button>" +
        "<button type='button' data-a='w'>" + (half ? "Half width" : "Full width") + "</button>" +
        "<button type='button' data-a='hide'>" + (hid ? "Show" : "Hide") + "</button>";
      bar.onclick = function (e) {
        var a = e.target && e.target.getAttribute("data-a"); if (!a) return;
        var L2 = layout(tab); L2.order = currentOrder(tab); var i = L2.order.indexOf(pid);
        if (a === "up" && i > 0) { L2.order.splice(i, 1); L2.order.splice(i - 1, 0, pid); }
        if (a === "down" && i < L2.order.length - 1) { L2.order.splice(i, 1); L2.order.splice(i + 1, 0, pid); }
        if (a === "w") toggleIn(L2.half, pid);
        if (a === "hide") toggleIn(L2.hidden, pid);
        saveLayout(tab, L2); applyLayout(tab); redrawCharts();
      };
      n.draggable = true;
      n.ondragstart = function (e) { dragPid = pid; e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", pid); } catch (x) {} n.classList.add("lay-dragging"); };
      n.ondragend = function () { n.classList.remove("lay-dragging"); dragPid = null; };
      n.ondragover = function (e) { if (dragPid && dragPid !== pid) { e.preventDefault(); n.classList.add("lay-over"); } };
      n.ondragleave = function () { n.classList.remove("lay-over"); };
      n.ondrop = function (e) {
        e.preventDefault(); n.classList.remove("lay-over"); if (!dragPid || dragPid === pid) return;
        var L2 = layout(tab); L2.order = currentOrder(tab); L2.order.splice(L2.order.indexOf(dragPid), 1); L2.order.splice(L2.order.indexOf(pid), 0, dragPid);
        saveLayout(tab, L2); applyLayout(tab); redrawCharts();
      };
    });
  }
  function setEditing(on) {
    editing = on; document.documentElement.classList.toggle("lay-editing", on);
    var b = el("lay-toggle"); if (b) { b.textContent = on ? "Done customizing" : "Customize"; b.setAttribute("aria-pressed", on); }
    ["ov", "val"].forEach(decorate);
    if (!on) redrawCharts();
  }
  function resetLayout(tab) { var all = LS("layout") || {}; delete all[tab]; LS("layout", all); syncPrefs(); applyLayout(tab); redrawCharts(); }
  function applyPreset(tab, name) {
    var order = PRESETS[tab] && PRESETS[tab][name];
    if (!order) return resetLayout(tab);
    var L = layout(tab); L.order = order.concat((defaults[tab] || []).filter(function (p) { return order.indexOf(p) < 0; })); L.hidden = [];
    saveLayout(tab, L); applyLayout(tab); redrawCharts();
  }

  var redrawT = null;
  function redrawCharts() {
    clearTimeout(redrawT);
    redrawT = setTimeout(function () {
      try {
        if (S.tab === "val" && APP.renderValAll) APP.renderValAll();
        else if (S.tab === "ov") { if (APP.renderAll) APP.renderAll(); if (APP.redrawOverview) APP.redrawOverview(); }
        drawExtras();
      } catch (e) {}
    }, 60);
  }

  /* ================= small SVG chart kit (same look as the page's charts) ================= */
  var SER = ["var(--q1)", "var(--q2)", "var(--q3)", "var(--q4)", "var(--q5)", "var(--q6)", "var(--q7)", "var(--muted)"];
  function tipFor(box) {
    var t = box.querySelector(".tip"); if (!t) { t = document.createElement("div"); t.className = "tip"; t.hidden = true; box.appendChild(t); }
    return { show: function (html, x, y) { t.innerHTML = html; t.hidden = false; t.style.left = x + "px"; t.style.top = y + "px"; }, hide: function () { t.hidden = true; } };
  }
  function bindTips(box, sel, html) {
    var tip = tipFor(box);
    box.querySelectorAll(sel).forEach(function (m) {
      var on = function (e) { var r = box.getBoundingClientRect(), p = e.touches ? e.touches[0] : e; tip.show(html(m), p.clientX - r.left, p.clientY - r.top); };
      m.addEventListener("mousemove", on); m.addEventListener("touchstart", on, { passive: true }); m.addEventListener("mouseleave", tip.hide);
    });
  }
  // donut with legend; parts [{label, value, sub}]
  function donut(box, parts, center) {
    var tot = parts.reduce(function (s, p) { return s + p.value; }, 0); if (!(tot > 0)) { box.innerHTML = ""; return; }
    var R = 70, r = 46, cx = 80, cy = 80, a0 = -Math.PI / 2, svg = "";
    parts.forEach(function (p, i) {
      var a1 = a0 + (p.value / tot) * Math.PI * 2, gap = parts.length > 1 ? 0.012 : 0, s = a0 + gap, e = a1 - gap, large = e - s > Math.PI ? 1 : 0;
      var P = function (rad, a) { return (cx + rad * Math.cos(a)).toFixed(2) + " " + (cy + rad * Math.sin(a)).toFixed(2); };
      var d = parts.length === 1 ? "M" + (cx - R) + " " + cy + "a" + R + " " + R + " 0 1 0 " + 2 * R + " 0a" + R + " " + R + " 0 1 0 " + -2 * R + " 0M" + (cx - r) + " " + cy + "a" + r + " " + r + " 0 1 1 " + 2 * r + " 0a" + r + " " + r + " 0 1 1 " + -2 * r + " 0"
        : "M" + P(R, s) + "A" + R + " " + R + " 0 " + large + " 1 " + P(R, e) + "L" + P(r, e) + "A" + r + " " + r + " 0 " + large + " 0 " + P(r, s) + "Z";
      svg += "<path class='dn' data-i='" + i + "' d='" + d + "' fill='" + SER[Math.min(i, 7)] + "' fill-rule='evenodd'/>";
      a0 = a1;
    });
    var legend = parts.map(function (p, i) { return "<li><i style='background:" + SER[Math.min(i, 7)] + "'></i><span>" + h(p.label) + "</span><b>" + (p.value / tot * 100).toFixed(1) + "%</b></li>"; }).join("");
    box.innerHTML = "<div class='dn-wrap'><svg viewBox='0 0 160 160' role='img' aria-label='" + h(center || "Allocation") + "'>" + svg +
      "<text x='80' y='76' text-anchor='middle' class='dn-c1'>" + h(center || "") + "</text><text x='80' y='96' text-anchor='middle' class='dn-c2'>" + parts.length + " slices</text></svg><ul class='dn-leg'>" + legend + "</ul></div>";
    bindTips(box, ".dn", function (m) { var p = parts[+m.getAttribute("data-i")]; return "<b>" + h(p.label) + "</b><br>" + (p.value / tot * 100).toFixed(1) + "%" + (p.sub ? " · " + h(p.sub) : ""); });
  }
  // horizontal bars; rows [{label, value, text, color}]
  function hbars(box, rows, opt) {
    opt = opt || {}; if (!rows.length) { box.innerHTML = "<div class='empty'>" + h(opt.empty || "No data yet.") + "</div>"; return; }
    var max = Math.max.apply(null, rows.map(function (r) { return Math.abs(r.value) || 0; })) || 1;
    box.innerHTML = "<div class='hb'>" + rows.map(function (r, i) {
      var w = Math.max(1.5, Math.abs(r.value) / max * 100);
      return "<div class='hb-row' data-i='" + i + "'><span class='hb-l'>" + h(r.label) + "</span><span class='hb-t'><i style='width:" + w + "%;background:" + (r.color || "var(--chart)") + "'></i></span><span class='hb-v'>" + h(r.text != null ? r.text : r.value) + "</span></div>";
    }).join("") + "</div>";
    if (opt.tip) bindTips(box, ".hb-row", function (m) { return opt.tip(rows[+m.getAttribute("data-i")]); });
  }
  // stacked daily columns; days [{d, parts:{series:value}}], series order fixed
  function stackCols(box, days, series, fmt) {
    var W = Math.max(320, box.clientWidth || 640), H = 200, pl = 48, pb = 22, pt = 8, iw = W - pl - 8, ih = H - pb - pt;
    var tot = days.map(function (d) { return series.reduce(function (s, k) { return s + (d.parts[k] || 0); }, 0); });
    var max = Math.max.apply(null, tot.concat([0])); if (!(max > 0)) max = 1;
    var bw = iw / Math.max(1, days.length), svg = "";
    for (var g = 0; g <= 4; g++) { var y = pt + ih - ih * g / 4; svg += "<line x1='" + pl + "' x2='" + (W - 8) + "' y1='" + y + "' y2='" + y + "' class='gl'/><text x='" + (pl - 6) + "' y='" + (y + 4) + "' text-anchor='end' class='ax'>" + fmt(max * g / 4) + "</text>"; }
    days.forEach(function (d, i) {
      var y = pt + ih, x = pl + i * bw + 1;
      series.forEach(function (k, si) { var v = d.parts[k] || 0; if (!v) return; var hh = v / max * ih; y -= hh; svg += "<rect x='" + x.toFixed(1) + "' y='" + y.toFixed(1) + "' width='" + Math.max(1, bw - 2).toFixed(1) + "' height='" + Math.max(0.5, hh - 1).toFixed(1) + "' rx='1.5' fill='" + SER[si] + "'/>"; });
      svg += "<rect class='sc-hit' data-i='" + i + "' x='" + (pl + i * bw) + "' y='" + pt + "' width='" + bw + "' height='" + ih + "' fill='transparent'/>";
      if (i % Math.ceil(days.length / 6) === 0) svg += "<text x='" + (x + bw / 2) + "' y='" + (H - 6) + "' text-anchor='middle' class='ax'>" + h(d.d.slice(5)) + "</text>";
    });
    box.innerHTML = "<svg viewBox='0 0 " + W + " " + H + "' role='img' aria-label='Daily cost by service'>" + svg + "</svg>" +
      "<div class='legend'>" + series.map(function (k, i) { return "<span><i style='background:" + SER[i] + "'></i>" + h(k) + "</span>"; }).join("") + "</div>";
    bindTips(box, ".sc-hit", function (m) { var d = days[+m.getAttribute("data-i")]; return "<b>" + h(d.d) + "</b><br>" + series.map(function (k) { return h(k) + ": " + fmt(d.parts[k] || 0); }).join("<br>"); });
  }

  /* ================= extra charts on the Overview ================= */
  function drawExtras() {
    try { drawAllocation(); } catch (e) {}
    try { drawNewsChart(); } catch (e) {}
  }
  function drawAllocation() {
    var host = el("ph-alloc");
    if (!host) {
      var ph = el("h-hold") && el("h-hold").closest("section"); if (!ph) return;
      host = document.createElement("div"); host.id = "ph-alloc"; host.className = "chart";
      var anchor = el("ph-empty"); ph.insertBefore(host, anchor ? anchor.nextSibling : null);
    }
    var rows = S.rows || [], parts = [], by = {};
    rows.forEach(function (r) { var v = r.valueUSD != null ? r.valueUSD : r.value; if (v > 0) by[r.ticker || r.tk || "?"] = (by[r.ticker || r.tk || "?"] || 0) + v; });
    Object.keys(by).forEach(function (k) { parts.push({ label: k, value: by[k] }); });
    parts.sort(function (a, b) { return b.value - a.value; });
    if (parts.length > 7) { var rest = parts.slice(6).reduce(function (s, p) { return s + p.value; }, 0); parts = parts.slice(0, 6).concat([{ label: "Other (" + (parts.length - 6) + ")", value: rest }]); }
    if (!parts.length) { host.innerHTML = ""; host.hidden = true; return; }
    host.hidden = false;
    var tot = parts.reduce(function (s, p) { return s + p.value; }, 0);
    parts.forEach(function (p) { p.sub = "$" + Math.round(p.value).toLocaleString("en-US"); });
    donut(host, parts, "$" + (tot >= 1e6 ? (tot / 1e6).toFixed(2) + "M" : tot >= 1e3 ? (tot / 1e3).toFixed(1) + "k" : tot.toFixed(0)));
  }
  function drawNewsChart() {
    var news = el("news"); if (!news) return;
    var host = el("news-chart");
    if (!host) { host = document.createElement("div"); host.id = "news-chart"; host.className = "chart"; news.parentNode.insertBefore(host, news); }
    var day = (S.news || []).find(function (n) { return n.date === S.newsDay; }) || (S.news || [])[0];
    var items = day && day.items || [];
    if (!items.length) { host.hidden = true; return; }
    host.hidden = false;
    var c = { Bullish: 0, Mixed: 0, Bearish: 0 };
    items.forEach(function (it) { if (c[it.impact] != null) c[it.impact]++; });
    hbars(host, [
      { label: "Bullish", value: c.Bullish, text: c.Bullish + " stories", color: "var(--up)" },
      { label: "Mixed", value: c.Mixed, text: c.Mixed + " stories", color: "var(--muted)" },
      { label: "Bearish", value: c.Bearish, text: c.Bearish + " stories", color: "var(--down)" },
    ], { tip: function (r) { return "<b>" + r.label + "</b><br>" + r.text + " in today's briefing"; } });
  }

  /* ================= account + prefs sync ================= */
  var me = null, mePending = null;
  async function loadMe(force) {
    if (!AUTH || !AUTH.session()) { me = null; return null; }
    if (me && !force) return me;
    if (!mePending) mePending = AUTH.fetch("/api/auth/me").then(function (r) {
      // Only a definitive 401 invalidates the stored session; a transient network/5xx
      // failure must NOT sign the user out of the browser.
      if (r.status === 401 && AUTH.session()) AUTH.setSession(null);
      return r.ok ? r.json() : null;
    }).then(function (j) {
      me = j; mePending = null;
      if (j && j.prefs && j.prefs.ui && force === "login") { LS("prefs", j.prefs.ui.prefs || prefs()); if (j.prefs.ui.layout) LS("layout", j.prefs.ui.layout); applyPrefs(prefs()); ["ov", "val"].forEach(applyLayout); }
      return j;
    }).catch(function () { mePending = null; return null; });
    return mePending;
  }
  var syncT = null;
  function syncPrefs() {
    if (!AUTH || !AUTH.session()) return;
    clearTimeout(syncT);
    syncT = setTimeout(function () { AUTH.fetch("/api/auth/prefs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prefs: { ui: { prefs: prefs(), layout: LS("layout") || {} } } }) }).catch(function () {}); }, 800);
  }
  async function post(path, body, auth) {
    var opts = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) };
    var r = auth ? await AUTH.fetch(path, opts) : await fetch(path, opts);
    var j = await r.json().catch(function () { return {}; });
    if (!r.ok) throw new Error(j.error || "Request failed (" + r.status + ").");
    return j;
  }

  /* ================= Settings tab ================= */
  function card(id, title, body, why) { return "<section class='panel set-card' id='" + id + "'><div class='ph'><h2>" + h(title) + "</h2>" + (why ? "<p class='why'>" + h(why) + "</p>" : "") + "</div>" + body + "</section>"; }
  function seg(name, opts, cur) { return "<div class='seg' role='group' data-pref='" + name + "'>" + opts.map(function (o) { return "<button type='button' data-v='" + o[0] + "' aria-pressed='" + (o[0] === cur) + "'>" + h(o[1]) + "</button>"; }).join("") + "</div>"; }

  /* ---- one tier card in the pricing grid: the "Revised pricing structure" table, one column per card ---- */
  /* mirrors api/_data/entitlements.json (Free ฿0 / Paid ฿399 / Premium ฿599); the server enforces it */
  var PLAN_ROWS = ["Market data", "Portfolio tracking", "Historical analysis", "Market rotation, intelligence, risk appetite", "Intrinsic value & deep analysis",
    "Sector rotation", "AI analyst & daily briefing", "Single-model LLM Council", "Monte Carlo simulations", "Stress testing & Projection Lab"];
  var PLAN_VALS = {
    demo:    ["Sample", "Sample (14)", "Sample", "—", "—", "—", "—", "—", "—", "—"],
    free:    ["Real", "20 holdings", "5 years", "—", "—", "—", "—", "—", "—", "—"],
    paid:    ["Real", "Unlimited", "Full history", "Included", "Included", "Included", "Included", "—", "—", "—"],
    premium: ["Real", "Unlimited", "Full history", "Included", "Included", "Included", "Included", "Included", "Included", "Included"],
  };
  function planCell(tier, cur, signed) {
    var C = {
      demo: { name: "Demo", price: "Free" },
      free: { name: "Free", price: "฿0<span class='per'>/mo</span>" },
      paid: { name: "Paid", price: "฿399<span class='per'>/mo</span>" },
      premium: { name: "Premium", price: "฿599<span class='per'>/mo</span>" },
    }[tier];
    var rows = PLAN_ROWS.map(function (label, i) {
      var v = PLAN_VALS[tier][i];
      return "<div><dt>" + h(label) + "</dt><dd" + (v === "—" ? " class='na' aria-label='Not included'" : v === "Included" ? " class='inc'" : "") + ">" + h(v) + "</dd></div>";
    }).join("");
    var btn = "";
    if (tier === "demo") btn = cur === "demo" ? "" : "<a class='btn' href='?demo=1'>Try the demo</a>";
    else if (tier === "free") btn = cur === "free" ? "" : signed ? "" : "<a class='btn' href='#set-account'>Create a free account</a>";
    else if (tier === "paid") {
      if (cur === "paid") btn = "";
      else if (cur !== "premium") btn = "<button class='btn pri' type='button' data-plan='paid'>Choose Paid</button>";
    } else if (tier === "premium") {
      if (cur !== "premium") btn = "<button class='btn pri' type='button' data-plan='premium'" + (cur === "paid" ? " data-switch='portal'" : "") + ">" + (cur === "paid" ? "Upgrade to Premium" : "Go Premium") + "</button>";
    }
    return "<div class='plan" + (cur === tier ? " cur" : "") + (tier === "premium" ? " prem" : "") + "' data-tier='" + tier + "'><h3>" + C.name + (cur === tier ? " <span class='badge'>CURRENT</span>" : "") + "</h3>" +
      "<div class='p'>" + C.price + "</div><dl>" + rows + "</dl>" + btn + "</div>";
  }

  async function renderSettings() {
    var pane = el("tab-set"); if (!pane) return;
    var p = prefs(), signed = !!(AUTH && AUTH.session() && !DEMO());
    var u = signed ? await loadMe() : null; signed = !!u;
    var qs = new URLSearchParams(location.search), billing = qs.get("billing");
    var cur = u ? (u.tier || "free") : "demo";
    var html = "";
    if (billing === "success") html += "<div class='set-banner up'>Payment received. Your plan switches on as soon as Stripe confirms it (usually a few seconds) — this page refreshes itself.</div>";
    if (billing === "cancel") html += "<div class='set-banner'>Checkout was cancelled. Nothing was charged.</div>";

    // account
    var acct;
    if (DEMO()) {
      acct = (AUTH && AUTH.session())
        ? "<p class='note'><b>Demo mode is on.</b> You are signed in but exploring the simulated terminal — none of your real data is loaded.</p><div class='set-row'><a class='btn pri' href='" + location.pathname + "'>Exit demo · load my real portfolio</a></div>"
        : "<p class='note'><b>You're exploring the demo.</b> Create a free account to use the real product with your own holdings.</p>" +
          "<form class='set-f' id='set-auth' autocomplete='on'><input type='email' id='set-email' name='email' placeholder='Email' autocomplete='username' autocapitalize='none' autocorrect='off' spellcheck='false' inputmode='email' aria-label='Email' required><input type='password' id='set-pw' name='password' placeholder='Password (8+ characters)' autocomplete='current-password' aria-label='Password' required>" +
          "<div class='set-row'><button class='btn pri' type='submit' data-a='login'>Sign in</button><button class='btn' type='submit' data-a='signup'>Create free account</button><button class='btn link' type='button' id='set-forgot'>Forgot password?</button></div></form>";
    } else if (signed) {
      var planTxt = u.tier === "premium" ? "Premium" : u.tier === "paid" ? "Paid" : "Free";
      var renew = (u.tier === "paid" || u.tier === "premium") && u.period_end ? " · renews " + h(String(u.period_end).slice(0, 10)) : "";
      acct = "<div class='set-kv'><span>Signed in as</span><b>" + h(u.email) + "</b><span>Plan</span><b>" + planTxt + renew + "</b>" + (u.is_admin ? "<span>Role</span><b>Admin</b>" : "") + "</div>" +
        "<div class='set-row'><button class='btn' id='set-logout' type='button'>Sign out</button><details class='set-pw'><summary class='btn'>Change password</summary><div class='set-f'><input type='password' id='set-newpw' name='new-password' placeholder='New password (8+ characters)' autocomplete='new-password' aria-label='New password'><button class='btn' type='button' id='set-pwgo'>Save password</button></div></details></div>";
    } else {
      acct = "<p class='note'>An account keeps your layout and display settings on every device and is required for real data. Your holdings stay in this browser either way.</p>" +
        "<form class='set-f' id='set-auth' autocomplete='on'><input type='email' id='set-email' name='email' placeholder='Email' autocomplete='username' autocapitalize='none' autocorrect='off' spellcheck='false' inputmode='email' aria-label='Email' required><input type='password' id='set-pw' name='password' placeholder='Password (8+ characters)' autocomplete='current-password' aria-label='Password' required>" +
        "<div class='set-row'><button class='btn pri' type='submit' data-a='login'>Sign in</button><button class='btn' type='submit' data-a='signup'>Create account</button><button class='btn link' type='button' id='set-forgot'>Forgot password?</button></div></form>";
    }
    html += card("set-account", "Account", acct + "<div class='set-msg' id='set-amsg' role='status'></div>", null);

    // plans / pricing
    var manage = (u && (u.tier === "paid" || u.tier === "premium")) ? "<div class='set-row'><button class='btn' id='set-manage' type='button'>Manage subscription</button><span class='note'>Switch plans or cancel from the secure billing portal.</span></div>" : "";
    var planNote = DEMO() ? "<p class='note'>All four tiers run the <b>same</b> Portfolio Terminal — what changes is whether the data is simulated or real, how deep it goes, and (on Premium) your personal AI analyst.</p>" : "";
    var plans = "<div class='plan-grid'>" + ["demo", "free", "paid", "premium"].map(function (t) { return planCell(t, cur, signed); }).join("") + "</div>" + manage +
      "<div class='set-msg' id='set-dmsg' role='status'></div>" + planNote;
    html += card("set-plan", "Plans & data", plans, "One terminal, four levels: Demo (simulated), Free (limited real data), Paid (full real data, unlimited valuation coverage), Premium (everything in Paid + AI analyst, LLM Council and Monte Carlo simulations). Prices in Thai baht.");

    // display
    var langOpts = (window.PT_I18N ? PT_I18N.LANGS : []).map(function (l) { return "<option value='" + l.code + "'" + (l.code === (window.PT_I18N ? PT_I18N.lang : "en") ? " selected" : "") + ">" + l.native + "</option>"; }).join("");
    var disp = "<div class='set-grid'><label>Language<select id='set-lang' class='notranslate' translate='no'>" + langOpts + "</select><span class='note'>Changes every label, description and sentence in the terminal, and the language the AI analyst answers in. Live news headlines and filings stay in their original language.</span></label><label>Theme" + seg("theme", [["auto", "Auto"], ["light", "Light"], ["dark", "Dark"]], p.theme) + "<span class='note'>100 more editor-style themes (Dracula, Nord, Tokyo Night, Solarized…) are in the palette button at the top of the page.</span></label>" +
      "<label>Text size" + seg("size", [["S", "Small"], ["M", "Medium"], ["L", "Large"], ["XL", "Extra large"]], p.size) + "</label>" +
      "<label>Density" + seg("density", [["comfortable", "Comfortable"], ["compact", "Compact"]], p.density) + "</label>" +
      "<label>Currency<div class='seg' role='group'><button type='button' id='set-usd' aria-pressed='" + (S.cur === "USD") + "'>USD</button><button type='button' id='set-thb' aria-pressed='" + (S.cur === "THB") + "'>THB</button></div></label></div>";
    html += card("set-display", "Display", disp, "Make the dashboard easier to read. Saved in this browser (and your account when signed in).");

    // layout
    var lay = "";
    ["ov", "val"].forEach(function (tab) {
      var L = layout(tab), names = { ov: "Overview", val: "Intrinsic value" }[tab];
      lay += "<h3>" + names + "</h3><ul class='set-list' data-tab='" + tab + "'>" + (L.order.length ? L.order : defaults[tab] || []).map(function (pid) {
        return "<li><label><input type='checkbox' data-pid='" + h(pid) + "'" + (L.hidden.indexOf(pid) < 0 ? " checked" : "") + "> " + h(titleOf(pid)) + "</label></li>";
      }).join("") + "</ul><div class='set-row'>" + Object.keys(PRESETS[tab]).map(function (n) { return "<button class='btn' type='button' data-preset='" + h(n) + "' data-tab='" + tab + "'>" + (n === "Default" ? "Reset to default" : "Preset: " + h(n)) + "</button>"; }).join("") + "</div>";
    });
    html += card("set-layout", "Dashboard layout", lay + "<p class='note'>Tick to show, untick to hide. To reorder or resize panels, press <b>Customize</b> at the top of the page and drag panels or use the arrows.</p>", "Choose which panels appear and in what order.");

    // import
    html += DEMO()
      ? card("set-import", "Statement import", "<p class='note'>Import is for your real account, so it's switched off in the demo — real statements never mix with simulated data. Create a free account to import a broker PDF, screenshot or CSV.</p>", "Import holdings from a broker PDF, screenshot or CSV.")
      : card("set-import", "Statement import", "<p class='note'>Pick one or several statements at once; you review every line before it is added.</p>", "Import holdings from a broker PDF, screenshot or CSV.");

    // admin
    if (u && u.is_admin) html += card("set-costs", "Running costs (admin)", "<div id='set-costs-body'><div class='empty'>Loading costs…</div></div>", "What this site costs to run: AI calls metered per request, plus fixed monthly plans. Only admins see this.");

    pane.innerHTML = "<div class='set-wrap'>" + html + "</div>";
    wireSettings(u);
    if (u && u.is_admin) loadCosts();
    if (billing) { try { history.replaceState(null, "", location.pathname + location.hash); } catch (e) {} if (billing === "success") setTimeout(function () { loadMe(true).then(function () { if (S.tab === "set") renderSettings(); }); }, 4000); }
  }

  function say(id, t, bad) { var m = el(id); if (m) { m.textContent = t || ""; m.style.color = bad ? "var(--down)" : "var(--muted)"; } }
  function wireSettings(u) {
    var form = el("set-auth");
    if (form) {
      var which = "login";
      form.querySelectorAll("button[type=submit]").forEach(function (b) { b.onclick = function () { which = b.getAttribute("data-a"); }; });
      form.onsubmit = async function (e) {
        e.preventDefault(); say("set-amsg", which === "login" ? "Signing in…" : "Creating account…");
        try {
          var j = await post("/api/auth/" + which, { email: el("set-email").value, password: el("set-pw").value });
          if (j.confirm) return say("set-amsg", j.message);
          AUTH.setSession(j.session);
          // A full reload is the one flow that is guaranteed correct in every mode:
          // it leaves demo mode, re-hydrates account state and repaints the header.
          say("set-amsg", "Signed in — loading your account…");
          setTimeout(function () { location.reload(); }, 300);
        } catch (err) { say("set-amsg", err.message, true); }
      };
      var forgot = el("set-forgot");
      if (forgot) forgot.onclick = async function () {
        var em = el("set-email").value; if (!em) return say("set-amsg", "Type your email first.", true);
        try { var j = await post("/api/auth/recover", { email: em }); say("set-amsg", j.message); } catch (err) { say("set-amsg", err.message, true); }
      };
    }
    if (el("set-logout")) el("set-logout").onclick = async function () { await post("/api/auth/logout", {}, true).catch(function () {}); AUTH.setSession(null); me = null; renderSettings(); };
    if (el("set-pwgo")) el("set-pwgo").onclick = async function () { try { await post("/api/auth/password", { password: el("set-newpw").value }, true); say("set-amsg", "Password changed."); } catch (err) { say("set-amsg", err.message, true); } };

    // plan subscribe buttons
    var planCard = el("set-plan");
    if (planCard) planCard.querySelectorAll("button[data-plan]").forEach(function (b) {
      b.onclick = async function () {
        if (!AUTH.session() || DEMO()) { say("set-dmsg", "Create a free account first — then pick a paid plan here.", true); var a = el("set-account"); if (a) a.scrollIntoView({ behavior: "smooth" }); return; }
        /* an existing Paid subscriber changes plan in the Stripe billing portal (Checkout refuses a second subscription) */
        var sw = b.getAttribute("data-switch") === "portal";
        say("set-dmsg", sw ? "Opening the billing portal…" : "Opening secure checkout…");
        try { var j = sw ? await post("/api/billing/portal", {}, true) : await post("/api/billing/checkout", { plan: b.getAttribute("data-plan") }, true); location.href = j.url; } catch (e) { say("set-dmsg", e.message, true); }
      };
    });
    if (el("set-manage")) el("set-manage").onclick = async function () { try { var j = await post("/api/billing/portal", {}, true); location.href = j.url; } catch (e) { say("set-dmsg", e.message, true); } };

    var langSel = document.getElementById("set-lang");
    if (langSel) langSel.onchange = function () { if (window.PT_I18N) PT_I18N.setLang(langSel.value); };
    document.querySelectorAll("#set-display .seg[data-pref]").forEach(function (g) {
      g.onclick = function (e) { var v = e.target.getAttribute("data-v"); if (!v) return; g.querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-pressed", b === e.target); }); setPref(g.getAttribute("data-pref"), v); };
    });
    if (el("set-usd")) el("set-usd").onclick = function () { var b = el("cur-usd"); if (b) b.click(); el("set-usd").setAttribute("aria-pressed", true); el("set-thb").setAttribute("aria-pressed", false); };
    if (el("set-thb")) el("set-thb").onclick = function () { var b = el("cur-thb"); if (b) b.click(); el("set-thb").setAttribute("aria-pressed", true); el("set-usd").setAttribute("aria-pressed", false); };

    document.querySelectorAll("#set-layout .set-list").forEach(function (ul) {
      ul.onchange = function (e) { var t = ul.getAttribute("data-tab"), pid = e.target.getAttribute("data-pid"), L = layout(t); L.order = currentOrder(t); var i = L.hidden.indexOf(pid); if (e.target.checked && i >= 0) L.hidden.splice(i, 1); if (!e.target.checked && i < 0) L.hidden.push(pid); saveLayout(t, L); applyLayout(t); };
    });
    document.querySelectorAll("#set-layout [data-preset]").forEach(function (b) { b.onclick = function () { applyPreset(b.getAttribute("data-tab"), b.getAttribute("data-preset")); renderSettings(); }; });
    var imp = el("set-impsave");
    if (imp) imp.onclick = function () {};
  }

  async function loadCosts() {
    var body = el("set-costs-body"); if (!body) return;
    try {
      var r = await AUTH.fetch("/api/admin/costs"); var j = await r.json(); if (!r.ok) throw new Error(j.error || "HTTP " + r.status);
      var usd = function (v) { return "$" + (v < 0.01 && v > 0 ? v.toFixed(4) : v.toFixed(2)); };
      var days = [], services = {};
      for (var i = 29; i >= 0; i--) { var d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10); var parts = (j.byDay && j.byDay[d]) || {}; Object.keys(parts).forEach(function (k) { services[k] = 1; }); days.push({ d: d, parts: parts }); }
      var ser = Object.keys(services); if (!ser.length) ser = ["Z.ai"];
      var rev = j.revenue;
      body.innerHTML =
        "<div class='kpis set-k'><div class='kpi'><span class='lbl'>AI spend this month</span><span class='val'>" + usd(j.mtd) + "</span><span class='sub'>" + j.calls + " calls</span></div>" +
        "<div class='kpi'><span class='lbl'>Projected AI, full month</span><span class='val'>" + usd(j.projected) + "</span><span class='sub'>at this month's pace</span></div>" +
        "<div class='kpi'><span class='lbl'>Fixed plans / month</span><span class='val'>" + usd(j.fixedMonth) + "</span><span class='sub'>" + j.fixed.length + " services</span></div>" +
        "<div class='kpi'><span class='lbl'>Premium revenue this month</span><span class='val'>" + (rev && rev.mtd != null ? usd(rev.mtd) : "–") + "</span><span class='sub'>" + (rev && rev.mtd != null ? rev.active + " active · Stripe " + rev.mode + " mode" : "Stripe not connected yet") + "</span></div></div>" +
        "<h3>Metered spend per day (last 30 days)</h3><div class='chart' id='set-cost-chart'></div>" +
        "<h3>By model</h3><div class='tablebox'><table class='kv'><thead><tr><th>Service · model</th><th>Calls</th><th>Input tokens</th><th>Output tokens</th><th>Cost</th></tr></thead><tbody>" +
        ((j.byModel || []).map(function (m) { return "<tr><td>" + h(m.service + " · " + m.model) + "</td><td>" + m.calls + "</td><td>" + m.in.toLocaleString("en-US") + "</td><td>" + m.out.toLocaleString("en-US") + "</td><td>" + usd(m.usd) + "</td></tr>"; }).join("") || "<tr><td colspan='5'>No metered calls in the last 35 days.</td></tr>") + "</tbody></table></div>" +
        "<h3>Fixed monthly lines</h3><ul class='set-fixed'>" + j.fixed.map(function (f) { return "<li><b>" + h(f.service) + "</b> " + usd(Number(f.usd_month) || 0) + "/mo <span class='muted'>" + h(f.note || "") + "</span></li>"; }).join("") + "</ul>" +
        "<h3>Which AI model does what</h3><ul class='set-fixed'><li><b>Statement import:</b> " + h(j.models.import) + "</li><li><b>News briefing:</b> " + h(j.models.news) + "</li><li><b>Fallback:</b> " + h(j.models.fallback) + "</li></ul>" +
        "<h3>Check the bills at the source</h3><ul class='set-fixed'>" +
        "<li><a href='https://z.ai/manage-apikey/billing' target='_blank' rel='noopener'>Z.ai billing &amp; usage</a> (GLM models)</li>" +
        "<li><a href='https://aistudio.google.com/usage' target='_blank' rel='noopener'>Google AI Studio usage</a> (Gemini fallback)</li>" +
        "<li><a href='https://vercel.com/dashboard' target='_blank' rel='noopener'>Vercel → Settings → Billing</a> (hosting)</li>" +
        "<li><a href='https://supabase.com/dashboard/org/_/billing' target='_blank' rel='noopener'>Supabase → Organization → Billing</a> (database)</li>" +
        "<li><a href='https://www.alphavantage.co/premium/' target='_blank' rel='noopener'>Alpha Vantage plans</a> (free key now)</li>" +
        "<li><a href='https://dashboard.stripe.com/' target='_blank' rel='noopener'>Stripe dashboard</a> (Premium revenue and fees)</li></ul>";
      stackCols(el("set-cost-chart"), days, ser, function (v) { return v === 0 ? "$0" : v < 0.01 ? "$" + v.toFixed(4) : "$" + v.toFixed(2); });
    } catch (e) { body.innerHTML = "<div class='empty'>Could not load costs: " + h(e.message) + "</div>"; }
  }

  /* ================= styles ================= */
  var css = document.createElement("style");
  css.textContent = [
    ".lay{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;align-items:start;grid-auto-flow:row dense}",
    ":root[data-density='compact'] .lay{gap:10px}",
    ".lay>.lay-item{grid-column:1/-1;min-width:0}.lay>.lay-item.lay-half{grid-column:auto}",
    ".lay>.lay-hidden{display:none!important}",
    ".lay-collapsed>*:not(.ph):not(.lay-bar){display:none!important}",
    ".lay-col{border:0;background:transparent;color:var(--muted);cursor:pointer;font-size:14px;padding:0 4px;margin-right:2px;transition:transform .15s}",
    ".lay-collapsed .lay-col{transform:rotate(-90deg)}",
    ".lay-editing .lay>.lay-hidden{display:flex!important;opacity:.45}",
    ".lay-editing .lay>.lay-item{outline:2px dashed color-mix(in srgb,var(--accent) 55%,transparent);outline-offset:3px}",
    ".lay-bar{display:flex;flex-wrap:wrap;align-items:center;gap:6px;background:var(--accent-soft);border-radius:4px;padding:6px 8px;font-size:13px;width:100%}",
    ".lay-bar b{margin-right:auto}.lay-bar button{font:inherit;font-size:12.5px;background:var(--panel);border:1px solid var(--line);border-radius:4px;padding:3px 9px;cursor:pointer;color:var(--fg)}",
    ".lay-grip{cursor:grab;font-size:16px;color:var(--accent)}.lay-dragging{opacity:.5}.lay-over{box-shadow:0 0 0 3px var(--accent)}",
    "@media (max-width:900px){.lay{grid-template-columns:1fr}.lay>.lay-item.lay-half{grid-column:1/-1}}",
    ".dn-wrap{display:flex;flex-wrap:wrap;gap:12px 24px;align-items:center}.dn-wrap svg{width:170px;height:170px;flex:none}",
    ".dn{stroke:var(--panel);stroke-width:1.5;cursor:pointer}.dn:hover{opacity:.85}.dn-c1{font-family:var(--f-mono);font-size:17px;font-weight:600;fill:var(--fg)}.dn-c2{font-size:12px;fill:var(--muted)}",
    ".dn-leg{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px 18px;flex:1;min-width:200px}",
    ".dn-leg li{display:grid;grid-template-columns:10px 1fr auto;gap:8px;align-items:center;font-size:13.5px}.dn-leg i{width:10px;height:10px;border-radius:2px}.dn-leg b{font-family:var(--f-mono);font-weight:500}",
    ".hb{display:flex;flex-direction:column;gap:7px}.hb-row{display:grid;grid-template-columns:minmax(120px,1.2fr) 2fr minmax(90px,auto);gap:10px;align-items:center;font-size:13.5px}",
    ".hb-t{height:10px;background:var(--panel-2);border-radius:3px;overflow:hidden}.hb-t i{display:block;height:100%;border-radius:0 3px 3px 0}.hb-v{font-family:var(--f-mono);font-size:12.5px;color:var(--muted);text-align:right}",
    "#news-chart{max-width:560px}#ph-alloc{margin:4px 0 8px}",
    ".set-wrap{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;align-items:start}@media (max-width:900px){.set-wrap{grid-template-columns:1fr}}",
    "#set-costs,#set-plan,#set-layout{grid-column:1/-1}",
    ".plan-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}@media (max-width:1000px){.plan-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (max-width:560px){.plan-grid{grid-template-columns:1fr}}",
    ".plan{border:1px solid var(--line);border-radius:8px;padding:12px 14px;display:flex;flex-direction:column;gap:7px}",
    ".plan.cur{border-color:var(--accent);background:var(--accent-soft)}",
    ".plan h3{margin:0;font-size:15px;display:flex;align-items:center;gap:8px}",
    ".plan .p{font-family:var(--f-mono);font-weight:600;font-size:16px}.plan .per{font-weight:400;font-size:12px;color:var(--muted)}",
    ".plan .tag{font-size:12.5px;color:var(--muted);line-height:1.4}",
    ".plan dl{margin:0;display:flex;flex-direction:column;flex:1;font-size:12.5px}.plan dl>div{display:flex;justify-content:space-between;align-items:baseline;gap:10px;padding:6px 0;border-top:1px solid var(--line)}",
    ".plan dt{color:var(--muted)}.plan dd{margin:0;text-align:right;font-weight:500;font-variant-numeric:tabular-nums}.plan dd.na{color:var(--muted);opacity:.7;font-weight:400}.plan dd.inc{color:var(--accent);font-weight:600}",
    ".plan.prem{border-color:color-mix(in srgb,var(--accent) 80%,transparent);box-shadow:0 0 0 1px color-mix(in srgb,var(--accent) 22%,transparent),0 0 14px color-mix(in srgb,var(--accent) 34%,transparent),0 0 34px color-mix(in srgb,var(--accent) 16%,transparent);animation:plan-glow 3.6s ease-in-out infinite}",
    "@keyframes plan-glow{50%{box-shadow:0 0 0 1px color-mix(in srgb,var(--accent) 30%,transparent),0 0 20px color-mix(in srgb,var(--accent) 46%,transparent),0 0 46px color-mix(in srgb,var(--accent) 24%,transparent)}}",
    "@media (prefers-reduced-motion:reduce){.plan.prem{animation:none}}",
    ".plan .badge{font-size:10.5px;font-weight:700;letter-spacing:.06em;color:var(--accent);border:1px solid var(--accent);border-radius:99px;padding:1px 8px}",
    ".plan .btn{align-self:flex-start;margin-top:2px}",
    ".set-opts{display:flex;flex-direction:column;gap:8px}.set-opt{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border:1px solid var(--line);border-radius:6px;cursor:pointer}",
    ".set-opt.on{border-color:var(--accent);background:var(--accent-soft)}.set-opt small{display:block;color:var(--muted);font-size:13px;margin-top:2px;line-height:1.45}.set-opt input{margin-top:4px}",
    ".set-opt:has(input:disabled){opacity:.75;cursor:default}",
    ".set-f{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.set-f input{font:inherit;font-size:14px;padding:7px 10px;border:1px solid var(--line);border-radius:4px;background:var(--panel);color:var(--fg);min-width:0;flex:1 1 220px}",
    ".set-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.btn.pri{border-color:var(--accent);color:var(--accent);font-weight:600}.btn.link{border:0;background:none;text-decoration:underline;color:var(--muted)}",
    ".set-msg{font-size:13px;min-height:18px}.set-kv{display:grid;grid-template-columns:auto 1fr;gap:4px 14px;font-size:14px}.set-kv span{color:var(--muted)}",
    ".set-grid{display:grid;gap:12px}.set-grid label{display:flex;flex-direction:column;gap:6px;font-size:13px;color:var(--muted)}",
    ".set-list{list-style:none;margin:0 0 8px;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:4px 16px;font-size:14px}",
    ".set-fixed{margin:0;padding-left:18px;display:flex;flex-direction:column;gap:5px;font-size:13.5px}",
    ".set-banner{grid-column:1/-1;padding:10px 14px;border-radius:6px;background:var(--panel-2);font-size:14px}.set-banner.up{background:color-mix(in srgb,var(--up) 14%,var(--panel))}",
    ".set-k{grid-template-columns:repeat(4,minmax(0,1fr))}@media (max-width:820px){.set-k{grid-template-columns:repeat(2,minmax(0,1fr))}}",
    ".set-pw summary{list-style:none;display:inline-block}.set-pw[open] .set-f{margin-top:8px}",
    "svg .gl{stroke:var(--line);stroke-width:1}",
    "#lay-toggle[aria-pressed='true']{border-color:var(--accent);color:var(--accent);background:var(--accent-soft)}",
  ].join("\n");
  document.head.appendChild(css);

  /* ================= boot ================= */
  function boot() {
    setupTab("ov"); setupTab("val");
    var status = document.querySelector("header.bar .status");
    if (status && !el("lay-toggle")) {
      var b = document.createElement("button"); b.className = "btn"; b.id = "lay-toggle"; b.type = "button"; b.textContent = "Customize"; b.setAttribute("aria-pressed", "false");
      b.title = "Reorder, resize and hide panels";
      b.onclick = function () { if (S.tab === "set") setTab("ov"); setEditing(!editing); };
      status.insertBefore(b, status.firstChild);
    }
    drawExtras();
    if (AUTH && AUTH.session()) loadMe(true).then(function () { if (S.tab === "set") renderSettings(); });
    if (/[?&]billing=/.test(location.search)) setTab("set");
    else if (S.tab === "set") renderSettings();
  }
  window.PT_UI = { setPref: setPref, getPref: function (k) { return prefs()[k]; }, renderSettings: renderSettings, redraw: redrawCharts, setEditing: setEditing, extras: function () { try { drawExtras(); } catch (e) {} } };
  boot();
})();
