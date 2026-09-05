// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import type { RouteInfo } from "../../src/data/contract";
import { fr } from "../../src/i18n/fr";
import { createColourToggle } from "../../src/ui/colours";
import { createLineSelect } from "../../src/ui/lines";
import { MANIFEST } from "../helpers/fixtures";

describe("createColourToggle", () => {
  it("is a pressed-state button that reports the scheme to use", () => {
    const parent = document.body.appendChild(document.createElement("div"));
    const onChange = vi.fn();
    const toggle = createColourToggle(parent, onChange);
    const button = parent.querySelector("button");
    expect(button?.textContent).toBe(fr.officialColours);
    toggle.update("palette");
    expect(button?.getAttribute("aria-pressed")).toBe("false");
    button?.click();
    expect(onChange).toHaveBeenCalledWith("official");
    toggle.update("official");
    expect(button?.getAttribute("aria-pressed")).toBe("true");
    button?.click();
    expect(onChange).toHaveBeenLastCalledWith("palette");
  });
});

describe("createLineSelect", () => {
  it("lists every route by mode after an all-lines option and reports the choice", () => {
    const parent = document.body.appendChild(document.createElement("div"));
    const onSelect = vi.fn();
    const tram = MANIFEST.routes[1];
    if (tram === undefined) {
      throw new Error("fixture route missing");
    }
    const routes: RouteInfo[] = [
      ...MANIFEST.routes.map((route) => ({ ...route, id: `gtfs-${route.id}` })),
      { ...tram, id: "gtfs-N06", name: "N06", mode: "noctis" },
    ];
    const select = createLineSelect(parent, routes, onSelect);
    const element = parent.querySelector("select");
    expect(parent.querySelector("label")?.textContent).toContain(fr.lineLabel);
    expect(element?.options[0]?.textContent).toBe(fr.allLines);
    expect(element?.options[0]?.value).toBe("");
    const groups = [...(element?.querySelectorAll("optgroup") ?? [])].map((group) => group.label);
    expect(groups).toEqual([fr.modeMetro, fr.modeTram, fr.modeNoctis]);
    if (element === null) {
      throw new Error("no select");
    }
    element.value = "7";
    element.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onSelect).toHaveBeenCalledWith("7");
    element.value = "";
    element.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onSelect).toHaveBeenLastCalledWith(null);
    select.update("N06");
    expect(element.value).toBe("N06");
    select.update(null);
    expect(element.value).toBe("");
  });

  it("sorts route names naturally within a mode", () => {
    const parent = document.body.appendChild(document.createElement("div"));
    const tram = MANIFEST.routes[1];
    if (tram === undefined) {
      throw new Error("fixture route missing");
    }
    const routes = [
      { ...tram, id: "92", name: "92" },
      { ...tram, id: "8", name: "8" },
      { ...tram, id: "10", name: "10" },
    ];
    createLineSelect(parent, routes, vi.fn());
    const names = [...parent.querySelectorAll("option")].slice(1).map((o) => o.textContent);
    expect(names).toEqual(["8", "10", "92"]);
  });
});
