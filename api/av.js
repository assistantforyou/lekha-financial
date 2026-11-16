// /api/av/* in one function (Vercel Hobby limit). Explicit requires so the bundler includes every handler.
const ROUTES = {
  "collection/[name]": () => require("./_h/av/collection/[name]"),
  "csv/[key]": () => require("./_h/av/csv/[key]"),
  "doc": () => require("./_h/av/doc"),
  "health": () => require("./_h/av/health"),
};
const h = require("./_router").group("av", ROUTES);
module.exports = h;
if (h.config) module.exports.config = h.config;
