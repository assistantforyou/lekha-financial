import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import path from "node:path"
import { fileURLToPath } from "node:url"

const dir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: dir,
  base: "/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(dir, "src") },
  },
  build: {
    outDir: path.resolve(dir, "../public"),
    emptyOutDir: false,
    rollupOptions: {
      input: path.resolve(dir, "login.html"),
    },
  },
})
