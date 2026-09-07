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
  reset: "Réinitialiser",
  resetHint: "Réinitialiser : revenir à 4 h du matin, au début de la journée de service",
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
  daysLabel: "Journées disponibles",
  officialColours: "Couleurs officielles des lignes",
  networkLabel: "Réseau",
  networkRuns: "Passages",
  networkSpeed: "Vitesse",
  networkDeviation: "Écart à l’habitude",
  legendSpeed: "Vitesse à cette heure, en km/h",
  legendDeviation: "Écart à la vitesse habituelle du tronçon",
  legendUsual: "habituel",
  lineLabel: "Ligne",
  allLines: "Toutes les lignes",
  showAllLines: "Réafficher toutes les lignes",
  chooseLine: "Choisir une ligne",
  changeLine: "changer de ligne",
  pickerModes: "Filtrer par mode",
  pickerAll: "Tous",
  pickerLines: "Lignes",
  stepperLabel: "Véhicules de la ligne {line}",
  previousVehicle: "Véhicule précédent",
  nextVehicle: "Véhicule suivant",
  previous: "Précédent",
  next: "Suivant",
  noVehicleRunning: "Aucun véhicule en service",
  oneVehicleRunning: "1 véhicule en service",
  vehiclesRunning: "{total} véhicules en service",
  vehicleRank: "Véhicule {position} sur {total}",
  follow: "Suivre",
  close: "Fermer",
  towards: "Direction",
  nextStop: "Prochain arrêt :",
  terminus: "Terminus atteint",
  layoverUntil: "En attente au terminus, départ à",
  offDuty: "Hors service à cet instant",
  vehicleBlock: "Véhicule",
  scrubberLabel: "Instant de la journée",
  expandPanel: "Afficher tout le panneau",
  collapsePanel: "Réduire le panneau",
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
  aboutSpeeds: "Vitesses",
  speedsNote:
    "Le réseau se lit de trois façons. « Passages » l’éclaire selon le nombre de courses de la journée. « Vitesse » colore chaque tronçon d’arrêt à arrêt selon la vitesse de l’horaire théorique à l’heure affichée : la distance divisée par le temps prévu, sur toutes les courses de cette heure-là. « Écart à l’habitude » rapporte cette vitesse à celle du même tronçon sur la journée entière.",
  speedsNoteWhy:
    "Les deux dernières ne répondent pas à la même question. La vitesse absolue dépend surtout de l’espacement des arrêts, pas de la circulation : un bus qui s’arrête tous les 300 mètres reste lent à 2 h du matin, et la carte change donc peu d’une heure à l’autre. L’écart divise cette part géographique et ne laisse que l’heure : la ville bleuit aux deux pointes et se réchauffe la nuit.",
  speedsNoteGrey:
    "Les horaires sont donnés à la minute, alors une heure desservie moins de trois fois ne dit rien de fiable : sa fenêtre s’élargit d’une heure puis de deux à la recherche de courses, et reste grise si elle n’en trouve pas assez. Un tronçon gris n’est donc pas lent, il est muet.",
  shortcutsTitle: "Raccourcis clavier",
  keySpace: "Espace",
  keySpaceMeaning: "lecture ou pause",
  keyArrows: "← →",
  keyArrowsMeaning: "une minute, dix avec Maj",
  keyDigits: "1 à 5",
  keyDigitsMeaning: "vitesse ×60, ×120, ×300, ×600, ×1200",
  keyEscape: "Échap",
  keyEscapeMeaning: "fermer le sélecteur de ligne, le panneau, puis la sélection",
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

/** Title of the vehicle stepper, naming the line it walks through. */
export function stepperLabel(line: string): string {
  return fr.stepperLabel.replace("{line}", line);
}

/** How many vehicles of the line are running, worded for none, one and many. */
export function vehicleTally(total: number): string {
  if (total <= 0) {
    return fr.noVehicleRunning;
  }
  return total === 1 ? fr.oneVehicleRunning : fr.vehiclesRunning.replace("{total}", String(total));
}

/** Which of them is selected, said in full rather than as a fraction. */
export function vehicleRank(position: number, total: number): string {
  return fr.vehicleRank.replace("{position}", String(position)).replace("{total}", String(total));
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
