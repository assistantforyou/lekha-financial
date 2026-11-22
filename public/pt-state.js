/* Portfolio Terminal: server-side state sync.
   Every document the app keeps in localStorage ("ptpub.v1.db.<key>") is mirrored into the
   signed-in account's pt_user_state rows, so holdings, valuation settings, saved valuations,
   quant runs and snapshots follow the user across browsers and survive a cleared cache.
   localStorage stays the fast, synchronous read path; this file keeps it in step. */
(function () {
  var NS = window.PT_STORAGE_NS;
  var AUTH = window.PT_AUTH || null;
  var USER_KEY = /^(?:holdings|valhist|quant|snapshots|reports)\/[A-Za-z0-9._:-]{1,80}$|^val\/settings$|^settings\/[a-z0-9._-]{1,40}$/;

  function lsGet(k) { try { var v = localStorage.getItem(NS + k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(NS + k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function lsDel(k) { try { localStorage.removeItem(NS + k); } catch (e) {} }
  function stamps() { return lsGet("sync.map") || {}; }
  function setStamp(k, iso) { var m = stamps(); m[k] = iso; lsSet("sync.map", m); }
  function localKeys() {
    var out = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k || k.indexOf(NS + "db.") !== 0) continue;
        var path = k.slice((NS + "db.").length);
        if (USER_KEY.test(path)) out.push(path);
      }
    } catch (e) {}
    return out;
  }

  var queue = {};           // key -> true (dirty)
  var timer = null;
  var inflight = null;
  var lastError = null;

  /* DEMO mode: never hydrate or flush. Anonymous visitors run on the simulated dataset
     (nothing to sync), and a signed-in user forcing ?demo=1 must not have their real
     account state overwritten by demo documents or pushed back to the server. */
  function signedIn() { try { return !!(AUTH && AUTH.session() && !window.PT_DEMO_MODE); } catch (e) { return false; } }

  function touch(key) {
    if (!USER_KEY.test(String(key || ""))) return;
    if (!signedIn()) return;
    queue[key] = true;
    clearTimeout(timer);
    timer = setTimeout(flush, 700);
  }
  function forget(key) { touch(key); }

  async function flush() {
    if (!signedIn()) return { ok: false, reason: "signed_out" };
    var keys = Object.keys(queue);
    if (!keys.length) return { ok: true, skipped: true };
    queue = {};
    var docs = [], deleted = [];
    keys.forEach(function (k) {
      var v = lsGet("db." + k);
      if (v === null || v === undefined) deleted.push(k);
      else docs.push({ key: k, data: v });
    });
    if (inflight) { try { await inflight; } catch (e) {} }
    inflight = (async function () {
      try {
        var r = await AUTH.fetch("/api/state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ docs: docs, deleted: deleted }) });
        if (!r.ok) throw new Error("HTTP " + r.status);
        var now = new Date().toISOString();
        keys.forEach(function (k) { setStamp(k, now); });
        lastError = null;
        window.dispatchEvent(new CustomEvent("pt:state-synced", { detail: { keys: keys } }));
        return { ok: true, keys: keys };
      } catch (e) {
        lastError = String(e && e.message || e);
        keys.forEach(function (k) { queue[k] = true; });   // keep the dirty flags for the next attempt
        return { ok: false, error: lastError };
      } finally { inflight = null; }
    })();
    return inflight;
  }

  // Each page checks the account again. Stored server timestamps prevent a second reload.
  var ready = false;
  function markReady(value) { ready = value; }
  function isReady() { return ready; }

  /* Pull the account's documents into localStorage, push anything local the account has never
     seen, and reload once if the server held something newer than this browser. */
  async function hydrate() {
    if (!signedIn() || isReady()) return { ok: true, skipped: true };
    var before = JSON.stringify([localKeys().sort(), stamps()]);
    try {
      var r = await AUTH.fetch("/api/state");
      if (!r.ok) throw new Error("HTTP " + r.status);
      var j = await r.json();
      var server = j.docs || [];
      var seen = {}, m = stamps(), newer = false;
      server.forEach(function (d) {
        if (!USER_KEY.test(d.key)) return;
        seen[d.key] = true;
        var st = m[d.key] || "";
        if (!st || Date.parse(d.updated_at) > Date.parse(st)) {
          if (!lsSet("db." + d.key, d.data)) throw new Error("Browser storage is full.");
          setStamp(d.key, d.updated_at);
          newer = true;
        }
      });
      // local documents the account has never seen (first sign-in on an existing browser)
      var missing = localKeys().filter(function (k) { return !seen[k]; });
      if (missing.length) {
        var docs = missing.map(function (k) { return { key: k, data: lsGet("db." + k) }; });
        var pr = await AUTH.fetch("/api/state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ docs: docs }) });
        if (!pr.ok) throw new Error("HTTP " + pr.status);
        var now = new Date().toISOString(); missing.forEach(function (k) { setStamp(k, now); });
      }
      markReady(true);
      var changed = newer || JSON.stringify([localKeys().sort(), stamps()]) !== before;
      if (changed && !newer) window.dispatchEvent(new CustomEvent("pt:state-hydrated"));
      if (newer) { location.reload(); return { ok: true, reloading: true }; }
      return { ok: true, pulled: server.length, pushed: missing.length };
    } catch (e) {
      lastError = String(e && e.message || e);
      return { ok: false, error: lastError };
    }
  }

  function reset() {          // after sign-out: the next sign-in hydrates again
    queue = {}; clearTimeout(timer); markReady(false); lsSet("sync.map", {});
  }

  window.PT_SYNC = {
    hydrate: hydrate, flush: flush, touch: touch, forget: forget, reset: reset,
    keys: localKeys, stamps: stamps, accepts: function (key) { return USER_KEY.test(key); },
    get status() { return { signedIn: signedIn(), ready: isReady(), pending: Object.keys(queue).length, error: lastError }; },
  };

  // Flush anything still queued when the page is hidden or closed.
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") flush(); });
  window.addEventListener("pagehide", function () { flush(); });

  // Kick off the pull as soon as the DOM is parseable but before the app's first render pass uses it.
  hydrate();
})();
