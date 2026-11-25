// AI Observability capture for the raw DeepSeek transport. This remains optional so
// missing PostHog configuration never affects model responses.
const crypto = require("crypto");
const { PostHog } = require("posthog-node");

const projectToken = String(process.env.POSTHOG_KEY || "").trim();
const apiHost = String(process.env.POSTHOG_HOST || "").trim();
const configured = Boolean(projectToken && apiHost);

if (!configured && process.env.NODE_ENV !== "production") {
  for (const variable of ["POSTHOG_KEY", "POSTHOG_HOST"]) {
    if (!process.env[variable]) {
      console.warn(`${variable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${variable} is configured`);
    }
  }
}

const posthog = configured ? new PostHog(projectToken, {
  host: apiHost,
  flushAt: 1,
  flushInterval: 0,
  requestTimeout: 2000,
  fetchRetryCount: 0,
  enableExceptionAutocapture: false,
  privacyMode: false,
}) : null;

const allowedId = (value) => {
  const id = String(value || "").trim();
  return /^[A-Za-z0-9_~.@()!'|:-]+$/.test(id) ? id : null;
};

function createAIContext({ sessionId, distinctId, traceId } = {}) {
  return {
    traceId: allowedId(traceId) || crypto.randomUUID(),
    sessionId: allowedId(sessionId),
    distinctId: distinctId ? String(distinctId) : undefined,
  };
}

async function send(event, context, properties) {
  if (!posthog) return;
  try {
    posthog.capture({
      distinctId: context.distinctId || context.traceId,
      event,
      properties: {
        $ai_trace_id: context.traceId,
        $ai_session_id: context.sessionId,
        ...(context.distinctId ? {} : { $process_person_profile: false }),
        ...properties,
      },
    });
    await posthog.flush().catch(() => {});
  } catch (e) { /* observability must not affect application work */ }
}

function generationContext(context) {
  return context && context.traceId ? context : createAIContext();
}

async function captureGeneration(context, { options, result, latency, stream, timeToFirstToken }) {
  const trace = generationContext(context);
  const spanId = crypto.randomUUID();
  await send("$ai_generation", trace, {
    $ai_span_id: spanId,
    $ai_span_name: options.job || "deepseek_completion",
    $ai_model: result.model,
    $ai_provider: "deepseek",
    $ai_input: options.messages || [],
    $ai_input_tokens: result.usage.inTok,
    $ai_cache_read_input_tokens: result.usage.cachedTok,
    $ai_output_choices: [{ role: "assistant", content: result.text }],
    $ai_output_tokens: result.usage.outTok,
    $ai_latency: latency / 1000,
    $ai_http_status: 200,
    $ai_stop_reason: result.finishReason,
    $ai_stream: !!stream,
    ...(stream && timeToFirstToken != null ? { $ai_time_to_first_token: timeToFirstToken / 1000 } : {}),
    ...(options.maxTokens ? { $ai_max_tokens: options.maxTokens } : {}),
    ...(options.temperature != null ? { $ai_temperature: options.temperature } : {}),
    ...(options.tools && options.tools.length ? { $ai_tools: options.tools } : {}),
  });
  trace.parentSpanId = spanId;
}

async function captureTool(context, { name, input, output, latency, error }) {
  const trace = generationContext(context);
  await send("$ai_span", trace, {
    $ai_span_id: crypto.randomUUID(),
    ...(trace.parentSpanId ? { $ai_parent_id: trace.parentSpanId } : {}),
    $ai_span_name: name || "tool_call",
    $ai_input_state: input,
    $ai_output_state: output,
    $ai_latency: latency / 1000,
    $ai_is_error: !!error,
    ...(error ? { $ai_error: error } : {}),
  });
}

module.exports = { createAIContext, captureGeneration, captureTool };
