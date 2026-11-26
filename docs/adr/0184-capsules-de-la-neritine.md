# 0184 — Capsules d'œufs de la néritine : collées sur les rochers, jamais écloses

- Statut : acceptée (complète les ADR 0111, 0146 et 0182)
- Date : 2026-11-26
- Auteur : Dev, cycle 311, issue #678

## Contexte

Épopée v1.23 « Reproduction, suite » : au bac tropical, la néritine zèbre ne pondait pas. FishKeeper : elle pond sur le décor, mais les œufs n'éclosent pas
en eau douce ; Aquarium Breeder : les œufs ne sont viables qu'en eau saumâtre (5 à 15 ‰), ce que
le jeu sait déjà (`NERITE_HATCHES_IN_FRESHWATER`, `sim/shrimp-colony.ts`). En aquarium, ce sont de
petites capsules blanches et dures, isolées, collées surtout sur les pierres et le bois.

## Décision

1. **Même calendrier, mêmes conditions** que les autres ovipares (ADR 0111) : la néritine
   rejoint `EGG_SPECIES` en dernier (tirages des autres espèces inchangés), avec la plage de
   ponte commune 22–26 °C, qui est aussi la plage tolérée de sa fiche (FishKeeper). Ponte de 4 à
   10 capsules (`clutchSize` commun), bornée par `eggRoom` (plafond d'espèce de 6, œufs sans
   alevin exclus de ce plafond selon l'ADR 0146, `MAX_TOTAL_FISH`, `MAX_EGGS`).
2. **Sur les rochers** (`CAPSULE_EGG_SPECIES`, `layCapsuleClutch` dans `sim/eggs-nerite.ts`) :
   chaque capsule tire un rocher, une sphère de sa forme de collision (`rockSpheres`) et une
   direction sur le dessus ou le flanc (hauteur au-dessus de `CAPSULE_MIN_UP`), à
   `EGG_GLASS_INSET` de la surface ; jusqu'à `CAPSULE_TRIES` essais pour sortir des sphères
   voisines, sinon le point est ressorti de celles qui le recouvrent. Surface `'rocher'` :
   schéma de sauvegarde inchangé. Sans rocher, ou décor absent : aucune capsule, aucune exception.
3. **Dures** : `isEggExposed` faux, aucun adulte ne les mange.
4. **Jamais d'éclosion en eau douce** : `hatchesToFry` faux ; la capsule s'efface à
   `EGG_HATCH_TIME`, sans larve ni alevin. Toutes les néritines du jeu vivent en eau douce.
5. **Répartiteur** : le choix de la surface de ponte selon l'espèce sort de `sim/world.ts` vers
   `laySpeciesClutch` (`sim/eggs-clutch.ts`), qui reçoit les surfaces du bac ; `sim/world.ts`
   descend sous son exception de taille (1 407 lignes).
6. **Rendu** : les capsules restent blanches (pas de teinte « mûre ») et sont dessinées après
   l'eau : dans la file opaque, la passe palette faisait virer leur blanc au bleu pâle des
   bulles (capture du cycle 311).
7. **Capture** `three-quarter-oeufs-neritine` : lot 4 d'eau douce (trois néritines) avec
   `oeufs=1`, trois capsules blanches sur les rochers.

## Options écartées

- **Une durée de vie propre aux capsules**, plus longue que l'incubation : il fallait un âge
  maximal par espèce dans la validation de la sauvegarde (`isEggAge`) ; reporté, la durée
  commune suffit à l'issue.
- **Le bois flotté comme surface dure** : forme de collision fine (branches), capsules souvent
  enfouies ; à ajouter avec une surface `'bois'` si une issue le demande.
- **Éclosion en eau saumâtre** : aucune eau saumâtre dans le jeu ; larves marines hors périmètre.

## Conséquences

- Un bac tropical avec un couple de néritines nourries et des rochers voit apparaître des
  capsules blanches à chaque période ; le journal note « Ponte » ; la population ne grandit pas.
- Les scénarios de non-régression, sans néritine, ne changent pas.
- Le nettoyage des capsules à la raclette (point 6 de #593) peut suivre.
