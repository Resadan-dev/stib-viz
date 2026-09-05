import { expect, test, type Page } from "@playwright/test";

/**
 * Milestone M3 flows on the fixture day: URL synchronisation, filters, speeds, line selection,
 * colour scheme, the vehicle panel, the scrubber and the about dialog.
 */

const DAY = "2026-09-11";

async function openPaused(page: Page): Promise<void> {
  await page.route(/tiles\.openfreemap\.org/, (route) => route.fulfill({ status: 204 }));
  await page.goto(`/?d=${DAY}&t=08:00&p=0`);
  await page.waitForFunction(() => window.stibviz?.ready() === true);
}

function param(page: Page, name: string): string | null {
  return new URL(page.url()).searchParams.get(name);
}

test("writes speed, filters, colours, line and instant back to the URL", async ({ page }) => {
  await openPaused(page);
  await page.getByRole("button", { name: "×600" }).click();
  await expect.poll(() => param(page, "s")).toBe("600");

  await page.getByLabel("Tram").uncheck();
  await expect.poll(() => param(page, "m")).toBe("metro,bus,noctis");

  await page.getByRole("button", { name: "Couleurs officielles des lignes" }).click();
  await expect.poll(() => param(page, "colours")).toBe("official");

  await page.getByLabel("Ligne", { exact: true }).fill("7");
  await page.getByLabel("Ligne", { exact: true }).press("Enter");
  await expect.poll(() => param(page, "l")).toBe("7");
  // Selecting a tram line shows trams again.
  await expect(page.getByLabel("Tram")).toBeChecked();

  // Focus is in the line field, which owns the arrow keys: leave it first.
  await page.getByLabel("Ligne", { exact: true }).blur();
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => param(page, "t")).toBe("08:01");
  await expect(page.locator("time.clock__time")).toHaveText("08:01");
});

test("reads the same state back from the URL", async ({ page }) => {
  await page.route(/tiles\.openfreemap\.org/, (route) => route.fulfill({ status: 204 }));
  await page.goto(`/?d=${DAY}&t=08:30&s=120&m=metro&l=1&colours=official&p=0`);
  await page.waitForFunction(() => window.stibviz?.ready() === true);
  await expect(page.locator("time.clock__time")).toHaveText("08:30");
  await expect(page.getByRole("button", { name: "×120" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Tram")).not.toBeChecked();
  await expect(page.getByLabel("Métro")).toBeChecked();
  await expect(page.getByLabel("Ligne", { exact: true })).toHaveValue("1");
  await expect(
    page.getByRole("button", { name: "Couleurs officielles des lignes" }),
  ).toHaveAttribute("aria-pressed", "true");
  const heads = await page.evaluate(() => window.stibviz?.snapshot().heads ?? []);
  expect(heads.length).toBeGreaterThan(0);
  expect(heads.every((head) => head.mode === "metro")).toBe(true);
});

test("opens the vehicle panel from an injected selection and closes it with Escape", async ({
  page,
}) => {
  await openPaused(page);
  const first = await page.evaluate(() => window.stibviz?.snapshot().heads[0]);
  if (first === undefined) {
    throw new Error("no vehicle drawn at 08:00");
  }
  await page.evaluate((vehicle) => window.stibviz?.select(vehicle), first.vehicle);
  const panel = page.locator("section.vehicle");
  await expect(panel).toBeVisible();
  await expect(panel.locator(".badge")).toHaveText(first.route);
  await expect(panel.locator(".vehicle__next")).toContainText(/Prochain arrêt|Terminus|attente/);
  await page.locator("body").press("Escape");
  await expect(panel).toBeHidden();
});

test("steps through the vehicles of the selected line and follows the chosen one", async ({
  page,
}) => {
  await openPaused(page);
  await page.getByLabel("Ligne", { exact: true }).fill("7");
  await page.getByLabel("Ligne", { exact: true }).press("Enter");
  const next = page.getByRole("button", { name: "Véhicule suivant" });
  await expect(next).toBeEnabled();
  await expect(page.locator(".stepper__count")).toHaveText(/– \/ [1-9]\d*/);
  await next.click();
  const panel = page.locator("section.vehicle");
  await expect(panel).toBeVisible();
  await expect(panel.locator(".badge")).toHaveText("7");
  await expect(panel.locator(".vehicle__follow")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".stepper__count")).toHaveText(/1 \/ [1-9]\d*/);
  await next.click();
  await expect(page.locator(".stepper__count")).toHaveText(/2 \/ [1-9]\d*/);
  await page.getByLabel("Ligne", { exact: true }).fill("999");
  await page.getByLabel("Ligne", { exact: true }).press("Enter");
  await expect(page.getByLabel("Ligne", { exact: true })).toHaveAttribute("aria-invalid", "true");
});

test("scrubs the day from the activity range and explains itself in the about dialog", async ({
  page,
}) => {
  await openPaused(page);
  const range = page.locator("input[type=range]");
  await range.evaluate((element: HTMLInputElement) => {
    element.value = "46980";
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator("time.clock__time")).toHaveText("17:03");
  expect(await page.evaluate(() => window.stibviz?.time())).toBe(46980);

  await page.getByRole("button", { name: "À propos" }).click();
  const dialog = page.locator("dialog.about");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("STIB-MIVB");
  await expect(dialog).toContainText("Raccourcis clavier");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});
