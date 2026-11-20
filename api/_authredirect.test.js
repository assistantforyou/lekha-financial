// Run: node api/_authredirect.test.js  (account e-mail return address: only our own hosts, never an arbitrary Host header)
const assert = require("assert");
delete process.env.SITE_URL;
const { callbackUrl, withRedirect } = require("./_auth");
const req = (host, fwd) => ({ headers: Object.assign({ host }, fwd ? { "x-forwarded-host": fwd } : {}) });
assert.strictEqual(callbackUrl(req("www.lekhafinancial.com")), "https://www.lekhafinancial.com/auth-callback.html");
assert.strictEqual(callbackUrl(req("lekhafinancial.com")), "https://lekhafinancial.com/auth-callback.html");
assert.strictEqual(callbackUrl(req("portfolio-terminal-pi-dusky.vercel.app")), "https://portfolio-terminal-pi-dusky.vercel.app/auth-callback.html");
assert.strictEqual(callbackUrl(req("internal", "www.lekhafinancial.com")), "https://www.lekhafinancial.com/auth-callback.html", "forwarded host wins");
// hostile or unknown hosts get no redirect (GoTrue then uses its own Site URL)
for (const bad of ["evil.com", "lekhafinancial.com.evil.com", "evil.com/lekhafinancial.com", "localhost:3000", "", "xlekhafinancial.com", "a.b.vercel.app"]) assert.strictEqual(callbackUrl(req(bad)), null, bad);
assert.strictEqual(callbackUrl({ headers: {} }), null); assert.strictEqual(callbackUrl(null), null);
process.env.SITE_URL = "https://www.lekhafinancial.com/";
assert.strictEqual(callbackUrl(req("evil.com")), "https://www.lekhafinancial.com/auth-callback.html", "SITE_URL overrides");
process.env.SITE_URL = "javascript:alert(1)";
assert.strictEqual(callbackUrl(req("evil.com")), null, "a malformed SITE_URL is ignored");
assert.strictEqual(withRedirect("signup", "https://x.com/a b"), "signup?redirect_to=https%3A%2F%2Fx.com%2Fa%20b");
assert.strictEqual(withRedirect("token?grant_type=password", "https://x.com/"), "token?grant_type=password&redirect_to=https%3A%2F%2Fx.com%2F");
assert.strictEqual(withRedirect("recover", null), "recover");
console.log("auth redirect ok");
