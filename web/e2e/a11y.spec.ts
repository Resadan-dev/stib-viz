import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Automated accessibility audit of the whole page with axe-core, plus the keyboard and
 * reduced-motion behaviour the rules cannot see (SCOPE.md, section 4.5).
 */

const DAY = "2026-09-11";

async function open(page: Page, query = "t=08:00&p=0"): Promise<void> {
  await page.route(/tiles\.openfreemap\.org/, (route) => route.fulfill({ status: 204 }));
  await page.goto(`/?d=${DAY}&${query}`);
  await page.waitForFunction(() => window.stibviz?.ready() === true);
}

async function audit(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    // The map is a canvas MapLibre owns; its own controls are out of our hands.
    .exclude(".maplibregl-ctrl")
    .analyze();
  const summary = results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    nodes: violation.nodes.map((node) => node.target.join(" ")),
  }));
  expect(summary).toEqual([]);
}

test("the page passes an axe audit", async ({ page }) => {
  await open(page);
  await audit(page);
});

test("the vehicle panel and the about dialog pass an axe audit", async ({ page }) => {
  await open(page);
  const first = await page.evaluate(() => window.stibviz?.snapshot().heads[0]);
  if (first === undefined) {
    throw new Error("no vehicle drawn at 08:00");
  }
  await page.evaluate((vehicle) => window.stibviz?.select(vehicle), first.vehicle);
  await expect(page.locator("section.vehicle")).toBeVisible();
  await audit(page);

  await page.getByRole("button", { name: "À propos" }).click();
  await expect(page.locator("dialog.about")).toBeVisible();
  await audit(page);
});

async function expectFocusRings(controls: Locator, atLeast: number): Promise<void> {
  const count = await controls.count();
  expect(count).toBeGreaterThan(atLeast);
  for (let i = 0; i < count; i += 1) {
    const control = controls.nth(i);
    await control.focus();
    const outline = await control.evaluate(
      (element) => getComputedStyle(element, ":focus-visible").outlineWidth,
    );
    expect(outline, await control.evaluate((element) => element.outerHTML.slice(0, 80))).not.toBe(
      "0px",
    );
  }
}

test("every control is reachable by keyboard with a visible focus ring", async ({ page }) => {
  await open(page);
  await expectFocusRings(
    page.locator(".panel button, .panel input, .panel select, .vehicle-slot button"),
    15,
  );
});

test("the line picker passes an axe audit and every badge has a focus ring", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Choisir une ligne" }).click();
  const picker = page.locator("section.picker");
  await expect(picker).toBeVisible();
  // The badges wear the official colours, with the ink chosen to keep 4.5:1 on each of them.
  await audit(page);
  await expectFocusRings(picker.locator("button"), 3);
});

test("playback starts paused when the visitor prefers reduced motion", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await open(page, "t=08:00");
  expect(await page.evaluate(() => window.stibviz?.playing())).toBe(false);
  await expect(page.getByRole("button", { name: "Lecture" })).toBeVisible();
  await context.close();
});
