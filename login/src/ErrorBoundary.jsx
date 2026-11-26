import * as React from "react"

/* The sign-in page has its own root: keep a failure from leaving a blank page with no way back. */
export default class ErrorBoundary extends React.Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    try { console.error("[lekha] sign-in failed", error, info && info.componentStack) } catch (e) {}
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div role="alert" style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24, fontFamily: "system-ui, sans-serif", background: "#fff", color: "#111" }}>
        <div style={{ maxWidth: 420 }}>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>This page could not load</h1>
          <p style={{ margin: "8px 0 0", fontSize: 14, lineHeight: 1.6, color: "#666" }}>Reload the page, or continue to the app.</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
            <button type="button" onClick={() => location.reload()} style={{ border: "1px solid #0f766e", background: "#0f766e", color: "#fff", borderRadius: 6, padding: "7px 12px", fontSize: 13, cursor: "pointer" }}>Reload</button>
            <button type="button" onClick={() => { location.href = "/#/portfolio/overview" }} style={{ border: "1px solid #d4d4d4", background: "#fff", color: "#111", borderRadius: 6, padding: "7px 12px", fontSize: 13, cursor: "pointer" }}>Open the app</button>
          </div>
        </div>
      </div>
    )
  }
}
