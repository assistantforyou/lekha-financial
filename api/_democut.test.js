// The demo cut-off is a promise to visitors: a request without a valid sign-in sees the market as of DEMO_ASOF
// and nothing after it. The date is applied at the service boundary, so the guard belongs here: a demo caller
// must never receive an item dated after the cut-off, even when the upstream feed has already rolled past it.
const assert = require("assert");
const svc = require("./_fin/service");
const { DEMO_ASOF } = require("./_fin/asof");

assert(/^\d{4}-\d{2}-\d{2}$/.test(DEMO_ASOF), "DEMO_ASOF is a date: " + DEMO_ASOF);

const rss = (pubDate) => `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>t</title>` +
  `<item><title>Story after the cut-off</title><link>https://example.com/a</link><pubDate>${pubDate}</pubDate>` +
  `<description>d</description></item></channel></rss>`;

const realFetch = global.fetch;
let served = null;

(async () => {
  // Upstream is live and only carries today's headlines, which is the case that used to leak.
  global.fetch = async () => new Response(served, { status: 200, headers: { "content-type": "application/rss+xml; charset=utf-8" } });
  served = rss("Wed, 25 Nov 2026 10:00:00 GMT");
  const live = await svc.getNews({ symbol: "ZZCUT", asOf: DEMO_ASOF });
  assert.deepStrictEqual(live.data, [], "a demo caller must not see headlines dated after the cut-off");
  assert(/No archived headlines/.test(live.meta.note || ""), "an empty demo feed says why");
  assert.strictEqual(live.meta.asOf, DEMO_ASOF, "the response carries the cut-off date");

  // A headline from the cut-off day itself is still shown: the rule is "up to", not "before".
  served = rss("Tue, 18 Aug 2026 10:00:00 GMT");
  const sameDay = await svc.getNews({ symbol: "ZZCUT2", asOf: DEMO_ASOF });
  assert.strictEqual(sameDay.data.length, 1, "headlines on the cut-off day are part of the demo");
  assert(/Headlines up to the demo date/.test(sameDay.meta.note || ""), "the note names the cut-off");

  // The demo's own FX constant must not drift back to a live rate.
  const demo = require("fs").readFileSync(__dirname + "/../public/pt-demo.js", "utf8");
  assert(/var DEMO_USDTHB = 33\.06/.test(demo), "the demo keeps the 2026-08-18 USD/THB rate");
  assert(!/usdthb: 34\.25/.test(demo), "no demo document is seeded with the live USD/THB rate");

  global.fetch = realFetch;
  console.log("_democut.test.js ok");
})().catch((e) => { global.fetch = realFetch; console.error(e); process.exit(1); });
