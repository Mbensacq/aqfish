# 0102 — Étagère d'animalerie : meubles supports à plusieurs niveaux

- Statut : acceptée (complète 0073)
- Date : 2026-11-03
- Auteur : Dev, cycle 140, issue #419 (solde de l'épopée #264)

## Contexte

L'ADR 0061 prévoit « des étagères d'animalerie à plusieurs niveaux ; chaque niveau est un
support » ; l'ADR 0073 a livré des meubles à un seul plateau et reporté les niveaux, car la
boîte pleine d'un meuble ne peut plus servir d'obstacle quand un bac se glisse entre deux
tablettes. L'issue #419 demande une étagère à trois niveaux, sans perte pour les sauvegardes
existantes (schéma 2) et sans toucher aux captures d'une pièce à un bac.

## Décision

1. **Niveaux au catalogue** (`sim/room-state.ts`) : chaque `SupportModel` a une liste
   `levels` (du bas vers le haut) de `SupportLevel` : hauteur de la tablette, plateau
   utilisable (emprise moins les montants) et hauteur libre au-dessus (`null` : jusqu'au
   plafond). La commode et l'étagère basse ont un seul niveau, identique à leur ancien
   plateau : leur pose ne change pas.
2. **Étagère d'animalerie** (`etagere-animalerie`) : 130 × 50 cm, tablettes de 3 cm dont le
   dessus est à 10, 76 et 142 cm, quatre montants de 4 cm ; les niveaux bas ont 122 cm de
   plateau et 63 cm libres, le plateau du haut 130 cm, ouvert jusqu'au plafond. Cotes en
   centimètres entiers, **approximation de jeu** des étagères de bacs du commerce (1,4 à
   1,8 m de haut, trois ou quatre rangées, bacs de 60 à 100 cm), non sourcées : un bac moyen
   (100 × 50 × 40 cm) par niveau, deux petits sur un niveau, ni grand bac ni récif (150 cm).
3. **Niveau d'un bac** : champ facultatif `TankPlacement.level` (0 : le plus bas), **absent
   pour le niveau 0** : toute position antérieure reste valide et identique, sans schéma 3 ni
   migration. À la lecture, `level` absent vaut 0, présent doit être un entier de 0 à
   `MAX_SUPPORT_LEVELS − 1` ; sa validité pour le meuble est revue avec la disposition
   (`roomLayoutProblems`).
4. **Pose** (`tankPlacementRefusal`) : niveau existant du meuble (au sol, seul le niveau 0),
   emprise sur le plateau du niveau, bac sous la tablette du dessus et sous le plafond
   retenu (`ROOM_CEILING_CM`, 2,20 m, sous le plus bas plafond de la pièce graphique,
   2,25 m) : refus `trop-haut` sinon. Le meuble porteur n'est plus un obstacle pour ses
   propres bacs (plateau et hauteur libre suffisent) ; il reste une boîte pleine pour tout
   le reste (bac au sol, autre meuble). Les bacs de niveaux différents se comparent par
   leurs boîtes, comme avant. Retirer ou déplacer le meuble reste refusé tant qu'un niveau
   porte un bac (règle de l'ADR 0073, inchangée).
5. **Pose automatique** (`findTankSpot`) : niveaux du bas vers le haut, chacun comme un
   plateau ; le catalogue « Bacs et meubles » ne demande donc pas de niveau, il remplit
   l'étagère. Le niveau est affiché dans la liste (« posé sur Étagère d'animalerie 1,
   niveau 2 »).
6. **Rendu** (`roomLayoutBlocks`) : montants, tablettes et traverses en blocs opaques
   (parties `caisson` et `plateau`) ; un bac posé a sa base à la hauteur de son niveau.

## Options écartées

- **Un support logique par niveau** (identifiant composite, ou trois meubles empilés) : le
  meuble ne se retirerait plus d'un bloc, et la sauvegarde aurait des meubles « fantômes »
  à valider ensemble ; un champ de position est plus simple et compatible.
- **Choix du niveau dans le catalogue** (liste déroulante) : une ligne de plus dans un
  panneau sans marge à 1280 × 720 (`docs/PIEGES.md`) ; la pose automatique couvre le
  besoin, le modèle accepte déjà tout niveau (`moveTank`).
- **Plafond lu sur la pièce graphique** : il dépend du bac affiché et du meuble implicite ;
  une borne fixe sous le plus bas garde la validation pure et la sauvegarde stable.

## Conséquences

- Les sauvegardes existantes se relisent et se réécrivent à l'identique ; seul un bac posé
  au niveau 1 ou 2 écrit `level`.
- Le plafond de meubles et de bacs (ADR 0096) compte l'étagère pour un meuble ; trois bacs
  pleins s'y posent sur une seule emprise au sol.
