/* Fonts are self-hosted (fontsource): same-origin, cached with the bundle, and only the unicode ranges a page uses are downloaded. */
import "@fontsource/inter/latin-400.css"
import "@fontsource/inter/latin-500.css"
import "@fontsource/inter/latin-600.css"
import "@fontsource/inter/latin-700.css"
import "@fontsource/inter/latin-ext-400.css"
import "@fontsource/inter/latin-ext-500.css"
import "@fontsource/inter/latin-ext-600.css"
import "@fontsource/inter/latin-ext-700.css"
import "@fontsource/inter/vietnamese-400.css"
import "@fontsource/inter/vietnamese-500.css"
import "@fontsource/inter/vietnamese-600.css"
import "@fontsource/inter/vietnamese-700.css"
import "@fontsource/ibm-plex-mono/latin-400.css"
import "@fontsource/ibm-plex-mono/latin-500.css"
import "@fontsource/ibm-plex-mono/latin-600.css"
import React from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import App from "./App"
import { captureAttribution, watchTools } from "./lib/pixel"
captureAttribution(); watchTools()
createRoot(document.getElementById("root")).render(<App />)

/* the V3 feature modules (simulation, council, deep analysis) mount into hosts that live in #stage; loaded at runtime, not bundled */
const MODULES = "/v3/lekha-modules.js"
import(/* @vite-ignore */ MODULES).catch((e) => console.warn("[lekha] feature modules failed to load", e))
