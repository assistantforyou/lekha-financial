// Minimal Stripe REST client (no SDK) + webhook signature check. Env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_PREMIUM.
const crypto = require("crypto");

function form(obj, prefix, out = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object") form(v, key, out);
    else out.push(encodeURIComponent(key) + "=" + encodeURIComponent(String(v)));
  }
  return out.join("&");
}

async function stripe(method, path, params, idempotencyKey) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw Object.assign(new Error("stripe_not_configured"), { status: 503 });
  if (process.env.VERCEL_ENV === "preview" && !/^(sk|rk)_test_/.test(key)) throw new Error("Preview billing requires a Stripe test key");
  const qs = method === "GET" && params ? "?" + form(params) : "";
  const r = await fetch(`https://api.stripe.com/v1/${path}${qs}`, {
    method, headers: { ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}), Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded", "Stripe-Version": "2025-08-27.basil" },
    body: method === "GET" || !params ? undefined : form(params),
  });
  const j = await r.json();
  if (!r.ok) throw Object.assign(new Error("stripe_" + (j.error && j.error.code || r.status)), { status: 502, detail: j.error && j.error.message });
  return j;
}

// Stripe-Signature: t=<ts>,v1=<hex>[,v1=...]; signed payload "<ts>.<raw body>", HMAC-SHA256 with the endpoint secret.
function verifySignature(raw, header, secret, toleranceSec = 300, now = Date.now()) {
  if (!raw || !header || !secret) return false;
  const parts = Object.create(null), sigs = [];
  for (const p of String(header).split(",")) { const [k, v] = p.split("="); if (k === "v1") sigs.push(v); else parts[k] = v; }
  const t = Number(parts.t);
  if (!t || Math.abs(now / 1000 - t) > toleranceSec || !sigs.length) return false;
  const want = crypto.createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");
  return sigs.some((s) => s && s.length === want.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(want)));
}

const periodEnd = (sub) => { const t = sub.current_period_end || (sub.items && sub.items.data && sub.items.data[0] && sub.items.data[0].current_period_end); return t ? new Date(t * 1000).toISOString() : null; };

// Price IDs that grant each plan. A price may grant exactly one plan: the current Paid and Premium prices must
// differ, and neither may appear in the other plan's legacy list (a THB 399 price listed as legacy Premium would
// sell Premium for THB 399). `issues` names the conflict without echoing any value.
const priceList = (v) => String(v || "").split(",").map((s) => s.trim()).filter(Boolean);
function priceMap(env = process.env) {
  const paid = String(env.STRIPE_PRICE_PAID || "").trim(), premium = String(env.STRIPE_PRICE_PREMIUM || "").trim();
  const grants = { paid: new Set([paid, ...priceList(env.STRIPE_LEGACY_PAID_PRICES)].filter(Boolean)),
    premium: new Set([premium, ...priceList(env.STRIPE_LEGACY_PREMIUM_PRICES)].filter(Boolean)) };
  const issues = [];
  if (paid && paid === premium) issues.push("STRIPE_PRICE_PAID and STRIPE_PRICE_PREMIUM must be different prices");
  else if ([...grants.paid].some((id) => grants.premium.has(id))) issues.push("a Stripe price is mapped to both Paid and Premium (check the legacy price lists)");
  return { paid, premium, grants, issues };
}

module.exports = { stripe, verifySignature, form, periodEnd, priceMap };
