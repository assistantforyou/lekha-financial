// Run: node api/_vol.test.js
const assert = require("assert");
Module = require("module"); const orig = Module._load;
Module._load = function (r) { if (r === "./_lib") return { cached: async (k, t, f) => f() }; return orig.apply(this, arguments); };
const { cboeRows, volatilityCsv, backtestDoc } = require("./_vol");
const vix = cboeRows("DATE,OPEN,HIGH,LOW,CLOSE\n11/12/2026,1,2,1,18.7\n11/13/2026,1,2,1,19.3\nbad,1\n", "CLOSE");
assert.deepStrictEqual(vix, [["2026-11-12", 18.7], ["2026-11-13", 19.3]]);
const eq = cboeRows("DATE,VIXEQ\n10/31/2024,22.5\n11/04/2024,23.1\n11/13/2026,42.77\n", "VIXEQ");
const csv = volatilityCsv([["2024-10-31", 17], ["2024-11-04", 18], ["2026-11-13", 19.3]], eq, "now");
const L = csv.split("\n");
assert.strictEqual(L[0], "Ticker,Data (yymmdd:close),Calculated at (sheet time)");
assert.strictEqual(L[1], "VIX,241031:17;241104:18;261113:19.3,now");
assert.strictEqual(L[2], "VIXEQ,241104:23.1;261113:42.77,now"); // observed VIXEQ starts at launch
const bt = backtestDoc(eq);
assert.strictEqual(bt.data, "241031:22.5"); assert.ok(bt.src.includes("back-tested") && bt.verification);
assert.strictEqual(volatilityCsv([], eq, "x"), null);
console.log("vol ok");
