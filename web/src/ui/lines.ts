import type { RouteInfo } from "../data/contract";
import { fr } from "../i18n/fr";

export interface LineField {
  update(line: string | null): void;
}

const naturally = new Intl.Collator("fr", { numeric: true });

/**
 * A text field for the line number, validated on submit, with every line offered as a native
 * suggestion while typing. Choosing a line dims every other vehicle (SCOPE.md, section 4.4).
 * The value is the public line name, "7" or "N06", never the GTFS route id.
 */
export function createLineField(
  parent: HTMLElement,
  routes: readonly RouteInfo[],
  onSelect: (line: string | null) => void,
): LineField {
  const names = [...new Set(routes.map((route) => route.name))].sort((a, b) =>
    naturally.compare(a, b),
  );
  const form = document.createElement("form");
  form.className = "lines";
  const label = document.createElement("label");
  label.className = "lines__label";
  label.htmlFor = "line-field";
  label.textContent = fr.lineLabel;
  const input = document.createElement("input");
  input.type = "text";
  input.id = "line-field";
  input.className = "lines__input";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.placeholder = fr.linePlaceholder;
  input.setAttribute("aria-invalid", "false");
  const list = document.createElement("datalist");
  list.id = "line-suggestions";
  for (const name of names) {
    const option = document.createElement("option");
    option.value = name;
    list.append(option);
  }
  input.setAttribute("list", list.id);
  const apply = document.createElement("button");
  apply.type = "submit";
  apply.className = "lines__apply";
  apply.textContent = fr.lineApply;
  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "lines__clear";
  clear.textContent = fr.allLines;
  clear.hidden = true;
  form.append(label, input, list, apply, clear);
  parent.append(form);

  let applied: string | null = null;
  function setValidity(message: string): void {
    input.setCustomValidity(message);
    input.setAttribute("aria-invalid", message === "" ? "false" : "true");
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const typed = input.value.trim().toUpperCase();
    if (typed === "") {
      setValidity("");
      applied = null;
      onSelect(null);
      return;
    }
    const name = names.find((candidate) => candidate.toUpperCase() === typed);
    if (name === undefined) {
      setValidity(fr.unknownLine);
      input.reportValidity();
      return;
    }
    setValidity("");
    applied = name;
    input.value = name;
    onSelect(name);
  });
  input.addEventListener("input", () => {
    setValidity("");
  });
  clear.addEventListener("click", () => {
    setValidity("");
    applied = null;
    input.value = "";
    onSelect(null);
  });

  return {
    update(line) {
      clear.hidden = line === null;
      if (line === applied) {
        return;
      }
      applied = line;
      input.value = line ?? "";
    },
  };
}
