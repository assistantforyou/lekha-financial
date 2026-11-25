// Short company description from Wikipedia (CC BY-SA 4.0). Keyless and optional.
// Used only when the profile chain returns a record without a description (Finnhub's profile2 has none),
// so the company page never falls back to "No description from the available providers".
// The article URL is kept beside the text so the caller can attribute it and link back to the source.
const { request } = require("../http");
const name = "wikipedia";
const H = { "User-Agent": "LEKHA-Financials/1.0 (+https://lekhafinancial.com; contact assistantforyou999@gmail.com)", Accept: "application/json" };
const SUFFIX = /\b(inc|inc\.|incorporated|corp|corp\.|corporation|company|co|co\.|plc|ltd|ltd\.|limited|holdings|group|the)\b/gi;
const TITLE = (t) => encodeURIComponent(String(t).trim().replace(/\s+/g, "_"));

async function summary(title) {
  const j = await request(name, `https://en.wikipedia.org/api/rest_v1/page/summary/${TITLE(title)}?redirect=true`, { headers: H, timeoutMs: 6000 });
  if (!j || !j.extract) throw new Error("wikipedia_empty");
  if (j.type && j.type !== "standard") throw new Error("wikipedia_" + j.type);
  if (/\bmay refer to\b|\bdisambiguation\b/i.test(j.extract)) throw new Error("wikipedia_disambiguation");
  const page = (j.content_urls && j.content_urls.desktop && j.content_urls.desktop.page) || `https://en.wikipedia.org/wiki/${TITLE(title)}`;
  return { description: j.extract, url: page, title: j.title || title };
}

// Try the registered name with legal suffixes removed first, then the name as filed.
async function description(companyName) {
  if (!companyName) return null;
  const plain = String(companyName).replace(SUFFIX, " ").replace(/\s+/g, " ").trim();
  for (const t of [plain, companyName]) {
    if (!t) continue;
    try { return await summary(t); } catch (e) { /* try the next form of the name */ }
  }
  return null;
}

module.exports = { name, configured: () => true, description, license: "CC BY-SA 4.0. Attribution and a link to the article are required." };
