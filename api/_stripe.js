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

async function stripe(method, path, params) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw Object.assign(new Error("stripe_not_configured"), { status: 503 });
  const qs = method === "GET" && params ? "?" + form(params) : "";
  const r = await fetch(`https://api.stripe.com/v1/${path}${qs}`, {
    method, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded", "Stripe-Version": "2025-08-27.basil" },
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

module.exports = { stripe, verifySignature, form, periodEnd };
