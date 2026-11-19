// Small fetch helper for providers: hard timeout, JSON/text parsing, uniform errors ("<provider>_<status>"), no keys in error text.
const SEC_UA = () => process.env.SEC_USER_AGENT || "PortfolioTerminal assistantforyou999@gmail.com";
const BROWSER_UA = "Mozilla/5.0 (portfolio-terminal research app)";

async function request(provider, url, { headers = {}, timeoutMs = 12000, text = false, method = "GET", body } = {}) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { method, headers, body, signal: ctl.signal });
    if (r.status === 404) return null;
    if (r.status === 204) return null;
    if (!r.ok) throw Object.assign(new Error(`${provider}_${r.status}`), { status: r.status });
    return text ? await r.text() : await r.json();
  } catch (e) {
    if (e && e.name === "AbortError") throw new Error(`${provider}_timeout`);
    throw e;
  } finally { clearTimeout(t); }
}
const notConfigured = (provider) => Object.assign(new Error(`${provider}_not_configured`), { code: "not_configured" });
module.exports = { request, SEC_UA, BROWSER_UA, notConfigured };
