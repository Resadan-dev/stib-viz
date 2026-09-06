import { fr } from "../i18n/fr";

/**
 * The control panel as a sheet, on a phone (SCOPE.md, section 4.5).
 *
 * Under the phone breakpoint the panel is a bar at the bottom of the screen with two positions.
 * Folded, it shows the clock, playback and the scrubber, and the map keeps the rest of the
 * screen; unfolded, it rises over part of the map and holds everything else. This module owns
 * the position; the stylesheet owns what each position looks like, and does nothing with it on
 * a wide screen, where the panel never folds.
 *
 * It opens folded on every load and remembers nothing between visits: the map is what the
 * visitor came for, and a sheet left open by a previous session would hide it.
 */

/**
 * Something that opens over the map and must never be stacked with the sheet. Written as
 * function properties rather than methods: these are callbacks, passed around on their own and
 * never bound to their object.
 */
export interface SheetDrawer {
  isOpen: () => boolean;
  close: () => void;
}

export interface Sheet {
  expand: () => void;
  collapse: () => void;
  isExpanded: () => boolean;
}

export interface SheetOptions {
  /** The control panel; its `data-sheet` attribute carries the position. */
  panel: HTMLElement;
  /** Where the chevron mounts: the playback row, beside the play button. */
  host: HTMLElement;
  /** The map. A tap on it folds the sheet, the way tapping outside a drawer closes it. */
  map: HTMLElement;
  /** The line picker, a sheet of its own on a phone: opening one folds the other. */
  picker: SheetDrawer;
  /**
   * The width that makes the panel a sheet at all. Narrowed to the media query the stylesheet
   * uses, so the two cannot disagree, and injectable for the tests.
   */
  phone?: SheetMedia;
}

/** As much of `MediaQueryList` as the sheet needs, so a test can answer for the screen. */
export interface SheetMedia {
  matches: boolean;
  addEventListener: (type: "change", listener: () => void) => void;
}

/** The phone breakpoint, kept in step with the one @media block of style.css. */
export const PHONE_QUERY = "(max-width: 600px)";

const SVG = "http://www.w3.org/2000/svg";

/** An upward chevron; the stylesheet turns it over once the sheet is open. */
function chevron(): SVGElement {
  const icon = document.createElementNS(SVG, "svg");
  icon.setAttribute("class", "sheet__chevron");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(SVG, "path");
  path.setAttribute("d", "M5 15l7-7 7 7");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "2");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  icon.append(path);
  return icon;
}

export function createSheet(options: SheetOptions): Sheet {
  const { panel, host, map, picker } = options;
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "sheet__toggle";
  toggle.setAttribute("aria-controls", panel.id);
  toggle.append(chevron());
  host.append(toggle);

  let expanded = false;

  function reflect(): void {
    panel.dataset.sheet = expanded ? "expanded" : "collapsed";
    toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    // The label names what the next press does, so the control is never a bare chevron.
    toggle.setAttribute("aria-label", expanded ? fr.collapsePanel : fr.expandPanel);
  }

  const sheet: Sheet = {
    expand() {
      if (picker.isOpen()) {
        picker.close();
      }
      expanded = true;
      reflect();
    },
    collapse() {
      expanded = false;
      reflect();
    },
    isExpanded: () => expanded,
  };

  toggle.addEventListener("click", () => {
    if (expanded) {
      sheet.collapse();
    } else {
      sheet.expand();
    }
  });
  // A window widened past the breakpoint is not a phone any more: the panel goes back to being
  // a panel, the chevron is not drawn, and an unfolded position left behind would swallow the
  // next Escape press for nothing.
  const phone = options.phone ?? window.matchMedia(PHONE_QUERY);
  phone.addEventListener("change", () => {
    if (!phone.matches) {
      sheet.collapse();
    }
  });
  map.addEventListener("click", () => {
    sheet.collapse();
  });
  reflect();
  return sheet;
}

/**
 * Escape closes the nearest thing first: the line picker, then the sheet, then the selected
 * vehicle (ARCHITECTURE.md, section 6.6). One press, one thing, so nothing goes unasked.
 */
export function closeTopmost(picker: SheetDrawer, sheet: Sheet, clearSelection: () => void): void {
  if (picker.isOpen()) {
    picker.close();
    return;
  }
  if (sheet.isExpanded()) {
    sheet.collapse();
    return;
  }
  clearSelection();
}
