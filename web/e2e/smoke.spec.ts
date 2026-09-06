import { expect, test, type Page } from "@playwright/test";

import type { HeadSnapshot, Snapshot } from "../src/app";
import { requireFixtureDay } from "./fixture";

/**
 * Smoke tests on the fixture day (Friday 11 September 2026: metro 1, tram 7, Noctis N06).
 * Basemap tiles are blocked so the suite runs offline; the network layer and the vehicles do
 * not depend on them.
 */

const DAY = "2026-09-11";
const EIGHT_OCLOCK_S = 14400;

interface ManifestSlice {
  path: string;
  hour: number;
  mode: string;
}

function distanceM(a: HeadSnapshot, b: HeadSnapshot): number {
  const latitude = (((a.lat + b.lat) / 2) * Math.PI) / 180;
  const dx = (b.lon - a.lon) * Math.cos(latitude) * 111_195;
  const dy = (b.lat - a.lat) * 111_195;
  return Math.hypot(dx, dy);
}

async function openDay(page: Page, query: string): Promise<string[]> {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  // An empty answer keeps the suite offline without the console error an aborted request logs.
  await page.route(/tiles\.openfreemap\.org/, (route) => route.fulfill({ status: 204 }));
  await page.goto(`/?d=${DAY}&${query}`);
  await page.waitForFunction(() => window.stibviz?.ready() === true);
  return errors;
}

function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(() => {
    if (window.stibviz === undefined) {
      throw new Error("stibviz API missing");
    }
    return window.stibviz.snapshot();
  });
}

test("loads the day with a map canvas, a running clock and no error", async ({ page }) => {
  const errors = await openDay(page, "t=08:00&p=0");
  await expect(page).toHaveTitle("Bruxelles en mouvement");
  await expect(page.locator("main.map canvas").first()).toBeVisible();
  await expect(page.locator(".panel__date")).toContainText("11 septembre 2026");

  const clock = page.locator("time.clock__time");
  await expect(clock).toHaveText("08:00");
  await page.getByRole("button", { name: "Lecture" }).click();
  await expect(clock).not.toHaveText("08:00");
  await expect(clock).toHaveText(/^08:\d\d$/);
  expect(errors).toEqual([]);
});

test("pauses and resumes from the button and the space bar", async ({ page }) => {
  await openDay(page, "t=08:00&p=1");
  const button = page.getByRole("button", { name: "Pause" });
  await button.click();
  await expect(page.getByRole("button", { name: "Lecture" })).toBeVisible();
  const paused = await page.evaluate(() => window.stibviz?.time());
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.stibviz?.time())).toBe(paused);

  await page.locator("body").press("Space");
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.stibviz?.time())).toBeGreaterThan(paused ?? 0);
});

test("requests only the slices the manifest lists and mounts one per mode", async ({ page }) => {
  await requireFixtureDay(page);
  const requested: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.includes("/slices/")) {
      requested.push(path);
    }
  });
  await openDay(page, "t=08:00&p=0");

  const manifest = (await (await page.request.get(`/data/${DAY}/manifest.json`)).json()) as {
    slices: ManifestSlice[];
  };
  const listed = manifest.slices.map((slice) => `/data/${DAY}/${slice.path}`);
  expect(requested.length).toBeGreaterThan(0);
  for (const path of requested) {
    expect(listed).toContain(path);
  }
  const hourEight = manifest.slices.filter((slice) => slice.hour === 8).map((slice) => slice.mode);
  expect(hourEight.sort()).toEqual(["metro", "tram"]);
  for (const mode of hourEight) {
    expect(requested).toContain(`/data/${DAY}/slices/08-${mode}.bin`);
  }

  const scene = await snapshot(page);
  expect(scene.hour).toBe(8);
  expect(scene.heads.length).toBeGreaterThan(10);
  const vehicles = scene.heads.map((head) => head.vehicle);
  expect(new Set(vehicles).size).toBe(vehicles.length);
});

test("metro 1 and tram 7 vehicles move along their routes", async ({ page }) => {
  await requireFixtureDay(page);
  await openDay(page, "t=08:00&p=0");
  const before = await snapshot(page);
  await page.evaluate((time) => window.stibviz?.seek(time), EIGHT_OCLOCK_S + 60);
  const after = await snapshot(page);
  expect(after.time).toBe(EIGHT_OCLOCK_S + 60);

  for (const route of ["1", "7"]) {
    const moved = before.heads
      .filter((head) => head.route === route)
      .map((head) => {
        const later = after.heads.find((candidate) => candidate.vehicle === head.vehicle);
        return later === undefined ? 0 : distanceM(head, later);
      });
    expect(moved.length, `route ${route} has vehicles at 08:00`).toBeGreaterThan(0);
    const farthest = Math.max(...moved);
    expect(farthest, `route ${route} moves within one minute`).toBeGreaterThan(100);
    expect(farthest, `route ${route} moves at a plausible speed`).toBeLessThan(2000);
  }
  for (const head of after.heads) {
    expect(head.lon).toBeGreaterThan(4.2);
    expect(head.lon).toBeLessThan(4.5);
    expect(head.lat).toBeGreaterThan(50.75);
    expect(head.lat).toBeLessThan(50.95);
  }
  await page.screenshot({ path: "test-results/fixture-08-01.png" });
});

test("reports the frame rate while playing", async ({ page }, testInfo) => {
  await openDay(page, "t=08:00&p=1");
  await page.waitForTimeout(2500);
  const fps = await page.evaluate(() => window.stibviz?.fps() ?? 0);
  testInfo.annotations.push({ type: "fps", description: fps.toFixed(1) });
  expect(fps).toBeGreaterThan(0);
});
