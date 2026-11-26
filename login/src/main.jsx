import * as React from "react"
import { createRoot } from "react-dom/client"
import Login from "./Login.jsx"
import ErrorBoundary from "./ErrorBoundary.jsx"
import "./index.css"

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Login />
    </ErrorBoundary>
  </React.StrictMode>
)
