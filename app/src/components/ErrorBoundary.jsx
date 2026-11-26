import { Component } from "react"
import { capture } from "@/lib/analytics"

/* A failed lazy chunk or a render error must never take the shell with it.
   The fallback keeps the visitor on the page with two ways out, and no stack trace in production. */
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    try {
      console.error("[lekha] render failed", error, info && info.componentStack)
      capture("app_error", {
        where: this.props.where || "app",
        message: String((error && error.message) || error).slice(0, 180),
      })
    } catch (e) {}
  }

  back = () => {
    this.setState({ error: null })
    location.href = "/#/portfolio/overview"
  }

  reload = () => location.reload()

  render() {
    if (!this.state.error) return this.props.children
    const full = !!this.props.full
    return (
      <div
        role="alert"
        style={{
          minHeight: full ? "100dvh" : 320,
          display: "grid",
          placeItems: "center",
          padding: 24,
          background: "var(--bg, #fff)",
          color: "var(--fg, #111)",
        }}
      >
        <div style={{ maxWidth: 440 }}>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>This screen could not load</h1>
          <p style={{ margin: "8px 0 0", fontSize: 14, lineHeight: 1.6, color: "var(--muted, #666)" }}>
            The rest of the app is still here. Reload the page, or go back to the portfolio.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
            <button type="button" onClick={this.reload} style={primary}>Reload</button>
            <button type="button" onClick={this.back} style={secondary}>Back to portfolio</button>
          </div>
          {import.meta.env.DEV && (
            <pre style={{ marginTop: 16, maxHeight: 180, overflow: "auto", fontSize: 11, whiteSpace: "pre-wrap", color: "var(--muted, #666)" }}>
              {String((this.state.error && this.state.error.stack) || this.state.error)}
            </pre>
          )}
        </div>
      </div>
    )
  }
}

const primary = {
  border: "1px solid var(--accent, #0f766e)",
  background: "var(--accent, #0f766e)",
  color: "var(--accent-fg, #fff)",
  borderRadius: 6,
  padding: "7px 12px",
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
}
const secondary = {
  border: "1px solid var(--line, #d4d4d4)",
  background: "var(--panel, #fff)",
  color: "var(--fg, #111)",
  borderRadius: 6,
  padding: "7px 12px",
  fontSize: 13,
  cursor: "pointer",
}
