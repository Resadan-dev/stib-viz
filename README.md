# stib-viz : Bruxelles en mouvement

Une carte nocturne de Bruxelles sur laquelle on regarde, minute après minute, tous les métros,
trams et bus de la STIB circuler selon l'horaire théorique d'une journée de service. Un site
statique reconstruit chaque nuit à partir des données ouvertes du portail Belgian Mobility.

État : jalon M0 (socle). Aucune donnée ni animation encore.

## Documents

- [SCOPE.md](SCOPE.md) : périmètre de la version 1, décisions, jalons et tâches.
- [ARCHITECTURE.md](ARCHITECTURE.md) : pipeline, contrat de données, site, intégration continue.
- [docs/01-exploration.md](docs/01-exploration.md) : exploration initiale des données et des
  options techniques.

## Organisation

- `pipeline/` : Python 3.12 géré par uv. Produit les données du site à partir du GTFS STIB.
- `web/` : Vite et TypeScript, géré par pnpm 10 (version épinglée dans `package.json`).
- `.github/workflows/` : intégration continue.

## Lancer les vérifications

Pipeline (uv installe Python 3.12 et les dépendances tout seul) :

```bash
cd pipeline && uv sync && uv run ruff check . && uv run pytest
```

Site. Sans pnpm installé, `npx` le télécharge à la version épinglée :

```bash
cd web && npx --yes pnpm@10 install && npx --yes pnpm@10 lint && npx --yes pnpm@10 typecheck && npx --yes pnpm@10 test
```

Avec pnpm installé (`corepack enable` ou installation directe), `pnpm install`, `pnpm lint`,
`pnpm typecheck`, `pnpm test` et `pnpm build` suffisent.

Note : ESLint reste en version 9 tant que Node 22.12 est la version locale ; ESLint 10 exige
Node 22.13 au minimum.

## Données et attribution

Source : STIB-MIVB – Open Data – portail Belgian Mobility, licence CC BY 4.0.
Fond de carte : OpenFreeMap © OpenMapTiles, données OpenStreetMap.
