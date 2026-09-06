// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import { fr, stepperLabel, vehicleRank, vehicleTally } from "../../src/i18n/fr";
import { createVehicleStepper } from "../../src/ui/stepper";

function mount() {
  const parent = document.body.appendChild(document.createElement("div"));
  const onStep = vi.fn<(direction: 1 | -1) => void>();
  const stepper = createVehicleStepper(parent, onStep);
  const group = parent.querySelector<HTMLElement>(".stepper");
  const buttons = parent.querySelectorAll("button");
  const previous = buttons[0];
  const next = buttons[1];
  const label = parent.querySelector<HTMLElement>(".stepper__label");
  const count = parent.querySelector<HTMLElement>(".stepper__count");
  if (group === null || previous === undefined || next === undefined) {
    throw new Error("stepper not built");
  }
  if (label === null || count === null) {
    throw new Error("stepper has no label or count");
  }
  return { parent, onStep, stepper, group, previous, next, label, count };
}

describe("createVehicleStepper", () => {
  it("names its two buttons in words and keeps the arrows from screen readers", () => {
    const { parent, group, previous, next, label } = mount();
    expect(previous.textContent).toContain(fr.previous);
    expect(next.textContent).toContain(fr.next);
    expect(previous.getAttribute("aria-label")).toBe(fr.previousVehicle);
    expect(next.getAttribute("aria-label")).toBe(fr.nextVehicle);
    const arrows = [...parent.querySelectorAll(".stepper__arrow")];
    expect(arrows).toHaveLength(2);
    for (const arrow of arrows) {
      expect(arrow.getAttribute("aria-hidden")).toBe("true");
    }
    expect(group.getAttribute("role")).toBe("group");
    expect(group.getAttribute("aria-labelledby")).toBe(label.id);
    expect(label.id).not.toBe("");
  });

  it("stays out of the way until a line is chosen", () => {
    const { stepper, group } = mount();
    stepper.update({ line: null, position: null, total: 0 });
    expect(group.hidden).toBe(true);
    stepper.update({ line: "7", position: null, total: 3 });
    expect(group.hidden).toBe(false);
  });

  it("says the line, how many of its vehicles run and which one is selected", () => {
    const { stepper, label, count } = mount();
    stepper.update({ line: "7", position: null, total: 3 });
    expect(label.textContent).toBe(stepperLabel("7"));
    expect(count.textContent).toBe(vehicleTally(3));
    stepper.update({ line: "7", position: 2, total: 3 });
    expect(count.textContent).toBe(vehicleRank(2, 3));
    stepper.update({ line: "N06", position: null, total: 1 });
    expect(label.textContent).toBe(stepperLabel("N06"));
    expect(count.textContent).toBe(fr.oneVehicleRunning);
    stepper.update({ line: "N06", position: null, total: 0 });
    expect(count.textContent).toBe(fr.noVehicleRunning);
  });

  it("steps back and forth, and disables both buttons when nothing of the line runs", () => {
    const { stepper, onStep, previous, next } = mount();
    stepper.update({ line: "7", position: null, total: 3 });
    expect(next.disabled).toBe(false);
    expect(previous.disabled).toBe(false);
    next.click();
    previous.click();
    expect(vi.mocked(onStep).mock.calls.map((call) => call[0])).toEqual([1, -1]);
    stepper.update({ line: "7", position: null, total: 0 });
    expect(next.disabled).toBe(true);
    expect(previous.disabled).toBe(true);
  });
});
