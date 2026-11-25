// Transport resilience: one provider (DeepSeek), retried on overload, failing closed on everything else.
// Fetch is stubbed, so no request leaves the machine and no key is real.
const assert = require("node:assert/strict");
const { generateJson } = require("./_llm");

process.env.DEEPSEEK_API_KEY = "fixture-deepseek-key";
process.env.SUPABASE_URL = "";
const schema = { type: "OBJECT", properties: { answer: { type: "STRING" } }, required: ["answer"] };
const prompt = { system: "Summarize cited evidence", user: "Filing E1 as of 2026-03-01", schema, deadlineMs: 5000 };
const valid = { answer: "See E1." };
const ok = (content) => new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 4 } }), { status: 200 });

let calls = 0;
const stub = (fn) => {
  calls = 0;
  global.fetch = async (url, init) => {
    assert.equal(String(url), "https://api.deepseek.com/chat/completions");
    assert.equal(init.headers.Authorization, "Bearer fixture-deepseek-key");
    calls++;
    return fn(JSON.parse(init.body), calls);
  };
};

(async () => {
  // Throttled once, then answers: the user sees the answer, not the throttle.
  stub((body, n) => (n === 1 ? new Response("rate limited", { status: 429 }) : ok(JSON.stringify(valid))));
  const info = {};
  assert.deepEqual(await generateJson({ ...prompt, info }), valid);
  assert.equal(calls, 2);
  assert.equal(info.provider, "DeepSeek");
  assert.equal(info.requests, 2);
  assert.equal(info.retries, 1);

  // Overloaded twice then answers.
  stub((body, n) => (n < 3 ? new Response("upstream busy", { status: 503 }) : ok(JSON.stringify(valid))));
  assert.deepEqual(await generateJson({ ...prompt }), valid);
  assert.equal(calls, 3);

  // Persistent outage: three attempts, then a typed error (502 to the caller).
  stub(() => new Response("down", { status: 500 }));
  await assert.rejects(() => generateJson({ ...prompt }), (e) => e.message === "upstream_500" && e.status === 502);
  assert.equal(calls, 3, "one attempt plus two retries");

  // A bad request is not retried: repeating it wastes the deadline.
  stub(() => new Response("bad model", { status: 400 }));
  await assert.rejects(() => generateJson({ ...prompt }), (e) => e.message === "upstream_400");
  assert.equal(calls, 1);

  // A 200 without a usable body is an error, never an empty answer.
  stub(() => new Response(JSON.stringify({ choices: [] }), { status: 200 }));
  await assert.rejects(() => generateJson({ ...prompt }), (e) => e.message === "empty");

  // The request carries the JSON contract and no thinking budget for structured jobs.
  stub(() => ok(JSON.stringify(valid)));
  await generateJson({ ...prompt });
  stub((body) => {
    assert.equal(body.messages[0].role, "system");
    assert.ok(body.messages[0].content.includes("JSON Schema"));
    assert.equal(body.response_format.type, "json_object");
    assert.equal(body.thinking.type, "disabled");
    assert.equal(body.stream, false);
    return ok(JSON.stringify(valid));
  });
  assert.deepEqual(await generateJson({ ...prompt }), valid);

  // No key: fail closed with not_configured, which the routes surface as 503.
  delete process.env.DEEPSEEK_API_KEY;
  await assert.rejects(() => generateJson({ ...prompt }), (e) => e.message === "not_configured" && e.status === 503);
  console.log("deepseek retry, fail-closed and request-shape checks passed");
})().catch((e) => { console.error(e); process.exitCode = 1; });
