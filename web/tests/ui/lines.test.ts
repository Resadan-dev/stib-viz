// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import type { RouteInfo } from "../../src/data/contract";
import { fr } from "../../src/i18n/fr";
import { createLinePicker } from "../../src/ui/lines";
import { MANIFEST } from "../helpers/fixtures";

function routes(withNoctis = true): RouteInfo[] {
  const tram = MANIFEST.routes[1];
  if (tram === undefined) {
    throw new Error("fixture route missing");
  }
  return [
    ...MANIFEST.routes.map((route) => ({ ...route, id: `gtfs-${route.id}` })),
    ...(withNoctis ? [{ ...tram, id: "gtfs-N06", name: "N06", mode: "noctis" as const }] : []),
    { ...tram, id: "gtfs-92", name: "92" },
    { ...tram, id: "gtfs-12", name: "12", mode: "bus", color: "1B5F9A", text_color: "FFFFFF" },
    { ...tram, id: "gtfs-T81", name: "T81", mode: "bus" },
    { ...tram, id: "gtfs-81", name: "81" },
  ];
}

function mount(withNoctis = true) {
  const parent = document.body.appendChild(document.createElement("div"));
  const host = document.body.appendChild(document.createElement("div"));
  const onSelect = vi.fn();
  const picker = createLinePicker(parent, host, routes(withNoctis), onSelect);
  const trigger = parent.querySelector<HTMLButtonElement>(".lines__trigger");
  const clear = parent.querySelector<HTMLButtonElement>(".lines__clear");
  const section = host.querySelector<HTMLElement>(".picker");
  if (trigger === null || clear === null || section === null) {
    throw new Error("picker not built");
  }
  const lines = () => [...section.querySelectorAll<HTMLButtonElement>(".picker__line")];
  const tabs = () => [...section.querySelectorAll<HTMLButtonElement>(".picker__tab")];
  const shown = () =>
    lines()
      .filter((button) => !button.hidden)
      .map((b) => b.textContent);
  return { parent, host, onSelect, picker, trigger, clear, section, lines, tabs, shown };
}

describe("createLinePicker", () => {
  it("lists every line of the day as a badge in its official colours, by number, Noctis last", () => {
    const { lines, section } = mount();
    expect(section.hidden).toBe(true);
    expect(section.getAttribute("role")).toBe("dialog");
    expect(lines().map((button) => button.textContent)).toEqual([
      "1",
      "7",
      "12",
      "81",
      "T81",
      "92",
      "N06",
    ]);
    const metro = lines()[0];
    expect(metro?.style.backgroundColor).toBe("rgb(181, 55, 140)");
    expect(metro?.style.color).toBe("rgb(255, 255, 255)");
    expect(metro?.title).toBe("GARE DE L OUEST - STOCKEL");
    expect(metro?.getAttribute("aria-pressed")).toBe("false");
  });

  it("offers one tab per mode of the day after the Tous tab, and filters the grid", () => {
    const { tabs, shown } = mount();
    expect(tabs().map((tab) => tab.textContent)).toEqual([
      fr.pickerAll,
      fr.modeMetro,
      fr.modeTram,
      fr.modeBus,
      fr.modeNoctis,
    ]);
    expect(
      mount(false)
        .tabs()
        .map((tab) => tab.textContent),
    ).not.toContain(fr.modeNoctis);
    tabs()[2]?.click();
    expect(shown()).toEqual(["7", "81", "92"]);
    expect(tabs()[2]?.getAttribute("aria-pressed")).toBe("true");
    expect(tabs()[0]?.getAttribute("aria-pressed")).toBe("false");
    tabs()[3]?.click();
    expect(shown()).toEqual(["12", "T81"]);
    tabs()[0]?.click();
    expect(shown()).toHaveLength(7);
    expect(tabs()[0]?.getAttribute("aria-pressed")).toBe("true");
  });

  it("holds the vehicle stepper between the badges and the footer", () => {
    const { picker, section } = mount();
    const slot = section.querySelector<HTMLElement>(".picker__vehicles");
    expect(slot).not.toBeNull();
    expect(picker.vehicles).toBe(slot);
    const children = [...section.children].map((child) => child.className);
    expect(children.indexOf("picker__vehicles")).toBeGreaterThan(children.indexOf("picker__grid"));
    expect(children.indexOf("picker__vehicles")).toBeLessThan(children.indexOf("picker__footer"));
  });

  it("opens from the trigger with focus inside, closes with its button or Escape, focus back", () => {
    const { picker, trigger, section } = mount();
    expect(trigger.textContent).toBe(fr.chooseLine);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.getAttribute("aria-controls")).toBe(section.id);
    trigger.click();
    expect(picker.isOpen()).toBe(true);
    expect(section.hidden).toBe(false);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(section.contains(document.activeElement)).toBe(true);
    section.querySelector<HTMLButtonElement>(".picker__close")?.click();
    expect(picker.isOpen()).toBe(false);
    expect(section.hidden).toBe(true);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
    trigger.click();
    section.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(picker.isOpen()).toBe(false);
    trigger.click();
    trigger.click();
    expect(picker.isOpen()).toBe(false);
  });

  it("selects a line on click without closing, and reflects the selection when told", () => {
    const { picker, trigger, clear, lines, onSelect } = mount();
    trigger.click();
    lines()[1]?.click();
    expect(onSelect).toHaveBeenCalledWith("7");
    expect(picker.isOpen()).toBe(true);
    picker.update("7");
    expect(lines()[1]?.getAttribute("aria-pressed")).toBe("true");
    expect(lines()[0]?.getAttribute("aria-pressed")).toBe("false");
    const badge = trigger.querySelector<HTMLElement>(".badge");
    expect(badge?.textContent).toBe("7");
    expect(badge?.style.backgroundColor).toBe("rgb(239, 224, 72)");
    expect(trigger.getAttribute("aria-label")).toContain("7");
    expect(clear.hidden).toBe(false);
    picker.update(null);
    expect(lines().every((button) => button.getAttribute("aria-pressed") === "false")).toBe(true);
    expect(trigger.textContent).toBe(fr.chooseLine);
    expect(trigger.hasAttribute("aria-label")).toBe(false);
    expect(clear.hidden).toBe(true);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("clears the selection from the panel button and from the picker", () => {
    const { picker, clear, section, onSelect } = mount();
    picker.update("12");
    clear.click();
    expect(onSelect).toHaveBeenLastCalledWith(null);
    section.querySelector<HTMLButtonElement>(".picker__all")?.click();
    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });
});
