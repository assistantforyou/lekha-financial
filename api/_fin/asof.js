// Demo cut-off. A request without a valid sign-in is a demo visitor: every financial datum is served as of this past date
// (real closes, filings and macro releases up to it, nothing later), so the demo cannot be used to read live data.
// One source of truth with the classic demo (public/pt-demo.js DEMO_DATE); override with DEMO_ASOF.
const { bearer, userFrom } = require("../_auth");
let FROM_DEMO = "2026-08-18"; try { FROM_DEMO = require("../../public/pt-demo.js").DEMO_DATE || FROM_DEMO; } catch (e) { /* keep default */ }
const DEMO_ASOF = /^\d{4}-\d{2}-\d{2}$/.test(process.env.DEMO_ASOF || "") ? process.env.DEMO_ASOF : FROM_DEMO;

/* null for a verified account, the demo date for everyone else. Only a request that carries a token pays for the verification. */
async function asOfFor(req) {
  if (!bearer(req)) return DEMO_ASOF;
  try { return (await userFrom(req)) ? null : DEMO_ASOF; } catch (e) { return DEMO_ASOF; }
}
module.exports = { DEMO_ASOF, asOfFor };
