/** Textes de l'interface en français : une seule source pour préparer d'autres langues (v2). */
export const fr = {
  appTitle: "Bruxelles en mouvement",
  appTagline: "Les métros, trams et bus de la STIB, minute après minute.",
  m0Status: "Jalon M0 : socle du projet. Les véhicules arrivent au jalon M2.",
  attribution: "Source: STIB-MIVB – Open Data",
} as const;

export type MessageKey = keyof typeof fr;
