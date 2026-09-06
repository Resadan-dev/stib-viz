import { test, type Page } from "@playwright/test";

/**
 * The fixture day, the three-route extract of 11 September 2026, is the only data continuous
 * integration ever holds. A local `web/public/data` may instead carry the real week built by
 * `stibviz week`; the tests that count its routes then skip themselves rather than fail.
 */

export const FIXTURE_DAY = "2026-09-11";

export async function requireFixtureDay(page: Page): Promise<void> {
  const response = await page.request.get(`/data/${FIXTURE_DAY}/manifest.json`);
  const manifest = response.ok() ? ((await response.json()) as { feed_version?: string }) : {};
  test.skip(
    !(manifest.feed_version ?? "").endsWith("-extract"),
    `needs the fixture day: uv run stibviz build --gtfs tests/fixtures/gtfs-extract/gtfs.zip --date ${FIXTURE_DAY} --out ../web/public/data`,
  );
}
