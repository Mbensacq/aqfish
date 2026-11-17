# Audit de qualité du code — 2026-11-17

Point de départ du chantier d'assainissement #686. Mesures sur `main` (`4a2082b`, v1.23.1),
code de production de `frontend/src/app` (hors `*.spec.ts`). Les commandes de la dernière
section permettent de refaire chaque mesure.

## Synthèse

| Point | Constat | Appréciation |
|---|---|---|
| Couches `ui → render → sim → core` | Imposées par ESLint, aucune violation | Solide |
| Déterminisme de la simulation | PRNG à graine, pas fixe, horloge réelle interdite par le lint | Solide |
| Couverture des tests unitaires | 96 % des lignes, `sim/` > 99 % (rapport du 15/11) | Solide |
| Mutation hebdomadaire de `sim/` | 86,95 % ; trois fichiers sous 75 % | Bon, à renforcer par endroits |
| Duplication | 3 blocs, 58 lignes (0,11 %) | Très bon |
| Exports inutilisés | 3 types sur 3 119 exports | Très bon |
| Concentration de la complexité | Un composant de 5 438 lignes, 4 fichiers de plus de 2 200 lignes, 39 fonctions de complexité > 15 | **À traiter** |
| Cycles d'import | 1 cycle à l'exécution (5 modules) ; 60 modules liés par des imports de types | **À traiter** |
| Coût du rendu | Passe palette faite par pixel d'affichage : 2 images/s en rendu logiciel | Corrigé (ADR 0151) |

Le code est sain sur l'essentiel : la dette est concentrée dans quelques fichiers qui ont
absorbé les fonctionnalités au fil des cycles, en premier lieu l'hôte de l'aquarium.

## Volumes

| Couche | Fichiers | Lignes de code | Lignes de tests |
|---|---|---|---|
| `sim` | 114 | 37 315 | 41 004 |
| `render` | 50 | 14 669 | 11 824 |
| `ui` | 33 | 14 260 | 12 334 |
| `core` | 22 | 3 335 | 3 272 |

Bout en bout : 115 fichiers, 434 tests, ~198 min cumulées en CI avant l'ADR 0151.

## Fichiers les plus gros

| Fichier | Lignes | Remarque |
|---|---|---|
| `ui/aquarium-host/aquarium-host.ts` | 5 438 | ~190 méthodes : boucle d'images, séance d'entretien, éditeurs, sauvegarde, partage, photo, fond d'écran, attributs de test |
| `sim/species.ts` | 2 554 | Surtout des données d'espèces |
| `render/aquarium-view.ts` | 2 315 | Caméra, glisser, passes et couches dans une classe |
| `sim/world.ts` | 2 244 | Types de l'état **et** orchestration du pas |
| `ui/control-panel/control-panel.ts` | 2 231 | Toutes les sections du panneau |
| `sim/save.ts` | 1 171 | Validation champ par champ |

## Fonctions les plus complexes

| Fonction | Complexité | Lignes |
|---|---|---|
| `AquariumHost.begin` | 83 | 207 |
| `stepFish` (`sim/swimmer.ts`) | 54 | 219 |
| `readWater` (`sim/water.ts`) | 52 | 178 |
| `parseWorldBody` (`sim/save.ts`) | 45 | 132 |
| `stepInPlace` (`sim/world.ts`) | 39 | 227 |
| `healthSummary` (`sim/health-summary.ts`) | 33 | 123 |
| `stepWalker` (`sim/axolotl.ts`) | 32 | 136 |
| `observeJournal`, `isEntry` (`sim/journal.ts`) | 30, 29 | — |

Au total : 39 fonctions de complexité > 15, 19 fonctions de plus de 80 lignes, 60 fonctions
de plus de 5 paramètres, 11 fichiers de plus de 600 lignes (hors blancs et commentaires).

## Dépendances

- **Cycle à l'exécution** : `world` → `species-catalog` → `species-sheet` → `treatment` →
  `population` → `world`.
- **Imports de types** : 60 modules de `sim/` forment une composante cyclique, parce que les
  types de l'état (`World` et ses entités) sont déclarés dans `world.ts`, qui importe à son
  tour presque tous les modules du pas.
- **Les plus importés** : `core/random/prng.ts` (35), `render/palette.ts` (33),
  `sim/daylight.ts` (33), `sim/species.ts` (31), `sim/environment.ts` (29).

## Performance des tests de bout en bout

Les parts e2e duraient de 21 à 36 minutes. Mesure en rendu logiciel (celui de la CI) :
2 images par seconde en 1280 × 720, ~7 s par clic, alors que le JavaScript occupait moins de
1 % du fil principal. Cause : la recherche de la couleur de palette était faite par pixel
d'affichage. Corrigé par l'ADR 0151 (11,6 images par seconde, image identique), et la CI
construit désormais l'application une seule fois au lieu de recompiler sur chaque part.

## Suites

- Garde-fous : limites et cliquet vérifiés par le lint, cycles interdits, empreintes de
  non-régression (`docs/CONVENTIONS.md`).
- 13 lots de refactorisation (#687 à #699), dans l'ordre de #686.

## Refaire les mesures

Depuis `frontend/` :

```bash
npm run qualite:bilan                      # exceptions restantes aux limites
node scripts/cycles-imports.mjs            # cycles d'import à l'exécution
npx -y jscpd@4.0.5 src/app --pattern '**/*.ts' --ignore '**/*.spec.ts' \
  --min-lines 12 --min-tokens 80           # duplication
npx -y madge@8.0.0 --circular --extensions ts --ts-config tsconfig.app.json \
  --exclude '\.spec\.ts$' src/app          # cycles, imports de types compris
```
