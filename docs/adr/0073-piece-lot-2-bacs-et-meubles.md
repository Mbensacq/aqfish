# 0073 — Pièce de N bacs, lot 2 : catalogue des bacs et des meubles, pose analytique

- Statut : acceptée
- Date : 2026-10-29
- Auteur : Dev, cycle 98, issue #305 (épopée #264)

## Contexte

L'ADR 0061 fixe la cible de la pièce de N bacs ; l'ADR 0069 a livré le lot 1 (état de la
pièce, schéma 2) en reportant au lot 2 les meubles supports, leur compteur et la position
des bacs (`furniture`, `nextFurnitureId`, `placement`). L'issue #305 demande un catalogue de
bacs (petit, moyen, grand) et de meubles supports, l'ajout et le retrait d'un bac vide posé
au sol ou sur un meuble, et l'enregistrement de tout cela au schéma 2.

Contraintes : déterminisme, `sim` pur, captures d'un bac seul identiques à l'octet, PR
d'environ 600 lignes hors tests. Le modèle (simulation et sauvegarde) atteint à lui seul
cette taille : l'interface, le rendu des bacs posés, l'e2e et les captures de la pièce à
deux bacs suivent dans une seconde PR (lot 2b).

## Décision

1. **Modèle** (`sim/room-state.ts`) : `RoomState` gagne `furniture: RoomSupport[]` (triés par
   identifiant) et `nextFurnitureId` ; `RoomTank` gagne `placement: TankPlacement | null`.
   `TankPlacement = { supportId: number | null, x, z, quarter }` : centre de l'emprise au
   centimètre, en mètres, quart de tour ; `supportId` `null` signifie **posé au sol**.
   `placement` `null` signifie **position historique** : le bac du lot 1 au centre de la
   pièce, sur le meuble implicite des réglages (`sim/room.ts`, `cabinetHeight`) ; il réserve
   une colonne de son emprise (plus le débord du meuble, 2 cm) jusqu'au plafond. Le bassin du
   jardin a toujours `placement` `null` et n'occupe pas la pièce.
2. **Catalogue** : tailles `petit` (60 × 50 × 30 cm), `moyen` (100 × 50 × 40 cm), `grand`
   (150 × 60 × 50 cm), toutes dans `TANK_LIMITS` ; la taille ne s'applique qu'aux
   environnements réglables (`tropical`), les autres gardent leurs dimensions. Meubles :
   `commode` (120 × 50 cm, plateau à 75 cm) et `etagere-bacs` (160 × 45 cm, plateau à 40 cm),
   **un seul niveau** chacun.
3. **Pose analytique au centimètre** : boîtes alignées sur les axes, calculées en
   demi-centimètres entiers (aucune erreur d'arrondi). Un meuble se pose au sol ; un bac se
   pose au sol ou sur le plateau d'un meuble, emprise entièrement sur le plateau. Refus :
   pièce pleine, position non centimétrique, hors du sol (8 × 6 m, `ROOM_FLOOR`), hors du
   plateau, chevauchement d'un meuble ou d'un autre bac (se toucher est permis), meuble
   inconnu, bassin (il est au jardin). Retirer un meuble qui porte un bac est refusé ;
   retirer le dernier bac aussi. Fonctions pures : `addSupport`, `removeSupport`, `addTank`,
   `moveTank`, `removeTank`, `renameTank`, `tankPlacementRefusal`, `roomLayoutProblems`.
4. **Bac ajouté** : vide (décor de départ de l'environnement, aucun animal), identifiant
   `nextTankId`, graine `tankSeed(graine, id)` (ADR 0061) ; ajouter ou retirer un bac ne
   change ni la graine ni l'évolution des autres (testé au bit près). La confirmation avant
   de retirer un bac peuplé revient à l'interface (`tankAnimalCount`).
5. **Schéma 2, champs facultatifs** (pas de schéma 3) : `nextFurnitureId` et `furniture` au
   niveau de la pièce, `placement` par bac. Ils sont **omis** quand ils sont vides (aucun
   meuble jamais posé, position historique) : un document du lot 1 relu puis réécrit est
   identique au caractère près. À la lecture : `furniture` absent vaut `[]`, `nextFurnitureId`
   absent vaut 0 (refusé s'il y a des meubles), `placement` absent vaut `null` ; puis la
   disposition entière est revalidée (`roomLayoutProblems`). `serializeRoom` refuse d'écrire
   une disposition incohérente.

## Options écartées

- **`placement` toujours non nul, meuble `meuble-bac` explicite créé à la migration** (forme
  de l'ADR 0061) : il faudrait convertir les meubles de la pièce graphique (`settings.room`)
  du repère du bac à celui de la pièce, et le rendu et l'éditeur de la pièce avec eux ;
  reporté au lot où l'hôte dessine la pièce depuis `RoomState` (lot 3).
- **Étagère à plusieurs niveaux** dès ce lot : chaque niveau serait un support, et la boîte
  pleine du meuble ne peut plus servir d'obstacle (un bac se glisse entre deux niveaux) ;
  reporté à l'étude de l'animalerie (lot 4).
- **Élargir `TANK_LIMITS` au nano-bac** (demandé par #305) : la hauteur minimale de 50 cm
  sert aussi la nage, l'eau et le redimensionnement de l'hôte ; un changement à mesurer et à
  sourcer à part, sans bloquer le catalogue.
- **Pose par gravité (empilement libre)** comme les meubles de la pièce graphique (ADR 0049) : inutile pour des bacs qui ne s'empilent pas ; un plateau désigné est plus simple
  à valider et à enregistrer.

## Conséquences

- Les meubles de la pièce graphique (`settings.room.items`) et les meubles supports de
  `RoomState` coexistent sans se voir jusqu'au lot 3 ; l'hôte du lot 2b doit passer les
  premiers comme obstacles et borner la pose au sol par les murs de la pièce graphique
  (`roomArea`), plus étroite que `ROOM_FLOOR` derrière le bac.
- L'hôte du lot 1 (`syncRoom`) garde meubles, compteur et positions à chaque
  resynchronisation ; un bac ajouté d'un environnement déjà présent est refusé à l'import
  par `roomWorlds` (« pas encore pris en charge ») tant que l'hôte n'affiche qu'un bac par
  environnement : le lot 2b distinguera les bacs posés (`placement` non nul), figés comme
  les mondes rangés (ADR 0063), des bacs à la position historique.
- Reste du lot 2 (2b) : catalogue dans l'interface, rendu des meubles et des bacs posés,
  e2e (ajout, rechargement, confirmation), captures de la pièce à deux bacs.
