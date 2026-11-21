// Transport fixtures exercise the real adapters without external credentials or network.
const assert = require("node:assert/strict");
const { generateJson } = require("./_llm");
process.env.ZAI_API_KEY = "fixture";
process.env.GEMINI_API_KEY = "fixture";
process.env.LLM_PRIMARY_TIMEOUT_MS = "35";
const schema = { type: "OBJECT", properties: { answer: { type: "STRING" } }, required: ["answer"] };
const prompt = { system: "Summarize cited evidence", user: "Filing E1 as of 2026-03-01", schema, deadlineMs: 750 };
const valid = { answer: "See E1." };
const primary = (content) => Response.json({ choices: [{ message: { content } }] });
const fallback = () => Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(valid) }] } }] });
const stall = (signal) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));

(async () => {
  for (const [scenario, fail] of Object.entries({
    timeout: (init) => stall(init.signal),
    stalledBody: init => ({ok:true, status:200, json:() => stall(init.signal)}),
    unauthorized: () => new Response(null, { status: 401 }),
    limited: () => new Response(null, { status: 429 }),
    error: () => new Response(null, { status: 500 }),
    unavailable: () => new Response(null, { status: 503 }),
    invalid: () => primary("broken"), schema: () => primary('{"other":1}'),
    empty: () => primary('{"answer":"  "}'), wrongType: () => primary('{"answer":1}')
  })) {
    const calls = [];
    global.fetch = async (url, init) => {
      if (!String(url).startsWith("https://")) return new Response(null);
      const body = JSON.parse(init.body);
      calls.push(url);
      if (url.includes("api.z.ai")) {
        assert.equal(body.messages[1].content, prompt.user);
        return fail(init);
      }
      assert.deepEqual(body.contents[0].parts, [{ text: prompt.user }]);
      assert.deepEqual(body.generationConfig.responseSchema, schema);
      return fallback();
    };
    const info = {};
    const start = Date.now();
    assert.deepEqual(await generateJson({ ...prompt, model: scenario, info }), valid);
    assert.ok(Date.now() - start < prompt.deadlineMs);
    assert.equal(calls.length, 2);
    assert.equal(info.provider, "Gemini");
    assert.equal(info.requests, 2);
  }
  let primaryCalls = 0, backupCalls = 0;
  global.fetch = async (url) => {
    if (url.includes("api.z.ai")) primaryCalls++;
    else backupCalls++;
    return new Response(null, { status: 503 });
  };
  for (let i = 0; i < 4; i++) await assert.rejects(generateJson({ ...prompt, model: "outage" }), /upstream/);
  assert.equal(primaryCalls, 3);
  assert.equal(backupCalls, 4);
  delete process.env.GEMINI_API_KEY;
  await assert.rejects(generateJson({ ...prompt, model: "missing" }), /upstream/);
  assert.equal(backupCalls, 4);
  delete process.env.ZAI_API_KEY;
  await assert.rejects(generateJson(prompt), /not_configured/);
  console.log("structured failover, evidence preservation, attempt limits and circuit checks passed");
})().catch(e => { console.error(e); process.exitCode = 1; });
