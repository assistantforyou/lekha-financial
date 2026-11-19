/* LEKHA app: the bridge between the React shell and the classic V2/V3 engine. Loaded BEFORE the engine.
   - LEKHA_SHELL.route()/onRoute()/go(): what the classic modules (sim, council, deep) call; the React router drives them.
   - LEKHA_SHELL.engineTab(t): the classic setTab() asks first, so "Settings" and "Intrinsic value" become shell routes instead of engine tabs.
   - LEKHA_SUMMARY(): the four-card portfolio summary (same sentences as V2, grouped). */
(function () {
  "use strict";
  var cur = { t: null, s: null }, routing = false, listeners = [], navigate = null, ready = [];
  function app() { return window.PT_APP || {}; }
  function modeOf(r) { return r && r.t === "analysis" && r.s === "value" ? "val" : "ov"; }
  function redraw(r) {
    var A = app();
    try {
      if (modeOf(r) === "val") { if (A.renderValAll) A.renderValAll(); }
      else { if (A.renderAll) A.renderAll(); if (A.redrawOverview) A.redrawOverview(); }
      if (window.PT_UI && PT_UI.extras) PT_UI.extras();
    } catch (e) { console.warn("[lekha] redraw", e); }
  }
  /* React calls this whenever the route changes (and again after it has moved panels into view). */
  function setRoute(r, panesShown) {
    var prev = cur; cur = r; var A = app(), mode = modeOf(r);
    if (A.setTab && A.S && (A.S.tab !== mode || !prev.t)) { routing = true; try { A.setTab(mode); } finally { routing = false; } }
    if (panesShown) requestAnimationFrame(function () { redraw(r); });
    listeners.forEach(function (f) { try { f(r, prev); } catch (e) {} });
  }
  function go(path) { if (navigate) navigate(path); else location.hash = "#/" + path; }
  function engineTab(t) {
    if (routing) return true;
    if (t === "set") { go(/[?&]billing=/.test(location.search) ? "account/plans" : "account/preferences"); return false; }
    if (t === "val") { go("analysis/value"); return false; }
    if (t === "ov" && cur && modeOf(cur) === "val") { go("portfolio/overview"); return false; }
    return true;
  }
  window.LEKHA_SHELL = {
    engineTab: engineTab, go: go, route: function () { return cur; }, onRoute: function (f) { listeners.push(f); },
    _setRoute: setRoute, _redraw: function () { redraw(cur); }, _register: function (fn) { navigate = fn; }, openSettings: function () { go("account/preferences"); }, closeSettings: function () {},
  };
  window.LEKHA_SUMMARY = function () {
    var $ = function (id) { return document.getElementById(id); };
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
})();
