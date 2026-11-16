// /api/billing/* in one function (Vercel Hobby limit). Explicit requires so the bundler includes every handler.
const ROUTES = {
  "checkout": () => require("./_h/billing/checkout"),
  "portal": () => require("./_h/billing/portal"),
  "webhook": () => require("./_h/billing/webhook"),
};
const h = require("./_router").group("billing", ROUTES, { rawBody: true });
module.exports = h;
if (h.config) module.exports.config = h.config;
