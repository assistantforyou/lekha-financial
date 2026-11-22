// Commercial data-rights switch. DATA_BLOCKED_SOURCES is a comma-separated list of provider names whose data must not
// reach users (for example "yahoo"; see docs/COMMERCIAL_LAUNCH_BLOCKERS.md). Fail-closed: a blocked source is never
// called, results it produced earlier are never served from a cache, and callers fall back to another provider or show
// no data. Pure module, no network.
const blockedSet = () => new Set(String(process.env.DATA_BLOCKED_SOURCES || "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean));
const allowed = (name) => !blockedSet().has(String(name || "").toLowerCase());
// a cache-key suffix that changes whenever the blocklist changes, so entries written under another policy are not reused
const policyTag = () => { const b = [...blockedSet()].sort(); return b.length ? "|blocked:" + b.join(",") : ""; };
module.exports = { allowed, blockedSet, policyTag };
