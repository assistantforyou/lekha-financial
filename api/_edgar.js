// SEC EDGAR access (keyless). Only data.sec.gov JSON APIs are used, with a generic descriptive User-Agent (no personal details).
// SEC allows 10 requests/second; calls are spaced ~120 ms apart per function instance.
const CIKS = require("./_data/sp500_cik.json");
const UA = "portfolio-terminal personal-dashboard";
let last = 0;

async function secGet(url, tries = 2) {
  for (let i = 0; i < tries; i++) {
    const slot = Math.max(Date.now(), last + 120); last = slot;
    if (slot > Date.now()) await new Promise((r) => setTimeout(r, slot - Date.now()));
    const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Encoding": "gzip, deflate", Accept: "application/json" } });
    if (r.status === 429 || r.status === 503) { await new Promise((x) => setTimeout(x, 1500 * (i + 1))); continue; }
    if (r.status === 404) return null;
    if (!r.ok) throw new Error("sec_" + r.status);
    return r.json();
  }
  throw new Error("sec_busy");
}
const pad = (cik) => String(cik).padStart(10, "0");
const companyFacts = (cik) => secGet(`https://data.sec.gov/api/xbrl/companyfacts/CIK${pad(cik)}.json`);
const submissions = (cik) => secGet(`https://data.sec.gov/submissions/CIK${pad(cik)}.json`);

// ticker -> CIK. The S&P 500 list ships with the app (open constituents dataset); others are not resolvable on data.sec.gov alone.
function cikOf(sym) { return CIKS[sym] || null; }

module.exports = { secGet, companyFacts, submissions, cikOf, UA };
