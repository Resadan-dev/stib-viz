// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import { fr } from "../../src/i18n/fr";
import { createVehicleStepper } from "../../src/ui/stepper";

describe("createVehicleStepper", () => {
  it("steps back and forth through the vehicles of the selected line", () => {
    const parent = document.body.appendChild(document.createElement("div"));
    const onStep = vi.fn<(direction: 1 | -1) => void>();
    const stepper = createVehicleStepper(parent, onStep);
    const [previous, next] = parent.querySelectorAll("button");
    expect(previous?.getAttribute("aria-label")).toBe(fr.previousVehicle);
    expect(next?.getAttribute("aria-label")).toBe(fr.nextVehicle);
    stepper.update({ enabled: false, position: null, total: 0 });
    expect(previous?.disabled).toBe(true);
    expect(next?.disabled).toBe(true);
    stepper.update({ enabled: true, position: null, total: 3 });
    expect(next?.disabled).toBe(false);
    expect(parent.querySelector(".stepper__count")?.textContent).toBe("– / 3");
    next?.click();
    previous?.click();
    expect(vi.mocked(onStep).mock.calls.map((call) => call[0])).toEqual([1, -1]);
    stepper.update({ enabled: true, position: 2, total: 3 });
    expect(parent.querySelector(".stepper__count")?.textContent).toBe("2 / 3");
  });
});
