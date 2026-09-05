import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;
const isCi = process.env.CI !== undefined;

/**
 * Smoke tests against the built site (`vite preview`), with the fixture day in `public/data`.
 * Basemap tiles are blocked by the tests themselves, so the suite runs offline and never hits
 * OpenFreeMap from continuous integration.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  fullyParallel: false,
  forbidOnly: isCi,
  retries: isCi ? 1 : 0,
  reporter: isCi ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${String(PORT)}`,
    viewport: { width: 1280, height: 800 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
      },
    },
  ],
  webServer: {
    command: `node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port ${String(PORT)} --strictPort`,
    url: `http://127.0.0.1:${String(PORT)}`,
    reuseExistingServer: !isCi,
    timeout: 30_000,
  },
});
