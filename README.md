# aqfish

Simulateur d'aquarium en **pixel art 3D** dans le navigateur : poissons, amphibiens et
plantes dans plusieurs environnements (bac tropical, bassin à koïs, paludarium, récif), que
l'on fait tourner à la souris et que l'on observe de dessus, de dessous ou de côté.

## Une expérience : une app construite en continu par des agents

Ce dépôt est construit **en continu par une équipe d'agents**, sans validation
humaine : chaque cycle enchaîne quatre rôles, et le suivant démarre dès que le précédent
se termine (jusqu'à 12 cycles par jour).

| Agent | Rôle |
|---|---|
| Planif | Choisit et spécifie la fonctionnalité du cycle |
| Dev | La code, avec ses tests, et ouvre une PR |
| QA | Teste de bout en bout, photographie l'app sous 5 angles, signale les bugs |
| Revue & release | Relit, fusionne ; la CI publie la version |
| Superviseur | Chaque matin : rapport du jour et santé du projet |
| Relance | Toutes les heures : relance la chaîne si elle s'est arrêtée |

Le socle (outillage, règles d'équipe, roadmap) a été préparé à la main ; **toute
l'application est écrite par les agents**. Le fonctionnement de l'équipe est décrit dans
[`CLAUDE.md`](CLAUDE.md), la roadmap dans [`docs/ROADMAP.md`](docs/ROADMAP.md).

- Application en ligne : https://mbensacq.github.io/aqfish/
- Rapports du jour et captures : branche [`equipe`](../../tree/equipe) et issue #2
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
