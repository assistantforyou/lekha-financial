// CNN Business Fear & Greed Index + its Safe Haven Demand component.
// Public JSON behind https://edition.cnn.com/markets/fear-and-greed (about one year of daily history).
// CNN refuses requests without a browser-like User-Agent.
const SOURCE = "https://edition.cnn.com/markets/fear-and-greed";
const URL_ = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata";

const day = (ms) => new Date(ms).toISOString().slice(0, 10);
const r2 = (v) => (typeof v === "number" && isFinite(v) ? Math.round(v * 100) / 100 : null);

// [{x: ms, y}] -> [[YYYY-MM-DD, y]] ascending, one point per calendar day (last wins)
function daily(points) {
  const m = new Map();
  for (const p of points || []) if (p && isFinite(p.x) && typeof p.y === "number" && isFinite(p.y)) m.set(day(p.x), r2(p.y));
  return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

function build(j) {
  const f = j && j.fear_and_greed, h = j && j.fear_and_greed_historical, s = j && j.safe_haven_demand;
  if (!f || typeof f.score !== "number" || !h || !Array.isArray(h.data) || !s) return null;
  const fgiHist = daily(h.data), shdHist = daily(s.data);
  if (fgiHist.length < 2) return null;
  return {
    asOf: f.timestamp ? new Date(f.timestamp).toISOString() : new Date().toISOString(),
    source: SOURCE,
    fgi: { score: r2(f.score), rating: f.rating || "", prevClose: r2(f.previous_close), prev1w: r2(f.previous_1_week), prev1m: r2(f.previous_1_month), prev1y: r2(f.previous_1_year) },
    fgiHist,
    shd: { score: r2(s.score), rating: s.rating || "" },
    shdHist,
  };
}

async function fetchFgi() {
  const r = await fetch(URL_, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      Origin: "https://edition.cnn.com",
      Referer: SOURCE + "/",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error("cnn_" + r.status);
  return build(await r.json());
}

module.exports = { fetchFgi, build };
