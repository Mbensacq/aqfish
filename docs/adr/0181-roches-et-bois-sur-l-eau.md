# 0181 — Roches et bois qui agissent sur l'eau

- Statut : acceptée
- Date : 2026-11-25
- Auteur : Dev, cycle 304, issue #733 (lot 7 de `docs/ECOSYSTEME.md`)

## Contexte

Rochers et bois flotté étaient du décor sans effet sur l'eau. En vrai, une roche calcaire
relève la dureté et le pH vers 7,6–7,9, sans effet au-dessus de 8,4, vite avec de la surface et
du courant, en quelques mois pour un bloc en eau calme ; les autres roches courantes sont
inertes ; aucune ne filtre (aquariumscience.org, « Rocks »). Le bois flotté libère des tanins et
baisse légèrement le pH. Le scénario S11 (roche calcaire chez des néons) restait impossible.

## Décision

- **Matière d'un rocher** : champ optionnel `material` de `DecorItem` (`sim/decor.ts`),
  `inert` ou `limestone`, refusé pour un bois ou une plante. Absent : inerte. La clé n'est
  écrite que pour `limestone` : une sauvegarde antérieure se relit à l'identique, et une roche
  inerte ne change pas le texte de sauvegarde. Les surfaces actives sont sommées par
  `decorSurfacesInto` (`sim/decor-water.ts`), seule source pour le pas et les lectures
  (cycle 305, #841 : `decorMaterial` supprimé, il ne servait plus qu'aux tests).
- **Éditeur** : une entrée « Roche calcaire » du catalogue (`limestone`, après « Rocher ») pose
  un rocher calcaire ; la consigne de pose dit l'effet sur l'eau de chaque élément qui en a un
  (rocher inerte, roche calcaire, bois flotté), source ou « approximation de jeu » comprise.
  La matière d'un rocher déjà posé ne change pas : on le retire et on en pose un autre.
- **Rendu** : même modèle voxel, blanc crème veiné de gris (`LIMESTONE_COLORS`) pour une roche
  calcaire ; aucun nouveau modèle (hors périmètre).
- **Eau** (`sim/decor-water.ts`, appelé par `stepLivingWaterInPlace` après `stepWaterInPlace`,
  donc au pas fin comme à gros pas) :
  - surface d'un élément : son échelle au carré ; courant : l'efficacité du filtre, avec un
    quart du taux sans filtre ;
  - roche calcaire : approche exponentielle du pH vers 7,8 sous cette valeur (jamais
    au-delà, jamais vers le bas) ; dissolution du carbonate vers 10 °dKH, autant ajouté à la
    dureté générale, nulle au-dessus de pH 8,4 ; taux 1/72 000 s⁻¹ pour une roche à
    l'échelle 1 dans 288 L, proportionnel à la surface et inverse du volume ;
  - bois flotté : approche du pH vers 6,5, au taux 1/288 000 s⁻¹, sans décomposition ni teinte ;
  - sans calcaire ni bois, rien n'est écrit dans l'eau. Aucune allocation par pas.
- La dureté reste un affichage : elle n'agit ni sur la santé ni sur le pH (ADR 0113). Le pH,
  lui, agit déjà sur la santé (`sim/wellbeing.ts`).

## Options écartées

- **Tampon carbonaté** (le KH freine la baisse du pH) : plus juste, mais change tout le modèle
  du pH et les scénarios S1 à S13 ; hors périmètre d'un lot S.
- **Matière pour tous les éléments** (plantes comprises) : sans effet pour les plantes ; la
  matière du bois est implicite.
- **Teinte des tanins du bois** : elle aurait changé l'apparence du bac d'eau froide par défaut
  et la teinte unique du catappa (`docs/PIEGES.md`, palette) ; laissée au catappa.
- **Bonus de filtration des roches** (lave, roches poreuses) : contredit par la source.

## Conséquences

- S11 devient un test vert : bac planté de 60 L, 10 néons, une roche calcaire à l'échelle 1,5,
  aucun changement d'eau : pH 7,50 au 7e jour de jeu, 7,69 au 90e (néons hors de leur plage
  idéale, 6–7,2, dans la tolérée, 5–7,8), 10 °dKH et 14 °dGH, eau « bonne », pleine santé ;
  la même roche inerte laisse le pH à 6,99 et la dureté du robinet. S1 à S13 inchangés.
- Le bac d'eau froide par défaut a un bois flotté : son pH baisse très lentement ; ses
  empreintes de non-régression changent (seul changement voulu, expliqué dans la PR).
- Approximations de jeu : cible 7,8, plafond de 10 °dKH, taux, part en eau calme, effet du
  bois. Le pH d'équilibre avec roche calcaire reste un peu sous 7,8 dans un bac peuplé sans
  changement d'eau : la dérive organique n'est pas tamponnée (option écartée ci-dessus).
