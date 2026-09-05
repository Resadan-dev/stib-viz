import { defineConfig } from "vitest/config";

export default defineConfig({
  build: {
    target: "es2022",
    // The basemap and rendering engines are large by nature; splitting them out keeps the
    // application chunk small and lets browsers cache the engines across deployments.
    rollupOptions: {
      output: {
        manualChunks(id: string): string | undefined {
          if (id.includes("node_modules/maplibre-gl")) {
            return "maplibre";
          }
          if (/node_modules\/@(deck|luma|math|loaders)\.gl\//.test(id)) {
            return "deck";
          }
          return undefined;
        },
      },
    },
    chunkSizeWarningLimit: 1500,
  },
  test: {
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // These files wire the page together and drive WebGL and the DOM: they are covered by the
      // Playwright smoke tests, not by unit tests (ARCHITECTURE.md, section 6.2).
      exclude: ["src/main.ts", "src/app.ts", "src/render/map.ts"],
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 80 },
    },
  },
});
