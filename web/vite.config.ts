import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // main.ts wires the page together and touches the DOM: it is covered by the Playwright
      // smoke test of milestone M3, not by unit tests (ARCHITECTURE.md, section 6.2).
      exclude: ["src/main.ts"],
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 80 },
    },
  },
});
