// Keyless FRED (St. Louis Fed) CSV downloads. Free, no account; cached hard so we stay polite.
const { fredRows } = require("./_mappers");

async function fredSeries(id, cosd = "1960-01-01") {
  const r = await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(id)}&cosd=${cosd}`, {
    headers: { "User-Agent": "portfolio-terminal/1.0 (personal dashboard)" },
  });
  if (!r.ok) throw new Error("fred_" + r.status);
  return fredRows(await r.text());
}

module.exports = { fredSeries };
