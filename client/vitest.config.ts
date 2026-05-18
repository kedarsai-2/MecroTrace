import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

const ciReports = process.env.CI === "true" || process.env.VITEST_HTML_REPORT === "true";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    reporters: ciReports ? ["default", "html", "junit"] : ["default"],
    outputFile: ciReports
      ? {
          html: "./target/vitest-report/index.html",
          junit: "./target/vitest-junit.xml",
        }
      : undefined,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
