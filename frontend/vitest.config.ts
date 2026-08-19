import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    // Switched from jsdom to happy-dom: recent jsdom versions pull transitive dependencies
    // (html-encoding-sniffer -> @exodus/bytes, and CSS parsing via @csstools/css-calc) that
    // ship ESM-only builds require()'d by a CJS caller, which crashes under Vitest/Node with
    // ERR_REQUIRE_ESM. happy-dom is self-contained and avoids that dependency chain entirely.
    environment: "happy-dom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
