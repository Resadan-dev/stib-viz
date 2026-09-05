import { MODES, type RouteInfo } from "../data/contract";
import { fr, modeLabel } from "../i18n/fr";

export interface LineSelect {
  update(line: string | null): void;
}

const naturally = new Intl.Collator("fr", { numeric: true });

/**
 * A select listing every route by mode, after an "all lines" option. Choosing a line dims every
 * other vehicle on the map (SCOPE.md, section 4.4). The value is the line name, the number
 * people know and share, not the GTFS route id, which STIB numbers differently.
 */
export function createLineSelect(
  parent: HTMLElement,
  routes: readonly RouteInfo[],
  onSelect: (line: string | null) => void,
): LineSelect {
  const label = document.createElement("label");
  label.className = "lines";
  const caption = document.createElement("span");
  caption.className = "lines__label";
  caption.textContent = fr.lineLabel;
  const select = document.createElement("select");
  select.className = "lines__select";
  const all = document.createElement("option");
  all.value = "";
  all.textContent = fr.allLines;
  select.append(all);
  for (const mode of MODES) {
    const ofMode = routes
      .filter((route) => route.mode === mode)
      .sort((a, b) => naturally.compare(a.name, b.name));
    if (ofMode.length === 0) {
      continue;
    }
    const group = document.createElement("optgroup");
    group.label = modeLabel(mode);
    for (const route of ofMode) {
      const option = document.createElement("option");
      option.value = route.name;
      option.textContent = route.name;
      group.append(option);
    }
    select.append(group);
  }
  select.addEventListener("change", () => {
    onSelect(select.value === "" ? null : select.value);
  });
  label.append(caption, select);
  parent.append(label);
  return {
    update(line) {
      select.value = line ?? "";
    },
  };
}
