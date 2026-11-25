#!/usr/bin/env node
/* Warm the translation cache for a language before sending paid traffic in it.
   The React shell is translated on the fly: the browser sends untranslated strings to POST /api/data/i18n, an LLM translates them, and the result is
   cached for a year (api/_h/data/i18n.js). The first visitor in a language pays for that (about five batches, up to 30 s each, English flipping to
   the new language). This script behaves like that first visitor so real visitors do not.

   Usage:  node scripts/warm-i18n.mjs <lang> [<lang> ...] [--url https://www.lekhafinancial.com] [--wait 40]
   Needs Playwright (npm i -D playwright, or a global install). It makes real calls to the --url you give it (and so real LLM calls when that is
   production): run it yourself, deliberately. Default url is the local dev server. Languages: th zh-Hans zh-Hant ja ko es hi vi fr. */
const args = process.argv.slice(2), opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d }
const url = (opt("--url", "http://localhost:3477") || "").replace(/\/$/, ""), wait = +opt("--wait", 40) * 1000
const langs = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")))
const ROUTES = ["portfolio/overview", "portfolio/holdings", "research/agent", "simulation/main", "analysis/stress", "sector/now", "macro/dashboard", "company/AAPL?tab=valuation", "account/plans"]
const OK = ["th", "zh-Hans", "zh-Hant", "ja", "ko", "es", "hi", "vi", "fr"]
if (!langs.length || langs.some((l) => !OK.includes(l))) { console.error("Usage: node scripts/warm-i18n.mjs <lang> [...]   (one of: " + OK.join(" ") + ")"); process.exit(1) }
let chromium; try { ({ chromium } = await import("playwright")) } catch (e) { console.error("Playwright is required: npm i -D playwright"); process.exit(1) }
const b = await chromium.launch()
for (const lang of langs) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } })
  await ctx.addInitScript(([l]) => { try { localStorage.setItem("ptpub.v1.prefs", JSON.stringify({ lang: l })); localStorage.setItem("ptpub.v1.app.tour", JSON.stringify({ v: 1, status: "skipped" })); localStorage.setItem("ptpub.v1.app.langprompt", JSON.stringify({ v: 1, a: "dismissed", lang: l })) } catch (e) {} }, [lang])
  const p = await ctx.newPage(); let calls = 0; p.on("response", (r) => { if (/\/api\/data\/i18n/.test(r.url())) calls++ })
  console.log(`[${lang}] warming ${url}`)
  for (const r of ROUTES) {
    const before = calls
    await p.goto(`${url}/#/${r}`, { waitUntil: "load" }).catch(() => {})
    await p.waitForTimeout(Math.min(wait, 8000))                       // let the observer queue and send its batches
    if (calls > before) await p.waitForTimeout(Math.max(0, wait - 8000))   // new strings were still being translated: give them time
    console.log(`  ${r.padEnd(30)} translation calls so far: ${calls}`)
  }
  await ctx.close()
}
await b.close(); console.log("done")
