import * as React from "react"
import { createRoot } from "react-dom/client"
import { Analytics } from "@vercel/analytics/react"
import Login from "./Login.jsx"
import "./index.css"

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Login />
    <Analytics />
  </React.StrictMode>
)
