import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

/**
 * The production headers live in public/_headers and take effect only once a host serves them.
 * This test reads the Content-Security-Policy written there and applies it to the page served by
 * the preview server, so a policy that would break the site is caught here rather than live.
 */

function contentSecurityPolicy(): string {
  const path = fileURLToPath(new URL("../public/_headers", import.meta.url));
  const line = readFileSync(path, "utf-8")
    .split("\n")
    .find((entry) => entry.trim().startsWith("Content-Security-Policy:"));
  if (line === undefined) {
    throw new Error("no Content-Security-Policy in public/_headers");
  }
  return line.trim().slice("Content-Security-Policy:".length).trim();
}

test("the site works under the Content-Security-Policy of public/_headers", async ({ page }) => {
  const csp = contentSecurityPolicy();
  const violations: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      violations.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    violations.push(error.message);
  });
  await page.route(/tiles\.openfreemap\.org/, (route) => route.fulfill({ status: 204 }));
  await page.route("**/*", async (route) => {
    if (route.request().resourceType() !== "document") {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    await route.fulfill({
      response,
      headers: { ...response.headers(), "content-security-policy": csp },
    });
  });
  await page.goto("/?d=2026-09-11&t=08:00&p=0");
  await page.waitForFunction(() => window.stibviz?.ready() === true);
  const heads = await page.evaluate(() => window.stibviz?.snapshot().heads.length ?? 0);
  expect(heads).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Lecture" }).click();
  await expect(page.locator("time.clock__time")).not.toHaveText("08:00");
  expect(violations).toEqual([]);
});
