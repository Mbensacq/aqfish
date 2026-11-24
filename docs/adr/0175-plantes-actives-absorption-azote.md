# 0175 — Plantes actives : absorption de l'azote, pousse liée à l'azote

- Statut : acceptée
- Date : 2026-11-24
- Auteur : Dev, cycle 296, issue #821 (tranche 1 de #731)

## Contexte

`docs/ECOSYSTEME.md` § 3.3 : les plantes du jeu poussaient et se taillaient, mais
**n'absorbaient rien** ; les nitrates ne baissaient qu'au changement d'eau, et aucun bac planté
peu peuplé (méthode Walstad) ne pouvait être stable sans entretien. Les scénarios S5 (60 L très
planté, 10 néons, sans changement d'eau : stable), S6 (le même sans plantes : instable) et S7
(le même surpeuplé : algues) devaient devenir des tests.

## Décision

Nouveau module pur `sim/plant-uptake.ts`, appelé par l'étape des plantes
(`stepPlantsStageInPlace`, `sim/world-step-life.ts`), au pas fin comme à gros pas (le volume
imposé de l'avance écosystème lui est passé) :

- **Masse** d'une plante, en m² de couverture : emprise de sa forme (`PLANT_FOOTPRINT_M2` :
  plante à tige 0,02 m², touffe 0,01 m², approximation de jeu) × échelle² × hauteur totale /
  hauteur d'origine. Aucun champ de sauvegarde nouveau : la masse se déduit du décor et de
  `WaterState.plantGrowth` ; la taille, qui retire de la pousse, retire de la masse.
- **Type** : plante à tige → rapide (_Egeria densa_, 125 mg N/m²/j), touffe → lente (quart
  d'_Egeria_, approximation de jeu), flottante (_Salvinia_, 406 mg N/m²/j, Reddy et De Busk 1985) prête pour la tranche 2. Un jour de jeu vaut un jour réel pour l'azote (ADR 0170).
- **Capacité** = masse × absorption du type × facteur de lumière (`plantLightFactor` : nul
  sans lumière) : c'est le plafond de ce que retirent les plantes.
- **Ammonium d'abord** : la capacité du pas est dépensée sur l'ammonium au prorata
  N / (K + N) (K = 0,05 mg N/L, approximation de jeu), puis le reste sur le nitrate, de même ;
  jamais plus que ce qui est dissous. Conversions par les masses molaires (NH₃ 17/14, NO₃⁻ 62/14).
- **Pousse** : le facteur de pousse des plantes à tige est multiplié par
  0,25 + 0,75 × N / (K + N) (azote total dissous) ; une plante sans azote pousse au quart.
- **pH** : la dérive du pH du jeu représente l'acidité des déchets azotés ; l'azote absorbé
  par les plantes relève le pH de la baisse qu'il aurait causée (`PH_RISE_PER_MG_N_PER_L`),
  sans dépasser le pH de l'eau neuve. Sans cela, S5 finissait à pH 5,25 malgré des nitrates
  nuls (dérive linéaire sans changement d'eau).
- **Algues** : inchangées ; elles poussent sur les nitrates **laissés par les plantes** et la
  lumière en excès (`algaeGrowth`). La concurrence passe par l'azote.
- Bassin et récif : pas de plantes actives (comme la pousse, `hasPlantGrowth`).

## Options écartées

- **Masse comptée en voxels du modèle** : coûteux à chaque pas et sans gain de réalisme.
- **Emprise de 0,01 m² par plante à tige** (10 × 10 cm) : S5 restait instable (nitrates à
  65 mg/L en 90 jours). La pollution du jeu par animal est forte (le néon compte 6 cm de
  modèle), le doublement de l'emprise compense ; à revoir si la charge est recalée.
- **Concurrence directe algues-plantes** (pousse des algues réduite par la masse de plantes) :
  aurait changé l'e2e des algues du bac par défaut sans nécessité.
- **Plafond de pH dérivé de la dureté (KH)** : hors périmètre ; la remontée liée à
  l'absorption suffit pour les scénarios.

## Conséquences

- S5, S6 et S7 sont des tests verts (`sim/ecosystem-scenarios.spec.ts`) ; S12 reste stable
  (bac tropical : nitrates au pic 20,0 mg/L au lieu de 22,5).
- Empreintes de non-régression changées pour les bacs à plantes actives : `tropical`,
  `tropical+nourri`, `eaufroide`, `eaufroide+nourri` (`non-regression.spec.ts`), et les
  scénarios tropicaux de `step-caracterisation.spec.ts` ; les sauvegardes simulées de
  `save-caracterisation.spec.ts` (lignes « ok » seulement). Bassin, récif et paludarium
  (sans plante dans son décor) inchangés.
- Les tests qui mesurent l'azote au mg/L près dans un bac au décor par défaut éteignent la
  lampe (`lighting: 0`) : les plantes n'y absorbent alors rien (`docs/PIEGES.md`).
- Tranche 2 de #731 : refuges, plantes flottantes à proposer, textes d'interface.
