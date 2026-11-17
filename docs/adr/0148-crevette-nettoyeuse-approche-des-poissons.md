# 0148 — Crevette nettoyeuse : approche des poissons de passage

- Statut : acceptée (complète l'ADR 0103)
- Date : 2026-11-17
- Auteur : Dev, cycle 234, issue #656

## Contexte

La crevette nettoyeuse (_Lysmata amboinensis_) est au récif depuis #422 (ADR 0103) : espèce,
fiche sourcée (Reeflex), statut légal à vérifier, marche sur le fond qui contourne coraux et
rochers. L'issue #656 demandait en plus un comportement lisible de nettoyage : la crevette
approche de temps en temps un poisson de passage. Le nettoyage réel (parasites, santé) est
hors périmètre.

## Décision

1. **Paramètre facultatif `BottomWalkerParams.cleaning`** (`share`, `radius`, `standoff`,
   `maxHeight`, validés par `validateSpecies`), déclaré par la seule crevette nettoyeuse :
   approximations de jeu (½ des créneaux de marche, portée 30 cm, arrêt à 5 cm, poisson au
   plus 20 cm au-dessus d'elle).
2. **Créneau d'approche tiré comme les états** : `walkerCleansAt(cleaning, graine, id,
créneau)`, hachage à sel propre, fonction pure. Aucun champ d'état ajouté : la sauvegarde
   ne change pas, un monde rechargé reprend la même approche au même instant.
3. **Cible** (`cleaningTarget`) : le nageur le plus proche à l'horizontale, au-dessus d'elle
   (jamais en dessous), à portée ; marcheurs du fond et amphibiens exclus ; à égalité, le
   premier du tableau.
4. **Pendant l'approche, la marche reste la marche** : seul le cap change (virage borné par
   `avoidTurnRate`), l'errance est tirée sans être appliquée (un tirage par pas, comme avant),
   l'évitement des obstacles et des pentes reste prioritaire, et les mêmes refus de pas
   s'appliquent : la crevette ne quitte ni le fond ni le bac. Arrivée à `standoff`, elle
   ralentit à `minSpeed`.
5. `stepWalker` reçoit les habitants du bac (`others`, vide par défaut) ; `world.ts` lui passe
   le tableau des entités.

## Options écartées

- **Quatrième état `nettoyage` dans les poids** : aurait redistribué les créneaux de toutes
  les phases de la crevette et ne dépendrait pas de la présence d'un poisson.
- **Le poisson vient à la station** (comportement réel le plus courant) : toucherait la nage
  de tous les poissons du récif et toutes les captures du récif peuplé.

## Conséquences

- Seules les captures où figure la crevette nettoyeuse changent (`recif-three-quarter-lot3`,
  `recif-front-lot3`) ; les autres, crevette cerise et axolotl compris, sont identiques à
  l'octet.
- Coût : au plus un parcours des habitants par crevette et par pas, pendant les créneaux
  d'approche (au plus deux crevettes par bac) : non mesurable sur le récif peuplé.
