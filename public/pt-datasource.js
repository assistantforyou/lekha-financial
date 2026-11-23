/* Portfolio Terminal: tier-driven data source.
   No picker, no "custom/none" sources — the data source follows the account:
     anonymous            DEMO simulation (public/pt-demo.js, deterministic, no /api calls)
     signed-in FREE       real data via /api/free (limited history & valuation symbols, server-enforced)
     signed-in PAID       /api/free at full depth + Alpha Vantage news/estimates via /api/av
     signed-in PREMIUM    everything in PAID (the AI panel is served by /api/ai)
   ?demo=1 forces the DEMO simulation even when signed in. The demo is a non-billable preview with
   Free-level screens: it reports tier "demo" and never a paid tier.
   The server decides entitlements on every request; nothing here is security. Datasets that feed only
   Paid/Premium screens are requested with the account token and skipped when /api/auth/me says the
   plan does not include them (the server would answer 402 anyway).
   Endpoint contract (base = /api/free, Bearer-authenticated):
     GET base/health                -> {"ok":true,"name":"..."}
     GET base/csv/<KEY>             -> text/csv  (KEY: ROTATION BREADTH RISK OBOS FACTOR PEER VOLATILITY VALIN HISTORY); 204/404 = not available
     GET base/doc?path=meta/<name>  -> JSON object or null
     GET base/collection/<name>     -> JSON [{id, data}]  (news fund rev etf ins) */
(function () {
  /* ---- account session (email + password via /api/auth; tokens kept in this browser) ---- */
  var SKEY = "ptpub.v1.session";
  function sess() { try { return JSON.parse(localStorage.getItem(SKEY) || "null"); } catch (e) { return null; } }
  function setSess(v) { try { if (v) localStorage.setItem(SKEY, JSON.stringify(v)); else localStorage.removeItem(SKEY); if (pageOwner && owner(v) !== pageOwner) location.reload(); } catch (e) {} }
  function owner(s) {
    if (!s) return null;
    if (s.user_id) return s.user_id;
    // Older sessions and email callbacks only carry the subject in the JWT.
    try { return JSON.parse(atob(s.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).sub || null; }
    catch (e) { return null; }
  }
  var pageOwner = owner(sess());
  window.addEventListener("storage", function (event) {
    if ((event.key === SKEY || event.key === null) && owner(sess()) !== pageOwner) location.reload();
  });
  var refreshing = null;
  async function token() {
    var s = sess(); if (!s || !s.access_token) return null;
    if (s.expires_at && s.expires_at * 1000 - Date.now() > 60000) return s.access_token;
    if (!refreshing) refreshing = fetch("/api/auth/refresh", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: s.refresh_token }) })
      .then(async function (r) {
        var j = r.ok ? await r.json() : null;
        if (sess()?.refresh_token !== s.refresh_token) return null;
        if (j && j.session && owner(j.session) === pageOwner) { setSess(j.session); return j.session.access_token; }
        if (r.status === 401) setSess(null);
        return null;
      })
      .catch(function () { return s.access_token; }).finally(function () { refreshing = null; });
    return refreshing;
  }
  async function authFetch(url, opts) {
    if (owner(sess()) !== pageOwner) return new Response(null, { status: 401 });
    opts = opts || {}; var t = await token();
    if (owner(sess()) !== pageOwner) return new Response(null, { status: 401 });
    var h = Object.assign({}, opts.headers || {});
    if (window.PT_DEMO_MODE && (url === "/api/data/agent" || url === "/api/rag")) {
      var keyName = "lekha.demo.knowledgeKey";
      var key = sessionStorage.getItem(keyName);
      if (!key) {
        key = Array.from(crypto.getRandomValues(new Uint8Array(32)), function (b) { return b.toString(16).padStart(2, "0"); }).join("");
        sessionStorage.setItem(keyName, key);
      }
      h["X-Lekha-Demo-Key"] = key;
    } else if (t) h.Authorization = "Bearer " + t;
    return fetch(url, Object.assign({}, opts, { headers: h }));
  }
  window.PT_AUTH = { session: sess, setSession: setSess, token: token, fetch: authFetch };

  /* ---- mode: anonymous -> DEMO simulation; signed-in -> real data (?demo=1 forces DEMO) ---- */
  var q = location.search || "";
  var demoForced = /[?&]demo=1(?:&|$)/.test(q) || /^#demo/.test(location.hash || "");
  window.PT_DEMO_MODE = demoForced || !pageOwner;
  window.PT_STORAGE_NS = window.PT_DEMO_MODE ? "ptpub.v1.demo." : "ptpub.v1.account." + encodeURIComponent(pageOwner) + ".";

  /* ---- demo clock: in demo mode "now" is frozen at 18 Aug 2026 (after the US close). Every date the page
     shows in demo mode is followed by "(Outdated date used for DEMO only)"; other tiers see real time. ---- */
  var DEMO_ISO = "2026-08-18", DEMO_SFX = "";
  window.PT_DEMO_DATE = DEMO_ISO; window.PT_DEMO_SFX = DEMO_SFX;
  window.ptNow = function () { return Date.now(); };   /* the sample portfolio runs on live market data, so it uses the real clock */
  /* Asia/Bangkok calendar day (UTC+7), the day the quant log and valuation history are keyed by */
  window.ptBkkDay = function () { return new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10); };
  window.ptSfx = function (s) { return String(s); };
  try { localStorage.removeItem("ptpub.v1.source"); } catch (e) {} /* picker config is gone */

  /* quote symbol for a holding: US tickers as-is; HKD -> 0700.HK, THB -> PTT.BK (suffix added when missing) */
  function quoteSym(h) {
    var t = String(h.tk || "").toUpperCase();
    if (h.cur === "HKD" && !/\.HK$/.test(t)) return /^\d+$/.test(t) ? ("0000" + t).slice(-4) + ".HK" : t + ".HK";
    if (h.cur === "THB" && !/\.BK$/.test(t)) return t + ".BK";
    return t;
  }
  function ns() { return window.PT_STORAGE_NS; }
  function holdingMap() {
    try {
      var v = JSON.parse(localStorage.getItem(ns() + "db.holdings/all") || "null"), m = {};
      ((v && v.items) || []).forEach(function (h) { if (h && h.tk && h.tk !== "CASH") m[quoteSym(h)] = h.tk; });
      return m;
    } catch (e) { return {}; }
  }
  function holdingSymbols() { return Object.keys(holdingMap()); }
  window.PT_QUOTE_SYM = quoteSym;
  function parseCsvLine(l) { return l.split(","); }

  /* Live quotes for the holdings table, derived from the HISTORY series (identical math in pt-demo.js for DEMO). */
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


  window.PT_TIER_READY = function () { return Promise.resolve({ tier: "demo" }); };
  if (window.PT_DEMO_MODE) {
    /* ---- DEMO: deterministic local simulation; no network, no private data, writes only to ptpub.v1.demo.* ----
       A preview, not a plan, with nothing locked (owner decision, 23 Nov 2026): every panel, the analyst, the council
       and the simulation engine run on the simulated sample portfolio. It reports tier "demo" and never a paid tier,
       so no server endpoint is opened by it; real accounts stay enforced server-side. This holds for ?demo=1 on a
       signed-in account too: the demo never borrows the account's plan or data. */
    window.PT_TIER = "demo";
    window.PT_LIMITS = { holdings: null, aiPerDay: null, simulationsPerDay: null, historyYears: null };
    window.PT_SOURCE_LABEL = "Simulated sample portfolio";
    if (window.PT_DEMO && window.PT_DEMO.source) {
      try { window.PT_DEMO._seedDemo(); } catch (e) {}
      window.PT_DATA_SOURCE = window.PT_DEMO.source();
    }
    return;
  }

  /* ---- signed-in: real data through this site's API ---- */
  var BASE = location.origin + "/api/free";
  var me = null, meP = null;
  function meAsync() {
    if (me) return Promise.resolve(me);
    if (!meP) meP = authFetch("/api/auth/me").then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      me = (j && (j.user || j)) || null;
      if (me && me.tier) {
        window.PT_TIER = me.tier;
        window.PT_LIMITS = me.limits || null;
        window.PT_SOURCE_LABEL = me.tier === "premium" ? "Premium — full real data + AI analyst"
          : me.tier === "paid" ? "Paid — full real data"
          : "Free — real data, limited history";
      }
      return me;
    }).catch(function () { return null; });
    return meP;
  }
  window.PT_TIER_READY = meAsync; /* resolves to the /api/auth/me record (or null) */
  meAsync(); /* start tier discovery immediately */

  /* Shared market datasets are identical for every account and contain nothing personal,
     so they are fetched WITHOUT the auth header — Vercel's CDN never caches authorized
     requests, and the edge cache is what keeps a page load fast on the Hobby plan.
     Anything per-user (HISTORY, FACTOR, VALIN, fund, rev, extras, me, state) keeps Bearer. */
  var SHARED_RE = /^(?:doc\?|collection\/(?:etf|ins))(?:$|[/?&])/;
  /* datasets that feed only Paid/Premium screens (mirrors api/_h/free/*; any listed feature unlocks) */
  var GATED = {
    "csv/ROTATION": ["marketRotation", "sectorRotation"], "csv/RISK": ["riskAppetite"], "csv/VOLATILITY": ["riskAppetite"],
    "csv/BREADTH": ["sectorRotation"], "csv/OBOS": ["sectorRotation"], "csv/FACTOR": ["sectorRotation"], "csv/PEER": ["valuation"],
    "csv/VALIN": ["valuation", "deepAnalysis"], "collection/fund": ["valuation", "deepAnalysis"], "collection/rev": ["sectorRotation", "deepAnalysis"],
    "collection/news": ["marketIntel", "deepAnalysis"], "doc?path=meta%2Fvixeq_hist": ["riskAppetite"]
  };
  function gateOf(path) { return GATED[String(path).replace(/^\//, "").split(/[?&]lang=/)[0]] || null; }
  /* false only when the account record positively says the plan lacks every listed feature */
  async function entitled(path) {
    var g = gateOf(path); if (!g) return true;
    var m = await meAsync();
    if (!m || !m.features) return true;   /* unknown: let the server decide */
    return g.some(function (f) { return m.features[f] === true; });
  }
  var PLAN_REQUIRED = { code: "plan_required", message: "Included in the Paid and Premium plans" };
  window.PT_ENTITLED = function (feature) { return !!(me && me.features && me.features[feature] === true); };
  async function get(path, asText) {   /* async keyword used to sit stranded before the comment above, so await below was read as a call to a function named "await" and every signed-in data request threw */
    if (!(await entitled(path))) { if (/^\/?csv\//.test(path)) throw PLAN_REQUIRED; return null; }   /* not in this plan: same as the server's 402, without the request */
    var url = BASE + path;
    var opts = { headers: { Accept: "application/json, text/csv, */*" } };
    var r, shared = SHARED_RE.test(path);
    for (var attempt = 0; attempt < 2; attempt++) {   /* one quiet retry: a cold serverless start or a provider hiccup should not read as "no data" */
      try { r = await (shared ? fetch(url, opts) : authFetch(url, opts)); } catch (e) { if (attempt) throw { code: "source_http_0", message: "Network error" }; await new Promise(function (ok) { setTimeout(ok, 1200); }); continue; }
      if (r.status >= 500 && !attempt) { await new Promise(function (ok) { setTimeout(ok, 1200); }); continue; }
      break;
    }
    if (r.status === 204 || r.status === 404) return null;
    if (r.status === 401) throw { code: "needs_reauth", message: "Session expired — sign in again." };
    if (!r.ok) throw { code: "source_http_" + r.status, message: "Data source returned HTTP " + r.status };
    return asText ? r.text() : r.json();
  }

  /* HISTORY and FACTOR take your tickers in a POST body (never the URL). The server enforces the
     plan's history depth; symbols are capped server-side too (MAX 25). */
  async function freePost(key) {
    if (!(await entitled("csv/" + key))) throw PLAN_REQUIRED;
    var syms = holdingSymbols();
    var r = await authFetch(BASE + "/csv/" + key, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbols: syms }) });
    if (r.status === 204 || r.status === 404) return null;
    if (r.status === 401) throw { code: "needs_reauth", message: "Session expired — sign in again." };
    if (!r.ok) throw { code: "source_http_" + r.status, message: "Data source returned HTTP " + r.status };
    var t = await r.text();
    if (key === "HISTORY") { computeLive(t, syms, holdingMap()); loadExtras(syms); }
    return t;
  }

  /* all-time highs + FX rates for the holdings table; tickers in a POST body */
  async function loadExtras(syms) {
    try {
      var r = await authFetch(BASE + "/extras", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbols: syms }) });
      if (!r.ok) return;
      var j = await r.json(), map = holdingMap(), ath = {};
      Object.keys(j.ath || {}).forEach(function (s) { ath[map[s] || s] = j.ath[s]; });
      window.PT_ATH = ath; window.PT_FX = j.fx || null;
      if (window.PT_HOLD) window.PT_HOLD.apply();
    } catch (e) { /* the table keeps its other columns */ }
  }

  /* Valuation inputs for your own holdings. Free/Demo stop at the plan's symbol count (the server caps too);
     Paid and Premium have no symbol limit (valSymbols === null), so every holding is sent in batches of 25
     (the server's per-request ceiling) and the replies are merged. */
  async function holdPost(path, asText) {
    if (!(await entitled(path))) { if (asText) throw PLAN_REQUIRED; return []; }
    var m = await meAsync(), lim = m && m.limits ? m.limits.valSymbols : undefined;
    var cap = lim === null ? Infinity : (lim || 12);
    var all = holdingSymbols(), syms = cap === Infinity ? all : all.slice(0, cap);
    window.PT_VAL_SKIPPED = all.slice(syms.length);
    window.PT_VAL_FAILED = [];
    if (!syms.length) { if (asText) throw { code: "no_holdings" }; return []; }
    var C = window.PT_CHUNK, batches = C.chunk(syms, C.BATCH);

    async function one(b) {
      var r = await authFetch(BASE + "/" + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbols: b }) });
      if (r.status === 429) throw { code: "rate_limited", message: "Too many valuation requests; wait a few minutes" };
      if (r.status === 204 || r.status === 404) return null;
      if (r.status === 401) throw { code: "needs_reauth", message: "Session expired — sign in again." };
      if (!r.ok) throw { code: "source_http_" + r.status, message: "Data source returned HTTP " + r.status };
      return asText ? r.text() : r.json();
    }

    var parts;
    if (batches.length === 1) parts = [await one(batches[0])];
    else {
      var total = syms.length;
      window.PT_VAL_PROGRESS = "valuing 0/" + total + "…";
      var done = 0;
      var out = await C.pool(batches.map(function (b) { return async function () { var v = await one(b); done += b.length; window.PT_VAL_PROGRESS = "valuing " + done + "/" + total + "…"; return v; }; }), 2);
      window.PT_VAL_PROGRESS = null;
      parts = [];
      out.forEach(function (o, i) {
        if (o && o.error) window.PT_VAL_FAILED = window.PT_VAL_FAILED.concat(batches[i]); else parts.push(o);
      });
      /* every batch failed: surface the first error like a single request would */
      if (!parts.length) { var e0 = out.find(function (o) { return o && o.error; }); throw e0.error; }
    }
    if (asText) { var csv = C.mergeValin(parts); if (!csv) throw { code: "no_data", message: "The price source returned nothing for your holdings" }; return csv; }
    return C.mergeDocs(parts);
  }

  /* Alpha Vantage extras (news / estimates): PAID & PREMIUM only; null = not entitled or failed, free data is used */
  async function premiumCollection(n) {
    try {
      var m = await meAsync();
      if (!m || (m.tier !== "paid" && m.tier !== "premium" && !m.is_admin)) return null;
      var syms = holdingSymbols().slice(0, 25);
      var r = n === "rev"
        ? await authFetch("/api/av/collection/rev", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbols: syms }) })
        : await authFetch("/api/av/collection/" + n);
      if (!r.ok) { window.PT_PREMIUM_STATE = r.status; return null; }
      window.PT_PREMIUM_STATE = 200;
      var j = await r.json(); return Array.isArray(j) && j.length ? j : null;
    } catch (e) { return null; }
  }

  window.PT_DATA_SOURCE = {
    fetchCsv: function (k) {
      if (k === "HISTORY" || k === "FACTOR") return freePost(k);
      if (k === "VALIN") return holdPost("csv/VALIN", true);
      return get("/csv/" + encodeURIComponent(k), true);
    },
    getDoc: async function (p) { var v = await get("/doc?path=" + encodeURIComponent(p), false); return v && typeof v === "object" && !Array.isArray(v) ? v : null; },
    getCollection: async function (n) {
      /* everything a source returns is untrusted: check shape, dates and URLs before the page renders it */
      var v = null;
      if (!(await entitled("collection/" + n))) return [];
      if (n === "news" || n === "rev") v = await premiumCollection(n);
      if (v == null && (n === "fund" || n === "rev")) v = await holdPost("collection/" + n, false);
      if (v == null) v = await get("/collection/" + encodeURIComponent(n), false);
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
})();
