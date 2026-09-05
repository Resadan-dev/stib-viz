import { describe, expect, it } from "vitest";

import { fr } from "../src/i18n/fr";

describe("textes français", () => {
  it("n'a aucune clé vide", () => {
    for (const [key, value] of Object.entries(fr)) {
      expect(value.trim(), `clé ${key}`).not.toBe("");
    }
  });

  it("nomme l'application", () => {
    expect(fr.appTitle).toBe("Bruxelles en mouvement");
  });
});
