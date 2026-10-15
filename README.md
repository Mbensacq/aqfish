# aqfish

Simulateur d'aquarium en **pixel art 3D** dans le navigateur : poissons, amphibiens et
plantes dans plusieurs environnements (bac tropical, bassin à koïs, paludarium, récif), que
l'on fait tourner à la souris et que l'on observe de dessus, de dessous ou de côté.

## Une expérience : une app construite la nuit par des agents

Ce dépôt est construit **chaque nuit par une équipe de cinq agents Claude** qui se
succèdent sans intervention humaine directe :

| Heure (Paris) | Agent | Rôle |
|---|---|---|
| 23:47 | Planif | Choisit et spécifie la fonctionnalité de la nuit |
| 00:43 | Dev | La code, avec ses tests, et ouvre une PR |
| 02:13 | QA | Teste de bout en bout, photographie l'app sous 5 angles, signale les bugs |
| 03:13 | Revue & release | Relit, fusionne, publie une version |
| 06:47 | Superviseur | Rédige le rapport du matin et surveille la santé du projet |

Le socle (outillage, règles d'équipe, roadmap) a été préparé à la main ; **toute
l'application est écrite par les agents**. Le fonctionnement de l'équipe est décrit dans
[`CLAUDE.md`](CLAUDE.md), la roadmap dans [`docs/ROADMAP.md`](docs/ROADMAP.md).

- Rapports du matin et captures : branche [`equipe`](../../tree/equipe)
- Versions publiées : onglet *Releases* et GitHub Pages

## Lancer le projet

Prérequis : Node 22.

```bash
cd frontend
npm ci
npm start            # http://localhost:4200
npm run verify       # formatage, lint, tests unitaires, build, bout en bout
npm run captures     # captures sous 5 angles dans docs/captures/latest
```

## Documentation

| Document | Contenu |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Couches, déterminisme, rendu pixel art, contrat de capture, tests |
| [`docs/DA.md`](docs/DA.md) | Direction artistique |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Phases, versions, épopées |
| [`docs/adr/`](docs/adr/) | Décisions d'architecture |
