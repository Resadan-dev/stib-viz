import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { contrastRatio, parseHexColor } from "../../src/theme/colors";

/**
 * The night palette must stay readable. Text tokens are checked against the panel background,
 * which is the darkest surface any of them sits on (WCAG 2.2 AA: 4.5:1 for normal text).
 */

const PANEL_OVER_GROUND = "090C15";
const MINIMUM = 4.5;

function tokens(): Map<string, string> {
  const css = readFileSync(fileURLToPath(new URL("../../src/style.css", import.meta.url)), "utf-8");
  const found = new Map<string, string>();
  for (const match of css.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6});/gi)) {
    found.set(match[1] ?? "", (match[2] ?? "").slice(1));
  }
  return found;
}

describe("contrastRatio", () => {
  it("measures the known extremes", () => {
    expect(contrastRatio("FFFFFF", "000000")).toBeCloseTo(21, 1);
    expect(contrastRatio("777777", "777777")).toBeCloseTo(1, 5);
    expect(contrastRatio("8B93A5", PANEL_OVER_GROUND)).toBeCloseTo(6.34, 1);
  });

  it("rejects a colour it cannot read", () => {
    expect(() => contrastRatio("nope", "000000")).toThrow(/colour/);
  });
});

describe("the night palette", () => {
  const palette = tokens();

  it("defines the ink tokens", () => {
    for (const name of ["ink", "ink-muted", "ink-faint", "accent", "focus"]) {
      expect(palette.get(name), name).toMatch(/^[0-9a-f]{6}$/i);
    }
  });

  it("keeps every text colour above the readable threshold on the panel", () => {
    for (const name of ["ink", "ink-muted", "ink-faint", "accent"]) {
      const colour = palette.get(name);
      if (colour === undefined) {
        throw new Error(`missing token ${name}`);
      }
      expect(contrastRatio(colour, PANEL_OVER_GROUND), `--${name}`).toBeGreaterThanOrEqual(MINIMUM);
    }
  });

  it("keeps the focus ring visible against the panel", () => {
    const focus = palette.get("focus");
    if (focus === undefined) {
      throw new Error("missing token focus");
    }
    // A focus indicator is a non-text contrast: 3:1 is the threshold.
    expect(contrastRatio(focus, PANEL_OVER_GROUND)).toBeGreaterThanOrEqual(3);
  });

  it("parses every mode colour", () => {
    for (const name of ["ground", "accent"]) {
      expect(parseHexColor(palette.get(name) ?? "")).toHaveLength(3);
    }
  });
});
