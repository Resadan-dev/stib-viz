import { MODES, type Mode, type RouteInfo } from "../data/contract";
import { fr, modeLabel } from "../i18n/fr";
import { badgeInk } from "../theme/colors";

export interface LinePicker {
  /** Where the vehicle stepper mounts: under the badges, above the footer. */
  vehicles: HTMLElement;
  /** Reflects the selected line, or null when every line is shown alike; reports nothing. */
  update(line: string | null): void;
  open(): void;
  close(): void;
  isOpen(): boolean;
}

type Badge = Pick<RouteInfo, "name" | "color" | "text_color">;

const naturally = new Intl.Collator("fr", { numeric: true });

/** Sort key of a line: Noctis after the others, then the number, "7" before "T7". */
function orderKey(route: RouteInfo): [number, number] {
  const digits = /\d+/.exec(route.name)?.[0];
  const number = digits === undefined ? Number.MAX_SAFE_INTEGER : Number(digits);
  return [route.mode === "noctis" ? 1 : 0, number];
}

/** One route per public name, in the order the STIB site lists its lines. */
export function sortLines(routes: readonly RouteInfo[]): RouteInfo[] {
  const seen = new Set<string>();
  const unique = routes.filter((route) => {
    if (seen.has(route.name)) {
      return false;
    }
    seen.add(route.name);
    return true;
  });
  return unique.sort((a, b) => {
    const [groupA, numberA] = orderKey(a);
    const [groupB, numberB] = orderKey(b);
    if (groupA !== groupB) {
      return groupA - groupB;
    }
    if (numberA !== numberB) {
      return numberA - numberB;
    }
    return naturally.compare(a.name, b.name);
  });
}

function paint(element: HTMLElement, route: Badge): void {
  element.textContent = route.name;
  element.style.backgroundColor = `#${route.color}`;
  element.style.color = `#${badgeInk(route)}`;
}

function button(className: string, text: string): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.className = className;
  element.textContent = text;
  return element;
}

/**
 * The line picker (SCOPE.md, section 4.4): a trigger in the control panel that shows the
 * selected line as a badge, and a translucent dialog in the bottom right corner of the map with
 * every line of the day as a badge in its official colours, one tab per mode, the way the STIB
 * site presents its network. Choosing a line dims every other vehicle. The dialog is not modal:
 * it stays open while lines are compared, keeps the choice when closed, and a single button
 * brings every line back. The value is the public line name, "7" or "N06", never the GTFS id.
 */
export function createLinePicker(
  parent: HTMLElement,
  host: HTMLElement,
  routes: readonly RouteInfo[],
  onSelect: (line: string | null) => void,
): LinePicker {
  const lines = sortLines(routes);
  const byName = new Map(lines.map((route) => [route.name, route]));
  const modes = MODES.filter((mode) => lines.some((route) => route.mode === mode));

  const group = document.createElement("div");
  group.className = "lines";
  const label = document.createElement("span");
  label.className = "lines__label";
  label.textContent = fr.lineLabel;
  const trigger = button("lines__trigger", fr.chooseLine);
  trigger.setAttribute("aria-haspopup", "dialog");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-controls", "line-picker");
  const clear = button("lines__clear", fr.allLines);
  clear.hidden = true;
  group.append(label, trigger, clear);
  parent.append(group);

  const section = document.createElement("section");
  section.id = "line-picker";
  section.className = "picker";
  section.setAttribute("role", "dialog");
  section.setAttribute("aria-labelledby", "line-picker-title");
  section.hidden = true;
  const header = document.createElement("div");
  header.className = "picker__header";
  const title = document.createElement("h2");
  title.id = "line-picker-title";
  title.className = "picker__title";
  title.textContent = fr.chooseLine;
  const close = button("vehicle__close picker__close", "×");
  close.setAttribute("aria-label", fr.close);
  header.append(title, close);

  const tabs = document.createElement("div");
  tabs.className = "picker__tabs";
  tabs.setAttribute("role", "group");
  tabs.setAttribute("aria-label", fr.pickerModes);
  const tabButtons: { mode: Mode | null; element: HTMLButtonElement }[] = [];
  for (const mode of [null, ...modes]) {
    const element = button("picker__tab", mode === null ? fr.pickerAll : modeLabel(mode));
    element.setAttribute("aria-pressed", mode === null ? "true" : "false");
    element.addEventListener("click", () => {
      showMode(mode);
    });
    tabs.append(element);
    tabButtons.push({ mode, element });
  }

  const grid = document.createElement("div");
  grid.className = "picker__grid";
  grid.setAttribute("role", "group");
  grid.setAttribute("aria-label", fr.pickerLines);
  const lineButtons = new Map<string, HTMLButtonElement>();
  for (const route of lines) {
    const element = button("picker__line", route.name);
    element.dataset.mode = route.mode;
    element.title = route.long_name;
    element.setAttribute("aria-pressed", "false");
    paint(element, route);
    element.addEventListener("click", () => {
      onSelect(route.name);
    });
    grid.append(element);
    lineButtons.set(route.name, element);
  }

  // The stepper for the chosen line mounts here: the picker holds everything about one line.
  const vehicles = document.createElement("div");
  vehicles.className = "picker__vehicles";

  const footer = document.createElement("div");
  footer.className = "picker__footer";
  const all = button("picker__all", fr.allLines);
  all.addEventListener("click", () => {
    onSelect(null);
  });
  footer.append(all);
  section.append(header, tabs, grid, vehicles, footer);
  host.append(section);

  let selected: string | null = null;

  function showMode(mode: Mode | null): void {
    for (const tab of tabButtons) {
      tab.element.setAttribute("aria-pressed", tab.mode === mode ? "true" : "false");
    }
    for (const [name, element] of lineButtons) {
      element.hidden = mode !== null && byName.get(name)?.mode !== mode;
    }
  }

  function open(): void {
    section.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    const current = selected === null ? undefined : lineButtons.get(selected);
    const first = [...lineButtons.values()].find((element) => !element.hidden);
    (current ?? first ?? close).focus();
  }

  function shut(): void {
    if (section.hidden) {
      return;
    }
    section.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    trigger.focus();
  }

  trigger.addEventListener("click", () => {
    if (section.hidden) {
      open();
    } else {
      shut();
    }
  });
  close.addEventListener("click", shut);
  clear.addEventListener("click", () => {
    onSelect(null);
  });
  section.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      // Closing the picker is the whole meaning of this Escape: the page handler must not also
      // drop the selected vehicle.
      event.stopPropagation();
      shut();
    }
  });

  function reflect(line: string | null): void {
    selected = line;
    for (const [name, element] of lineButtons) {
      element.setAttribute("aria-pressed", name === line ? "true" : "false");
    }
    clear.hidden = line === null;
    if (line === null) {
      trigger.replaceChildren(document.createTextNode(fr.chooseLine));
      trigger.removeAttribute("aria-label");
      return;
    }
    const badge = document.createElement("span");
    badge.className = "badge lines__badge";
    const route = byName.get(line);
    if (route === undefined) {
      // A line the day does not run, from a shared link: shown as it is, so it can be cleared.
      badge.textContent = line;
    } else {
      paint(badge, route);
    }
    trigger.replaceChildren(badge);
    trigger.setAttribute("aria-label", `${fr.lineLabel} ${line}, ${fr.changeLine}`);
  }
  reflect(null);

  return {
    vehicles,
    update: reflect,
    open,
    close: shut,
    isOpen: () => !section.hidden,
  };
}
