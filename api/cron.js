// /api/cron/* in one function (Vercel Hobby limit). Explicit requires so the bundler includes every handler.
const ROUTES = {
  "flows": () => require("./_h/cron/flows"),
  "insiders": () => require("./_h/cron/insiders"),
  "prune": () => require("./_h/cron/prune"),
};
const h = require("./_router").group("cron", ROUTES);
module.exports = h;
if (h.config) module.exports.config = h.config;
