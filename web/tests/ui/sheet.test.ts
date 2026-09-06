// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fr } from "../../src/i18n/fr";
import { closeTopmost, createSheet, type Sheet, type SheetDrawer } from "../../src/ui/sheet";

function drawer(open = false): SheetDrawer & { close: ReturnType<typeof vi.fn> } {
  let isOpen = open;
  const close = vi.fn(() => {
    isOpen = false;
  });
  return { isOpen: () => isOpen, close };
}

/** A media query whose answer the test decides, and can change behind the page's back. */
function query(matches: boolean) {
  const listeners: (() => void)[] = [];
  const list = {
    matches,
    addEventListener: (_type: string, listener: () => void) => {
      listeners.push(listener);
    },
  };
  return {
    list,
    widen() {
      list.matches = false;
      for (const listener of listeners) {
        listener();
      }
    },
  };
}

function mount(picker: SheetDrawer = drawer(), phone = query(true)) {
  const panel = document.body.appendChild(document.createElement("aside"));
  panel.id = "control-panel";
  const host = panel.appendChild(document.createElement("div"));
  const map = document.body.appendChild(document.createElement("main"));
  const sheet = createSheet({ panel, host, map, picker, phone: phone.list });
  const toggle = host.querySelector<HTMLButtonElement>(".sheet__toggle");
  if (toggle === null) {
    throw new Error("no sheet toggle");
  }
  return { panel, host, map, picker, sheet, toggle, phone };
}

beforeEach(() => {
  document.body.replaceChildren();
});

describe("createSheet", () => {
  it("starts folded on every load, with a chevron that says what it will do", () => {
    const { panel, sheet, toggle } = mount();
    expect(sheet.isExpanded()).toBe(false);
    expect(panel.dataset.sheet).toBe("collapsed");
    expect(toggle.type).toBe("button");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.getAttribute("aria-controls")).toBe(panel.id);
    expect(toggle.getAttribute("aria-label")).toBe(fr.expandPanel);
  });

  it("unfolds and folds again from the chevron", () => {
    const { panel, sheet, toggle } = mount();
    toggle.click();
    expect(sheet.isExpanded()).toBe(true);
    expect(panel.dataset.sheet).toBe("expanded");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.getAttribute("aria-label")).toBe(fr.collapsePanel);
    toggle.click();
    expect(sheet.isExpanded()).toBe(false);
    expect(panel.dataset.sheet).toBe("collapsed");
    expect(toggle.getAttribute("aria-label")).toBe(fr.expandPanel);
  });

  it("folds back on a tap anywhere on the map", () => {
    const { map, sheet, toggle } = mount();
    toggle.click();
    map.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(sheet.isExpanded()).toBe(false);
    // A tap while it is already folded changes nothing, and never opens it.
    map.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(sheet.isExpanded()).toBe(false);
  });

  it("never stacks two drawers: unfolding shuts the line picker", () => {
    const picker = drawer(true);
    const { sheet, toggle } = mount(picker);
    toggle.click();
    expect(picker.close).toHaveBeenCalledTimes(1);
    expect(sheet.isExpanded()).toBe(true);
    // Folding it back leaves the picker alone: it is shut already.
    toggle.click();
    expect(picker.close).toHaveBeenCalledTimes(1);
  });

  it("folds itself when the screen grows past the width that made it a sheet", () => {
    // On a wide screen the panel is not a sheet and the chevron is not drawn, so an unfolded
    // position left over from a narrow window would swallow the next Escape for nothing.
    const { sheet, toggle, phone } = mount();
    toggle.click();
    expect(sheet.isExpanded()).toBe(true);
    phone.widen();
    expect(sheet.isExpanded()).toBe(false);
  });

  it("holds the same state when told twice, from the outside", () => {
    const { panel, sheet } = mount();
    sheet.collapse();
    expect(panel.dataset.sheet).toBe("collapsed");
    sheet.expand();
    sheet.expand();
    expect(sheet.isExpanded()).toBe(true);
    expect(panel.dataset.sheet).toBe("expanded");
  });
});

describe("closeTopmost", () => {
  function sheetSpy(expanded: boolean) {
    const collapse = vi.fn<() => void>();
    const sheet: Sheet = { expand: vi.fn<() => void>(), collapse, isExpanded: () => expanded };
    return { sheet, collapse };
  }

  it("shuts the line picker first, and nothing else with it", () => {
    const picker = drawer(true);
    const { sheet, collapse } = sheetSpy(true);
    const clear = vi.fn();
    closeTopmost(picker, sheet, clear);
    expect(picker.close).toHaveBeenCalledTimes(1);
    expect(collapse).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
  });

  it("folds the sheet second, keeping the selected vehicle", () => {
    const { sheet, collapse } = sheetSpy(true);
    const clear = vi.fn();
    closeTopmost(drawer(false), sheet, clear);
    expect(collapse).toHaveBeenCalledTimes(1);
    expect(clear).not.toHaveBeenCalled();
  });

  it("clears the selection once neither drawer is open", () => {
    const { sheet, collapse } = sheetSpy(false);
    const clear = vi.fn();
    closeTopmost(drawer(false), sheet, clear);
    expect(collapse).not.toHaveBeenCalled();
    expect(clear).toHaveBeenCalledTimes(1);
  });
});
