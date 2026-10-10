import { describe, expect, it } from "vitest";

import { fr } from "../src/i18n/fr";

describe("French UI copy", () => {
  it("has no empty value", () => {
    for (const [key, value] of Object.entries(fr)) {
      expect(value.trim(), `key ${key}`).not.toBe("");
    }
  });

  it("names the application", () => {
    expect(fr.appTitle).toBe("Bruxelles en mouvement");
  });

  it("uses typographic apostrophes", () => {
    for (const [key, value] of Object.entries(fr)) {
      expect(value, `key ${key}`).not.toMatch(/'/);
    }
  });

  it("has no em dash: a comma, a colon or two sentences say it better", () => {
    for (const [key, value] of Object.entries(fr)) {
      expect(value, `key ${key}`).not.toContain("—");
    }
  });
});
