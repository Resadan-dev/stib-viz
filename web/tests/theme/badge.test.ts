import { describe, expect, it } from "vitest";

import { MIN_BADGE_CONTRAST, badgeInk, contrastRatio } from "../../src/theme/colors";

describe("badgeInk", () => {
  it("keeps the text colour of the feed when it reads on the route colour", () => {
    expect(badgeInk({ color: "B5378C", text_color: "FFFFFF" })).toBe("FFFFFF");
    expect(badgeInk({ color: "EFE048", text_color: "000000" })).toBe("000000");
    expect(MIN_BADGE_CONTRAST).toBe(4.5);
  });

  it("switches to black or white, whichever reads better, when the feed pair does not", () => {
    // STIB writes white on its orange, its red and its green; none reaches 4.5:1.
    expect(badgeInk({ color: "F6A90B", text_color: "FFFFFF" })).toBe("000000");
    expect(badgeInk({ color: "E43C2E", text_color: "FFFFFF" })).toBe("000000");
    expect(badgeInk({ color: "1B5F9A", text_color: "333333" })).toBe("FFFFFF");
    expect(
      contrastRatio(badgeInk({ color: "4C8B33", text_color: "FFFFFF" }), "4C8B33"),
    ).toBeGreaterThan(MIN_BADGE_CONTRAST);
  });

  it("returns the feed colour untouched when a colour cannot be parsed", () => {
    expect(badgeInk({ color: "", text_color: "FFFFFF" })).toBe("FFFFFF");
    expect(badgeInk({ color: "B5378C", text_color: "white" })).toBe("white");
  });
});
