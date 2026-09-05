import { describe, expect, it } from "vitest";

import { chooseDay } from "../../src/data/days";
import { INDEX } from "../helpers/fixtures";

describe("chooseDay", () => {
  it("takes the requested day when the index lists it", () => {
    expect(chooseDay(INDEX, "2026-09-11", "2026-09-09")?.date).toBe("2026-09-11");
  });

  it("falls back to today when the request is unknown", () => {
    expect(chooseDay(INDEX, "2026-01-01", "2026-09-09")?.date).toBe("2026-09-09");
    expect(chooseDay(INDEX, undefined, "2026-09-09")?.date).toBe("2026-09-09");
  });

  it("falls back to the nearest day, the later one on a tie", () => {
    expect(chooseDay(INDEX, undefined, "2026-09-05")?.date).toBe("2026-09-09");
    expect(chooseDay(INDEX, undefined, "2026-09-10")?.date).toBe("2026-09-11");
    expect(chooseDay(INDEX, undefined, "2026-12-25")?.date).toBe("2026-09-11");
  });

  it("returns nothing for an empty index", () => {
    expect(chooseDay({ ...INDEX, days: [] }, undefined, "2026-09-09")).toBeUndefined();
  });
});
