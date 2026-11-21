// Anonymous document ownership uses an opaque browser capability. Store only its digest.
// Network-based quotas are independent of this value so clearing browser data does not reset quotas.
const { createHash } = require("node:crypto");

function knowledgeOwner(profile, req) {
  if (!profile.demo) return profile.user_id;
  const key = req.headers["x-lekha-demo-key"];
  if (typeof key !== "string" || !/^[0-9a-f]{64}$/.test(key)) return null;
  return "demo-session:" + createHash("sha256").update(key).digest("hex");
}
module.exports = { knowledgeOwner };
