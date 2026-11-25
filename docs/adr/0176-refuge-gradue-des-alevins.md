# 0176 — Refuge gradué des alevins par la masse des plantes

- Statut : acceptée
- Date : 2026-11-25
- Auteur : Dev, cycle 297, issue #823 (tranche 2 de #731)

## Contexte

Depuis l'ADR 0107, un alevin est à l'abri des adultes s'il est à moins de `FRY_HIDE_RADIUS`
(12 cm, à l'horizontale) d'une plante, quelle qu'elle soit : une petite touffe protège autant
qu'un massif. `docs/ECOSYSTEME.md` § 3.3 veut que les plantes servent de refuge selon leur
masse, et la tranche 1 (#821, ADR 0175) a donné à chaque plante une masse (`plantMass`) que
la pousse augmente et que la taille réduit.

## Décision

Dans `sim/fry.ts` :

- **Couverture** d'un alevin (`fryCover`) : somme des masses des plantes à moins de
  `FRY_HIDE_RADIUS`, pousse comprise (`WaterState.plantGrowth`).
- **Protection** (`fryProtection`) : couverture / `FRY_FULL_COVER_M2` (0,03 m², approximation
  de jeu : une touffe dense d'environ 17 × 17 cm), bornée à 1 ; 0 sans plante (plancher).
- **Vigilance** (`fryVigilance`) : nombre fixe de [0, 1[ par alevin, hachage de la graine du
  monde et de son identifiant. Aucun tirage pris aux générateurs des poissons, rien de
  sauvegardé : les sauvegardes ne changent pas.
- Un alevin est **à l'abri** (`isSheltered`) si sa vigilance est sous la protection. La
  prédation (`eatFryInPlace`) ne vérifie l'abri que pour un alevin à portée d'un adulte.
- **Bilan du bac** (`sim/bilan.ts`) : point « Alevins sans refuge suffisant » quand moins de la
  moitié des alevins sont à l'abri (`FRY_REFUGE_SUFFICIENT`), avec le compte, la couverture
  visée et l'action.

Pourquoi une vigilance fixe plutôt qu'un tirage à chaque rencontre : un tirage par pas, répété
tant qu'un adulte reste à portée (des dizaines de pas), condamnerait presque tout alevin sous
une couverture partielle ; avec une vigilance fixe, la part des alevins à l'abri est exactement
la protection, lisible et testable, et le compte du bilan est celui de la prédation.

## Conséquences

- Sous une couverture pleine, rien ne change par rapport à l'ADR 0107 ; sous une touffe seule
  (0,01 m² à l'échelle 1), un tiers des alevins environ sont à l'abri.
- Empreinte changée : `alevins` de `sim/step-caracterisation.spec.ts` (bac par défaut avec
  alevins, dont les touffes ne couvrent plus pleinement). `sim/non-regression.spec.ts` et
  les sauvegardes sont inchangées.
- Scénario S13 (`sim/ecosystem-scenarios.spec.ts`) : à emplacements égaux, des touffes denses
  gardent au moins une fois et demie plus d'alevins que des touffes maigres.
- Plantes flottantes (lentille d'eau, salvinia) : absentes du jeu, proposées dans une issue à
  part ; leur absorption est déjà prévue (`PLANT_UPTAKE_MG_N_PER_M2_DAY.flottante`). Les
  jeunes crevettes viendront avec #732.
