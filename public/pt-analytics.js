/* PostHog for every LEKHA surface: the React shell (/), the classic terminals (/v2, /v3) and /login.html.
   Loaded after /pt-meta-pixel.js so the existing Meta helper can be mirrored into PostHog.

   - The public project key comes from GET /api/ph (environment, never committed). No key = no-op.
   - One browser init: autocapture, heatmaps, session replay (inputs and numeric cells masked), exception capture,
     web vitals, pageleave and manual pageviews for the single-page shells.
   - Privacy: props pass through clean(), which drops e-mail, prompts, questions, holdings, balances and tokens.
     Session replay masks every input and every element marked .num or [data-ph-mask]; [data-ph-block] is blocked.
   - Any surface can call window.PT_PH.capture(name, props), .identify(id, props), .reset(), .pageview().
     Events queued before the library finishes loading are flushed once it is ready. */
(function () {
  if (window.PT_PH && window.PT_PH.version === 1) return;

  var CFG_KEY = "ptpub.v1.ph.cfg";
  var CFG_TTL = 10 * 60 * 1000;
  var MAX_QUEUE = 60;
  var SENSITIVE = /^(email|e_mail|phone|name|full_name|password|passcode|token|access_token|refresh_token|secret|authorization|cookie|prompt|question|answer|message|content|body|text|query|q|holdings|positions|balance|balances|cost_basis|api_key)$/i;
  var META_MAP = {
    Purchase: "purchase",
    Subscribe: "subscription_started",
    InitiateCheckout: "checkout_started",
    CompleteRegistration: "signup_completed",
    Lead: "lead_submitted",
  };

  var state = { ph: null, cfg: null, ready: false, queue: [], uid: null, lastUrl: null, viewPending: false };

  function clean(value, depth) {
    if (value == null) return value;
    if (typeof value === "string") return value.length > 160 ? value.slice(0, 160) : value;
    if (typeof value === "number" || typeof value === "boolean") return value;
    if (depth > 2) return undefined; // deeper shapes are unknown: drop rather than risk a nested e-mail or balance
    if (Array.isArray(value)) return value.slice(0, 20).map(function (v) { return clean(v, depth + 1); });
    if (typeof value !== "object") return undefined;
    var out = {};
    for (var k in value) {
      if (!Object.prototype.hasOwnProperty.call(value, k) || SENSITIVE.test(k)) continue;
      var v = clean(value[k], depth + 1);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }

  function surface() {
    var p = location.pathname.replace(/\/+$/, "") || "/";
    if (p === "/" || p === "/index.html") return "app";
    if (p === "/v3") return "v3";
    if (p === "/v2") return "v2";
    if (p === "/login.html" || p === "/login") return "login";
    if (p === "/auth-callback.html") return "auth_callback";
    return "other";
  }

  function route() {
    var h = String(location.hash || "").replace(/^#\/?/, "");
    return h ? h.split("?")[0].slice(0, 80) : location.pathname.slice(0, 80);
  }

  function plan() {
    var el = document.getElementById("brand-tier");
    var s = el ? String(el.textContent || "").toLowerCase() : "";
    if (/premium/.test(s)) return "premium";
    if (/\bpaid\b|pro\b/.test(s)) return "paid";
    if (/demo/.test(s)) return "demo";
    return null;
  }

  function jwtSub(token) {
    try {
      var part = String(token || "").split(".")[1];
      if (!part) return null;
      var json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
      return json && json.sub ? String(json.sub) : null;
    } catch (e) {
      return null;
    }
  }

  function sessionUser() {
    try {
      var s = window.PT_AUTH && window.PT_AUTH.session && window.PT_AUTH.session();
      if (!s) return null;
      var id = s.user_id || jwtSub(s.access_token);
      return id ? { id: String(id) } : null;
    } catch (e) {
      return null;
    }
  }

  function flush() {
    var q = state.queue.splice(0, state.queue.length);
    for (var i = 0; i < q.length; i++) {
      try {
        if (q[i].kind === "identify") state.ph.identify(q[i].id, q[i].props);
        else state.ph.capture(q[i].name, q[i].props);
      } catch (e) {}
    }
  }

  function capture(name, props) {
    if (!name) return;
    var p = clean(props || {}, 0);
    if (!state.ready || !state.ph) {
      if (state.queue.length < MAX_QUEUE) state.queue.push({ kind: "capture", name: String(name).slice(0, 80), props: p });
      return;
    }
    try { state.ph.capture(String(name).slice(0, 80), p); } catch (e) {}
  }

  function identify(id, props) {
    if (!id) return;
    var p = clean(props || {}, 0);
    if (!state.ready || !state.ph) {
      if (state.queue.length < MAX_QUEUE) state.queue.push({ kind: "identify", id: String(id), props: p });
      return;
    }
    try { state.ph.identify(String(id), p); } catch (e) {}
  }

  function reset() {
    state.uid = null;
    state.queue = state.queue.filter(function (e) { return e.kind !== "identify"; });
    if (!state.ready || !state.ph) return;
    try { state.ph.reset(); } catch (e) {}
  }

  function pageview() {
    if (!state.ready || !state.ph) { state.viewPending = true; return; }
    if (location.href === state.lastUrl) return;
    state.lastUrl = location.href;
    state.viewPending = false;
    try {
      state.ph.capture("$pageview", { $current_url: location.href, surface: surface(), route: route() });
    } catch (e) {}
  }

  function sync() {
    if (!state.ready || !state.ph) return;
    var u = sessionUser();
    if (u) {
      if (state.uid !== u.id) {
        state.uid = u.id;
        try { state.ph.identify(u.id, { surface: "lekha" }); } catch (e) {}
      }
    } else if (state.uid) {
      state.uid = null;
      try { state.ph.reset(); } catch (e) {}
    }
    try {
      var p = plan();
      if (p) state.ph.register({ plan: p });
    } catch (e) {}
  }

  function scrub(events) {
    for (var i = 0; i < events.length; i++) {
      var props = events[i] && events[i].properties;
      if (!props) continue;
      for (var k in props) {
        if (SENSITIVE.test(k)) delete props[k];
        else if (typeof props[k] === "string" && props[k].length > 300) props[k] = props[k].slice(0, 300);
      }
    }
    return events;
  }

  function start(cfg) {
    if (!cfg || !cfg.enabled || !cfg.key || state.ph) return;
    state.cfg = cfg;
    var s = document.createElement("script");
    s.async = true;
    s.src = "/vendor/posthog.js";
    s.onload = function () {
      if (!window.posthog || typeof window.posthog.init !== "function") return;
      try {
        window.posthog.init(cfg.key, {
          api_host: cfg.host,
          ui_host: cfg.uiHost,
          autocapture: { mask_all_text: true },
          capture_pageview: false,
          capture_pageleave: true,
          person_profiles: "identified_only",
          cross_subdomain_cookie: false,
          secure_cookie: true,
          enable_heatmaps: true,
          capture_exceptions: true,
          capture_performance: { web_vitals: true },
          session_recording: {
            // Replays show the interface and its values, so the owner can see exactly what happened. Typed input
            // stays masked; wrap anything that must stay private in [data-ph-mask] or block it with [data-ph-block].
            maskAllInputs: true,
            maskTextSelector: "[data-ph-mask]",
            blockSelector: "[data-ph-block]",
          },
          before_send: scrub,
          loaded: function (ph) {
            state.ph = ph || window.posthog;
            state.ready = true;
            if (cfg.environment) {
              try { state.ph.register({ environment: cfg.environment }); } catch (e) {}
            }
            sync();
            flush();
            pageview();
          },
        });
      } catch (e) {}
    };
    document.head.appendChild(s);
  }

  function boot() {
    var cached = null;
    try {
      var raw = sessionStorage.getItem(CFG_KEY);
      if (raw) {
        var c = JSON.parse(raw);
        if (c && c.t && Date.now() - c.t < CFG_TTL) cached = c.v;
      }
    } catch (e) {}
    if (cached) return start(cached);
    fetch("/api/ph", { credentials: "omit" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (cfg) {
        if (!cfg) return;
        try { sessionStorage.setItem(CFG_KEY, JSON.stringify({ t: Date.now(), v: cfg })); } catch (e) {}
        start(cfg);
      })
      .catch(function () {});
  }

  function bridgeMeta() {
    var t = window.ptTrack;
    if (typeof t === "function" && !t.__ph) {
      var wrapped = function (name, params) {
        t.apply(window, arguments);
        var mapped = META_MAP[name];
        if (mapped) capture(mapped, { via: "meta", plan: params && params.content_ids && params.content_ids[0] });
      };
      wrapped.__ph = 1;
      window.ptTrack = wrapped;
    }
    var c = window.ptTrackCustom;
    if (typeof c === "function" && !c.__ph) {
      var custom = function (name, params) {
        c.apply(window, arguments);
        capture("meta_custom", { via: "meta", name: String(name || "").slice(0, 60) });
      };
      custom.__ph = 1;
      window.ptTrackCustom = custom;
    }
  }

  window.PT_PH = {
    version: 1,
    capture: capture,
    identify: identify,
    reset: reset,
    pageview: pageview,
    surface: surface,
    route: route,
    get ready() { return state.ready; },
    get enabled() { return !!state.cfg && !!state.cfg.enabled; },
  };

  bridgeMeta();

  // SPA navigation: React sets location.hash, the classic shells use hash routes too.
  function hookHistory() {
    var push = history.pushState, replace = history.replaceState;
    if (push && !push.__ph) {
      var p = function () { var r = push.apply(history, arguments); setTimeout(pageview, 0); return r; };
      p.__ph = 1;
      history.pushState = p;
    }
    if (replace && !replace.__ph) {
      var r = function () { var out = replace.apply(history, arguments); setTimeout(pageview, 0); return out; };
      r.__ph = 1;
      history.replaceState = r;
    }
    window.addEventListener("hashchange", pageview);
    window.addEventListener("popstate", pageview);
  }
  hookHistory();

  // Semantic clicks on the classic headers (autocapture also runs, these add stable names).
  document.addEventListener(
    "click",
    function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var tagged = t.closest("[data-ph-event]");
      if (tagged) {
        capture(tagged.getAttribute("data-ph-event"), {
          surface: surface(),
          route: route(),
          label: tagged.getAttribute("data-ph-label") || "",
        });
        return;
      }
      var tab = t.closest("#v3nav [role=tab], #v2nav [role=tab], .seg.tabs [data-t]");
      if (tab) return capture("terminal_tab_selected", { surface: surface(), tab: tab.getAttribute("data-t") || "" });
      if (t.closest("#refresh")) return capture("prices_refreshed", { surface: surface() });
      if (t.closest("#cur-thb")) return capture("currency_changed", { surface: surface(), currency: "THB" });
      if (t.closest("#cur-usd")) return capture("currency_changed", { surface: surface(), currency: "USD" });
      if (t.closest("#acct")) return capture("account_clicked", { surface: surface() });
      if (t.closest("#lay-toggle")) return capture("layout_customize_toggled", { surface: surface() });
    },
    true
  );

  // Account state: identify on sign-in, reset on sign-out, refresh the plan property.
  window.addEventListener("storage", sync);
  window.addEventListener("pt:state-hydrated", sync);
  window.addEventListener("lekha:me-refresh", sync);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) sync(); });

  boot();
})();
