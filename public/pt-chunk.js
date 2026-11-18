/* Batching helpers for plans with unlimited valuation coverage. The server caps every request at 25
   symbols (SEC pacing + function time limit), so the client sends batches and merges the replies.
   Pure functions: loaded in the browser as window.PT_CHUNK and required by api/_chunk.test.js. */
(function (root) {
  "use strict";

  function chunk(list, size) {
    var out = [], n = Math.max(1, size | 0);
    for (var i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
    return out;
  }

  /* collection replies: arrays of {id, data}; a later duplicate id (same ticker twice) is dropped */
  function mergeDocs(parts) {
    var seen = {}, out = [];
    parts.forEach(function (p) {
      if (!Array.isArray(p)) return;
      p.forEach(function (d) {
        if (!d || typeof d.id !== "string" || seen[d.id]) return;
        seen[d.id] = 1; out.push(d);
      });
    });
    return out;
  }

  /* VALIN CSV replies: one header, every data row, the first UPDATED stamp last. null/empty parts are skipped. */
  function mergeValin(parts) {
    var head = null, rows = [], upd = null, seen = {};
    parts.forEach(function (t) {
      if (typeof t !== "string" || !t.trim()) return;
      t.split("\n").forEach(function (ln, i) {
        ln = ln.replace(/\r$/, "");
        if (!ln) return;
        if (i === 0) { if (!head) head = ln; return; }
        if (/^UPDATED,/.test(ln)) { if (!upd) upd = ln; return; }
        var tk = ln.split(",")[0];
        if (seen[tk]) return;
        seen[tk] = 1; rows.push(ln);
      });
    });
    if (!head || !rows.length) return null;
    return [head].concat(rows, upd ? [upd] : []).join("\n") + "\n";
  }

  /* run async jobs with at most `limit` in flight; results keep input order; a failed job yields null */
  async function pool(jobs, limit, onDone) {
    var res = new Array(jobs.length), next = 0, done = 0;
    async function worker() {
      while (next < jobs.length) {
        var i = next++;
        try { res[i] = await jobs[i](); } catch (e) { res[i] = { error: e }; }
        done++; if (onDone) onDone(done, jobs.length);
      }
    }
    var ws = [];
    for (var w = 0; w < Math.min(limit, jobs.length); w++) ws.push(worker());
    await Promise.all(ws);
    return res;
  }

  var api = { chunk: chunk, mergeDocs: mergeDocs, mergeValin: mergeValin, pool: pool, BATCH: 25 };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PT_CHUNK = api;
})(typeof window !== "undefined" ? window : this);
