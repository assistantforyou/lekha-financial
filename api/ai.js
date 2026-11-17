// /api/ai/* in one function (Vercel Hobby limit). Explicit requires so the bundler includes every handler.
const ROUTES = {
  "ask": () => require("./_h/ai/ask"),
  "briefing": () => require("./_h/ai/briefing"),
  "simulate": () => require("./_h/ai/simulate"),
};
const h = require("./_router").group("ai", ROUTES);
module.exports = h;
if (h.config) module.exports.config = h.config;
