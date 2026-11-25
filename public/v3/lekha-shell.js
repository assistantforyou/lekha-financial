/* LEKHA V3 shell: five primary tabs + nested sub-tabs, hash routing (#/<tab>/<sub>), persistence, redraw-on-show,
   Settings drawer. The classic engine keeps its own S.tab ("ov" | "val" | "set") as an engine mode; this file maps
   routes onto it so every existing render gate keeps working unchanged. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var KEY = "ptpub.v1.v3.route", START = "ptpub.v1.v3.start";
  var TABS = {
    portfolio: { name: "My Portfolio", subs: [["overview", "Overview"], ["holdings", "Holdings"], ["risk", "Risk"]] },
    simulation: { name: "Intelligent Simulation", subs: [["main", "Monte Carlo Engine"]] },
    macro: { name: "Macroeconomics & Indicators", subs: [["regime", "Macro Regime"], ["rotation", "Market Rotation"], ["intel", "Market Intelligence"], ["appetite", "Risk Appetite"]] },
    analysis: { name: "Deep Analysis & Intelligent Council", subs: [["value", "Intrinsic Value & Margin of Safety"], ["deep", "Holdings Deep Analysis"], ["council", "LLM Council"], ["reports", "AI Research Reports"]] },
    sector: { name: "Sector Rotation Intelligence", subs: [["now", "Right Now"], ["rrg", "Rotation Graph"], ["lead", "Leadership Quality"], ["breadth", "Sector Breadth"]] },
  };
  var cur = { t: null, s: null }, routing = false, drawerOpen = false, modeBeforeDrawer = "ov", listeners = [];
  function ls(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || "null"); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }
  function parse(h) {
    var m = /^#\/([a-z]+)(?:\/([a-z]+))?/.exec(h || ""); if (!m || !TABS[m[1]]) return null;
    var subs = TABS[m[1]].subs.map(function (x) { return x[0]; });
    return { t: m[1], s: subs.indexOf(m[2]) >= 0 ? m[2] : subs[0] };
  }
  function defaultRoute() { return parse("#/" + (ls(KEY) || "")) || parse(ls(START) === "macro" ? "#/macro/regime" : "#/portfolio/overview"); }
  function modeOf(r) { return r.t === "analysis" && r.s === "value" ? "val" : "ov"; }
  function app() { return window.PT_APP || {}; }

  function redraw(r) {
    var A = app();
    try {
      if (modeOf(r) === "val") { if (A.renderValAll) A.renderValAll(); }
      else { if (A.renderAll) A.renderAll(); if (A.redrawOverview) A.redrawOverview(); }
      if (window.PT_UI && PT_UI.extras) PT_UI.extras();
    } catch (e) { console.warn("[v3] redraw", e); }
  }
  function show(r, push) {
    var prev = cur; cur = r;
    Object.keys(TABS).forEach(function (t) {
      var on = t === r.t, pane = $("t-" + t), btn = $("nt-" + t);
      if (pane) pane.hidden = !on;
      if (btn) { btn.setAttribute("aria-selected", on); btn.tabIndex = on ? 0 : -1; }
    });
    var pane = $("t-" + r.t);
    pane.querySelectorAll(".v3pane").forEach(function (p) { p.hidden = p.dataset.s !== r.s; });
    pane.querySelectorAll(".v3sub [data-s]").forEach(function (b) { var on = b.dataset.s === r.s; b.setAttribute("aria-selected", on); b.tabIndex = on ? 0 : -1; });
    var subName = (TABS[r.t].subs.filter(function (x) { return x[0] === r.s; })[0] || [])[1];
    $("v3crumb").textContent = TABS[r.t].name + (TABS[r.t].subs.length > 1 ? "  ›  " + subName : "");
    document.title = subName + " · LEKHA Financials";
    var h = "#/" + r.t + "/" + r.s;
    if (location.hash !== h) { if (push) history.pushState(null, "", h); else history.replaceState(null, "", h); }
    ls(KEY, r.t + "/" + r.s);
    var mode = modeOf(r), A = app();
    if (A.setTab && A.S && (A.S.tab !== mode || !prev.t)) { routing = true; try { A.setTab(mode); } finally { routing = false; } }
    /* charts drawn while hidden used a fallback width: redraw what just became visible */
    requestAnimationFrame(function () { redraw(r); });
    listeners.forEach(function (f) { try { f(r, prev); } catch (e) {} });
  }
  function go(path, push) { var r = parse("#/" + path); if (r) show(r, push !== false); }

  /* ---------- Settings drawer (the classic Settings tab, as a utility, not a research tab) ---------- */
  function openDrawer() {
    if (drawerOpen) return; drawerOpen = true;
    var A = app(); modeBeforeDrawer = (A.S && A.S.tab !== "set") ? A.S.tab : modeOf(cur || defaultRoute());
    $("v3-drawer").hidden = false; $("v3-drawer-bg").hidden = false; document.documentElement.classList.add("v3-noscroll");
    setTimeout(function () { var x = $("v3-drawer-x"); if (x) x.focus(); }, 30);
  }
  function closeDrawer() {
    if (!drawerOpen) return; drawerOpen = false;
    $("v3-drawer").hidden = true; $("v3-drawer-bg").hidden = true; document.documentElement.classList.remove("v3-noscroll");
    var A = app(); if (A.setTab) { routing = true; try { A.setTab(modeBeforeDrawer); } finally { routing = false; } }
    redraw(cur); var b = $("v3-settings"); if (b) b.focus();
  }
  /* called by the classic setTab() before it renders; return false to stop it */
  function engineTab(t) {
    if (routing) return true;
    if (t === "set") { openDrawer(); setTimeout(startPref, 0); return true; }
    if (drawerOpen) { closeDrawer(); return false; }
    if (t === "val") { go("analysis/value"); return false; }
    if (t === "ov" && cur && modeOf(cur) === "val") { go("portfolio/overview"); return false; }
    return true;
  }
  function startPref() {
    var box = $("v3-start-pref"); if (!box) return setTimeout(startPref, 150);
    var v = ls(START) === "macro" ? "macro" : "portfolio";
    box.innerHTML = "<h3>Start screen</h3><div class='seg' role='group' aria-label='Start screen'><button type='button' data-v='portfolio' aria-pressed='" + (v === "portfolio") + "'>Portfolio first</button><button type='button' data-v='macro' aria-pressed='" + (v === "macro") + "'>Markets first</button></div><p class='note'>Replaces V2's page-order presets: which research tab V3 opens on when no tab is in the address.</p>";
    box.onclick = function (e) { var b = e.target.closest("button[data-v]"); if (!b) return; ls(START, b.dataset.v); startPref(); };
  }

  /* ---------- Portfolio summary as four cards (same sentences as V2, grouped) ---------- */
  window.LEKHA_SUMMARY = function () {
    var pf = $("sm-pf"), mk = $("sm-mk"), host = $("v3-sum"); if (!pf || !mk) return;
    if (!host) { host = document.createElement("div"); host.id = "v3-sum"; host.className = "v3sum"; var s = $("summary"); if (!s) return; s.appendChild(host); }
    var strip = function (el) { var c = el.cloneNode(true), l = c.querySelector(".sm-lbl"); if (l) l.remove(); return c.innerHTML.trim(); };
    var p = strip(pf), m = strip(mk);
    var dot = p.indexOf(". "), first = dot >= 0 ? p.slice(0, dot + 1) : p, rest = dot >= 0 ? p.slice(dot + 2).replace(/\.$/, "") : "";
    var drivers = [], risks = [];
    rest.split("; ").forEach(function (x) { if (!x) return; x = x.charAt(0).toUpperCase() + x.slice(1); (/of the book|below its 1-year peak/.test(x) ? risks : drivers).push(x); });
    var card = function (k, t, body) { return "<div class='v3sc v3sc-" + k + "'><h3>" + t + "</h3><div>" + (body || "<span class='muted'>Nothing notable in the current data.</span>") + "</div></div>"; };
    host.innerHTML = card("a", "Portfolio assessment", first) + card("d", "Performance drivers", drivers.map(function (x) { return "<p>" + x + ".</p>"; }).join("")) +
      card("r", "Major risks", risks.map(function (x) { return "<p>" + x + ".</p>"; }).join("") || "<span class='muted'>No position above 15% of the book and no 10%+ drawdown from the 1-year peak.</span>") + card("m", "Market context", m);
  };

  /* ---------- wiring ---------- */
  function keyNav(list, attr, onPick) {
    list.addEventListener("keydown", function (e) {
      var bs = Array.prototype.slice.call(list.querySelectorAll("[" + attr + "]")), i = bs.indexOf(document.activeElement); if (i < 0) return;
      var j = e.key === "ArrowRight" ? (i + 1) % bs.length : e.key === "ArrowLeft" ? (i - 1 + bs.length) % bs.length : e.key === "Home" ? 0 : e.key === "End" ? bs.length - 1 : -1;
      if (j < 0) return; e.preventDefault(); bs[j].focus(); onPick(bs[j]);
    });
  }
  function boot() {
    var nav = $("v3nav");
    nav.addEventListener("click", function (e) { var b = e.target.closest("[data-t]"); if (!b) return; var t = b.dataset.t; var last = ls(KEY + "." + t); go(t + "/" + (last || TABS[t].subs[0][0])); });
    keyNav(nav, "data-t", function (b) { go(b.dataset.t + "/" + TABS[b.dataset.t].subs[0][0]); });
    document.querySelectorAll(".v3sub").forEach(function (sub) {
      sub.addEventListener("click", function (e) { var b = e.target.closest("[data-s]"); if (b) go(cur.t + "/" + b.dataset.s); });
      keyNav(sub, "data-s", function (b) { go(cur.t + "/" + b.dataset.s); });
    });
    listeners.push(function (r) { ls(KEY + "." + r.t, r.s); var b = $("nt-" + r.t); if (b && b.scrollIntoView && window.innerWidth < 900) b.scrollIntoView({ block: "nearest", inline: "center" }); });
    window.addEventListener("hashchange", function () { var r = parse(location.hash); if (r && (r.t !== cur.t || r.s !== cur.s)) show(r, false); });
    window.addEventListener("popstate", function () { var r = parse(location.hash); if (r) show(r, false); });
    $("v3-settings").onclick = function () { var b = $("tb-set"); if (b) b.click(); };
    $("v3-drawer-x").onclick = closeDrawer; $("v3-drawer-bg").onclick = closeDrawer;
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && drawerOpen) closeDrawer(); });
    show(parse(location.hash) || defaultRoute(), false);
  }
  window.LEKHA_SHELL = { engineTab: engineTab, go: go, route: function () { return cur; }, onRoute: function (f) { listeners.push(f); }, openSettings: openDrawer, closeSettings: closeDrawer };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
