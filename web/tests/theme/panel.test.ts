import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

function stylesheet(): string {
  return readFileSync(fileURLToPath(new URL("../../src/style.css", import.meta.url)), "utf-8");
}

/**
 * Two layout promises the rendering tests cannot see. The control panel scrolls only when the
 * viewport is genuinely too short: its height reserve drifted away from its offsets once
 * already, which left a scrollbar with empty space below it. The line picker lets the map show
 * through: a wide backdrop blur made it read as opaque at the same alpha.
 */

function rule(selector: string): string {
  const css = stylesheet();
  const start = css.indexOf(`${selector} {`);
  expect(start, `no ${selector} rule`).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf("}", start));
}

function panelRules(): string {
  const css = stylesheet();
  // Top-level rules only: the ones inside a media query are indented.
  const blocks = [...css.matchAll(/^\.panel \{([^}]*)\}/gm)].map((match) => match[1] ?? "");
  expect(blocks.length, "no top-level .panel rule").toBeGreaterThan(0);
  return blocks.join("");
}

function rem(declarations: string, pattern: RegExp, group = 1): number {
  const match = pattern.exec(declarations);
  if (match === null) {
    throw new Error(`no match for ${pattern.source}`);
  }
  return Number(match[group]);
}

describe("the control panel", () => {
  const declarations = panelRules();

  it("reserves above and below itself exactly what its own offset asks for", () => {
    const top = rem(declarations, /top: ([0-9.]+)rem;/);
    const reserved = rem(declarations, /max-height: calc\(100vh - ([0-9.]+)rem\);/);
    expect(reserved).toBeCloseTo(2 * top, 5);
  });

  it("lets the map show through the line picker", () => {
    const picker = rule(".picker");
    expect(picker).toContain("background: var(--panel-sheer)");
    // A backdrop blur wide enough to smear the network lines turns the night map into a flat
    // dark field, and the picker reads as opaque however low its alpha is.
    const blur = /blur\(([0-9.]+)px\)/.exec(picker);
    expect(blur === null ? 0 : Number(blur[1])).toBeLessThanOrEqual(4);
  });

  it("leaves the speed buttons room to sit on one line", () => {
    const width = rem(declarations, /width: min\(([0-9.]+)rem,/);
    const sides = rem(declarations, /padding: [0-9.]+rem ([0-9.]+)rem/);
    // Five buttons of about 3.6 rem, the widest being x1200; below this they overflow sideways
    // and the panel grows a horizontal scrollbar.
    expect(width - 2 * sides).toBeGreaterThanOrEqual(18);
  });
});
