# 0169 — Avance « écosystème » à gros pas et harnais des scénarios de référence

- Statut : acceptée
- Date : 2026-11-23
- Auteur : Dev, cycle 288, issue #799 (tranche 2c de #728)

## Contexte

L'équilibre d'un bac se juge sur des semaines et des mois simulés (`docs/ECOSYSTEME.md`
§ 3.4). Au pas fin (`SIM_DT` = 1/60 s), avec la nage de chaque animal, trois mois de jeu
(90 jours de 20 minutes) demanderaient plus de six millions de pas : impossible dans un test
unitaire. Les scénarios de référence (§ 4) ont besoin d'une avance rapide, déterministe, qui
reste fidèle au pas fin.

## Décision

- **Module `sim/ecosystem-step.ts`** : `advanceEcosystemInPlace(world, durée, options)`
  enchaîne, à chaque pas long, la faim (`growHunger`, comme la nage), l'eau, les algues, les
  plantes et la santé : **les mêmes fonctions** que le pas fin (`sim/world-step-life.ts`), dans
  le même ordre. Pas de nage, de granulés, de maladies (tirées au hasard), de mortalité ni de
  rendu : aucun tirage, même monde ⇒ même résultat au bit près. Mode décor : seul le temps
  avance.
- **Pas de 5 s** (`ECOSYSTEM_STEP_SECONDS`). L'ammoniaque produite pendant un pas n'est
  convertie qu'au pas suivant (`stepWaterInPlace`) : l'écart avec le pas fin vaut environ
  `pas / 120 s`. Mesuré sur le bac tropical par défaut : 2,1 % sur l'ammoniaque à 5 s (0,5 %
  sur les nitrates), 27 % à 60 s. Tolérance des tests : 3 %. Trois mois d'un bac peuplé
  tournent en environ 0,1 s.
- **Volume imposé** (`liters`) : le bocal de 10 L de S1 est plus petit que le plus petit bac
  réglable ; l'avance accepte un volume d'eau à la place de celui de la boîte du monde. Pour
  cela, `stepWaterStageInPlace` est découpé : `stepLivingWaterInPlace(world, dt, liters)`
  (corps et pas d'eau) est partagé par les deux avances, sans changer un bit du pas fin
  (empreintes de non-régression inchangées).
- **Repas sans nage** (`feedAnimalsInPlace`) : chaque animal qui mange les granulés et a faim
  en mange jusqu'à ne plus avoir faim, de la masse moyenne d'un granulé ; l'ammoniaque des
  repas entre dans l'eau comme au pas fin (ADR 0168). Rien ne tombe ni ne pourrit.
- **Harnais** (`sim/testing/ecosystem-scenario.ts`, aide de test hors build) : bac de départ,
  volume, entretien (période des repas, période et part des changements d'eau), durée en jours
  de jeu ; relevé des pics d'ammoniaque, de nitrites et de nitrates (valeur et jour), de la
  pire qualité de l'eau et du premier jour « mauvaise », de la santé minimale et des algues.
  Entretien normal : un repas par minute simulée, 30 % d'eau tous les 7 jours de jeu
  (calendrier d'entretien).

## Options écartées

- **Intégrer exactement la production pendant le pas** (solution de `dA/dt = p − kA`) : plus
  juste à gros pas, mais change le pas fin, donc toutes les empreintes, sans gain de
  comportement ; le pas de 5 s suffit.
- **Pas d'une minute** (exemple de `docs/ECOSYSTEME.md`) : 27 % d'écart sur l'ammoniaque.
- **Rattrapage hors ligne dans l'application** (bac rangé, retour après une absence) : hors
  périmètre ; l'avance le permettra.

## Conséquences

- S1 et S4 sont des tests (`sim/ecosystem-scenarios.spec.ts`), chacun en moins de 5 s.
- **S2 et S12 échouent** avec la calibration actuelle (relevés dans `docs/ECOSYSTEME.md`
  § 4) : l'azote est calé en secondes sur le tableau de bord, l'entretien en jours de 20 min.
  Ils deviendront des tests quand la production sera recalée sur le jour de jeu (issue à part).
