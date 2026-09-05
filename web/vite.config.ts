import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // main.ts assemble la page et touche le DOM : il est couvert par le test de fumée
      // Playwright du jalon M3, pas par les tests unitaires (ARCHITECTURE.md, section 6.2).
      exclude: ["src/main.ts"],
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 80 },
    },
  },
});
