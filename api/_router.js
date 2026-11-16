// One serverless function per route group (Vercel Hobby allows 12 per deployment). vercel.json rewrites
// /api/<group>/<rest> to /api/<group>?__r=<rest>; this maps <rest> onto the handler module and its dynamic params.
// routes: {"doc": loader, "collection/[name]": loader, ...}; rest: "collection/news" -> loader + {name: "news"}
function resolve(routes, rest) {
  const parts = String(rest || "").split("/").filter(Boolean);
  if (!parts.length || parts.some((p) => !/^[A-Za-z0-9_.\-]+$/.test(p) || p.startsWith("."))) return null;
  const exact = parts.join("/");
  if (routes[exact]) return { load: routes[exact], params: {} };
  const prefix = parts.slice(0, -1).join("/");
  for (const k of Object.keys(routes)) {
    const m = /^(.*?)\/?\[(\w+)\]$/.exec(k);
    if (m && m[1] === prefix) return { load: routes[k], params: { [m[2]]: parts[parts.length - 1] } };
  }
  return null;
}

function group(name, routes, opts = {}) {
  const handler = async (req, res) => {
    const q = req.query || {};
    const r = resolve(routes, q.__r);
    if (!r) return res.status(404).json({ error: "Not found." });
    delete q.__r;
    req.query = { ...q, ...r.params };
    const mod = r.load();
    // the group function reads the raw body (needed by the Stripe webhook); parse JSON for everything else
    if (opts.rawBody && !(mod.config && mod.config.api && mod.config.api.bodyParser === false) && req.method !== "GET" && req.method !== "HEAD") {
      const chunks = []; for await (const c of req) chunks.push(c);
      const t = Buffer.concat(chunks).toString("utf8");
      try { req.body = t ? JSON.parse(t) : {}; } catch (e) { req.body = {}; }
    }
    return mod(req, res);
  };
  if (opts.rawBody) handler.config = { api: { bodyParser: false } };
  return handler;
}

module.exports = { group, resolve };
