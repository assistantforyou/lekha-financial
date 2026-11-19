import React from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import App from "./App"
createRoot(document.getElementById("root")).render(<App />)

/* the V3 feature modules (simulation, council, deep analysis) mount into hosts that live in #stage; loaded at runtime, not bundled */
const MODULES = "/v3/lekha-modules.js"
import(/* @vite-ignore */ MODULES).catch((e) => console.warn("[lekha] feature modules failed to load", e))
