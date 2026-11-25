// Compatibility layer for the PostHog wizard's call sites. The real client is initialised once, for every
// surface (React app, /v2, /v3, login), by public/pt-analytics.js; this module only forwards to window.PT_PH
// so there is a single posthog-js instance and a single identity. Without a key every call is a no-op.
const api = () => (typeof window !== "undefined" ? window.PT_PH : null)

export const isPostHogConfigured = Boolean(typeof window !== "undefined" && window.PT_PH)

export function identifyPostHogUser(session) {
  const userId = session && session.user_id
  if (!userId) return
  const ph = api()
  if (ph) ph.identify(userId, { surface: "app" })
}

export function resetPostHogUser() {
  const ph = api()
  if (ph) ph.reset()
}

export function capturePostHog(event, properties) {
  const ph = api()
  if (ph) ph.capture(event, properties)
}

/* posthog-js logger calls are development noise; keep the signature so wizard call sites stay valid. */
export function logPostHog() {}

export default api
