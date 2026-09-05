// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { fr } from "../../src/i18n/fr";
import { createClockView } from "../../src/ui/clock";

describe("createClockView", () => {
  it("shows civil time and flags the next morning", () => {
    const parent = document.createElement("div");
    const view = createClockView(parent);
    view.update(46980);
    const time = parent.querySelector("time");
    expect(time?.textContent).toBe("17:03");
    expect(time?.getAttribute("datetime")).toBe("17:03");
    const tag = parent.querySelector<HTMLElement>(".clock__next-day");
    expect(tag?.hidden).toBe(true);
    view.update(77400);
    expect(time?.textContent).toBe("01:30");
    expect(tag?.hidden).toBe(false);
    expect(tag?.textContent).toBe(fr.nextDay);
  });

  it("only touches the DOM when the displayed minute changes", () => {
    const parent = document.createElement("div");
    const view = createClockView(parent);
    view.update(0);
    const time = parent.querySelector("time");
    if (time === null) {
      throw new Error("no time element");
    }
    time.textContent = "sentinel";
    view.update(30);
    expect(time.textContent).toBe("sentinel");
    view.update(60);
    expect(time.textContent).toBe("04:01");
  });
});
