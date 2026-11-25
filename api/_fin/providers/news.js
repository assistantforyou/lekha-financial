// Keyless news: per-ticker Yahoo Finance headlines + public publisher RSS (CNBC, MarketWatch, Federal Reserve, BBC Business, Nasdaq, Seeking Alpha).
// Headline, publisher, time and URL always come from the feed. Only headlines and short descriptions are kept and every item links back to the publisher.
const { request, BROWSER_UA } = require("../http");
const S = require("../schemas");
const obs = require("../obs");
const name = "rss";
const FEEDS = [
  // US markets
  { name: "CNBC", url: "https://www.cnbc.com/id/100003114/device/rss/rss.html", category: "market" },
  { name: "CNBC Finance", url: "https://www.cnbc.com/id/10000664/device/rss/rss.html", category: "market" },
  { name: "CNBC Investing", url: "https://www.cnbc.com/id/15839069/device/rss/rss.html", category: "market" },
  { name: "CNBC Technology", url: "https://www.cnbc.com/id/19854910/device/rss/rss.html", category: "market" },
  { name: "CNBC Economy", url: "https://www.cnbc.com/id/20910258/device/rss/rss.html", category: "macro" },
  { name: "MarketWatch", url: "https://feeds.content.dowjones.io/public/rss/mw_marketpulse", category: "market" },
  { name: "MarketWatch Top Stories", url: "https://feeds.content.dowjones.io/public/rss/mw_topstories", category: "market" },
  { name: "WSJ Markets", url: "https://feeds.content.dowjones.io/public/rss/RSSMarketsMain", category: "market" },
  { name: "Bloomberg Markets", url: "https://feeds.bloomberg.com/markets/news.rss", category: "market" },
  { name: "Financial Times", url: "https://www.ft.com/markets?format=rss", category: "market" },
  { name: "New York Times Business", url: "https://rss.nytimes.com/services/xml/rss/nyt/Business.xml", category: "market" },
  { name: "New York Times Economy", url: "https://rss.nytimes.com/services/xml/rss/nyt/Economy.xml", category: "macro" },
  { name: "Seeking Alpha", url: "https://seekingalpha.com/market_currents.xml", category: "market" },
  { name: "Benzinga", url: "https://www.benzinga.com/feed", category: "market" },
  { name: "Investing.com", url: "https://www.investing.com/rss/news.rss", category: "market" },
  { name: "Business Insider", url: "https://markets.businessinsider.com/rss/news", category: "market" },
  { name: "Fortune", url: "https://fortune.com/feed/fortune-feeds/?id=3230629", category: "market" },
  { name: "Nasdaq", url: "https://www.nasdaq.com/feed/rssoutbound?category=Markets", category: "market" },
  { name: "Nasdaq Stocks", url: "https://www.nasdaq.com/feed/rssoutbound?category=Stocks", category: "market" },
  // central banks and global
  { name: "Federal Reserve", url: "https://www.federalreserve.gov/feeds/press_all.xml", category: "macro" },
  { name: "European Central Bank", url: "https://www.ecb.europa.eu/rss/press.html", category: "macro" },
  { name: "The Economist: Finance", url: "https://www.economist.com/finance-and-economics/rss.xml", category: "macro" },
  { name: "BBC Business", url: "https://feeds.bbci.co.uk/news/business/rss.xml", category: "market" },
  { name: "The Guardian Business", url: "https://www.theguardian.com/business/rss", category: "market" },
  { name: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml", category: "general" },
  // Asia and crypto
  { name: "Bangkok Post Business", url: "https://www.bangkokpost.com/rss/data/business.xml", category: "market" },
  { name: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/", category: "market" },
  { name: "Cointelegraph", url: "https://cointelegraph.com/rss", category: "market" },
];
const PER_FEED = 20; // a very large feed (The Economist lists 300) must not drown the others
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
  for (const m of String(xml || "").matchAll(/<item[^>]*>([\s\S]*?)<\/item>/g)) {
    if (out.length >= PER_FEED) break;
    const tag = (t) => { const r = new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`).exec(m[1]); return r ? decode(r[1]) : ""; };
    const url = tag("link"), title = tag("title"), at = Date.parse(tag("pubDate")); if (!title || !/^https?:\/\//i.test(url)) continue;
    out.push(S.newsItem({ id: "rss" + hash(url), headline: title.slice(0, 220), publisher, publishedAt: Number.isFinite(at) ? at : null, url, tickers, summary: tag("description"), category: categorize(title + " " + tag("description"), dflt), source: "RSS (" + publisher + ")" }));
  }
  return out;
}
async function company(sym) {
  if (!require("../../_licensing").allowed("yahoo")) return [];
  return obs.timed(name, "yahoo-rss", async () => {
    const x = await request(name, `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(sym)}&region=US&lang=en-US`, { text: true, headers: { "User-Agent": BROWSER_UA }, timeoutMs: 5000 });
    return parse(x, "Yahoo Finance", [sym], "company");
  });
}
let memo = null; // the 27 feeds are fetched at most once every 5 minutes per instance, however many callers ask
async function market() {
  if (memo && Date.now() - memo.t < 15 * 6e4) return memo.p;
  const p = Promise.all(FEEDS.map((f) => obs.timed(name, "feed:" + f.name, async () => parse(await request(name, f.url, { text: true, headers: { "User-Agent": BROWSER_UA }, timeoutMs: 5000 }), f.name, [], f.category)).catch(() => []))).then((a) => a.flat());
  memo = { t: Date.now(), p }; p.then((r) => { if (!r.length && memo && memo.p === p) memo = null; });
  return p;
}
// stories in the market feeds that name a ticker (2+ letters; an uppercase word or a $cashtag), so company pages gain every outlet too
async function mentioning(sym) {
  const t = String(sym || "").toUpperCase(); if (!/^[A-Z]{2,5}$/.test(t)) return [];
  const re = new RegExp(`(?:^|[^A-Za-z0-9])\\$?${t}(?![A-Za-z0-9])`);
  return (await market()).filter((n) => re.test(n.headline + " " + (n.summary || ""))).map((n) => ({ ...n, tickers: [t] }));
}
module.exports = { name, configured: () => true, license: "Headlines and links only, each linking to the publisher. Do not reproduce article bodies.", company, market, mentioning, categorize, parse, decode, FEEDS };
