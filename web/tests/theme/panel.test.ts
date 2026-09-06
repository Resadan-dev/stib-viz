import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * The control panel scrolls only when the viewport is genuinely too short. Its height reserve
 * drifted away from its offsets once already, which left a scrollbar with empty space below it.
 */

function panelRules(): string {
  const css = readFileSync(fileURLToPath(new URL("../../src/style.css", import.meta.url)), "utf-8");
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

  it("leaves the speed buttons room to sit on one line", () => {
    const width = rem(declarations, /width: min\(([0-9.]+)rem,/);
    const sides = rem(declarations, /padding: [0-9.]+rem ([0-9.]+)rem/);
    // Five buttons of about 3.6 rem, the widest being x1200; below this they overflow sideways
    // and the panel grows a horizontal scrollbar.
    expect(width - 2 * sides).toBeGreaterThanOrEqual(18);
  });
});
