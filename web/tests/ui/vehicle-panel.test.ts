// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import { fr } from "../../src/i18n/fr";
import type { VehicleDescription } from "../../src/render/selection";
import { createVehiclePanel } from "../../src/ui/vehicle-panel";
import { MANIFEST } from "../helpers/fixtures";

const tram = MANIFEST.routes[1];
if (tram === undefined) {
  throw new Error("fixture route missing");
}

const RUNNING: VehicleDescription = {
  status: "running",
  block: "10474608",
  route: tram,
  headsign: "HEYSEL",
  tripIndex: 0,
  start: 15000,
  end: 17400,
  nextStop: { name: "BOURSE", time: 46980 },
};

describe("createVehiclePanel", () => {
  it("shows the route badge in its colours, the destination and the next stop", () => {
    const parent = document.body.appendChild(document.createElement("div"));
    const onClose = vi.fn();
    const panel = createVehiclePanel(parent, onClose);
    const section = parent.querySelector<HTMLElement>("section");
    expect(section?.hidden).toBe(true);
    panel.show(RUNNING);
    expect(section?.hidden).toBe(false);
    const badge = parent.querySelector<HTMLElement>(".badge");
    expect(badge?.textContent).toBe("7");
    expect(badge?.style.backgroundColor).toBe("rgb(239, 224, 72)");
    expect(badge?.style.color).toBe("rgb(0, 0, 0)");
    expect(parent.querySelector(".vehicle__mode")?.textContent).toBe(fr.modeTram);
    expect(parent.querySelector(".vehicle__headsign")?.textContent).toContain("HEYSEL");
    expect(parent.querySelector(".vehicle__next")?.textContent).toBe(
      `${fr.nextStop} BOURSE · 17:03`,
    );
    expect(parent.querySelector(".vehicle__block")?.textContent).toContain("10474608");
    parent.querySelector("button")?.click();
    expect(onClose).toHaveBeenCalledTimes(1);
    panel.hide();
    expect(section?.hidden).toBe(true);
  });

  it("words the terminus, a layover and an off-duty vehicle", () => {
    const parent = document.body.appendChild(document.createElement("div"));
    const panel = createVehiclePanel(parent, vi.fn());
    panel.show({ ...RUNNING, nextStop: null });
    expect(parent.querySelector(".vehicle__next")?.textContent).toBe(fr.terminus);
    panel.show({ ...RUNNING, status: "layover", start: 46980, nextStop: null });
    expect(parent.querySelector(".vehicle__next")?.textContent).toBe(`${fr.layoverUntil} 17:03`);
    panel.show({ ...RUNNING, status: "off", route: null, headsign: null, nextStop: null });
    expect(parent.querySelector(".vehicle__headsign")?.textContent).toBe(fr.offDuty);
    expect(parent.querySelector<HTMLElement>(".badge")?.hidden).toBe(true);
  });
});
