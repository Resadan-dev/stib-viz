import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { PHONE_QUERY } from "../../src/ui/sheet";

/**
 * The phone layout promises things no rendering test in this suite can see: the control panel
 * becomes a sheet at the bottom of the screen, folded on load, so the map keeps most of the
 * screen and can be handled at all (SCOPE.md, section 4.5).
 */

function read(name: string): string {
  return readFileSync(fileURLToPath(new URL(`../../${name}`, import.meta.url)), "utf-8");
}

/** The body of the `@media` block with this condition, braces counted rather than guessed. */
function mediaBlock(css: string, condition: string): string {
  const start = css.indexOf(`@media ${condition} {`);
  expect(start, `no @media ${condition} block`).toBeGreaterThan(-1);
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === "{") {
      depth += 1;
    } else if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        return css.slice(open + 1, i);
      }
    }
  }
  throw new Error(`unterminated @media ${condition} block`);
}

const css = read("src/style.css");
const phone = mediaBlock(css, "(max-width: 600px)");

describe("the phone sheet", () => {
  it("is the only phone breakpoint, so one width decides the whole layout", () => {
    expect(css).not.toContain("max-width: 480px");
    expect(css.match(/@media \(max-width: 600px\)/g)).toHaveLength(1);
    // The module watches the same width, and folds the sheet when the screen outgrows it.
    expect(css).toContain(`@media ${PHONE_QUERY}`);
  });

  it("sits at the bottom of the screen and clears the home indicator", () => {
    expect(phone).toMatch(/\.panel\s*\{[^}]*bottom: 0;/);
    expect(phone).toContain("env(safe-area-inset-bottom)");
  });

  it("shows only the clock, playback and the activity curve while it is folded", () => {
    const folded = /\.panel\[data-sheet="collapsed"\][^{]*\{[^}]*display: none;/.exec(phone);
    expect(folded, "no rule hiding the rest of a folded sheet").not.toBeNull();
    const rule = folded?.[0] ?? "";
    for (const part of ["panel__clock", "panel__controls", "panel__activity"]) {
      expect(rule, `${part} must stay in the folded bar`).toContain(part);
    }
  });

  it("leaves the map at least three tenths of the screen once unfolded", () => {
    const unfolded = /\.panel\[data-sheet="expanded"\]\s*\{([^}]*)\}/.exec(phone)?.[1] ?? "";
    const height = /max-height: (\d+)dvh;/.exec(unfolded);
    expect(height, "the unfolded sheet must be capped in dynamic viewport units").not.toBeNull();
    expect(Number(height?.[1])).toBeLessThanOrEqual(70);
    expect(unfolded).toContain("overflow-y: auto");
  });

  it("measures every height in dynamic viewport units, which phone browser bars change", () => {
    // 100vh is the tall viewport on a phone: a box sized against it is cut off by the address
    // bar until the page scrolls, and this page never scrolls.
    expect(css).not.toContain("100vh");
  });

  it("gives every control of the panel a finger-sized height", () => {
    expect(phone).toContain("min-height: 44px;");
    for (const control of [".play", ".days__day", ".speeds__button", ".sheet__toggle"]) {
      expect(phone, `${control} must be reachable by thumb`).toContain(control);
    }
  });

  it("keeps the seven days on one scrolling line rather than two stacked rows", () => {
    const days = /\.days\s*\{([^}]*)\}/.exec(phone)?.[1] ?? "";
    expect(days).toContain("flex-wrap: nowrap");
    expect(days).toContain("overflow-x: auto");
  });

  it("puts the selected vehicle above the sheet, not under it", () => {
    const vehicle = /\.vehicle-slot\s*\{([^}]*)\}/.exec(phone)?.[1] ?? "";
    expect(vehicle).toContain("bottom: auto");
    expect(vehicle).toMatch(/top: /);
  });

  it("opens the line picker across the full width, over the folded bar", () => {
    const slot = /\.picker-slot\s*\{([^}]*)\}/.exec(phone)?.[1] ?? "";
    expect(slot).toContain("left: 0;");
    expect(slot).toContain("right: 0;");
    const above = /z-index: (\d+);/.exec(slot);
    const panel = /\.panel\s*\{[^}]*z-index: (\d+);/.exec(css);
    expect(Number(above?.[1])).toBeGreaterThan(Number(panel?.[1]));
  });
});

describe("the page itself", () => {
  it("reaches under the phone notch, without which every safe-area inset is zero", () => {
    expect(read("index.html")).toContain("viewport-fit=cover");
  });
});
