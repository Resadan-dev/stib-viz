import { fr } from "../i18n/fr";
import { COVERAGE_RAMP } from "../theme/colors";

export interface CoverageGuide {
  open(): void;
  close(): void;
}

const TITLE_ID = "coverage-guide-title";

/** The departures each class stands for, and the rhythm they make, darkest class first. */
const SCALE: readonly (readonly [string, string])[] = [
  [fr.coverageBand0, fr.guideRhythm0],
  [fr.coverageBand1, fr.guideRhythm1],
  [fr.coverageBand2, fr.guideRhythm2],
  [fr.coverageBand3, fr.guideRhythm3],
  [fr.coverageBand4, fr.guideRhythm4],
];

function text<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  content: string,
  className = "",
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.textContent = content;
  if (className !== "") {
    node.className = className;
  }
  return node;
}

/** Terms and what they mean, as a definition list: each term reads as the start of its line. */
function terms(pairs: readonly (readonly [string, string])[]): HTMLDListElement {
  const list = document.createElement("dl");
  list.className = "guide__terms";
  for (const [term, meaning] of pairs) {
    list.append(text("dt", term), text("dd", meaning));
  }
  return list;
}

/**
 * The classes of the grid with the rhythm each one means. The colour of a row reaches the
 * stylesheet as a custom property, as the swatches of the legend do.
 */
function scale(): HTMLTableElement {
  const table = document.createElement("table");
  table.className = "guide__scale";
  const head = table.createTHead().insertRow();
  for (const label of [fr.guideScaleDepartures, fr.guideScaleRhythm]) {
    const cell = text("th", label);
    cell.scope = "col";
    head.append(cell);
  }
  const body = table.createTBody();
  SCALE.forEach(([band, rhythm], k) => {
    const row = body.insertRow();
    const [r, g, b] = COVERAGE_RAMP[k] ?? [0, 0, 0];
    row.style.setProperty("--swatch", `rgb(${String(r)}, ${String(g)}, ${String(b)})`);
    const name = text("th", band, "guide__band");
    name.scope = "row";
    row.append(name, text("td", rhythm));
  });
  return table;
}

function section(title: string, ...content: HTMLElement[]): HTMLElement {
  const part = document.createElement("section");
  part.className = "guide__section";
  part.append(text("h3", title), ...content);
  return part;
}

/**
 * The notice of the coverage view (docs/03-commune-coverage.md, D41): what is on the map, what
 * the figures measure, and what they leave out. A modal dialog, translucent so the grid it
 * explains stays in sight behind it. The sheet scrolls inside the dialog and the close button
 * sits over it, so the button stays in reach however far the notice is read. It closes from
 * that button, with Escape, or with a click beside it: the sheet fills the dialog, so a click
 * that reaches the dialog itself fell on the backdrop.
 */
export function createCoverageGuide(parent: HTMLElement): CoverageGuide {
  const dialog = document.createElement("dialog");
  dialog.className = "guide";
  dialog.setAttribute("aria-labelledby", TITLE_ID);
  const sheet = document.createElement("div");
  sheet.className = "guide__sheet";
  // The sheet scrolls and holds no control of its own: a tab stop lets a keyboard read past the
  // first screen, and the region gives that stop a name.
  sheet.tabIndex = 0;
  sheet.setAttribute("role", "region");
  sheet.setAttribute("aria-labelledby", TITLE_ID);
  const close = document.createElement("button");
  close.type = "button";
  close.className = "vehicle__close guide__close";
  close.setAttribute("aria-label", fr.close);
  close.textContent = "×";
  const title = text("h2", fr.guideTitle, "guide__title");
  title.id = TITLE_ID;

  sheet.append(
    title,
    text("p", fr.guideLead, "guide__lead"),
    section(
      fr.guideSeenTitle,
      text("p", fr.guideSeenIntro),
      scale(),
      terms([
        [fr.guideSeenEmptyTerm, fr.guideSeenEmpty],
        [fr.guideSeenBordersTerm, fr.guideSeenBorders],
        [fr.guideSeenHourTerm, fr.guideSeenHour],
        [fr.guideSeenTooltipTerm, fr.guideSeenTooltip],
      ]),
    ),
    section(
      fr.guideShowsTitle,
      terms([
        [fr.guideShowsDepartureTerm, fr.guideShowsDeparture],
        [fr.guideShowsReachTerm, fr.guideShowsReach],
        [fr.guideShowsBestTerm, fr.guideShowsBest],
        [fr.guideShowsWellServedTerm, fr.guideShowsWellServed],
        [fr.guideShowsCommunesTerm, fr.guideShowsCommunes],
      ]),
    ),
    section(
      fr.guideLimitsTitle,
      terms([
        [fr.guideLimitsOthersTerm, fr.guideLimitsOthers],
        [fr.guideLimitsWhereTerm, fr.guideLimitsWhere],
        [fr.guideLimitsPathTerm, fr.guideLimitsPath],
        [fr.guideLimitsTimetableTerm, fr.guideLimitsTimetable],
        [fr.guideLimitsResidentsTerm, fr.guideLimitsResidents],
        [fr.guideLimitsThresholdTerm, fr.guideLimitsThreshold],
      ]),
    ),
  );
  dialog.append(close, sheet);
  parent.append(dialog);

  const open = (): void => {
    dialog.showModal();
  };
  const shut = (): void => {
    dialog.close();
  };
  close.addEventListener("click", shut);
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      shut();
    }
  });
  return { open, close: shut };
}
