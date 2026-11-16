// /api/free/* in one function (Vercel Hobby limit). Explicit requires so the bundler includes every handler.
const ROUTES = {
  "collection/[name]": () => require("./_h/free/collection/[name]"),
  "csv/[key]": () => require("./_h/free/csv/[key]"),
  "doc": () => require("./_h/free/doc"),
  "extras": () => require("./_h/free/extras"),
  "health": () => require("./_h/free/health"),
  "status": () => require("./_h/free/status"),
};
const h = require("./_router").group("free", ROUTES);
module.exports = h;
if (h.config) module.exports.config = h.config;
