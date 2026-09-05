import type { DayIndexEntry } from "../data/contract";
import { dayKindLabel, fr } from "../i18n/fr";

export interface DaySelector {
  update(day: string): void;
}

const CHIP = new Intl.DateTimeFormat("fr-BE", { weekday: "short", day: "numeric" });
const FULL = new Intl.DateTimeFormat("fr-BE", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

function noon(date: string): Date {
  return new Date(`${date}T12:00:00`);
}

/** "mer. 9": the short weekday and the day of the month. */
export function dayChipLabel(date: string): string {
  return CHIP.format(noon(date));
}

/** One pressed-state button per published day (SCOPE.md, section 4.4). */
export function createDaySelector(
  parent: HTMLElement,
  days: readonly DayIndexEntry[],
  onSelect: (date: string) => void,
): DaySelector {
  const group = document.createElement("div");
  group.className = "days";
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", fr.daysLabel);
  const buttons = new Map<string, HTMLButtonElement>();
  let current = "";
  for (const day of days) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `days__day days__day--${day.kind}`;
    button.textContent = dayChipLabel(day.date);
    button.title = `${FULL.format(noon(day.date))}, ${dayKindLabel(day.kind)}`;
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => {
      if (day.date !== current) {
        onSelect(day.date);
      }
    });
    buttons.set(day.date, button);
    group.append(button);
  }
  parent.append(group);
  return {
    update(day) {
      current = day;
      for (const [date, button] of buttons) {
        button.setAttribute("aria-pressed", date === day ? "true" : "false");
      }
    },
  };
}
