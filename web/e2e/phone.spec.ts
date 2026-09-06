import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * The site on a phone (SCOPE.md, section 4.5). The control panel is a sheet at the bottom of the
 * screen: folded on load, so the map keeps most of the screen and can be handled; unfolded from
 * the chevron, where it holds everything else and still never covers the map entirely.
 *
 * A Pixel-sized viewport with touch, which is what turns on the phone breakpoint and the
 * pointer-target rules of the accessibility audit.
 */

const DAY = "2026-09-11";
const WIDTH = 412;
const HEIGHT = 915;

test.use({
  viewport: { width: WIDTH, height: HEIGHT },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});

async function open(page: Page): Promise<void> {
  await page.route(/tiles\.openfreemap\.org/, (route) => route.fulfill({ status: 204 }));
  await page.goto(`/?d=${DAY}&t=08:00&p=0`);
  await page.waitForFunction(() => window.stibviz?.ready() === true);
}

/** What is left of the screen above the sheet, as a fraction of its height. */
async function mapShare(page: Page): Promise<number> {
  const box = await page.locator(".panel").boundingBox();
  if (box === null) {
    throw new Error("the control panel has no box");
  }
  return box.y / HEIGHT;
}

async function audit(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .exclude(".maplibregl-ctrl")
    .analyze();
  expect(
    results.violations.map((violation) => ({
      id: violation.id,
      nodes: violation.nodes.map((node) => node.target.join(" ")),
    })),
  ).toEqual([]);
}

/** Nothing may stick out sideways: the page has no horizontal scrollbar to reach it with. */
async function expectNoSidewaysScroll(page: Page): Promise<void> {
  const overflowing = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("body, .app, .panel, .picker, .vehicle")]
      .filter((element) => element.scrollWidth > element.clientWidth + 1)
      .map((element) => `${element.className}: ${String(element.scrollWidth)}`),
  );
  expect(overflowing).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    WIDTH,
  );
}

test("opens folded, leaving the map most of the screen and nothing overflowing", async ({
  page,
}) => {
  await open(page);
  const panel = page.locator(".panel");
  await expect(panel).toHaveAttribute("data-sheet", "collapsed");
  expect(await mapShare(page)).toBeGreaterThan(0.6);

  // The folded bar is the clock, playback and the scrubber; the rest waits behind the chevron.
  await expect(page.locator("time.clock__time")).toBeVisible();
  await expect(page.getByRole("button", { name: "Lecture" })).toBeVisible();
  await expect(page.locator(".activity__range")).toBeVisible();
  await expect(page.locator(".counters")).toBeHidden();
  await expect(page.getByRole("button", { name: "×300", exact: true })).toBeHidden();
  await expectNoSidewaysScroll(page);
});

test("unfolds from the chevron, and folds back on Escape or a tap on the map", async ({ page }) => {
  await open(page);
  const panel = page.locator(".panel");
  const chevron = page.locator(".sheet__toggle");
  await chevron.click();
  await expect(panel).toHaveAttribute("data-sheet", "expanded");
  await expect(chevron).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(".counters")).toBeVisible();
  await expect(page.getByRole("button", { name: "À propos" })).toBeVisible();
  // Even unfolded it never takes the whole screen: the map stays in view above it.
  expect(await mapShare(page)).toBeGreaterThan(0.25);
  await expectNoSidewaysScroll(page);

  await page.keyboard.press("Escape");
  await expect(panel).toHaveAttribute("data-sheet", "collapsed");

  await chevron.click();
  await expect(panel).toHaveAttribute("data-sheet", "expanded");
  await page.locator("main.map").click({ position: { x: WIDTH / 2, y: 80 } });
  await expect(panel).toHaveAttribute("data-sheet", "collapsed");
});

test("never stacks two drawers: the line picker folds the sheet", async ({ page }) => {
  await open(page);
  const panel = page.locator(".panel");
  const picker = page.locator("section.picker");
  await page.locator(".sheet__toggle").click();
  await page.getByRole("button", { name: "Choisir une ligne" }).click();
  await expect(picker).toBeVisible();
  await expect(panel).toHaveAttribute("data-sheet", "collapsed");
  await expectNoSidewaysScroll(page);

  // The picker is a sheet of its own: full width, over the folded bar, never beside it.
  const box = await picker.boundingBox();
  expect(box?.x).toBeLessThanOrEqual(1);
  expect(box?.width).toBeCloseTo(WIDTH, 0);
});

test.describe("on the narrowest screen the scope promises", () => {
  // SCOPE.md section 4.5 promises no horizontal scrolling from 360 px wide. The panel is the
  // widest thing on the page, so this is where that promise is most likely to break.
  const NARROW = 360;
  test.use({ viewport: { width: NARROW, height: 740 } });

  test("nothing overflows sideways at 360 px, folded or unfolded", async ({ page }) => {
    await open(page);
    const overflow = async (): Promise<string[]> =>
      page.evaluate(
        (width) =>
          [...document.querySelectorAll<HTMLElement>("body, .app, .panel, .picker, .vehicle")]
            .filter((element) => element.scrollWidth > element.clientWidth + 1)
            .map(
              (element) =>
                `${element.className}: ${String(element.scrollWidth)} > ${String(width)}`,
            ),
        NARROW,
      );
    expect(await overflow()).toEqual([]);
    await page.locator(".sheet__toggle").click();
    await expect(page.locator(".panel")).toHaveAttribute("data-sheet", "expanded");
    expect(await overflow()).toEqual([]);
    await page.getByRole("button", { name: "Choisir une ligne" }).click();
    await expect(page.locator("section.picker")).toBeVisible();
    expect(await overflow()).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      NARROW,
    );
  });
});

test("passes an axe audit folded and unfolded, pointer targets included", async ({ page }) => {
  await open(page);
  await audit(page);
  await page.locator(".sheet__toggle").click();
  await expect(page.locator(".panel")).toHaveAttribute("data-sheet", "expanded");
  await audit(page);
});
