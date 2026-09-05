import type { DayIndex, DayIndexEntry } from "./contract";

/**
 * Chooses the day to show: the requested one when the index lists it, else today, else the
 * nearest listed day, the later one on a tie (ARCHITECTURE.md, section 6.1).
 */
export function chooseDay(
  index: DayIndex,
  requested: string | undefined,
  today: string,
): DayIndexEntry | undefined {
  const { days } = index;
  if (requested !== undefined) {
    const match = days.find((day) => day.date === requested);
    if (match !== undefined) {
      return match;
    }
  }
  const todayEntry = days.find((day) => day.date === today);
  if (todayEntry !== undefined) {
    return todayEntry;
  }
  const target = Date.parse(today);
  let best: DayIndexEntry | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const day of days) {
    const distance = Math.abs(Date.parse(day.date) - target);
    const closer = distance < bestDistance;
    const laterOnTie = distance === bestDistance && best !== undefined && day.date > best.date;
    if (closer || laterOnTie) {
      best = day;
      bestDistance = distance;
    }
  }
  return best ?? days[0];
}
