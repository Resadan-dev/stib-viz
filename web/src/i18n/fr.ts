/**
 * French user interface copy.
 *
 * The site targets a Brussels audience, so its interface is in French while the rest of the
 * repository is in English. Keeping every string here is what makes adding Dutch and English
 * a matter of new files rather than a hunt through the code (SCOPE.md, section 6).
 */

import type { Mode } from "../data/contract";

export const fr = {
  appTitle: "Bruxelles en mouvement",
  appTagline: "Les métros, trams et bus de la STIB, minute après minute.",
  mapLabel: "Carte de Bruxelles",
  play: "Lecture",
  pause: "Pause",
  nextDay: "lendemain",
  loading: "Chargement de la journée…",
  waitingNextHour: "Chargement de l’heure suivante…",
  endOfDay: "Fin de la journée de service.",
  noDay: "Aucune journée disponible.",
  dataError: "Les données du jour sont indisponibles.",
  basemapUnavailable: "Fond de carte indisponible, le réseau reste affiché.",
  attribution: "Source: STIB-MIVB – Open Data",
  speedLabel: "Vitesse de lecture",
  filtersLabel: "Modes affichés",
  countersLabel: "Compteurs du moment",
  countersVehicles: "En service",
  countersDepartures: "Départs",
  countersKm: "km",
  countersTotal: "Total",
  modeMetro: "Métro",
  modeTram: "Tram",
  modeBus: "Bus",
  modeNoctis: "Noctis",
  kindWeekday: "jour de semaine",
  kindSaturday: "samedi",
  kindSunday: "dimanche",
  officialColours: "Couleurs officielles des lignes",
  lineLabel: "Ligne",
  allLines: "Toutes les lignes",
} as const;

export type MessageKey = keyof typeof fr;

export function modeLabel(mode: Mode): string {
  switch (mode) {
    case "metro":
      return fr.modeMetro;
    case "tram":
      return fr.modeTram;
    case "bus":
      return fr.modeBus;
    case "noctis":
      return fr.modeNoctis;
  }
}

/** The day kind written by the pipeline: weekday, saturday or sunday. */
export function dayKindLabel(kind: string): string {
  if (kind === "saturday") {
    return fr.kindSaturday;
  }
  if (kind === "sunday") {
    return fr.kindSunday;
  }
  return fr.kindWeekday;
}
