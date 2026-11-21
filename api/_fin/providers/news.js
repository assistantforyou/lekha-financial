// Keyless news: per-ticker Yahoo Finance headlines + public publisher RSS (CNBC, MarketWatch, Federal Reserve, BBC Business, Nasdaq, Seeking Alpha).
// Headline, publisher, time and URL always come from the feed. Only headlines and short descriptions are kept and every item links back to the publisher.
const { request, BROWSER_UA } = require("../http");
const S = require("../schemas");
const obs = require("../obs");
const name = "rss";
const FEEDS = [
  { name: "CNBC", url: "https://www.cnbc.com/id/100003114/device/rss/rss.html", category: "market" },
  { name: "CNBC Economy", url: "https://www.cnbc.com/id/20910258/device/rss/rss.html", category: "macro" },
  { name: "MarketWatch", url: "https://feeds.content.dowjones.io/public/rss/mw_marketpulse", category: "market" },
  { name: "Federal Reserve", url: "https://www.federalreserve.gov/feeds/press_all.xml", category: "macro" },
  { name: "BBC Business", url: "https://feeds.bbci.co.uk/news/business/rss.xml", category: "market" },
  { name: "Nasdaq", url: "https://www.nasdaq.com/feed/rssoutbound?category=Markets", category: "market" },
];
const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "\u2019", lsquo: "\u2018", rdquo: "\u201d", ldquo: "\u201c", ndash: "\u2013", mdash: "\u2014", hellip: "\u2026", pound: "\u00a3", euro: "\u20ac", copy: "\u00a9", reg: "\u00ae", trade: "\u2122" };
const entities = (s) => String(s).replace(/&(?:#(\d{1,6})|#x([0-9a-f]{1,5})|([a-z]{2,8}));/gi, (m, d, h, n) => { try { return d ? String.fromCodePoint(+d) : h ? String.fromCodePoint(parseInt(h, 16)) : Object.prototype.hasOwnProperty.call(NAMED, n.toLowerCase()) ? NAMED[n.toLowerCase()] : m; } catch (e) { return m; } });
// feeds often double-encode (&amp;rsquo;) and prefix teasers with a label such as "Key Points": decode twice, drop tags, drop the label
const decode = (s) => entities(entities(String(s || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")).replace(/<[^>]+>/g, " ")).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").replace(/^Key Points\s*(?=[A-Z0-9"\u201c])/, "").trim();
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };

// topic classifier (keyword rules: explainable, not AI)
const CATS = [["earnings", /\b(earnings|eps|quarterly results|guidance|revenue (?:beat|miss)|q[1-4] results|profit (?:rises|falls|jumps))\b/i], ["m&a", /\b(acquire[sd]?|acquisition|merger|takeover|buyout|to buy|deal to|bid for|spin-?off)\b/i],
  ["regulatory", /\b(sec |ftc|doj|antitrust|lawsuit|probe|investigation|fine[sd]?|regulator|ban[ns]?|tariff|sanction|approval|fda|settle)/i], ["macro", /\b(fed |federal reserve|inflation|cpi|ppi|jobs report|payrolls|gdp|rate (?:cut|hike)|treasury yield|unemployment|fomc|recession)\b/i]];
const categorize = (t, dflt = "general") => { for (const [c, re] of CATS) if (re.test(t)) return c; return dflt; };

function parse(xml, publisher, tickers, dflt) {
  const out = [];
  for (const m of String(xml || "").matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const tag = (t) => { const r = new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`).exec(m[1]); return r ? decode(r[1]) : ""; };
    const url = tag("link"), title = tag("title"), at = Date.parse(tag("pubDate")); if (!title || !/^https?:\/\//i.test(url)) continue;
    out.push(S.newsItem({ id: "rss" + hash(url), headline: title.slice(0, 220), publisher, publishedAt: Number.isFinite(at) ? at : null, url, tickers, summary: tag("description"), category: categorize(title + " " + tag("description"), dflt), source: "RSS (" + publisher + ")" }));
  }
  return out;
}
async function company(sym) {
  return obs.timed(name, "yahoo-rss", async () => {
    const x = await request(name, `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(sym)}&region=US&lang=en-US`, { text: true, headers: { "User-Agent": BROWSER_UA }, timeoutMs: 8000 });
    return parse(x, "Yahoo Finance", [sym], "company");
  });
}
async function market() {
  const all = await Promise.all(FEEDS.map((f) => obs.timed(name, "feed:" + f.name, async () => parse(await request(name, f.url, { text: true, headers: { "User-Agent": BROWSER_UA }, timeoutMs: 8000 }), f.name, [], f.category)).catch(() => [])));
  return all.flat();
}
module.exports = { name, configured: () => true, license: "Headlines and links only, each linking to the publisher. Do not reproduce article bodies.", company, market, categorize, parse, decode };
