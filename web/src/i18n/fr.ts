/**
 * French user interface copy.
 *
 * The site targets a Brussels audience, so its interface is in French while the rest of the
 * repository is in English. Keeping every string here is what makes adding Dutch and English
 * a matter of new files rather than a hunt through the code (SCOPE.md, section 6).
 */
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
} as const;

export type MessageKey = keyof typeof fr;
