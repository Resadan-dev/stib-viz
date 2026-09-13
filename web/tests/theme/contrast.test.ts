import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  COVERAGE_OPACITY,
  COVERAGE_RAMP,
  contrastRatio,
  parseHexColor,
} from "../../src/theme/colors";

/**
 * The night palette must stay readable. Text tokens are checked against the panel background,
 * which is the darkest surface any of them sits on (WCAG 2.2 AA: 4.5:1 for normal text).
 */

const PANEL_OVER_GROUND = "090C15";
const MINIMUM = 4.5;

/** Flattens a translucent surface onto an opaque one, the way the browser paints it. */
function over(surface: readonly [number, number, number, number], background: string): string {
  const under = parseHexColor(background);
  if (under === undefined) {
    throw new Error(`unreadable background ${background}`);
  }
  const [r, g, b, alpha] = surface;
  return [r, g, b]
    .map((channel, i) => Math.round(channel * alpha + (under[i] ?? 0) * (1 - alpha)))
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("");
}

/** Reads an `rgb(r g b / a)` token out of the stylesheet. */
function surfaceToken(css: string, name: string): readonly [number, number, number, number] {
  const pattern = /--([a-z-]+):\s*rgb\((\d+) (\d+) (\d+) \/ ([0-9.]+)\);/g;
  for (const match of css.matchAll(pattern)) {
    if (match[1] === name) {
      return [Number(match[2]), Number(match[3]), Number(match[4]), Number(match[5])];
    }
  }
  throw new Error(`missing surface token --${name}`);
}

function stylesheet(): string {
  return readFileSync(fileURLToPath(new URL("../../src/style.css", import.meta.url)), "utf-8");
}

function tokens(): Map<string, string> {
  const css = stylesheet();
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

  it("keeps the line picker readable at half opacity over the night ground", () => {
    const ground = palette.get("ground");
    if (ground === undefined) {
      throw new Error("missing token ground");
    }
    const surface = surfaceToken(stylesheet(), "panel-sheer");
    expect(surface[3]).toBeLessThanOrEqual(0.5);
    const flattened = over(surface, ground);
    for (const name of ["ink", "ink-muted", "ink-faint", "accent"]) {
      const colour = palette.get(name);
      if (colour === undefined) {
        throw new Error(`missing token ${name}`);
      }
      expect(contrastRatio(colour, flattened), `--${name} on the picker`).toBeGreaterThanOrEqual(
        MINIMUM,
      );
    }
  });

  it("keeps the notice of the coverage view readable over the brightest class of the grid", () => {
    const ground = palette.get("ground");
    const brightest = COVERAGE_RAMP[COVERAGE_RAMP.length - 1];
    if (ground === undefined || brightest === undefined) {
      throw new Error("missing ground or coverage ramp");
    }
    // The notice opens from the coverage view, so the grid is what shows through it. Its
    // brightest class, laid at the grid's opacity over the night ground, is the worst case: the
    // blur spreads the thin lines and the vehicles, not the broad fields of colour.
    const [r, g, b] = brightest;
    const map = over([r, g, b, COVERAGE_OPACITY], ground);
    const glass = surfaceToken(stylesheet(), "glass");
    // Translucent is the point: the map must still be there behind the words.
    expect(glass[3]).toBeLessThanOrEqual(0.8);
    const flattened = over(glass, map);
    for (const name of ["ink", "accent"]) {
      const colour = palette.get(name);
      if (colour === undefined) {
        throw new Error(`missing token ${name}`);
      }
      expect(contrastRatio(colour, flattened), `--${name} on the notice`).toBeGreaterThanOrEqual(
        MINIMUM,
      );
    }
  });

  it("writes the notice in the full ink and the accent only", () => {
    // The muted and faint inks fall under 4.5:1 on a surface this sheer over the brightest
    // class. Top-level rules only; the one for reduced transparency is indented, and solid.
    const rules = [...stylesheet().matchAll(/^\.guide[^{]*\{([^}]*)\}/gm)].map(
      (match) => match[1] ?? "",
    );
    expect(rules.length, "no .guide rule").toBeGreaterThan(0);
    for (const rule of rules) {
      expect(rule).not.toMatch(/--ink-(muted|faint)/);
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
