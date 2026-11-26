// /api/ai/* in one function (Vercel Hobby limit). Explicit requires so the bundler includes every handler.
const ROUTES = {
  "ask": () => require("./_h/ai/ask"),
  "briefing": () => require("./_h/ai/briefing"),
  "simulate": () => require("./_h/ai/simulate"),
  "council": () => require("./_h/ai/council"),
  "council-v3": () => require("./_h/ai/council-v3"),
  "chat": () => require("./_h/ai/chat"),
  "threads": () => require("./_h/ai/threads"),
  "memory": () => require("./_h/ai/memory"),
  "inbox": () => require("./_h/ai/inbox"),
};
const h = require("./_router").group("ai", ROUTES);
module.exports = h;
if (h.config) module.exports.config = h.config;
