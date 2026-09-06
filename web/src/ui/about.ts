import { fr } from "../i18n/fr";

export interface AboutInfo {
  feedVersion: string;
  attribution: string;
  repositoryUrl: string;
}

export interface About {
  open(): void;
  close(): void;
}

function paragraph(text: string, className = ""): HTMLParagraphElement {
  const p = document.createElement("p");
  p.textContent = text;
  if (className !== "") {
    p.className = className;
  }
  return p;
}

function heading(text: string): HTMLHeadingElement {
  const h = document.createElement("h3");
  h.textContent = text;
  return h;
}

function shortcut(keys: string, meaning: string): [HTMLElement, HTMLElement] {
  const dt = document.createElement("dt");
  dt.textContent = keys;
  const dd = document.createElement("dd");
  dd.textContent = meaning;
  return [dt, dd];
}

/** The about dialog: method, data credits, colour note, keyboard shortcuts, source code link. */
export function createAbout(parent: HTMLElement, info: AboutInfo): About {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "toggle about__button";
  button.textContent = fr.about;

  const dialog = document.createElement("dialog");
  dialog.className = "about";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "vehicle__close about__close";
  close.setAttribute("aria-label", fr.close);
  close.textContent = "×";
  const title = document.createElement("h2");
  title.textContent = fr.aboutTitle;

  const shortcuts = document.createElement("dl");
  shortcuts.className = "about__shortcuts";
  shortcuts.append(
    ...shortcut(fr.keySpace, fr.keySpaceMeaning),
    ...shortcut(fr.keyArrows, fr.keyArrowsMeaning),
    ...shortcut(fr.keyDigits, fr.keyDigitsMeaning),
    ...shortcut(fr.keyEscape, fr.keyEscapeMeaning),
  );

  const licence = document.createElement("a");
  licence.href = "https://creativecommons.org/licenses/by/4.0/deed.fr";
  licence.target = "_blank";
  licence.rel = "noopener";
  licence.textContent = fr.aboutLicence;
  const data = paragraph(`${info.attribution}. `);
  data.append(licence);

  const source = document.createElement("a");
  source.href = info.repositoryUrl;
  source.target = "_blank";
  source.rel = "noopener";
  source.textContent = fr.aboutSource;
  const sourceLine = document.createElement("p");
  sourceLine.append(source);

  dialog.append(
    close,
    title,
    paragraph(fr.aboutMethod),
    heading(fr.aboutData),
    data,
    paragraph(`${fr.aboutFeed} ${info.feedVersion}`),
    paragraph(fr.aboutBasemap),
    heading(fr.aboutColours),
    paragraph(fr.sharedColoursNote),
    heading(fr.aboutSpeeds),
    paragraph(fr.speedsNote),
    heading(fr.shortcutsTitle),
    shortcuts,
    sourceLine,
  );
  parent.append(button, dialog);

  const open = (): void => {
    dialog.showModal();
  };
  const shut = (): void => {
    dialog.close();
  };
  button.addEventListener("click", open);
  close.addEventListener("click", shut);
  return { open, close: shut };
}
