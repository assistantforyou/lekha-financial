/* Portfolio Terminal: data-source selector + PT_DATA_SOURCE router.
   Config lives only in this browser (localStorage "ptpub.v1.source"). Types:
     none     no market data (panels show "no market-data source connected")
     builtin  this site's own /api proxy (Alpha Vantage, key held server-side)
     custom   any HTTP endpoint implementing the contract below, optional bearer token
   Endpoint contract (base = URL without trailing slash):
     GET base/health                -> {"ok":true,"name":"..."}
     GET base/csv/<KEY>             -> text/csv  (KEY: ROTATION BREADTH RISK OBOS FACTOR PEER VOLATILITY VALIN HISTORY); 204/404 = not available
     GET base/doc?path=meta/<name>  -> JSON object or null
     GET base/collection/<name>     -> JSON [{id, data}]  (news fund rev etf ins)
   Entitlement checks belong on that server; nothing here is security. */
(function () {
  var KEY = "ptpub.v1.source";
  function load() { try { var v = JSON.parse(localStorage.getItem(KEY) || "null"); if (v && v.type) return v; } catch (e) {} return { type: "none" }; }
  function save(c) { try { if (!c || c.type === "none") localStorage.removeItem(KEY); else localStorage.setItem(KEY, JSON.stringify(c)); return true; } catch (e) { return false; } }
  function baseOf(c) {
    if (c.type === "builtin") return location.origin + "/api";
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
  var cfg = load();
  window.PT_SOURCE_LABEL = cfg.type === "builtin" ? "Alpha Vantage" : cfg.type === "custom" ? "custom data source" : "";
  if (cfg.type !== "none" && baseOf(cfg)) {
    window.PT_DATA_SOURCE = {
      fetchCsv: function (k) { return get(cfg, "/csv/" + encodeURIComponent(k), true); },
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
  var labels = { none: "Data source: none", builtin: "Data source: Alpha Vantage", custom: "Data source: custom" };
  btn.textContent = labels[cfg.type] || labels.none;
  var status = document.querySelector("header.bar .status");
  if (status) status.insertBefore(btn, status.firstChild);

  var dlg = document.createElement("dialog");
  dlg.id = "ds-dlg";
  dlg.innerHTML =
    "<h3>Data source</h3><div class='muted' style='font-size:12px'>Where market panels get their data. Holdings never leave this browser.</div>" +
    "<label class='ds-opt'><input type='radio' name='ds-t' value='none'><span>None<small>Panels show what is missing. Manual prices only.</small></span></label>" +
    "<label class='ds-opt'><input type='radio' name='ds-t' value='builtin'><span>Alpha Vantage (built-in)<small>This site's proxy. The API key stays on the server; free tier is rate-limited and cached.</small></span></label>" +
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
