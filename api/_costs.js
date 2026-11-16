// Usage/cost log (table pt_costs). Never stores prompts or statement content: only service, job, model, counts, USD.
const { sb } = require("./_lib");
const { tokenCost } = require("./_pricing");

async function logUsage({ service, job, model, inTok = 0, outTok = 0, extra = {} }) {
  const usd = tokenCost(model, inTok, outTok);
  try {
    await sb("pt_costs", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ service, job, model, units: { in: inTok, out: outTok, ...extra }, usd: usd == null ? 0 : usd }),
    });
  } catch (e) { /* logging must never break the request */ }
  return usd;
}

// Pure aggregation used by the admin endpoint (and tested): rows -> totals by model, by day, month-to-date.
function aggregate(rows, now = new Date()) {
  const month = now.toISOString().slice(0, 7);
  const byModel = {}, byDay = {};
  let mtd = 0, calls = 0;
  for (const r of rows || []) {
    const usd = Number(r.usd) || 0, day = String(r.ts || "").slice(0, 10), key = `${r.service} · ${r.model}`;
    const m = byModel[key] || (byModel[key] = { service: r.service, model: r.model, calls: 0, in: 0, out: 0, usd: 0 });
    m.calls++; m.in += Number(r.units && r.units.in) || 0; m.out += Number(r.units && r.units.out) || 0; m.usd += usd;
    if (day) { const d = byDay[day] || (byDay[day] = {}); d[r.service] = (d[r.service] || 0) + usd; }
    if (day.startsWith(month)) { mtd += usd; calls++; }
  }
  const dim = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const projected = now.getUTCDate() > 0 ? (mtd / now.getUTCDate()) * dim : mtd;
  return { mtd, calls, projected, byModel: Object.values(byModel).sort((a, b) => b.usd - a.usd || b.calls - a.calls), byDay };
}

module.exports = { logUsage, aggregate };
