# Bruxelles en mouvement : exploration d'une visualisation animée du réseau STIB

Date : 5 septembre 2026. Statut : exploration et brainstorming, aucun code.

Objectif : une carte de Bruxelles sur laquelle on voit, minute après minute, circuler tous les
trams, bus et métros de la STIB, dans l'esprit de
[france-rail-traffic](https://github.com/magrinj/france-rail-traffic) (démo :
<https://france-rail-traffic.pages.dev/>).

Tout ce qui suit a été vérifié le 5 septembre 2026 (pages consultées, réponses brutes des API,
rapport de validation du GTFS du jour). Les points encore incertains sont marqués « à vérifier ».

> Correction du 5 septembre 2026, après téléchargement du GTFS : `shape_dist_traveled` est présent
> dans `shapes.txt` mais **absent de `stop_times.txt`**. La position des arrêts le long des tracés
> doit donc être calculée par projection (voir ARCHITECTURE.md, étape 5) ; la phrase de la
> section 3.2 qui l'affirmait disponible était fausse et a été corrigée.

---

## 1. Résumé en six points

1. **C'est faisable avec des données ouvertes, sans accord particulier.** Le GTFS STIB contient les
   tracés (`shapes.txt`), les couleurs officielles des lignes et les horaires de chaque course.
   Licence CC BY 4.0, usage commercial autorisé, attribution obligatoire.
2. **Le portail open data de la STIB a déménagé.** `data.stib-mivb.brussels` (OpenDataSoft) redirige
   maintenant vers <https://data.belgianmobility.io/>, le portail commun des quatre opérateurs
   belges (STIB-MIVB, De Lijn, TEC, SNCB), géré par la « Belgian Mobility Company ». Beaucoup de
   tutoriels et de bibliothèques en ligne décrivent l'ancien portail : à prendre avec recul.
3. **Les positions temps réel existent, mais ne sont pas des coordonnées GPS.** L'API renvoie, par
   ligne, une liste de véhicules décrits par « dernier arrêt passé + distance en mètres ». Il
   faut donc les projeter sur le tracé de la ligne pour obtenir un point sur la carte. C'est le
   principal travail spécifique à Bruxelles.
4. **Le problème le plus dur du projet français (le map-matching avec pfaedle) n'existe pas ici.**
   Le GTFS STIB a déjà des tracés géographiques pour toutes les courses. Le pipeline sera donc
   nettement plus simple.
5. **Trois lectures possibles de « minute après minute »** : rejouer l'horaire théorique (comme la
   référence), rejouer une journée réellement observée (positions enregistrées), ou afficher le
   direct. Elles partagent le même moteur de rendu ; seule la fabrication des trajectoires change.
6. **Recommandation** : commencer par le rejeu de l'horaire théorique (100 % statique, aucun
   serveur, aucune clé), et lancer très tôt un petit enregistreur de positions temps réel pour
   constituer des « vraies journées » à rejouer ensuite.

---

## 2. Ce que fait la référence, et ce qui se transpose

### 2.1 france-rail-traffic en bref

| Aspect | Choix du projet français |
|---|---|
| Nature des données | Horaires théoriques (GTFS SNCF, Transilien, Corse). Aucun retard, aucune suppression. |
| Positions | Interpolation linéaire entre arrêts le long du tracé, vitesse constante. |
| Tracés | Absents des GTFS : générés par map-matching sur OpenStreetMap avec pfaedle (C++, GPL). |
| Pipeline | Python 3.11, sept étapes, ~25 min complet, ~6 min pour la fenêtre de 7 jours. |
| Format livré | Binaire par catégorie : `pos.bin` (Float32 lon/lat entrelacés), `time.bin` (Float32 secondes depuis minuit), `idx.bin` (Uint32 index de début). Découpage par tranches d'une heure avec 600 s de recouvrement pour tenir 60 fps. |
| Rendu | MapLibre GL JS + deck.gl `TripsLayer`, fond Carto Dark Matter, page unique `web/index.html` en JavaScript sans bundler. |
| Visuel | Fond sombre, réseau coloré par intensité (cinq classes), quatre couleurs de trains, traînées dont la longueur encode le temps écoulé (donc la vitesse). |
| Interface | Horloge, sélecteur de jour, compteurs par catégorie, courbe d'activité qui sert de barre de défilement, vitesses ×60 à ×1800, barre espace pour la pause. |
| Chiffres | 13 602 courses, 1 481 trains simultanés au pic, 2,3 M de sommets, 27,9 Mo, plus de 110 fps sur Apple Silicon. |
| Exploitation | GitHub Actions chaque nuit (cron 03:20 UTC) puis Cloudflare Pages. Fenêtre glissante de 7 jours. |
| Licences | Code MIT, données ODbL par héritage. |

Capture d'écran de la démo (samedi 5 septembre 2026, 09:21, 772 trains) : panneau gauche avec
bascule France/Corse et couches, cartouche droit avec horloge et sélecteur de jour, légende en bas
à gauche avec compteurs, courbe d'activité et boutons de vitesse en bas au centre. Le tout est très
sobre et lisible.

### 2.2 Ce qui change pour Bruxelles

| Sujet | France | Bruxelles |
|---|---|---|
| Échelle géographique | Un pays, zoom continental | 160 km², un seul niveau de zoom « ville » plus un zoom quartier |
| Volume | 13 602 courses/jour, 1 481 véhicules au pic | ~800 véhicules actifs simultanément (chiffre du portail), de l'ordre de 10 000 à 15 000 courses par jour ouvré (à confirmer sur un jour donné) : même ordre de grandeur, donc le format binaire et le découpage horaire se transposent tels quels |
| Tracés | Map-matching OSM nécessaire | `shapes.txt` fourni (750 tracés) avec `shape_dist_traveled` : interpolation directe |
| Modes | Trains, sur voies | Métro (souterrain, 4 lignes), tram (18 lignes, surface et tunnels du prémétro), bus (~55 lignes), Noctis (11 lignes de nuit) |
| Temps réel | Non traité | Disponible toutes les 15 s, ce qui ouvre les scénarios « journée réelle » et « direct » |
| Fond de carte | Carto Dark Matter, monde entier | Un extrait de Bruxelles suffit ; possibilité d'un fond fait maison avec UrbIS |
| Service de nuit | Trains de nuit qui traversent minuit | Noctis (vendredi et samedi soir) plus derniers métros vers 00:30 : même mécanisme « charger la veille » |

---

## 3. Inventaire des données disponibles

### 3.1 Portail Belgian Mobility (ex-portail STIB)

Adresse : <https://data.belgianmobility.io/> (catalogue : `/en/data.html?agency=stibmivb`, FAQ,
base de connaissances, conditions). Portail développeur pour créer un compte et obtenir une clé :
`https://api-management-opendata-production.developer.azure-api.net/signup`.

**Licence et quotas** (page « Terms »)

- Licence CC BY 4.0. Usage commercial autorisé. Attribution : « Source: STIB-MIVB – Open Data –
  [date de mise à jour] ». Données modifiées : « Contains data originally published by STIB-MIVB,
  modified by [nom] ». La FAQ demande aussi de créditer « Belgian Mobility Company » avec un lien.
- Accès anonyme : 100 requêtes par jour, 10 par minute.
- Niveau « standard » (compte gratuit) : 12 000 requêtes par jour, 500 par minute.
- Aucune clause vue sur l'archivage ou le rejeu des données temps réel.

**Jeux de données STIB-MIVB**

| Jeu | Format | Fréquence | Contenu | Remarque |
|---|---|---|---|---|
| GTFS statique | zip | quotidien | horaires, arrêts, tracés, couleurs | le socle du projet |
| NeTEx EPIP | XML | quotidien | même chose au format européen | inutile ici |
| VehiclePositions | JSON | 15 s | « ~800 positions GPS » d'après la vitrine, en réalité des positions linéaires (voir 3.2) | lecture anonyme possible |
| WaitingTimes | JSON | temps réel | prochains passages par arrêt | utile pour valider les positions |
| StopDetails | JSON | statique | id, nom fr/nl, latitude/longitude | vérifié |
| stopsByLine | JSON | statique | par ligne et direction, liste ordonnée des arrêts | vérifié |
| TravellersInformation | JSON | temps réel | perturbations fr/nl/en | bonus (overlay) |
| ShapeFile | zip | hebdomadaire | tracés, arrêts, zones | redondant avec `shapes.txt` |
| INSPIRE Roads / Rails | zip | hebdomadaire | infrastructure | curiosité |
| GTFS-RT | protobuf | 30 s | la vitrine annonce trip updates et alertes pour la STIB, mais la base de connaissances écrit « STIB-MIVB does not produce GTFS-RT feeds » et ne donne d'URL que pour De Lijn, TEC et SNCB | contradiction à trancher avec un compte ; sans impact pour la visualisation, qui n'en a pas besoin |

Points d'entrée observés (préfixe `https://api-management-discovery-production.azure-api.net/api/datasets/stibmivb/`) :
`rt/VehiclePositions`, `rt/WaitingTimes`, `rt/TravellersInformation`, `static/StopDetails`,
`static/stopsByLine`. Les GTFS statiques des autres opérateurs suivent le motif
`https://opendata-discovery-gtfs-static.api.production.belgianmobility.io/api/gtfs/feed/{agence}/static` ;
l'URL exacte pour `stibmivb` est à vérifier une fois le compte créé.

### 3.2 Format réel des positions temps réel (réponse brute du 5 septembre, ~09:40)

```json
{
  "results": [
    {
      "lineid": "76",
      "vehiclepositions": "[{\"directionId\":\"1638\",\"distanceFromPoint\":160,\"pointId\":\"1659\"},
                            {\"directionId\":\"2836\",\"distanceFromPoint\":279,\"pointId\":\"1617\"}]"
    },
    {
      "lineid": "54",
      "vehiclepositions": "[{\"directionId\":\"3243\",\"distanceFromPoint\":0,\"pointId\":\"1780\"}, ...]"
    }
  ],
  "totalCount": 70
}
```

Ce que cela implique :

- **Pas de latitude/longitude, pas d'identifiant de véhicule, pas d'identifiant de course, pas
  d'horodatage.** Chaque véhicule est décrit par trois champs : `pointId` (dernier arrêt passé),
  `distanceFromPoint` (mètres parcourus depuis cet arrêt, 0 = à l'arrêt) et `directionId`
  (identifiant de l'arrêt terminus, qui indique la direction). Cette lecture est confirmée par la
  documentation de MobilityTwin (« distance de chaque véhicule depuis le dernier arrêt ») et par
  les données elles-mêmes (sur la ligne 95, un véhicule a `pointId` = `directionId` = 1781 avec
  distance 0 : il est au terminus). Une validation empirique sur quelques lignes reste prudente
  (à vérifier).
- Le champ `vehiclepositions` est une chaîne JSON à l'intérieur du JSON (double sérialisation).
  Même chose pour `gpscoordinates` dans StopDetails et `points` dans stopsByLine.
- 70 lignes actives au moment du test (samedi matin). Un appel renvoie tout le réseau : un seul
  appel toutes les 15 s suffit pour tout enregistrer.
- Certains identifiants d'arrêts portent un suffixe (`4074B`, `4262F`, `1871B`) : quais ou
  variantes. La correspondance avec les `stop_id` du GTFS est à vérifier.

**Passer de « ligne, dernier arrêt, distance » à un point sur la carte**

1. Pour la ligne et la direction (via `directionId` et la liste ordonnée de stopsByLine),
   choisir le tracé correspondant dans `shapes.txt`.
2. Projeter l'arrêt `pointId` sur ce tracé pour obtenir son abscisse curviligne. Le GTFS STIB ne
   la fournit pas dans `stop_times.txt` (colonne `shape_dist_traveled` absente, vérifié le
   5 septembre 2026) ; elle se calcule une fois par tracé et se réutilise.
3. Avancer de `distanceFromPoint` mètres le long du tracé : on obtient longitude, latitude et cap.
4. Pour animer, apparier chaque véhicule d'un instantané au suivant (même ligne et direction,
   progression monotone le long du tracé, vitesse plausible) afin de reconstituer des
   trajectoires continues. MobilityTwin fait exactement ce travail et parle de « calculs pour
   attribuer une identité unique à chaque véhicule le long d'un trajet ».

Pièges attendus : variantes de parcours et boucles (quel tracé choisir), déviations non
présentes dans le GTFS, arrêts inconnus, véhicules haut-le-pied ou en régulation.

### 3.3 GTFS statique STIB (rapport de validation du 5 septembre 2026, miroir gtfs.be)

| Élément | Valeur |
|---|---|
| Fichiers | agency, calendar, calendar_dates, feed_info, routes, shapes, stop_times, stops, translations, trips |
| Lignes (`routes`) | 89 |
| Courses (`trips`) | 75 696 sur la période de validité |
| Arrêts | 2 784 |
| Tracés (`shapes`) | 750, avec `shape_dist_traveled` (1 986 avertissements mineurs de cohérence de distance) |
| Validité | 31 août au 27 septembre 2026 (fenêtre glissante d'environ quatre semaines) |
| Couleurs | `route_color` et `route_text_color` renseignés (couleurs officielles des lignes) |
| Divers | headsigns, accessibilité PMR, traductions fr/nl |
| Taille | 14,4 Mo zippé |

Conséquences pour le projet :

- L'interpolation se fait directement sur les tracés : ni OSM, ni pfaedle, ni compilation C++.
- Les couleurs officielles des lignes sont disponibles sans les recopier à la main.
- La fenêtre de validité impose une reconstruction régulière (comme la référence, chaque nuit).
- Miroir quotidien avec rapport de validation : <https://data.gtfs.be/stib/gtfs/>. Fiche
  Transitland : opérateur `o-u151-stib`, flux `f-u151-stib`.

### 3.4 MobilityTwin.Brussels (ULB, laboratoire CoDE)

Site : <https://mobilitytwin.brussels/> (documentation `/doc/`, onglet STIB). Plateforme de
recherche qui archive depuis 2023 des données de mobilité bruxelloises (plus de 4 Tio).
Inscription gratuite par e-mail, jeton Bearer, « pas de limite d'usage pour la recherche ».

Points d'entrée STIB utiles, avec paramètres `timestamp` ou `start_timestamp`/`end_timestamp` :

| Point d'entrée | Contenu | Historique |
|---|---|---|
| `/stib/vehicle-position` | positions estimées en GeoJSON (latitude/longitude) avec un uuid stable par trajet | depuis le 21 août 2024, 2,97 M d'enregistrements |
| `/stib/vehicle-distance` | positions brutes (dernier arrêt + distance) | depuis le 24 février 2023, 4,85 M |
| `/stib/segments`, `/stib/stops`, `/stib/shapefile` | géométries | depuis août 2024 |
| `/stib/gtfs`, `/stib/gtfs-parquet` | archives GTFS | depuis avril 2024 |
| `/stib/speed`, `/stib/aggregated-speed`, `/stib/punctuality` | dérivés | 2024-2025 |
| `/stib/trips` | trajectoires au format MF-JSON | sur demande |

Intérêt : récupérer une journée réelle déjà convertie en coordonnées sans enregistrer soi-même,
et comparer théorique et réel. Réserve : la licence des données dérivées n'est pas indiquée ;
pour un site public, demander l'autorisation (contact indiqué sur le site : gaspard.merten@ulb.be).

### 3.5 Ce que propose le site de la STIB (réponse à la question « cartes du site »)

- **Plans PDF** (page « Plans de réseau et plans de quartier ») : plan Brupass, plan Brupass XL,
  plan Noctis, plan métro + lignes Chrono + SNCB, plus de 80 plans de quartier autour des
  stations de métro. Ce sont des images : aucune donnée réutilisable, mais une excellente
  référence graphique (couleurs de lignes, hiérarchie métro/tram/bus).
- **Plan dynamique** (`/files/live/sites/STIBMIVB/files/Travel/DynamicPlan/index.html`) : carte
  web des lignes en couleur, zoomable, sans véhicules en temps réel.
- **Application mobile STIB** : « la carte interactive donne une vue en temps réel des véhicules
  sur l'ensemble de notre réseau, des trains SNCB et des bus et trams TEC et De Lijn ». Aucune
  version web trouvée, et aucune API publique derrière cette carte autre que celles du portail.

Conclusion : le site fournit de l'inspiration visuelle, pas de données. Les données passent par
le portail Belgian Mobility.

### 3.6 Projets et outils existants (pour ne pas réinventer)

| Projet | Ce qu'il apporte | Statut |
|---|---|---|
| [TRAVIC](https://travic.app/) (geOps + Université de Fribourg) | Animation d'horaires GTFS pour 260 villes, référence historique du genre | Bruxelles-Central s'y trouve, mais seuls des trains SNCB apparaissent à l'écran : la STIB ne semble pas couverte (vérifié le 5 septembre) |
| [All Transit](https://kylebarron.dev/blog/all-transit/) (Kyle Barron) | Même approche que la référence à l'échelle des États-Unis : abscisse curviligne, tuiles JSON par zoom, deck.gl `TripsLayer` ; leçons de performance (désactiver `useDevicePixels`, masquer les arrêts sous zoom 11) | référence technique |
| [hvv.live / « The Moving City »](https://franz.hamburg/writing/the-moving-city.html) (Hambourg) | Direct par interpolation entre deux positions, Mapbox GL avec style piloté par les données, index spatial rbush, prétraitement sous 2 ms sur un iPhone 7 | référence pour le scénario « direct » |
| [Mini Tokyo 3D](https://github.com/nagix/mini-tokyo-3d) | Plus de 1 100 trains simultanés en 3D, métro rendu à altitude négative grâce à deck.gl ; plugin GTFS/GTFS-RT | référence pour un rendu 3D du métro |
| [TransitFlow](https://github.com/transitland/transitland-processing-animation) (Will Geary) | Export vidéo d'une journée de transit (Processing) | archivé, idée d'export vidéo à garder |
| [StibTrack](https://github.com/dalisalvador/stib) | Application React Native de suivi temps réel STIB, avec un serveur relais pour ménager le quota | ancienne API, mais confirme le besoin d'un relais |
| [stibgtfs2mqtt](https://github.com/danito/stibgtfs2mqtt/) | Combine API temps réel et GTFS ; note que les données de l'API et du GTFS « sont incohérentes » entre elles et que les Noctis manquent côté API | avertissement utile |
| Sujet GitHub `stib-mivb` | Surtout des intégrations domotiques (temps d'attente) et des projets étudiants d'analyse de vitesse et de retards | rien qui rejoue une journée entière sur une carte |

Aucun projet public ne fait aujourd'hui pour Bruxelles ce que fait france-rail-traffic pour la
France : la place est libre.

### 3.7 Fonds de carte et géodonnées bruxelloises

| Option | Pour | Contre |
|---|---|---|
| [OpenFreeMap](https://openfreemap.org/) | Tuiles vectorielles gratuites, sans clé ni quota, styles Positron, Bright, Liberty, Dark, auto-hébergeable | Style à personnaliser pour l'estomper |
| Carto Dark Matter (choix de la référence) | Sombre et sobre, fonctionne immédiatement | Conditions d'usage Carto à respecter |
| Protomaps / PMTiles | Un seul fichier pour Bruxelles, hébergé avec le site, aucune dépendance externe | Petit travail d'extraction et de style |
| MapTiler, Stadia | Styles soignés | Clé et quota |
| [UrbIS](https://datastore.brussels/web/urbis-download) (CIRB, licence open data) | Bâtiments 2D et 3D, voirie, parcelles : de quoi dessiner un fond « made in Brussels » (bâti gris, canal, parcs) voire une vue 3D | Travail cartographique à faire soi-même |
| OpenStreetMap / OpenRailwayMap | Voies de tram et de métro si l'on veut dessiner les rails | Redondant avec `shapes.txt` |

---

## 4. Trois architectures possibles

Les trois partagent le même « moteur » (carte + trajectoires horodatées + contrôle du temps).
Elles diffèrent par la fabrication des trajectoires.

### A. Rejouer l'horaire théorique (le plus proche de la référence)

```
GTFS zip (quotidien)
  └─ choisir un jour de service (calendar + calendar_dates, charger aussi la veille pour la nuit)
  └─ pour chaque course : stop_times (heures, shape_dist_traveled) + shape (tracé)
  └─ échantillonner la trajectoire aux sommets du tracé, temps interpolé entre arrêts
  └─ écrire un binaire par mode (métro, tram, bus, Noctis) et par tranche horaire
  └─ site statique : MapLibre + deck.gl TripsLayer, scrubber, compteurs
GitHub Actions chaque nuit → hébergement statique (Cloudflare Pages, GitHub Pages ou Vercel)
```

- Aucune clé, aucun serveur, aucune donnée personnelle, coût nul.
- Ordre de grandeur : France = 2,3 M de sommets pour 13 602 courses ; Bruxelles devrait tenir
  entre 1 et 3 M de sommets par jour, soit 10 à 40 Mo bruts, découpables par heure.
- Limites : ni retards, ni déviations, ni suppressions ; vitesse constante entre arrêts (on peut
  ajouter un temps d'arrêt fictif de 15 à 30 s pour que les véhicules « marquent » les arrêts).
- Choix du jour : un mercredi hors vacances, un samedi et un dimanche donnent trois ambiances.

### B. Rejouer une journée réelle (positions enregistrées)

```
Enregistreur (cron toutes les 15 à 20 s, clé « standard ») → VehiclePositions brut, horodaté
  └─ stockage compressé (≈ 30 Ko par instantané, ≈ 5 000 instantanés par jour)
  └─ conversion « dernier arrêt + distance » → coordonnées via shapes.txt
  └─ appariement des véhicules entre instantanés → trajectoires continues
  └─ même binaire, même site qu'en A (avec un sélecteur « théorique / réel »)
```

- Quota : un appel toutes les 15 s = 5 760 appels par jour, sous les 12 000 du niveau standard.
- Ce que cela apporte : le vrai Bruxelles (embouteillages, régulation, grèves, jours de neige),
  la comparaison théorique/réel, une carte de chaleur des retards, l'avance ou le retard de chaque
  véhicule affiché en couleur.
- Ce que cela coûte : un enregistreur qui tourne en permanence (Cloudflare Worker + R2, Vercel
  cron + Blob, ou un simple Raspberry Pi), une clé API tenue secrète, et du soin dans
  l'appariement.
- Raccourci possible : MobilityTwin fournit déjà l'historique converti (voir 3.4), sous réserve de
  licence.

### C. Le direct

Même conversion qu'en B mais en continu : un relais serveur interroge l'API toutes les 15 s et
sert un instantané mis en cache à tous les visiteurs (quel que soit leur nombre, un seul appel par
15 s vers la STIB). Le navigateur interpole entre deux instantanés pour un mouvement fluide
(technique hvv.live). Nécessite un serveur léger et masque la clé.

### Recommandation

1. **A d'abord** : résultat visible rapidement, pipeline simple, zéro exploitation.
2. **Lancer l'enregistreur de B dès que la clé existe**, même si la conversion vient plus tard :
   chaque jour non enregistré est perdu.
3. **C en dernier**, comme mode supplémentaire sur le même site.

---

## 5. Choix techniques (pistes, pas de décision)

| Brique | Option recommandée | Alternatives |
|---|---|---|
| Rendu des véhicules | deck.gl `TripsLayer` (traînées gratuites, des milliers de trajectoires à 60 fps ; horodatages en Float32, donc « secondes depuis minuit » et pas des timestamps Unix) | couche WebGL maison dans MapLibre ; Three.js pour la 3D (Mini Tokyo 3D) ; canvas 2D suffisant pour 800 points sans traînées |
| Carte | MapLibre GL JS (sans clé) | Mapbox GL (clé), Leaflet (pas de WebGL) |
| Format de trajectoires | Binaire typé à la manière de la référence (`pos.bin`, `time.bin`, `idx.bin`), découpé par heure | Arrow/Parquet côté navigateur ; tuiles JSON par zoom (All Transit) |
| Pipeline | Python (pandas ou polars, gtfs-kit ou partridge, shapely, pyproj) ; s'inspirer directement du dépôt de référence (MIT) en retirant l'étape pfaedle | Node/TypeScript pour n'avoir qu'un langage |
| Prototype visuel sans écrire d'interface | Charger un CSV de trajectoires dans kepler.gl (couche « Trip ») pour juger le rendu en quelques minutes | Observable notebook |
| Hébergement A | Site statique (Cloudflare Pages comme la référence, GitHub Pages, Vercel) | |
| Hébergement B/C | Cloudflare Worker + R2/KV ou Vercel cron + Blob ; clé API en variable secrète | Petit VPS, Raspberry Pi |
| Enregistrement | Une fonction planifiée toutes les 15 à 20 s, écriture brute sans transformation (on convertit plus tard, en cas de correction de l'algorithme) | |

Ordre de grandeur de coût : A gratuit ; B quelques euros par mois au plus ; C idem.

---

## 6. Pistes visuelles

### Trois directions à trancher

1. **Nocturne, « la ville qui respire »** (proche de la référence). Fond très sombre et désaturé,
   réseau en filigrane, véhicules lumineux avec traînées. Couleur par mode : métro en blanc chaud,
   trams dans leur couleur officielle, bus en une teinte froide, Noctis en violet. Le spectacle
   est dans le rythme : les vagues de 7 h, le creux de 14 h, l'extinction après minuit.
2. **Plan officiel animé, clair.** Fond gris très pâle construit avec UrbIS (bâti, canal, parcs),
   lignes dans leurs couleurs STIB (`route_color`), véhicules en pastilles portant le numéro de
   ligne, typographie proche des plans de la STIB. Lisible en plein jour, plus « service
   public » que « data art ».
3. **Minimaliste, sans fond de carte.** Seulement le réseau en gris et les véhicules, façon
   simulation ferroviaire suisse de Vasile Coțovanu : le tracé du réseau suffit à reconnaître
   Bruxelles (pentagone, petite ceinture, canal, axe Louise, ligne 4/7). Très peu de pixels, très
   élégant, s'exporte bien en vidéo.

### Encodages qui marchent

- Traînée dont la longueur encode le temps écoulé (donc la vitesse), sans calcul.
- Halo ou pulsation quand un véhicule est à l'arrêt (`distanceFromPoint` = 0 en réel, ou temps
  d'arrêt fictif en théorique).
- Métro en couche estompée sous la surface, avec en option une vue inclinée où les tunnels
  passent sous les bâtiments 3D d'UrbIS (idée Mini Tokyo 3D, à réserver pour plus tard).
- Réseau coloré par nombre de passages quotidiens, comme la référence, mais avec une palette qui
  n'entre pas en collision avec les couleurs de lignes.
- En mode réel : couleur du véhicule = avance ou retard par rapport à l'horaire.

### Interface

- Horloge et jour de service, sélecteur de jour (semaine, samedi, dimanche, jour de grève ou
  d'événement si enregistré).
- Compteurs par mode (véhicules en circulation, courses depuis minuit, kilomètres).
- Courbe d'activité sur 24 h qui sert de barre de défilement, vitesses ×60 à ×1800, espace pour
  pause, pas à pas d'une minute.
- Filtres par mode et par ligne ; clic sur un véhicule : ligne, destination, prochain arrêt.
- Repères bruxellois : canal, petite ceinture, pentagone, communes ; « moments » à raconter
  (premier métro 05:00, fin de service 00:30, rush de la Gare du Midi, sortie du stade).

### Bonus

- Export vidéo d'une journée (esprit TransitFlow) pour les réseaux sociaux.
- Mode « embarqué » : suivre un seul tram 3, 4 ou 7 de terminus à terminus.
- Cadran 24 h et petits multiples semaine/week-end.

---

## 7. Risques et questions ouvertes

| Sujet | Risque | Comment lever le doute |
|---|---|---|
| Sémantique de `distanceFromPoint` / `pointId` | dernier arrêt passé ou prochain arrêt ? | croiser quelques instantanés avec WaitingTimes et avec l'observation d'une ligne connue |
| Identifiants d'arrêts avec suffixe (`4074B`) | non-correspondance avec les `stop_id` GTFS | table de correspondance à construire, vérifier sur StopDetails |
| Variantes de parcours | mauvais tracé choisi pour un véhicule | choisir le tracé qui contient `pointId` et `directionId` dans le bon ordre |
| GTFS-RT STIB | information contradictoire sur le portail | sans impact ; vérifier avec le compte par curiosité |
| Licence MobilityTwin | non précisée | demander avant tout usage public |
| Quotas | 12 000 appels par jour en standard | un enregistreur = un appel par 15 s, jamais d'appel direct depuis les navigateurs |
| Précision des temps dans deck.gl | Float32 | secondes depuis minuit, pas d'epoch |
| Performance mobile | All Transit signale des faiblesses | découpage horaire, `useDevicePixels: false`, tests sur téléphone tôt |
| Données incohérentes API / GTFS | signalé par stibgtfs2mqtt | s'appuyer sur le GTFS pour la géométrie, sur l'API pour les positions seulement |
| Attribution | obligatoire | pied de page : « Source: STIB-MIVB – Open Data – [date] », Belgian Mobility Company, fond de carte et OpenStreetMap |

---

## 8. Prochaines étapes proposées

1. **Créer le compte développeur** sur le portail Belgian Mobility et souscrire au niveau
   « standard » (action à faire par vous : création de compte).
2. **Trancher la direction visuelle** parmi les trois de la section 6, ou en combiner deux
   (par exemple nocturne par défaut, clair en option).
3. **Choisir le périmètre de la première version** : A seul, ou A plus l'enregistreur de B.
4. **Première session de code** (quand vous le déciderez) : un notebook qui charge le GTFS du
   jour, compte les courses d'un mercredi, produit les trajectoires de deux ou trois lignes et
   les affiche dans kepler.gl. C'est le test le moins cher pour valider le rendu et les volumes.
5. **En parallèle** : un enregistreur minimal des positions brutes, pour commencer à constituer
   des journées réelles.

---

## Sources consultées le 5 septembre 2026

- Dépôt et démo de référence : <https://github.com/magrinj/france-rail-traffic>,
  <https://france-rail-traffic.pages.dev/>
- Portail Belgian Mobility : <https://data.belgianmobility.io/en/data.html>,
  `/en/terms.html`, `/en/faq.html`, `/en/knowledge-base.html`
- Réponses brutes des API STIB : VehiclePositions, stopsByLine, StopDetails (accès anonyme)
- Rapport de validation GTFS STIB : <https://data.gtfs.be/stib/gtfs/>
- MobilityTwin.Brussels : <https://mobilitytwin.brussels/tag/stib/>
- Plans STIB : <https://www.stib-mivb.be/travel/network-and-district-maps>
- TRAVIC : <https://travic.app/> ; All Transit : <https://kylebarron.dev/blog/all-transit/> ;
  hvv.live : <https://franz.hamburg/writing/the-moving-city.html> ;
  Mini Tokyo 3D : <https://github.com/nagix/mini-tokyo-3d>
- deck.gl TripsLayer : <https://deck.gl/docs/api-reference/geo-layers/trips-layer>
- OpenFreeMap : <https://openfreemap.org/> ; UrbIS : <https://datastore.brussels/web/urbis-download>
