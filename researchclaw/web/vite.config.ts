import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Dev: Vite serves the SPA on :5173 and proxies API/SSE calls to the
// ResearchClaw backend on :8787. Build output (dist/) is hosted by server.js.
const API_TARGET = process.env.RESEARCHCLAW_API || "http://127.0.0.1:8787";

export default defineConfig({
  plugins: [react()],
  // Served by the backend under /app/ (see server.js SPA hosting).
  base: "/app/",
  server: {
    port: 5173,
    proxy: {
      "/projects": { target: API_TARGET, changeOrigin: true },
      "/openclaw": { target: API_TARGET, changeOrigin: true }
    }
  },
  test: {
    environment: "node"
  }
});
