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
  close: "Fermer",
  towards: "Direction",
  nextStop: "Prochain arrêt :",
  terminus: "Terminus atteint",
  layoverUntil: "En attente au terminus, départ à",
  offDuty: "Hors service à cet instant",
  vehicleBlock: "Véhicule",
  scrubberLabel: "Instant de la journée",
  about: "À propos",
  aboutTitle: "À propos de cette carte",
  aboutMethod:
    "Chaque véhicule suit l’horaire théorique de la STIB, à vitesse constante entre deux arrêts le long du tracé officiel. La journée court de 4 h à 4 h le lendemain, Noctis compris. Rien n’est mesuré en temps réel.",
  aboutData: "Données",
  aboutFeed: "Version du flux GTFS :",
  aboutLicence: "Licence CC BY 4.0.",
  aboutBasemap: "Fond de carte OpenFreeMap © OpenMapTiles, données © contributeurs OpenStreetMap.",
  aboutColours: "Couleurs",
  sharedColoursNote:
    "Par défaut, un blanc chaud pour le métro, un bleu pour les bus, un violet pour les Noctis et la couleur officielle pour les trams. Les couleurs officielles de la STIB sont partagées entre plusieurs lignes : deux lignes sans rapport peuvent se ressembler.",
  shortcutsTitle: "Raccourcis clavier",
  keySpace: "Espace",
  keySpaceMeaning: "lecture ou pause",
  keyArrows: "← →",
  keyArrowsMeaning: "une minute, dix avec Maj",
  keyDigits: "1 à 4",
  keyDigitsMeaning: "vitesse ×60, ×120, ×300, ×600",
  keyEscape: "Échap",
  keyEscapeMeaning: "fermer la sélection",
  aboutSource: "Code source sur GitHub",
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
