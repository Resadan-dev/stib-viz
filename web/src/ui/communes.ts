/**
 * The 19 municipalities in the panel while the coverage view is on (docs/03-commune-coverage.md,
 * D36). For each: the shares of its residents by class at the displayed hour as one stacked bar,
 * very high first; the share well served; and the hours a day an average resident spends at that
 * level. The Region comes last, as the yardstick.
 *
 * Sorted by those hours, which belong to the day rather than to the hour, so the rows stay put
 * while the clock runs. The table is also the text version of the map, and pointing at a row, or
 * focusing it, outlines the municipality there.
 */

import {
  COVERAGE_CLASSES,
  amplitudeHours,
  classShares,
  wellServedShare,
  type AreaFigures,
  type Coverage,
} from "../data/coverage";
import { fr } from "../i18n/fr";
import { COVERAGE_RAMP } from "../theme/colors";

export interface CommuneTable {
  update(coverage: Coverage | null, index: number, visible: boolean): void;
}

interface Row {
  area: AreaFigures;
  bar: HTMLElement;
  segments: HTMLElement[];
  share: HTMLElement;
}

const CLASS_NAMES: readonly string[] = [
  fr.coverageClass0,
  fr.coverageClass1,
  fr.coverageClass2,
  fr.coverageClass3,
  fr.coverageClass4,
];
const PERCENT = new Intl.NumberFormat("fr-BE", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const HOURS = new Intl.NumberFormat("fr-BE", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function cell(tag: "th" | "td", className: string, text = ""): HTMLTableCellElement {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

/** The order of the rows: the most hours at the "high" level first, ties in file order. */
function byHours(areas: readonly AreaFigures[]): number[] {
  return areas
    .map((_, i) => i)
    .sort((a, b) => {
      const first = areas[a];
      const second = areas[b];
      const gap =
        (second === undefined ? 0 : amplitudeHours(second)) -
        (first === undefined ? 0 : amplitudeHours(first));
      return gap !== 0 ? gap : a - b;
    });
}

export function createCommuneTable(
  parent: HTMLElement,
  onPoint: (municipality: number | null) => void,
): CommuneTable {
  const section = document.createElement("section");
  section.className = "communes";
  section.hidden = true;
  section.setAttribute("aria-labelledby", "communes-title");
  const title = document.createElement("h2");
  title.id = "communes-title";
  title.className = "communes__title";
  title.textContent = fr.communesTitle;
  const note = document.createElement("p");
  note.className = "communes__note";
  note.textContent = fr.communesNote;
  const table = document.createElement("table");
  table.className = "communes__table";
  const headRow = document.createElement("tr");
  const barHeader = cell("th", "communes__bar-head");
  barHeader.setAttribute("aria-label", fr.legendCoverage);
  headRow.append(
    cell("th", "communes__name", fr.communesName),
    barHeader,
    cell("th", "communes__number", fr.communesShare),
    cell("th", "communes__number", fr.communesHours),
  );
  for (const header of headRow.children) {
    header.setAttribute("scope", "col");
  }
  const head = document.createElement("thead");
  head.append(headRow);
  const body = document.createElement("tbody");
  table.append(head, body);
  section.append(title, note, table);
  parent.append(section);

  let rows: Row[] = [];
  let built: Coverage | null = null;
  let filled = -1;

  function row(area: AreaFigures, name: string, municipality: number | null): Row {
    const tr = document.createElement("tr");
    const nameCell = cell("th", "communes__name", name);
    nameCell.setAttribute("scope", "row");
    const bar = document.createElement("div");
    bar.className = "communes__bar";
    bar.setAttribute("role", "img");
    // Very high first, on the left, where the eye starts reading the share well served.
    const segments = Array.from({ length: COVERAGE_CLASSES }, (_, k) => {
      const [r, g, b] = COVERAGE_RAMP[COVERAGE_CLASSES - 1 - k] ?? [0, 0, 0];
      const segment = document.createElement("span");
      segment.className = "communes__segment";
      segment.style.setProperty("--swatch", `rgb(${String(r)}, ${String(g)}, ${String(b)})`);
      return segment;
    });
    bar.append(...segments);
    const barCell = cell("td", "communes__bar-cell");
    barCell.append(bar);
    const share = cell("td", "communes__number");
    const hours = cell("td", "communes__number", `${HOURS.format(amplitudeHours(area))} h`);
    tr.append(nameCell, barCell, share, hours);
    if (municipality === null) {
      tr.className = "communes__region";
    } else {
      tr.tabIndex = 0;
      const point = (): void => {
        onPoint(municipality);
      };
      const leave = (): void => {
        onPoint(null);
      };
      tr.addEventListener("pointerenter", point);
      tr.addEventListener("pointerleave", leave);
      tr.addEventListener("focus", point);
      tr.addEventListener("blur", leave);
    }
    body.append(tr);
    return { area, bar, segments, share };
  }

  function build(coverage: Coverage): void {
    body.replaceChildren();
    const areas = coverage.figures.municipalities;
    rows = byHours(areas).flatMap((i) => {
      const area = areas[i];
      const name = coverage.municipalities.list[i]?.name;
      return area === undefined || name === undefined ? [] : [row(area, name, i)];
    });
    rows.push(row(coverage.figures.region, fr.communesRegion, null));
  }

  function fill(index: number): void {
    for (const { area, bar, segments, share } of rows) {
      const shares = classShares(area, index);
      const described: string[] = [];
      segments.forEach((segment, k) => {
        const klass = COVERAGE_CLASSES - 1 - k;
        const value = shares[klass] ?? 0;
        segment.hidden = value <= 0;
        segment.style.flexGrow = String(value);
        if (value > 0) {
          described.push(`${CLASS_NAMES[klass] ?? ""} ${PERCENT.format(value)}`);
        }
      });
      bar.setAttribute("aria-label", described.join(", "));
      share.textContent = PERCENT.format(wellServedShare(area, index));
    }
  }

  return {
    update(coverage, index, visible) {
      section.hidden = !visible || coverage === null;
      if (section.hidden || coverage === null) {
        return;
      }
      if (coverage !== built) {
        build(coverage);
        built = coverage;
        filled = -1;
      }
      if (index !== filled) {
        fill(index);
        filled = index;
      }
    },
  };
}
