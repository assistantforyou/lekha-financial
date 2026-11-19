#!/usr/bin/env node
// Local preview without the Vercel CLI: serves public/ and runs api/**/*.js handlers with Vercel-style req/res.
// Usage: set -a; source ~/.config/portfolio-terminal/keys.env; set +a; node scripts/dev-server.mjs [port]
import http from "node:http";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const PORT = Number(process.argv[2]) || 3456;
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json", ".ico": "image/x-icon" };

// same rewrites as vercel.json: /api/<group>/<rest> -> api/<group>.js?__r=<rest>
const REWRITE = /^\/api\/(free|av|billing|cron|ai)\/(.+)$/;
function route(pathname) {
  const rw = REWRITE.exec(pathname);
  if (rw) return { file: join(ROOT, "api", rw[1] + ".js"), query: { __r: rw[2] } };
  const parts = pathname.replace(/^\/api\//, "").split("/").filter(Boolean);
  let dir = join(ROOT, "api"); const query = {};
  for (let i = 0; i < parts.length; i++) {
    const last = i === parts.length - 1, p = parts[i];
    if (last && existsSync(join(dir, p + ".js"))) return { file: join(dir, p + ".js"), query };
    if (existsSync(join(dir, p)) && statSync(join(dir, p)).isDirectory()) { dir = join(dir, p); continue; }
    const dyn = readdirSync(dir).find((f) => /^\[.+\](\.js)?$/.test(f));
    if (!dyn) return null;
    query[dyn.replace(/^\[|\](\.js)?$/g, "")] = decodeURIComponent(p);
    if (dyn.endsWith(".js")) { if (last) return { file: join(dir, dyn), query }; return null; }
    dir = join(dir, dyn);
  }
  return existsSync(join(dir, "index.js")) ? { file: join(dir, "index.js"), query } : null;
}

http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://localhost");
  if (u.pathname.startsWith("/api/")) {
    const r = route(u.pathname);
    if (!r) { res.writeHead(404); return res.end("no route"); }
    const mod = require(r.file);
    const raw = mod.config && mod.config.api && mod.config.api.bodyParser === false;
    req.query = { ...Object.fromEntries(u.searchParams), ...r.query };
    if (!raw && req.method !== "GET") {
      const chunks = []; for await (const c of req) chunks.push(c);
      const t = Buffer.concat(chunks).toString("utf8");
      try { req.body = t ? JSON.parse(t) : {}; } catch (e) { req.body = t; }
    }
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (j) => { if (!res.getHeader("Content-Type")) res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(j)); return res; };
    res.send = (b) => { res.end(b); return res; };
    try { await mod(req, res); } catch (e) { console.error(e); if (!res.headersSent) { res.statusCode = 500; res.end("error"); } }
    return;
  }
  let rel = u.pathname === "/" ? "index.html" : u.pathname;
  if (/^\/v\d+\/?$/.test(rel)) rel = rel.replace(/\/?$/, "/index.html"); // same as the /v2 rewrite in vercel.json
  const f = join(ROOT, "public", rel);
  if (!f.startsWith(join(ROOT, "public")) || !existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); return res.end("not found"); }
  res.writeHead(200, { "Content-Type": TYPES[extname(f)] || "application/octet-stream" });
  res.end(readFileSync(f));
}).listen(PORT, () => console.log("dev server on http://localhost:" + PORT));
