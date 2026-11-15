const assert = require("assert");
const { cftcSeries, ticFrom } = require("./_flows");
const s = cftcSeries([
  { report_date_as_yyyy_mm_dd: "2026-11-03T00:00:00.000", asset_mgr_positions_long: "1111721", asset_mgr_positions_short: "183137" },
  { report_date_as_yyyy_mm_dd: "2026-10-27T00:00:00.000", asset_mgr_positions_long: "1000", asset_mgr_positions_short: "x" },
  { report_date_as_yyyy_mm_dd: "2026-10-20T00:00:00.000", asset_mgr_positions_long: "5", asset_mgr_positions_short: "6" },
], "asset_mgr_positions_long", "asset_mgr_positions_short");
assert.strictEqual(s, "2026-10-20,5,6;2026-11-03,1111721,183137");
const pad = (a) => { const r = Array(17).fill(""); r[0] = "All Countries"; r[2] = a[0]; r[16] = String(a[1]); return r.join("\t"); };
const t = ticFrom(["hdr", "Austria\t1\t2026-08\t" , pad(["2026-07", 2778]), pad(["2026-08", 153944])].join("\n"), 6);
assert.deepStrictEqual(t.months, { "Jul 2026": { total: 2.8, private: null, official: null }, "Aug 2026": { total: 153.9, private: null, official: null } });
assert.strictEqual(ticFrom("nothing"), null);
console.log("flows ok");
