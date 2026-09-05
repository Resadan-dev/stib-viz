# stib-viz : périmètre de la version 1

Statut : périmètre figé le 5 septembre 2026, après une phase d'exploration
([docs/01-exploration.md](docs/01-exploration.md)) et dix questions de cadrage ; ajusté le même
jour après relecture d'architecture (vitesses, budgets, politique d'anomalies).
Le document technique associé est [ARCHITECTURE.md](ARCHITECTURE.md).

## 1. Vision

**Bruxelles en mouvement** : une carte nocturne de Bruxelles sur laquelle on regarde, minute après
minute, tous les métros, trams et bus de la STIB circuler selon l'horaire théorique d'une journée
de service. Un site statique, sans compte, sans clé, sans serveur, reconstruit chaque nuit à partir
des données ouvertes.

Le modèle est [france-rail-traffic](https://github.com/magrinj/france-rail-traffic). La version
bruxelloise s'en distingue par la densité urbaine, la présence de quatre modes dont un souterrain,
des véhicules qui enchaînent leurs courses, et une journée de service qui traverse minuit.

## 2. Décisions cadrantes

| Sujet | Décision | Pourquoi |
|---|---|---|
| Nature des données | Horaires théoriques du GTFS STIB, aucune donnée temps réel en v1 | Déterministe, aucune clé, aucun serveur ; le temps réel viendra par un enregistreur en v2 |
| Direction visuelle | Nocturne : fond très sombre, véhicules lumineux avec traînées | C'est le rythme de la ville que l'on veut montrer |
| Fenêtre publiée | Sept jours glissants : hier, aujourd'hui, les cinq jours suivants. Le premier jalon ne traite qu'une seule journée pour valider | Comme la référence ; la journée unique sert de banc d'essai |
| Axe du temps | Journée de service de 04:00 à 04:00 le lendemain, un ruban continu qui inclut les Noctis | Aucune couture à minuit ; le service STIB s'étend de 04:22 à 03:58 au plus tard |
| Trajectoires | Précalculées par le pipeline, tracés simplifiés, découpées par tranche horaire | Simple, éprouvé par la référence ; le navigateur reste léger |
| Unité animée | Le véhicule, obtenu en enchaînant les courses par `block_id` | Battement visible aux terminus, compteur exact de véhicules, base du « suivre un véhicule » en v2 |
| Fond de carte | OpenFreeMap, style sombre personnalisé, sans clé | Gratuit, sans quota ; alternative auto-hébergée documentée pour la v2 |
| Hébergement | Cloudflare Pages, déploiement par GitHub Actions | Statique, gratuit, comme la référence |
| Stack du site | Vite et TypeScript strict, sans framework d'interface | Petit, typé, testable |
| Stack du pipeline | Python 3.12 et uv | Déjà utilisé pour l'analyse de faisabilité |
| Qualité | Tests unitaires obligatoires, développement dirigé par les tests, couverture minimale 80 % | Développeur seul : les tests sont la seule relecture |
| Interactions v1 | Lecture, pause, vitesse, barre de défilement sur la courbe d'activité, filtres par mode, clic sur un véhicule, état partageable dans l'URL | Le reste est documenté pour la v2 |
| Langue | Français, textes centralisés pour ajouter néerlandais et anglais plus tard | Bruxelles est bilingue, mais la v1 reste petite |
| Cibles | Ordinateur d'abord ; le mobile fonctionne sans promesse de fluidité | Le rendu de 800 véhicules avec traînées est exigeant |

## 3. Chiffres de référence

Mesurés le 5 septembre 2026 sur le GTFS officiel (version `2_20_20260831_010702`, valable du
31 août au 27 septembre 2026). Ils dimensionnent le projet et servent de valeurs attendues pour
les contrôles du pipeline.

| Mesure | Mercredi 9 sept. | Samedi 12 sept. | Dimanche 13 sept. |
|---|---|---|---|
| Courses de la journée de service | 18 784 | 13 769 | 11 933 |
| Véhicules simultanés au pic | 776 à 17:03 | 479 | 357 |
| Véhicules distincts en service | 1 299 | | |
| Amplitude du service (premier départ, dernière arrivée) | 04:26 à 01:41 | 04:22 à 03:58 avec Noctis | 04:22 à 01:46 |
| Kilomètres parcourus | 164 000 | 117 000 | 101 000 |

Réseau : 89 lignes (4 métros, 18 trams, 67 bus dont 12 Noctis), 2 784 arrêts, 750 tracés.
Chaque véhicule enchaîne 13 courses en médiane avec 11 minutes de battement ; aucun chevauchement.

Poids des trajectoires d'un mercredi selon la tolérance de simplification des tracés, hors
recouvrement des tranches :

| Tolérance | Sommets | Poids brut | Par tranche horaire moyenne |
|---|---|---|---|
| Aucune (un sommet tous les 11 m) | 8,2 M | 99 Mo | 4,7 Mo |
| 2 m | 2,1 M | 25 Mo | 1,2 Mo |
| 5 m | 1,3 M | 15 Mo | 0,7 Mo |

La v1 part sur 2 m, ce qui ramène Bruxelles au volume de la référence française (2,3 M de sommets).
Le recouvrement des tranches ajoute environ 12 %, soit 28 Mo pour un mercredi.

## 4. Ce que fait la version 1

### 4.1 Données

- Source unique : le GTFS statique STIB publié sur le portail Belgian Mobility, téléchargé sans
  clé, licence CC BY 4.0.
- Sept journées de service disponibles : hier, aujourd'hui et les cinq jours suivants, dans la
  limite de la période de validité du flux.
- Quatre modes : métro, tram, bus, Noctis (lignes `N…`). La navette événementielle `NAV` est
  traitée comme un bus.
- Les courses d'un même véhicule (`block_id`) sont enchaînées ; le véhicule reste visible au
  terminus pendant son battement. Un déplacement à vide entre deux terminus distincts n'est pas
  dessiné : la trajectoire s'interrompt et reprend.
- Vitesse constante entre deux arrêts consécutifs, le long du tracé officiel simplifié à 2 m.
  Les temps d'arrêt sont ceux du GTFS (le plus souvent nuls).

### 4.2 Carte et rendu nocturne

- Fond OpenFreeMap sombre, personnalisé : voirie et eau à peine visibles, aucun point d'intérêt,
  toponymes rares et discrets.
- Couche « réseau » : tous les tracés, très sombres, dont l'intensité croît avec le nombre de
  passages quotidiens. Elle rend la carte lisible même si les tuiles de fond ne se chargent pas.
  Le métro y est rendu comme une couche souterraine, plus estompée.
- Véhicules : un point lumineux et une traînée dont la longueur encode le temps écoulé, donc la
  vitesse, sans aucun calcul. Couleurs : métro blanc chaud, trams dans leur couleur officielle
  (`route_color`), bus dans une teinte bleue froide unique, Noctis violet.
- Un véhicule à l'arrêt garde son point ; sa traînée s'éteint.

### 4.3 Temps

- Le ruban va de 04:00 à 04:00 le lendemain. L'horloge affiche l'heure civile (01:30, pas 25:30)
  et signale le passage au lendemain.
- Vitesses : ×60, ×120, ×300, ×600. Par défaut ×300, soit la journée en moins de cinq minutes.
  Au-delà de ×600, une image avancerait de plus de dix secondes de service et l'animation
  deviendrait stroboscopique. Pause par bouton ou barre d'espace ; flèches pour avancer ou
  reculer d'une minute, dix minutes avec Majuscule.
- Si l'heure suivante n'est pas encore chargée au moment de la bascule, la lecture attend
  visiblement plutôt que d'afficher une heure incomplète.
- La courbe d'activité (véhicules en circulation par minute, empilés par mode) sert de barre de
  défilement : clic et glissement.

### 4.4 Interface

- Horloge, date et nature du jour (semaine, samedi, dimanche), sélecteur des sept journées.
- Compteurs par mode : véhicules en circulation, courses parties depuis 04:00, kilomètres.
- Filtres par mode (afficher ou masquer métro, tram, bus, Noctis).
- Clic sur un véhicule : pastille de ligne dans sa couleur, destination, prochain arrêt, heure
  théorique de passage.
- Panneau « à propos » : méthode, date du GTFS, attributions, lien vers le dépôt.
- État partageable dans l'URL : journée, instant, vitesse, filtres, position de la carte, mode
  lecture ou pause.

### 4.5 Plateformes et performance

- Navigateurs : versions courantes de Chrome, Edge, Firefox et Safari sur ordinateur.
- Mobile : la page se charge, se lit et se joue sans défilement horizontal dès 360 px de large ;
  aucune promesse de fluidité.
- Budgets : première image en moins de 4 Mo de données propres au site, hors tuiles, soit un
  manifeste de 300 Ko au plus, une couche réseau de 1 Mo au plus et une heure de tranches de
  2,5 Mo au plus ; au plus 35 Mo par journée, recouvrement compris ; 60 images par seconde au pic
  sur un ordinateur portable de 2020.
- Accessibilité : commandes au clavier, états de focus visibles, couleur jamais seule porteuse
  d'information (les filtres portent leur nom), lecture démarrée en pause si `prefers-reduced-motion`.

### 4.6 Exploitation

- Reconstruction automatique chaque nuit par GitHub Actions après la publication du GTFS, puis
  déploiement sur Cloudflare Pages. Une journée qui échoue est exclue et l'exécution le signale.
- Budget d'intégration continue : moins de dix minutes par exécution, environ cinq attendues.

## 5. Ce que la version 1 ne fait pas

- Aucune donnée temps réel, aucun retard, aucune déviation, aucune perturbation.
- Aucun enregistrement de positions ; seuls les points d'extension sont prévus.
- Pas de filtre par ligne, pas de suivi d'un véhicule, pas d'export vidéo.
- Pas de néerlandais ni d'anglais.
- Pas de version mobile optimisée, pas de 3D, pas de fond de carte auto-hébergé.
- Pas d'autres opérateurs (SNCB, De Lijn, TEC), pas de comptes, pas de mesure d'audience.

## 6. Version 2 : pistes documentées

| Piste | Note |
|---|---|
| Enregistreur temps réel et rejeu de journées réelles | Le contrat de données de la v1 est prévu pour ; voir ARCHITECTURE.md section 8 |
| Comparaison théorique et réel, carte de chaleur des retards | Dépend de l'enregistreur |
| Filtre par ligne, suivi d'un véhicule, export vidéo | Le chaînage par véhicule de la v1 rend le suivi trivial |
| Néerlandais et anglais | Textes déjà centralisés en v1 |
| Fond de carte auto-hébergé (Protomaps / PMTiles) | Supprime la dernière dépendance externe |
| Mobile de premier rang | Tolérance 5 à 10 m, tranches plus courtes, tests sur téléphone |
| Format binaire quantifié | Positions sur 16 bits relatives à la boîte englobante : moitié du poids |
| Autres opérateurs dans Bruxelles | Les GTFS SNCB, De Lijn et TEC sont sur le même portail |
| Métro en 3D sous le bâti UrbIS | Idée reprise de Mini Tokyo 3D |

## 7. Jalons

Chaque jalon se termine par des tests verts, une revue de code, et une démonstration.

| Jalon | Contenu | Terminé quand |
|---|---|---|
| M0 Socle | Dépôt, outillage Python et TypeScript, lint, tests vides, intégration continue qui exécute les tests | Une modification triviale passe la CI de bout en bout |
| M1 Une journée | Pipeline complet pour un seul mercredi : téléchargement, sélection, projection des arrêts, simplification, trajectoires par véhicule, tranches horaires, manifeste, contrôles ; extrait GTFS de trois lignes versionné pour les tests | Les contrôles passent ; vérification manuelle que les compteurs du manifeste reproduisent les chiffres de la section 3 (18 784 courses, 776 véhicules au pic) à la course près ; la CI, elle, valide l'extrait versionné |
| M2 Voir bouger | Site minimal : carte, couche réseau, véhicules animés de la journée M1, horloge, lecture et pause | Un tram 7 et un métro 1 suivent visiblement leur ligne ; 60 images par seconde au pic sur ordinateur |
| M3 Interface | Courbe d'activité et défilement, vitesses, compteurs, filtres, clic véhicule, URL, panneau à propos, clavier, textes centralisés | Tous les parcours de la section 4 fonctionnent ; test de fumée Playwright vert |
| M4 Sept jours et production | Fenêtre glissante, sélecteur de journée, reconstruction nocturne, déploiement Cloudflare Pages, budgets vérifiés | Le site public se met à jour seul pendant une semaine sans intervention |
| M5 Finition | Style nocturne affiné, performance, accessibilité, documentation, README | Revue finale, liste v2 à jour |

### 7.1 Tâches par jalon

Une case par module ou par comportement, dans les termes d'[ARCHITECTURE.md](ARCHITECTURE.md).
Chaque case se coche avec ses tests verts.

**M0 Socle**

- [x] Dépôt Git local initialisé, `.gitignore`, `.editorconfig`, `README.md`
- [x] `pipeline/` : projet uv en Python 3.12, `pyproject.toml`, ruff, pytest avec couverture
      minimale de 80 %, commande `stibviz --version`
- [x] `web/` : projet Vite et TypeScript strict, pnpm, eslint, vitest avec couverture minimale
      de 80 %, `i18n/fr.ts` et son test
- [x] `.github/workflows/ci.yml` : lint, types et tests des deux côtés à chaque push et PR
- [ ] Dépôt GitHub créé, licence confirmée, première exécution de la CI verte

**M1 Une journée**

- [ ] `fetch` : téléchargement conditionnel par ETag, empreinte SHA-256, vérification du zip
- [ ] `gtfs` : lecture et validation des tables, heures au-delà de 24:00
- [ ] `service_day` : services actifs d'une date, règle du ruban `[04:00, 28:00)`
- [ ] `shapes` : distance cumulée sur le tracé d'origine, contrôle contre `shape_dist_traveled`
- [ ] `shapes` : projection croissante des arrêts sur le tracé d'origine, écarts mesurés
- [ ] `shapes` : simplification à 2 m qui conserve les abscisses d'origine
- [ ] `vehicles` : enchaînement par `block_id`, battements, coupures des déplacements à vide,
      courses sans `block_id`, chevauchements scindés
- [ ] `trajectories` : échantillonnage (lon, lat, t) à vitesse constante entre arrêts
- [ ] `slicing` : tranches horaires avec recouvrement 300 s / 120 s, coupure par interpolation,
      tranches vides non écrites
- [ ] `network` : segments arrêt à arrêt, classes d'intensité, dictionnaire des arrêts, table de
      correspondance pour la v2
- [ ] `stats` : séries par minute (véhicules, départs cumulés, kilomètres cumulés), lignes
- [ ] `encode` : tranches binaires STV1, fichiers d'arrêts par heure, manifeste, index
- [ ] `checks` : contrôles bloquants, anomalies par objet, rapport
- [ ] `cli` : commandes `fetch`, `build`, `check`, `index`
- [ ] Extrait GTFS de trois lignes versionné avec ses valeurs attendues
- [ ] Journée du mercredi 9 septembre 2026 construite, chiffres vérifiés à la main

**M2 Voir bouger**

- [ ] `data/` : lecture de l'index et du manifeste, décodage des tranches STV1, test de contrat
      sur la journée de fixture
- [ ] `time/` : horloge de journée de service, lecteur à vitesse variable, lecture et pause
- [ ] `render/` : carte MapLibre avec style nocturne, couche réseau
- [ ] `render/` : une `TripsLayer` par mode en attributs binaires, couleurs dépliées, test de
      non-recopie
- [ ] `render/` : `ScatterplotLayer` des têtes, position par recherche dichotomique, battement
- [ ] `ui/` : horloge, bouton lecture et pause
- [ ] Vérification visuelle du tram 7 et du métro 1, mesure des 60 images par seconde

**M3 Interface**

- [ ] `ui/` : courbe d'activité servant de barre de défilement
- [ ] `ui/` : vitesses ×60 à ×600, raccourcis clavier
- [ ] `ui/` : compteurs par mode lus dans les séries du manifeste
- [ ] `ui/` : filtres par mode, couches et préchargement
- [ ] `render/` et `ui/` : sélection d'un véhicule, arrêts chargés à la demande, panneau
- [ ] `state/` : état unique, synchronisation avec l'URL, aller-retour testé
- [ ] `data/` : préchargement de l'heure suivante, cache de trois heures, attente visible
- [ ] `ui/` : panneau à propos et attributions
- [ ] `i18n/` : textes français complets
- [ ] Test de fumée Playwright sur la journée de fixture

**M4 Sept jours et production**

- [ ] Pipeline : fenêtre glissante de sept journées, index des seules journées valides
- [ ] `ui/` : sélecteur de journée
- [ ] `nightly.yml` : fetch avec ETag, build et check par journée, index, build du site,
      déploiement wrangler, code de sortie différé
- [ ] Projet Cloudflare Pages, secrets GitHub, en-têtes de cache
- [ ] Budgets vérifiés sur une semaine réelle : poids, durée du pipeline, minutes de CI

**M5 Finition**

- [ ] Style nocturne : couleurs des modes réglées sur le rendu réel, fond ajusté
- [ ] Performance : `useDevicePixels`, mesure sur un portable de 2020, mobile fonctionnel
- [ ] Accessibilité : focus, clavier, `prefers-reduced-motion`
- [ ] Documentation : README, panneau à propos, `docs/`, liste v2 à jour
- [ ] Revue finale

## 8. Qualité et méthode

- Développement dirigé par les tests : chaque comportement commence par un test qui échoue.
- Couverture minimale de 80 % sur la logique (pipeline et modules TypeScript non graphiques). Le
  code de rendu WebGL est couvert par le test de fumée et par la vérification visuelle.
- Revue systématique avant fusion, même seul : la revue outillée est la seule relecture.
- Aucune clé ni secret dans le dépôt ; les identifiants Cloudflare vivent dans les secrets GitHub.
- Les contrôles du pipeline distinguent les anomalies globales, qui bloquent la journée, des
  anomalies par objet, tolérées sous 0,1 % des courses, journalisées et résumées dans le
  manifeste. Une journée bloquée n'est jamais publiée ; les autres journées le sont.

## 9. Licences et attribution

- Code : licence MIT, comme la référence (à confirmer à la création du dépôt).
- Données : CC BY 4.0. Mention obligatoire, dans le panneau à propos et le pied de page :
  « Source: STIB-MIVB – Open Data – [date du GTFS] », avec un lien vers Belgian Mobility Company.
- Fond de carte : « OpenFreeMap © OpenMapTiles Data from OpenStreetMap ».
- Bibliothèques : MapLibre GL JS (BSD), deck.gl (MIT).

## 10. Risques principaux

| Risque | Parade |
|---|---|
| Tracés très denses, poids excessif | Simplification à 2 m, budget par tranche contrôlé par le pipeline |
| Le GTFS ne place pas les arrêts sur les tracés | Projection monotone des arrêts, contrôle d'écart (médiane et p99) |
| Boucles et variantes de parcours | Choix du tracé par `shape_id` de la course, projection contrainte par l'ordre des arrêts |
| Journée qui traverse minuit | Ruban 04:00 → 04:00 par construction |
| Changement de format du flux | Validation stricte en entrée, échec explicite, jour exclu |
| Indisponibilité d'OpenFreeMap | La couche réseau rend la carte lisible seule ; auto-hébergement en v2 |
| Minutes d'intégration continue | Exécution unique par nuit, moins de dix minutes, arrêt anticipé si le flux n'a pas changé |

## 11. Glossaire

- **Course** : un `trip` GTFS, d'un terminus à l'autre.
- **Véhicule** : un `block_id` GTFS, suite de courses assurées par le même engin.
- **Tracé** : un `shape` GTFS, polyligne géographique d'une variante de parcours.
- **Journée de service** : les courses rattachées à une date GTFS, de 04:00 à 04:00 le lendemain.
- **Tranche horaire** : sous-ensemble des trajectoires actives pendant une heure, avec recouvrement.
- **Manifeste** : fichier JSON qui décrit une journée publiée : statistiques, lignes, tranches.
