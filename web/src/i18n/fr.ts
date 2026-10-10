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
  networkCoverage: "Desserte",
  legendCoverage: "Départs par sens à portée de marche, dans l’heure",
  coverageBand0: "aucun",
  coverageBand1: "moins de 4",
  coverageBand2: "4 à 10",
  coverageBand3: "11 à 20",
  coverageBand4: "plus de 20",
  legendFew: "peu ou pas d’habitants",
  legendBorder: "limite de commune",
  coverageClass0: "Desserte nulle",
  coverageClass1: "Desserte faible",
  coverageClass2: "Desserte moyenne",
  coverageClass3: "Desserte élevée",
  coverageClass4: "Desserte très élevée",
  coverageFew: "Peu ou pas d’habitants",
  coverageAtLeast: "au moins",
  coverageDepartureOne: "départ par sens à portée dans l’heure",
  coverageDepartureMany: "départs par sens à portée dans l’heure",
  coverageLoading: "Chargement de la desserte…",
  coverageUnavailable: "La desserte des habitants n’a pas pu être chargée.",
  communesTitle: "Les 19 communes",
  communesNote:
    "Part des habitants avec plus de 10 départs par sens à portée à l’heure affichée, et heures par jour à ce niveau.",
  communesName: "Commune",
  communesShare: "Bien desservis",
  communesHours: "Heures",
  communesRegion: "Région",
  guideOpen: "Comment lire cette carte",
  guideTitle: "Comment lire la desserte",
  guideLead:
    "Cette vue répond à une question : depuis chez soi, à pied, combien de départs STIB a-t-on à sa portée, à l’heure affichée ?",
  guideSeenTitle: "Ce que vous voyez",
  guideSeenIntro:
    "Chaque carré de 50 mètres où vivent des habitants prend la couleur des départs à sa portée dans l’heure. Plus le vert est clair, plus ils sont nombreux.",
  guideScaleDepartures: "Départs par sens dans l’heure",
  guideScaleRhythm: "Rythme",
  guideRhythm0: "aucun départ",
  guideRhythm1: "moins d’un départ par quart d’heure",
  guideRhythm2: "un départ toutes les 6 à 15 minutes",
  guideRhythm3: "un départ toutes les 3 à 6 minutes",
  guideRhythm4: "plus d’un départ toutes les 3 minutes",
  guideSeenEmptyTerm: "Le noir",
  guideSeenEmpty:
    "Pas d’habitants, ou presque : bois, parcs, cimetières, voies ferrées, zones d’activité. Ce n’est pas un trou dans le réseau. Au-delà de la Région, rien n’est calculé.",
  guideSeenBordersTerm: "Les traits clairs",
  guideSeenBorders: "Les limites des 19 communes, avec le nom de chacune en son milieu.",
  guideSeenHourTerm: "L’heure",
  guideSeenHour:
    "La carte montre l’heure pleine qui contient l’heure affichée, et change quand l’horloge passe à la suivante.",
  guideSeenTooltipTerm: "La bulle",
  guideSeenTooltip:
    "Au survol d’un carré, elle donne sa commune, son nombre exact de départs et sa classe.",
  guideShowsTitle: "Ce que la carte montre",
  guideShowsDepartureTerm: "Un départ",
  guideShowsDeparture:
    "Un métro, un tram ou un bus, Noctis compris, qui quitte un arrêt. Pour chaque ligne, seul le sens le plus fréquent compte : on ne voyage que dans un sens à la fois.",
  guideShowsReachTerm: "À portée",
  guideShowsReach:
    "À moins de 400 mètres d’un arrêt de bus ou de tram, ou de 800 mètres d’une station de métro, à vol d’oiseau. Avec les détours, cela fait environ 500 mètres et un kilomètre à pied.",
  guideShowsBestTerm: "Le meilleur arrêt",
  guideShowsBest:
    "Quand plusieurs arrêts sont à portée, seuls comptent le mieux desservi en surface et le mieux desservi en métro, additionnés. Une ligne qui passe à trois arrêts voisins ne compte donc qu’une fois.",
  guideShowsWellServedTerm: "Bien desservi",
  guideShowsWellServed:
    "Plus de 10 départs par sens dans l’heure, soit moins de 6 minutes entre deux départs.",
  guideShowsCommunesTerm: "Le tableau",
  guideShowsCommunes:
    "Pour chaque commune, la part de ses habitants bien desservis à l’heure affichée, et le nombre d’heures par jour où un habitant l’est, en moyenne. Chaque habitant compte pour un, quelle que soit la surface de son quartier.",
  guideLimitsTitle: "Ce qu’elle ne montre pas",
  guideLimitsOthersTerm: "Les autres transports",
  guideLimitsOthers:
    "Ni les trains SNCB, ni les bus De Lijn et TEC. Près des gares, à Watermael-Boitsfort, Uccle, Haren ou Evere, on est mieux desservi que la carte ne le dit.",
  guideLimitsWhereTerm: "Où mènent les départs",
  guideLimitsWhere:
    "Ni en combien de temps. Dix départs d’une même ligne pèsent autant que dix départs de dix lignes, qui desservent pourtant bien plus d’endroits. Un bus et un métro comptent chacun pour un départ, quelle que soit leur capacité.",
  guideLimitsPathTerm: "Le chemin réel",
  guideLimitsPath:
    "La distance est prise à vol d’oiseau, avec un détour moyen. Un canal, une voie ferrée ou le ring à contourner, une pente, un escalier ou un arrêt inaccessible en fauteuil n’y sont pas.",
  guideLimitsTimetableTerm: "Les aléas",
  guideLimitsTimetable:
    "Les départs sont ceux de l’horaire prévu, sans retards, travaux ni suppressions.",
  guideLimitsResidentsTerm: "Qui vit où, au mètre près",
  guideLimitsResidents:
    "Les habitants de chaque secteur statistique sont répartis également sur ses carrés. Les emplois, les écoles et les visiteurs ne sont pas comptés.",
  guideLimitsThresholdTerm: "Une norme officielle",
  guideLimitsThreshold:
    "Le seuil de 10 départs s’inspire des classes de la Commission européenne, comptées ici par sens. Ce n’est pas un objectif de la STIB.",
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
    "Par défaut, une couleur par mode : un blanc chaud pour le métro, un jaune doré pour les trams, un bleu pour les bus, un violet pour les Noctis. Avec les couleurs officielles, chaque ligne prend la sienne ; la STIB les partage entre plusieurs lignes, et deux lignes sans rapport peuvent se ressembler.",
  aboutSpeeds: "Vitesses",
  speedsNote:
    "Le réseau se lit de quatre façons ; la dernière, « Desserte », est décrite plus bas. « Passages » l’éclaire selon le nombre de courses de la journée. « Vitesse » colore chaque tronçon d’arrêt à arrêt selon la vitesse de l’horaire théorique à l’heure affichée : la distance divisée par le temps prévu, sur toutes les courses de cette heure-là. « Écart à l’habitude » rapporte cette vitesse à celle du même tronçon sur la journée entière.",
  speedsNoteWhy:
    "Les deux dernières ne répondent pas à la même question. La vitesse absolue dépend surtout de l’espacement des arrêts, pas de la circulation : un bus qui s’arrête tous les 300 mètres reste lent à 2 h du matin, et la carte change donc peu d’une heure à l’autre. L’écart divise cette part géographique et ne laisse que l’heure : la ville bleuit aux deux pointes et se réchauffe la nuit.",
  speedsNoteGrey:
    "Les horaires sont donnés à la minute, alors une heure desservie moins de trois fois ne dit rien de fiable : sa fenêtre s’élargit d’une heure puis de deux à la recherche de courses, et reste grise si elle n’en trouve pas assez. Un tronçon gris n’est donc pas lent, il est muet.",
  aboutCoverage: "Desserte",
  aboutCoverageGuide:
    "Sa légende ouvre une notice complète : ce que la carte montre, et ce qu’elle ne montre pas.",
  aboutResidents:
    "Habitants : Source : Statbel, secteurs statistiques et population par secteur, données modifiées.",
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
