// Web research provider: search the open web and read a page.
//
// Search backends, in order of preference:
//   1. Tavily      (TAVILY_API_KEY)          - purpose-built for agents, returns clean snippets
//   2. Brave API   (BRAVE_SEARCH_API_KEY)    - independent index
//   3. Serper      (SERPER_API_KEY)          - Google results via a proxy
//   4. Keyless     - Brave's public results page, Google News RSS and Wikipedia, merged.
//      Brave's HTML gives title, publisher, date and snippet but hides the destination URL behind a
//      script redirect, so those rows carry the publisher domain instead of a clickable link. News and
//      Wikipedia rows always carry real URLs.
//
// Reading a page: Tavily Extract (TAVILY_API_KEY), then r.jina.ai (keyless, returns clean Markdown),
// then a direct fetch-and-strip fallback.
// Everything here is public web data; no credentials are stored or returned.
const { request } = require("../http");

const CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const HEAD = { "user-agent": CHROME, accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8", "accept-language": "en-US,en;q=0.9" };

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "...", mdash: "-", ndash: "-", rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"', middot: "-" };
function un(s) {
  return String(s || "").replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, g) => {
    if (g[0] === "#") { const hex = g[1] === "x" || g[1] === "X", n = parseInt(hex ? g.slice(2) : g.slice(1), hex ? 16 : 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m; }
    return Object.hasOwn(ENT, g.toLowerCase()) ? ENT[g.toLowerCase()] : m;
  });
}
const text = (s) => un(String(s || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return ""; } };
const iso = (d) => { const s = String(d || "").trim(); if (!s) return null; const t = Date.parse(/T\d|\d{1,2}:\d{2}|\bGMT\b|\bUTC\b|Z$/i.test(s) ? s : s + " 00:00 UTC"); return Number.isFinite(t) ? new Date(t).toISOString() : null; };
const cdata = (s) => un(String(s || "").replace(/^<!\[CDATA\[|\]\]>$/g, "").trim());

// ---------------------------------------------------------------- paid / keyed backends
async function tavily(q, limit) {
  const body = JSON.stringify({ api_key: process.env.TAVILY_API_KEY, query: q, max_results: Math.min(limit, 10), search_depth: "basic", include_answer: false });
  const j = await request("web", "https://api.tavily.com/search", { method: "POST", headers: { "content-type": "application/json" }, body, timeoutMs: 15000 });
  return ((j && j.results) || []).map((r) => ({ title: text(r.title), url: r.url || null, snippet: text(r.content).slice(0, 500), domain: host(r.url), publishedAt: iso(r.published_date) }));
}
async function tavilyRead(u) {
  const body = JSON.stringify({ api_key: process.env.TAVILY_API_KEY, urls: [u], extract_depth: "basic" });
  const j = await request("web", "https://api.tavily.com/extract", { method: "POST", headers: { "content-type": "application/json" }, body, timeoutMs: 25000 });
  const r = (((j || {}).results) || [])[0] || {};
  const bodyText = text(r.raw_content);
  if (bodyText.length < 400) throw Object.assign(new Error("extract_thin"), { status: 502 });
  const title = ((r.raw_content || "").match(/^#\s+(.+)$/m) || [])[1] || "";
  return { url: u, title: text(title), domain: host(u), publishedAt: null, text: bodyText.slice(0, 14000), via: "tavily" };
}
async function braveApi(q, limit) {
  const j = await request("web", `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=${Math.min(limit, 10)}`, { headers: { ...HEAD, accept: "application/json", "x-subscription-token": process.env.BRAVE_SEARCH_API_KEY }, timeoutMs: 15000 });
  return (((j || {}).web || {}).results || []).map((r) => ({ title: text(r.title), url: r.url || null, snippet: text(r.description).slice(0, 500), domain: host(r.url), publishedAt: iso(r.age) }));
}
async function serper(q, limit) {
  const j = await request("web", "https://google.serper.dev/search", { method: "POST", headers: { "content-type": "application/json", "x-api-key": process.env.SERPER_API_KEY }, body: JSON.stringify({ q, num: Math.min(limit, 10) }), timeoutMs: 15000 });
  return ((j && j.organic) || []).map((r) => ({ title: text(r.title), url: r.link || null, snippet: text(r.snippet).slice(0, 500), domain: host(r.link), publishedAt: iso(r.date) }));
}

// ---------------------------------------------------------------- keyless backends
/* Brave's public results page. Each result is a chunk after data-type="web"; the title lives in the
   title attribute, the publisher in the site name, the snippet in the content div. */
function parseBrave(html, limit) {
  const out = [];
  for (const chunk of String(html || "").split(/data-type="web"/).slice(1)) {
    if (out.length >= limit) break;
    const t = /class="title[^"]*"[^>]*\stitle="([^"]{3,300})"/.exec(chunk) || /class="title[^"]*"[^>]*>([^<]{3,300})</.exec(chunk);
    const site = /class="desktop-small-semibold[^"]*"[^>]*>([^<]{2,80})</.exec(chunk);
    const cite = /<cite[^>]*>([\s\S]{0,400}?)<\/cite>/.exec(chunk);
    const citeTxt = cite ? text(cite[1]) : "";
    const url = citeTxt && !/›|…/.test(citeTxt) ? (citeTxt.match(/https?:\/\/[^\s]+/) || [])[0] || null : null;
    const body = /class="content[^"]*"[^>]*>([\s\S]{0,3000}?)<\/div>/.exec(chunk);
    const date = /class="[^"]*t-secondary[^"]*"[^>]*>\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},\s+\d{4})/.exec(chunk);
    let snippet = body ? text(body[1]) : "";
    if (date) snippet = snippet.replace(new RegExp("^" + date[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*-?\\s*"), "");
    const title = t ? text(t[1]) : "";
    if (!title || /^(brave search|about brave)$/i.test(title)) continue;
    out.push({ title, url, snippet: snippet.slice(0, 500), domain: host(url) || (site ? text(site[1]).toLowerCase().replace(/\s+/g, "") : ""), publishedAt: date ? iso(date[1]) : null });
  }
  return out;
}
async function braveWeb(q, limit) {
  const url = `https://search.brave.com/search?q=${encodeURIComponent(q)}&source=web`;
  // Brave rate-limits bursts; one quiet retry is enough and keeps a fast turn from losing the best source.
  try { return parseBrave(await request("web", url, { headers: HEAD, text: true, timeoutMs: 15000 }), limit); }
  catch (e) { await new Promise((r) => setTimeout(r, 450)); return parseBrave(await request("web", url, { headers: HEAD, text: true, timeoutMs: 15000 }), limit); }
}
/* Bing News RSS carries a real description (often with the figure), the publisher and the destination
   URL tucked inside its click redirect. It is the most content-rich keyless source. */
async function bingNews(q, limit) {
  const xml = await request("web", `https://www.bing.com/news/search?q=${encodeURIComponent(q)}&format=rss`, { headers: HEAD, text: true, timeoutMs: 15000 });
  const out = [];
  for (const m of String(xml || "").matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    if (out.length >= limit) break;
    const block = m[1];
    const title = cdata((/<title>([\s\S]*?)<\/title>/.exec(block) || [])[1]);
    const raw = cdata((/<link>([\s\S]*?)<\/link>/.exec(block) || [])[1]).replace(/&amp;/g, "&");
    let url = raw;
    try { const u = new URL(raw); url = u.searchParams.get("url") || raw; } catch (e) { /* keep raw */ }
    const pub = cdata((/<News:Source>([\s\S]*?)<\/News:Source>/.exec(block) || [])[1]);
    const desc = text((/<description>([\s\S]*?)<\/description>/.exec(block) || [])[1]);
    const date = iso(cdata((/<pubDate>([\s\S]*?)<\/pubDate>/.exec(block) || [])[1]));
    if (!title || !url) continue;
    out.push({ title, url, snippet: desc.slice(0, 500), domain: pub || host(url), publishedAt: date, publisher: pub });
  }
  return out;
}
/* Google News RSS: real article URLs, publisher and date, and it answers almost any company question
   with dated reporting. This is the reliable keyless backbone. */
async function googleNews(q, limit) {
  const xml = await request("web", `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`, { headers: HEAD, text: true, timeoutMs: 15000 });
  const out = [];
  for (const m of String(xml || "").matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    if (out.length >= limit) break;
    const block = m[1];
    const title = cdata((/<title>([\s\S]*?)<\/title>/.exec(block) || [])[1]);
    const link = cdata((/<link>([\s\S]*?)<\/link>/.exec(block) || [])[1]);
    const pub = cdata((/<source[^>]*>([\s\S]*?)<\/source>/.exec(block) || [])[1]) || host(link);
    const date = iso(cdata((/<pubDate>([\s\S]*?)<\/pubDate>/.exec(block) || [])[1]));
    if (!title || !link) continue;
    out.push({ title: title.replace(/\s+-\s+[^-]{2,60}$/, "").trim(), url: link, snippet: `${pub}${date ? " · " + date.slice(0, 10) : ""}`, domain: host(link) === "news.google.com" ? (pub || "news.google.com") : host(link), publishedAt: date, publisher: pub });
  }
  return out;
}
async function wikipedia(q, limit) {
  const j = await request("web", `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=${Math.min(limit, 5)}&format=json`, { headers: HEAD, timeoutMs: 12000 });
  const rows = (((j || {}).query || {}).search) || [];
  return rows.map((r) => ({ title: un(r.title), url: `https://en.wikipedia.org/wiki/${encodeURIComponent(String(r.title).replace(/ /g, "_"))}`, snippet: text(r.snippet).slice(0, 400), domain: "en.wikipedia.org", publishedAt: iso(r.timestamp), publisher: "Wikipedia" }));
}
const key = (t) => String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 90);

/* News RSS gives a headline but no body, so a result set can be all titles and no figures. For the top
   couple of undated-number rows, fetch the page and keep the sentences that carry a number or share. */
function keySentences(text) {
  const parts = String(text || "").split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => s.length > 40 && s.length < 400);
  const picks = parts.filter((s) => /\d/.test(s) && /(%|percent|quarter|third|half|billion|million|revenue|customer|supplier|largest|top)/i.test(s));
  return picks.slice(0, 3).join(" ").slice(0, 700);
}
async function enrich(rows) {
  const picks = rows.filter((r) => r.url && !/^https:\/\/news\.google\.com\//.test(r.url)).slice(0, 1);
  await Promise.all(picks.map(async (r) => {
    try {
      const html = await request("web", r.url, { headers: HEAD, text: true, timeoutMs: 5000 });
      const keep = keySentences(pageText(String(html || "")).text);
      if (keep) r.excerpt = keep;
    } catch (e) { /* a page that blocks us is not a failed search */ }
  }));
  return rows;
}

// ---------------------------------------------------------------- public API
async function search(query, { limit = 8 } = {}) {
  const q = String(query || "").trim().slice(0, 300);
  const want = Math.max(3, Math.min(Number(limit) || 8, 10));
  let rows = [], via = "keyless";
  if (process.env.TAVILY_API_KEY) { try { rows = await tavily(q, want); via = "tavily"; } catch (e) { rows = []; } }
  if (!rows.length && process.env.BRAVE_SEARCH_API_KEY) { try { rows = await braveApi(q, want); via = "brave"; } catch (e) { rows = []; } }
  if (!rows.length && process.env.SERPER_API_KEY) { try { rows = await serper(q, want); via = "serper"; } catch (e) { rows = []; } }
  if (!rows.length) {
    // The three keyless sources are independent: run them together and merge, so one block does not
    // empty the result set. Failures are per-source and silent.
    const [brave, bing, news, wiki] = await Promise.all([braveWeb(q, want).catch(() => []), bingNews(q, want).catch(() => []), googleNews(q, want).catch(() => []), wikipedia(q, 2).catch(() => [])]);
    // Brave is relevance-ranked and carries the explanatory sources; news adds dates and publisher
    // names; Wikipedia covers definitions and company history. Keep that order rather than by date.
    rows = [...brave, ...bing, ...news, ...wiki];
  }
  const seen = new Set(), out = [];
  for (const r of rows) {
    const k = key(r.title);
    if (!k || seen.has(k)) continue;
    seen.add(k); out.push(r);
    if (out.length >= want) break;
  }
  if (!out.length) throw Object.assign(new Error("web_no_results"), { status: 502 });
  if (via === "keyless") await enrich(out);
  return { query: q, via, results: out };
}

function pageText(html) {
  const title = un((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html) || [])[1] || "").replace(/\s+/g, " ").trim();
  const published = (/"datePublished"\s*:\s*"([^"]+)"/i.exec(html) || /<meta[^>]+property="article:published_time"[^>]+content="([^"]+)"/i.exec(html) || [])[1] || null;
  const body = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|nav|footer|header|form|iframe)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|section|article|li|h[1-6]|tr|br)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  const lines = un(body).split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter((l) => l.length > 40);
  return { title, publishedAt: published ? iso(published) : null, text: lines.join("\n").slice(0, 14000) };
}

async function read(url) {
  const u = String(url || "").trim();
  if (!/^https?:\/\//i.test(u)) throw Object.assign(new Error("bad_url"), { status: 400 });
  if (process.env.TAVILY_API_KEY) {
    try { return await tavilyRead(u); } catch (e) { /* fall through to the keyless readers */ }
  }
  try {
    const md = await request("web", `https://r.jina.ai/${u}`, { headers: { accept: "text/plain" }, text: true, timeoutMs: 25000 });
    const cut = md.indexOf("Markdown Content:");
    const body = (cut > 0 ? md.slice(cut + "Markdown Content:".length) : md).replace(/^\s*\[.*?\]\s*$/gm, "").trim();
    if (body.length > 400) {
      const title = (/^Title:\s*(.+)$/m.exec(md) || [])[1] || "";
      const published = (/^Published Time:\s*(.+)$/m.exec(md) || [])[1] || "";
      return { url: u, title: title.trim(), domain: host(u), publishedAt: published ? iso(published) : null, text: body.slice(0, 14000), via: "jina" };
    }
  } catch (e) { /* fall through to a direct fetch */ }
  const html = await request("web", u, { headers: HEAD, text: true, timeoutMs: 20000 });
  const p = pageText(String(html || ""));
  if (!p.text) throw Object.assign(new Error("page_empty"), { status: 502 });
  return { url: u, title: p.title, domain: host(u), publishedAt: p.publishedAt, text: p.text, via: "direct" };
}

module.exports = { name: "web", search, read, parseBrave, googleNews, bingNews };
