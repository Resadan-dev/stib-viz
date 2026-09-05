// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { fr } from "../../src/i18n/fr";
import { createAbout } from "../../src/ui/about";

// jsdom 30 has no showModal or close on dialogs; the open attribute is what the test observes.
const dialogPrototype = HTMLDialogElement.prototype as {
  showModal?: () => void;
  close?: () => void;
};
dialogPrototype.showModal ??= function showModal(this: HTMLDialogElement) {
  this.open = true;
};
dialogPrototype.close ??= function close(this: HTMLDialogElement) {
  this.open = false;
};

const INFO = {
  feedVersion: "2_20_20260831_010702",
  attribution: "Source: STIB-MIVB – Open Data – 2026-09-05",
  repositoryUrl: "https://github.com/Resadan-dev/stib-viz",
};

describe("createAbout", () => {
  it("opens a dialog with the method, the data credits and the shortcuts, and closes it", () => {
    const parent = document.body.appendChild(document.createElement("div"));
    createAbout(parent, INFO);
    const button = parent.querySelector("button");
    expect(button?.textContent).toBe(fr.about);
    const dialog = parent.querySelector("dialog");
    expect(dialog?.open).toBe(false);
    button?.click();
    expect(dialog?.open).toBe(true);
    const text = dialog?.textContent ?? "";
    expect(text).toContain(INFO.feedVersion);
    expect(text).toContain(INFO.attribution);
    expect(text).toContain("OpenFreeMap");
    expect(text).toContain(fr.sharedColoursNote);
    expect(text).toContain(fr.shortcutsTitle);
    const links = [...(dialog?.querySelectorAll("a") ?? [])].map((a) => a.getAttribute("href"));
    expect(links).toContain(INFO.repositoryUrl);
    dialog?.querySelector<HTMLButtonElement>("button")?.click();
    expect(dialog?.open).toBe(false);
  });
});
