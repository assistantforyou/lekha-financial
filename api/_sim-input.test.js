const assert = require("node:assert/strict");
const { test } = require("node:test");

test("unmodelled holdings cannot silently become cash and empty benchmark history is unavailable", async () => {
  const { buildSimInput } = await import("../public/v3/lekha-sim.js");
  const list = Array.from({length:26}, (_, i) => ({ticker:"T" + i, value:1}));
  global.window = { PT_APP: { S:{hist:{"INDEXSP:.INX":{D:[]}}}, lekha:{aggregate:()=>({list,total:list.length})} } };
  try {
    assert.match(buildSimInput().err, /25 invested/);
    list.pop();
    assert.match(buildSimInput().err, /price history/);
  } finally { delete global.window; }
});
