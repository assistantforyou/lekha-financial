/* Portfolio Terminal: data-source selector + PT_DATA_SOURCE router.
   Config lives only in this browser (localStorage "ptpub.v1.source"). Types:
     none     no market data (panels show "no market-data source connected")
     free     this site's free tier: public sources (FRED, ...) through /api/free, no key needed
     premium  everything in free, plus Alpha Vantage extras through /api/av (signed-in subscribers; checked server-side)
     custom   any HTTP endpoint implementing the contract below, optional bearer token
   With nothing saved the free tier is the default; choosing "none" is stored explicitly.
   Endpoint contract (base = URL without trailing slash):
     GET base/health                -> {"ok":true,"name":"..."}
     GET base/csv/<KEY>             -> text/csv  (KEY: ROTATION BREADTH RISK OBOS FACTOR PEER VOLATILITY VALIN HISTORY); 204/404 = not available
     GET base/doc?path=meta/<name>  -> JSON object or null
     GET base/collection/<name>     -> JSON [{id, data}]  (news fund rev etf ins)
   Entitlement checks belong on that server; nothing here is security. */
(function () {
  /* ---- account session (email + password via /api/auth; tokens kept in this browser) ---- */
  var SKEY = "ptpub.v1.session";
  function sess() { try { return JSON.parse(localStorage.getItem(SKEY) || "null"); } catch (e) { return null; } }
  function setSess(v) { try { if (v) localStorage.setItem(SKEY, JSON.stringify(v)); else localStorage.removeItem(SKEY); } catch (e) {} }
  var refreshing = null;
  async function token() {
    var s = sess(); if (!s || !s.access_token) return null;
    if (s.expires_at && s.expires_at * 1000 - Date.now() > 60000) return s.access_token;
    if (!refreshing) refreshing = fetch("/api/auth/refresh", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: s.refresh_token }) })
      .then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { if (j && j.session) { j.session.email = j.session.email || s.email; setSess(j.session); return j.session.access_token; } setSess(null); return null; })
      .catch(function () { return s.access_token; }).finally(function () { refreshing = null; });
    return refreshing;
  }
  async function authFetch(url, opts) {
    opts = opts || {}; var t = await token(); var h = Object.assign({}, opts.headers || {});
    if (t) h.Authorization = "Bearer " + t;
    return fetch(url, Object.assign({}, opts, { headers: h }));
  }
  window.PT_AUTH = { session: sess, setSession: setSess, token: token, fetch: authFetch };

  var KEY = "ptpub.v1.source";
  function load() {
    try { var v = JSON.parse(localStorage.getItem(KEY) || "null"); if (v && v.type) { if (v.type === "builtin" || v.type === "av") v.type = "premium"; return v; } } catch (e) {}
    return { type: "free" };
  }
  function save(c) { try { localStorage.setItem(KEY, JSON.stringify(c)); return true; } catch (e) { return false; } }
  function baseOf(c) {
    if (c.type === "free" || c.type === "premium") return location.origin + "/api/free";
    if (c.type === "custom" && c.url) return String(c.url).trim().replace(/\/+$/, "");
    return null;
  }
  function headers(c) { var h = { Accept: "application/json, text/csv, */*" }; if (c.type === "custom" && c.token) h.Authorization = "Bearer " + c.token; return h; }
  async function get(c, path, asText) {
    var b = baseOf(c); if (!b) return null;
    var r = await fetch(b + path, { headers: headers(c) });
    if (r.status === 204 || r.status === 404) return null;
    if (!r.ok) throw { code: "source_http_" + r.status, message: "Data source returned HTTP " + r.status };
    return asText ? r.text() : r.json();
  }
  /* ---- your holdings -> free-tier prices ----
     The tickers go to the server in a POST body (not the URL) so they are not written into request logs; nothing is stored.
     The returned history also gives live quote fields, published as window.PT_LIVE for the holdings table. US-listed USD holdings only. */
  /* quote symbol for a holding: US tickers as-is; HKD -> 0700.HK, THB -> PTT.BK (suffix added when missing) */
  function quoteSym(h) {
    var t = String(h.tk || "").toUpperCase();
    if (h.cur === "HKD" && !/\.HK$/.test(t)) return /^\d+$/.test(t) ? ("0000" + t).slice(-4) + ".HK" : t + ".HK";
    if (h.cur === "THB" && !/\.BK$/.test(t)) return t + ".BK";
    return t;
  }
  function holdingMap() {
    try {
      var v = JSON.parse(localStorage.getItem("ptpub.v1.db.holdings/all") || "null"), m = {};
      ((v && v.items) || []).forEach(function (h) { if (h && h.tk && h.tk !== "CASH") m[quoteSym(h)] = h.tk; });
      return m;
    } catch (e) { return {}; }
  }
  function holdingSymbols() { return Object.keys(holdingMap()); }
  window.PT_QUOTE_SYM = quoteSym;
  function parseCsvLine(l) { return l.split(","); }
  function computeLive(text, syms, map) {
    var lines = String(text).split("\n"), head = parseCsvLine(lines[0] || ""), live = {}, newest = 0;
    for (var j = 0; j < head.length; j += 2) {
      var m = /^D\|(.+)$/.exec(head[j] || ""); if (!m || syms.indexOf(m[1]) < 0) continue;
      var pts = [];
      for (var i = 2; i < lines.length; i++) { var c = parseCsvLine(lines[i]), d = parseFloat(c[j]), v = parseFloat(c[j + 1]); if (isFinite(d) && isFinite(v) && v > 0) pts.push([(Math.floor(d) - 25569) * 864e5, v]); }
      if (pts.length < 2) continue;
      var n = pts.length, px = pts[n - 1][1], at = function (back) { return n - 1 - back >= 0 ? pts[n - 1 - back][1] : null; };
      var yr = new Date(pts[n - 1][0]).getUTCFullYear(), prevYear = null;
      for (var q = n - 1; q >= 0; q--) if (new Date(pts[q][0]).getUTCFullYear() < yr) { prevYear = pts[q][1]; break; }
      var hi = 0; for (var r2 = Math.max(0, n - 252); r2 < n; r2++) if (pts[r2][1] > hi) hi = pts[r2][1];
      var rel = function (base) { return base ? px / base - 1 : null; };
      live[(map && map[m[1]]) || m[1]] = { px: px, prev: at(1), hi52: hi, day: rel(at(1)), w1: rel(at(5)), m1: rel(at(21)), ytd: rel(prevYear), from52: rel(hi) };
      if (pts[n - 1][0] > newest) newest = pts[n - 1][0];
    }
    var sig = JSON.stringify(live), changed = sig !== window.PT_LIVE_SIG;
    window.PT_LIVE = live; window.PT_LIVE_SIG = sig; window.PT_LIVE_AT = Date.now(); window.PT_LIVE_ASOF = newest ? new Date(newest).toISOString().slice(0, 10) : null;
    if (changed) (function again(tries) { if (window.PT_HOLD) window.PT_HOLD.apply(); else if (tries < 20) setTimeout(function () { again(tries + 1); }, 250); })(0);
  }
  /* HISTORY and FACTOR both take your tickers in a POST body (never the URL) */
  async function freePost(key) {
    var syms = holdingSymbols();
    var r = await fetch(location.origin + "/api/free/csv/" + key, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbols: syms }) });
    if (r.status === 204 || r.status === 404) return null;
    if (!r.ok) throw { code: "source_http_" + r.status, message: "Data source returned HTTP " + r.status };
    var t = await r.text();
    if (key === "HISTORY") { computeLive(t, syms, holdingMap()); loadExtras(syms); }
    return t;
  }

  /* all-time highs + FX rates (ECB) for the holdings table; tickers in a POST body */
  async function loadExtras(syms) {
    try {
      var r = await fetch(location.origin + "/api/free/extras", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbols: syms }) });
      if (!r.ok) return;
      var j = await r.json(), map = holdingMap(), ath = {};
      Object.keys(j.ath || {}).forEach(function (s) { ath[map[s] || s] = j.ath[s]; });
      window.PT_ATH = ath; window.PT_FX = j.fx || null;
      if (window.PT_HOLD) window.PT_HOLD.apply();
    } catch (e) { /* the table keeps its other columns */ }
  }

  /* Intrinsic value inputs for your own holdings: tickers in a POST body, never the URL; nothing stored. */
  async function holdPost(path, asText) {
    var all = holdingSymbols(), syms = all.slice(0, 12);
    window.PT_VAL_SKIPPED = all.slice(12);
    if (!syms.length) { if (asText) throw { code: "no_holdings" }; return []; }
    var r = await fetch(location.origin + "/api/free/" + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbols: syms }) });
    if (r.status === 429) throw { code: "rate_limited", message: "Too many valuation requests; wait a few minutes" };
    if (r.status === 204 || r.status === 404) { if (asText) throw { code: "no_data", message: "The price source returned nothing for your holdings" }; return []; }
    if (!r.ok) throw { code: "source_http_" + r.status, message: "Data source returned HTTP " + r.status };
    return asText ? r.text() : r.json();
  }

  /* Premium extras (Alpha Vantage news / estimates); null = not entitled or failed, so the free data is used */
  async function premiumCollection(n) {
    try {
      var syms = holdingSymbols().slice(0, 25);
      var r = n === "rev"
        ? await authFetch("/api/av/collection/rev", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbols: syms }) })
        : await authFetch("/api/av/collection/" + n);
      if (!r.ok) { window.PT_PREMIUM_STATE = r.status; return null; }
      window.PT_PREMIUM_STATE = 200;
      var j = await r.json(); return Array.isArray(j) && j.length ? j : null;
    } catch (e) { return null; }
  }

  var cfg = load();
  window.PT_SOURCE_LABEL = cfg.type === "premium" ? "Premium (Alpha Vantage + free sources)" : cfg.type === "free" ? "free public data" : cfg.type === "custom" ? "custom data source" : "";
  if (cfg.type !== "none" && baseOf(cfg)) {
    window.PT_DATA_SOURCE = {
      fetchCsv: function (k) { return (cfg.type === "free" || cfg.type === "premium") && (k === "HISTORY" || k === "FACTOR") ? freePost(k) : (cfg.type === "free" || cfg.type === "premium") && k === "VALIN" ? holdPost("csv/VALIN", true) : get(cfg, "/csv/" + encodeURIComponent(k), true); },
      getDoc: async function (p) { var v = await get(cfg, "/doc?path=" + encodeURIComponent(p), false); return v && typeof v === "object" && !Array.isArray(v) ? v : null; },
      getCollection: async function (n) {
        /* everything a source returns is untrusted: check shape, dates and URLs before the page renders it */
        var v = null;
        if (cfg.type === "premium" && (n === "news" || n === "rev")) v = await premiumCollection(n);
        if (v == null) v = (cfg.type === "free" || cfg.type === "premium") && (n === "fund" || n === "rev") ? await holdPost("collection/" + n, false) : await get(cfg, "/collection/" + encodeURIComponent(n), false);
        if (!Array.isArray(v)) return [];
        return v.filter(function (d) {
          if (!d || typeof d.id !== "string" || !d.data || typeof d.data !== "object") return false;
          if (n === "news" && !/^\d{4}-\d{2}-\d{2}$/.test(String(d.data.date))) return false;
          return true;
        }).map(function (d) {
          if (n === "news" && Array.isArray(d.data.items)) {
            d.data.items = d.data.items.filter(function (it) { return it && typeof it === "object"; }).map(function (it) {
              if (!/^https?:\/\//i.test(String(it.url || ""))) it.url = "";
              return it;
            });
          }
          return d;
        });
      }
    };
  }

  /* The picker lives on the Settings tab (pt-ui.js); it uses these. */
  window.PT_DS = {
    load: load, save: save,
    test: async function (c) { return get(c.type === "premium" ? { type: "free" } : c, "/health", false); }
  };
})();
