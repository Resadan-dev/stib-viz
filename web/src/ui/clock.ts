import { fr } from "../i18n/fr";
import { civilTime, formatClock } from "../time/clock";

export interface ClockView {
  update(time: number): void;
}

/** Civil time in `HH:MM`, with a tag once the clock has crossed into the next calendar day. */
export function createClockView(parent: HTMLElement): ClockView {
  const root = document.createElement("div");
  root.className = "clock";
  const time = document.createElement("time");
  time.className = "clock__time";
  const nextDay = document.createElement("span");
  nextDay.className = "clock__next-day";
  nextDay.textContent = fr.nextDay;
  nextDay.hidden = true;
  root.append(time, nextDay);
  parent.append(root);

  let shownMinute = -1;
  return {
    update(instant) {
      const minute = Math.floor(instant / 60);
      if (minute === shownMinute) {
        return;
      }
      shownMinute = minute;
      const text = formatClock(instant);
      time.textContent = text;
      time.dateTime = text;
      nextDay.hidden = !civilTime(instant).nextDay;
    },
  };
}
