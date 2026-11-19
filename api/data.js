// /api/data/* in one function (Vercel Hobby limit). Unified financial data service: see api/_fin/service.js and docs/INTEGRATION_AUDIT.md.
const H = require("./_h/data/handlers");
const ROUTES = Object.fromEntries(H.routes.map((r) => [r, () => H.make(r)]));
const h = require("./_router").group("data", ROUTES);
module.exports = h;
