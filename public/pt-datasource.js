/* Portfolio Terminal: data-source selector + PT_DATA_SOURCE router.
   Config lives only in this browser (localStorage "ptpub.v1.source"). Types:
     none     no market data (panels show "no market-data source connected")
     free     this site's free tier: public sources (FRED, ...) through /api/free, no key needed
     av       premium tier: Alpha Vantage through /api/av (key held server-side)
     custom   any HTTP endpoint implementing the contract below, optional bearer token
   With nothing saved the free tier is the default; choosing "none" is stored explicitly.
   Endpoint contract (base = URL without trailing slash):
     GET base/health                -> {"ok":true,"name":"..."}
     GET base/csv/<KEY>             -> text/csv  (KEY: ROTATION BREADTH RISK OBOS FACTOR PEER VOLATILITY VALIN HISTORY); 204/404 = not available
     GET base/doc?path=meta/<name>  -> JSON object or null
     GET base/collection/<name>     -> JSON [{id, data}]  (news fund rev etf ins)
   Entitlement checks belong on that server; nothing here is security. */
(function () {
  var KEY = "ptpub.v1.source";
  function load() {
    try { var v = JSON.parse(localStorage.getItem(KEY) || "null"); if (v && v.type) { if (v.type === "builtin") v.type = "av"; return v; } } catch (e) {}
    return { type: "free" };
  }
  function save(c) { try { localStorage.setItem(KEY, JSON.stringify(c)); return true; } catch (e) { return false; } }
  function baseOf(c) {
    if (c.type === "free") return location.origin + "/api/free";
    if (c.type === "av") return location.origin + "/api/av";
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
  function holdingSymbols() {
    try {
      var v = JSON.parse(localStorage.getItem("ptpub.v1.db.holdings/all") || "null");
      return ((v && v.items) || []).filter(function (h) { return h && h.tk && h.tk !== "CASH" && h.cur === "USD"; }).map(function (h) { return h.tk; });
    } catch (e) { return []; }
  }
  function parseCsvLine(l) { return l.split(","); }
  function computeLive(text, syms) {
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
      live[m[1]] = { px: px, prev: at(1), hi52: hi, day: rel(at(1)), w1: rel(at(5)), m1: rel(at(21)), ytd: rel(prevYear), from52: rel(hi) };
      if (pts[n - 1][0] > newest) newest = pts[n - 1][0];
    }
    var sig = JSON.stringify(live), changed = sig !== window.PT_LIVE_SIG;
    window.PT_LIVE = live; window.PT_LIVE_SIG = sig; window.PT_LIVE_AT = Date.now(); window.PT_LIVE_ASOF = newest ? new Date(newest).toISOString().slice(0, 10) : null;
    if (changed) (function again(tries) { if (window.PT_HOLD) window.PT_HOLD.apply(); else if (tries < 20) setTimeout(function () { again(tries + 1); }, 250); })(0);
  }
  async function freeHistory() {
    var syms = holdingSymbols();
    var r = await fetch(location.origin + "/api/free/csv/HISTORY", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbols: syms }) });
    if (r.status === 204 || r.status === 404) return null;
    if (!r.ok) throw { code: "source_http_" + r.status, message: "Data source returned HTTP " + r.status };
    var t = await r.text(); computeLive(t, syms); return t;
  }

  var cfg = load();
  window.PT_SOURCE_LABEL = cfg.type === "av" ? "Alpha Vantage" : cfg.type === "free" ? "free public data" : cfg.type === "custom" ? "custom data source" : "";
  if (cfg.type !== "none" && baseOf(cfg)) {
    window.PT_DATA_SOURCE = {
      fetchCsv: function (k) { return cfg.type === "free" && k === "HISTORY" ? freeHistory() : get(cfg, "/csv/" + encodeURIComponent(k), true); },
      getDoc: async function (p) { var v = await get(cfg, "/doc?path=" + encodeURIComponent(p), false); return v && typeof v === "object" && !Array.isArray(v) ? v : null; },
      getCollection: async function (n) {
        /* everything a source returns is untrusted: check shape, dates and URLs before the page renders it */
        var v = await get(cfg, "/collection/" + encodeURIComponent(n), false);
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

  /* ---- UI ---- */
  var css = document.createElement("style");
  css.textContent =
    "#ds-dlg{max-width:460px;width:calc(100% - 32px);background:var(--panel);color:var(--fg);border:1px solid var(--line);border-radius:6px;padding:16px}" +
    "#ds-dlg::backdrop{background:rgba(0,0,0,.45)}#ds-dlg h3{margin:0 0 4px;font-family:var(--f-display);font-size:16px}" +
    "#ds-dlg label.ds-opt{display:flex;gap:8px;align-items:flex-start;padding:8px;border:1px solid var(--line);border-radius:4px;margin-top:8px;cursor:pointer}" +
    "#ds-dlg label.ds-opt small{display:block;color:var(--muted)}#ds-dlg .ds-f{display:grid;gap:6px;margin-top:10px}" +
    "#ds-dlg input[type=text],#ds-dlg input[type=password]{width:100%;font-family:var(--f-mono);font-size:12px;background:var(--panel-2);border:1px solid var(--line);border-radius:4px;padding:6px 8px;color:var(--fg)}" +
    "#ds-dlg .ds-row{display:flex;gap:8px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap}#ds-msg{font-size:12px;min-height:18px;margin-top:8px;color:var(--muted)}";
  document.head.appendChild(css);

  var btn = document.createElement("button");
  btn.className = "btn"; btn.id = "ds-open";
  var labels = { none: "Data source: none", free: "Data source: free", av: "Data source: Alpha Vantage", custom: "Data source: custom" };
  btn.textContent = labels[cfg.type] || labels.none;
  var status = document.querySelector("header.bar .status");
  if (status) status.insertBefore(btn, status.firstChild);

  var dlg = document.createElement("dialog");
  dlg.id = "ds-dlg";
  dlg.innerHTML =
    "<h3>Data source</h3><div class='muted' style='font-size:12px'>Where market panels get their data. Holdings never leave this browser.</div>" +
    "<label class='ds-opt'><input type='radio' name='ds-t' value='none'><span>None<small>Panels show what is missing. Manual prices only.</small></span></label>" +
    "<label class='ds-opt'><input type='radio' name='ds-t' value='free'><span>Free public data<small>FRED and other public sources through this site. No key, no account; coverage grows as sources are added.</small></span></label>" +
    "<label class='ds-opt'><input type='radio' name='ds-t' value='av'><span>Alpha Vantage (premium)<small>Licensed market data through this site's proxy. The key stays on the server.</small></span></label>" +
    "<label class='ds-opt'><input type='radio' name='ds-t' value='custom'><span>Custom endpoint<small>Your own server implementing the endpoint contract.</small></span></label>" +
    "<div class='ds-f' id='ds-custom' hidden><input type='text' id='ds-url' placeholder='https://your-server.example.com/pt' autocomplete='off' spellcheck='false'>" +
    "<input type='password' id='ds-token' placeholder='Bearer token (optional, stored in this browser)' autocomplete='off'></div>" +
    "<div id='ds-msg' role='status'></div>" +
    "<div class='ds-row'><button class='btn' id='ds-test' type='button'>Test</button><button class='btn' id='ds-cancel' type='button'>Cancel</button><button class='btn' id='ds-save' type='button' style='border-color:var(--accent);color:var(--accent)'>Save &amp; reload</button></div>";
  document.body.appendChild(dlg);

  function $(id) { return document.getElementById(id); }
  function cur() { var r = dlg.querySelector("input[name=ds-t]:checked"); return r ? r.value : "none"; }
  function draft() { var t = cur(); return t === "custom" ? { type: "custom", url: $("ds-url").value, token: $("ds-token").value } : { type: t }; }
  function sync() { $("ds-custom").hidden = cur() !== "custom"; $("ds-test").disabled = cur() === "none"; }
  function say(t, bad) { var m = $("ds-msg"); m.textContent = t; m.style.color = bad ? "var(--down)" : "var(--muted)"; }
  dlg.addEventListener("change", sync);
  btn.addEventListener("click", function () {
    var c = load();
    dlg.querySelector("input[value=" + c.type + "]").checked = true;
    $("ds-url").value = c.url || ""; $("ds-token").value = c.token || "";
    say(""); sync(); dlg.showModal();
  });
  $("ds-cancel").addEventListener("click", function () { dlg.close(); });
  $("ds-test").addEventListener("click", async function () {
    var c = draft();
    if (c.type === "custom") {
      var u = (c.url || "").trim();
      if (!/^https?:\/\//i.test(u)) return say("Enter a full http(s) URL.", true);
      if (/^http:\/\//i.test(u) && !/^http:\/\/(localhost|127\.0\.0\.1)/i.test(u)) return say("Use https:// (plain http is only allowed for localhost).", true);
    }
    say("Testing…");
    try {
      var j = await get(c, "/health", false);
      if (j && j.ok) say("Connected" + (j.name ? ": " + j.name : "") + ".");
      else say("Reached the server but /health did not return {ok:true}.", true);
    } catch (e) { say("Could not connect (" + ((e && e.message) || "network or CORS error") + ").", true); }
  });
  $("ds-save").addEventListener("click", function () {
    var c = draft();
    if (c.type === "custom") {
      c.url = (c.url || "").trim();
      if (!/^https?:\/\//i.test(c.url)) return say("Enter a full http(s) URL.", true);
      if (/^http:\/\//i.test(c.url) && !/^http:\/\/(localhost|127\.0\.0\.1)/i.test(c.url)) return say("Use https:// (plain http is only allowed for localhost).", true);
    }
    if (!save(c)) return say("Could not save (browser storage blocked).", true);
    location.reload();
  });
})();
