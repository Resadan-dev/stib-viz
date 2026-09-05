// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import type { RouteInfo } from "../../src/data/contract";
import { fr } from "../../src/i18n/fr";
import { createColourToggle } from "../../src/ui/colours";
import { createLineField } from "../../src/ui/lines";
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

function routes(): RouteInfo[] {
  const tram = MANIFEST.routes[1];
  if (tram === undefined) {
    throw new Error("fixture route missing");
  }
  return [
    ...MANIFEST.routes.map((route) => ({ ...route, id: `gtfs-${route.id}` })),
    { ...tram, id: "gtfs-N06", name: "N06", mode: "noctis" },
    { ...tram, id: "gtfs-92", name: "92" },
    { ...tram, id: "gtfs-12", name: "12", mode: "bus" },
  ];
}

function mount() {
  const parent = document.body.appendChild(document.createElement("div"));
  const onSelect = vi.fn();
  const field = createLineField(parent, routes(), onSelect);
  const input = parent.querySelector("input");
  const form = parent.querySelector("form");
  if (input === null || form === null) {
    throw new Error("no field");
  }
  const submit = (value: string) => {
    input.value = value;
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  };
  return { parent, onSelect, field, input, submit };
}

describe("createLineField", () => {
  it("is a labelled text field with every line as a suggestion, in natural order", () => {
    const { parent, input } = mount();
    expect(parent.querySelector("label")?.textContent).toContain(fr.lineLabel);
    expect(input.getAttribute("list")).toBe(parent.querySelector("datalist")?.id);
    const suggestions = [...parent.querySelectorAll("datalist option")].map((o) =>
      o.getAttribute("value"),
    );
    expect(suggestions).toEqual(["1", "7", "12", "92", "N06"]);
  });

  it("applies a known line on submit, upper-cased, and rejects an unknown one", () => {
    const { onSelect, input, submit } = mount();
    submit("7");
    expect(onSelect).toHaveBeenLastCalledWith("7");
    submit(" n06 ");
    expect(onSelect).toHaveBeenLastCalledWith("N06");
    expect(input.getAttribute("aria-invalid")).toBe("false");
    submit("999");
    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.validationMessage).toBe(fr.unknownLine);
    submit("");
    expect(onSelect).toHaveBeenLastCalledWith(null);
    expect(input.getAttribute("aria-invalid")).toBe("false");
  });

  it("clears with its button and only rewrites the field when the applied line changes", () => {
    const { parent, onSelect, field, input } = mount();
    const clear = parent.querySelector<HTMLButtonElement>(".lines__clear");
    expect(clear?.hidden).toBe(true);
    field.update("7");
    expect(input.value).toBe("7");
    expect(clear?.hidden).toBe(false);
    input.value = "12";
    field.update("7");
    expect(input.value).toBe("12");
    field.update("N06");
    expect(input.value).toBe("N06");
    parent.querySelector<HTMLButtonElement>(".lines__clear")?.click();
    expect(onSelect).toHaveBeenLastCalledWith(null);
    field.update(null);
    expect(input.value).toBe("");
  });
});
