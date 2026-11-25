import posthog from "posthog-js"

const projectToken = import.meta.env.VITE_POSTHOG_KEY
const apiHost = import.meta.env.VITE_POSTHOG_HOST

export const isPostHogConfigured = Boolean(projectToken && apiHost)

if (isPostHogConfigured) {
  posthog.init(projectToken, {
    api_host: apiHost,
    defaults: "2026-08-30",
    capture_exceptions: {
      capture_unhandled_errors: true,
      capture_unhandled_rejections: true,
      capture_console_errors: false,
    },
    logs: {
      serviceName: "portfolio-terminal-web",
      environment: import.meta.env.MODE,
    },
  })
} else if (import.meta.env.DEV) {
  for (const variable of ["VITE_POSTHOG_KEY", "VITE_POSTHOG_HOST"]) {
    if (!import.meta.env[variable]) {
      console.error(`${variable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${variable} is configured`)
    }
  }
}

let identifiedUserId = null

export function identifyPostHogUser(session) {
  const userId = session && session.user_id
  if (!isPostHogConfigured || !userId || identifiedUserId === userId) return

  if (identifiedUserId) posthog.reset()
  posthog.identify(userId, session.email ? { email: session.email } : undefined)
  identifiedUserId = userId
}

export function resetPostHogUser() {
  if (!isPostHogConfigured) return
  posthog.reset()
  identifiedUserId = null
}

export function capturePostHog(event, properties) {
  if (!isPostHogConfigured) return
  posthog.capture(event, properties)
}

export function logPostHog(level, message, attributes) {
  if (!isPostHogConfigured) return
  posthog.logger[level](message, attributes)
}

try {
  identifyPostHogUser(window.PT_AUTH && window.PT_AUTH.session())
} catch (e) {}

export default posthog
