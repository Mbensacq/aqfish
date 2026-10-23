# 0043 — Modèle d'édition du décor

- Statut : acceptée
- Date : 2026-10-23
- Auteur : Dev, cycle 56, issue #167

## Contexte

L'épopée v0.9 « L'éditeur » (idée de Mathis #34) permet de modifier le décor du bac à la
souris. Le décor est déjà décrit par des données (`DecorItem`, ADR 0015) : rochers et plantes
posés sur le sable, dont les formes de collision sont des obstacles du monde. Il faut ajouter,
choisir et supprimer des éléments sans casser la pureté de `sim/` (ADR 0003), le déterminisme,
la sauvegarde ni le contrat de capture ; le picking doit rester juste sous les cinq angles.

## Décision

- **Module pur `sim/decor-edit.ts`** : `addDecorItem` et `removeDecorItem` renvoient un
  **nouveau** tableau de `DecorItem` (jamais modifié en place ; `null` si rien ne change), puis
  `setDecorInPlace` l'installe dans le monde en recalculant ses obstacles comme `createWorld`
  (décor, puis éléments tirés de la graine). Poissons, nourriture et temps sont conservés ; un
  poisson recouvert par un élément ajouté en est sorti au pas suivant par le filet de sécurité
  de `stepFish`. `withDecor` en est la version non mutante.
- **Graine d'un élément ajouté** : `deriveSeed(graine du monde, DECOR_SEED_BASE + n)`, `n`
  partant de la longueur du décor et sautant les graines déjà prises ; rotation tirée de cette
  graine, échelle 1. Même monde et mêmes gestes : même décor.
- **Bornes** : centre à au moins 4 cm des vitres (`canPlaceDecorAt`), 64 éléments au plus
  (`MAX_DECOR_ITEMS` = `MAX_SAVE_DECOR`), élément validé par `validateDecorItem`.
- **Environnements** : le bac tropical seulement (`EDITABLE_ENVIRONMENTS`). Dans le récif,
  coraux et anémones sont disposés autour du décor (ADR 0040, 0041) : modifier le décor les
  déplacerait. Le bassin et le paludarium restent fixes pour l'instant.
- **Picking** (`render/`) : lancer de rayon Three.js sur les maillages voxels des éléments
  (`DecorLayer.pickItem`, coraux et anémones exclus), puis, à défaut, intersection pure du
  rayon avec le dessus du sable (`sandPoint`, `render/decor-pick.ts`). Le rayon part de la
  caméra réelle : juste sous tous les angles, sans code par préréglage.
- **Sélection** : la coque de contour de l'élément choisi prend un second matériau, clair
  (`texteInterface`) et de 2 px. Aucune couleur nouvelle dans la palette.
- **Interface** : « Éditer le décor » dans la section « Décor » de « Réglages » ouvre le panneau
  `ui/decor-editor` à la place de « Réglages » (exclusif avec lui à toutes les largeurs, avec
  « Commandes » sous 640 px). En mode édition, un clic sur le canvas édite au lieu de nourrir.
  Chaque modification est enregistrée aussitôt (`saveNow`).
- **Capture** : `edition=<indice>` montre le mode édition avec un élément sélectionné.

## Options écartées

- **Éditer le tableau en place** : le cache des éléments tirés de la graine (`worldFeatures`)
  est indexé par tableau de décor ; un tableau modifié en place le rendrait faux.
- **Picking par sphères de collision** : celles des plantes ne couvrent que les tiges (le
  feuillage est traversable) ; un clic sur une feuille ne sélectionnerait rien.
- **Graine aléatoire (`Math.random`)** : casserait le déterminisme et la reproductibilité.

## Conséquences

- Le décor de la sauvegarde (schéma 1) porte déjà les éléments édités : aucun changement de
  format.
- Déplacer, tourner et redimensionner (#168) n'auront qu'à produire un nouveau tableau de la
  même manière.
- Étendre l'édition au récif demandera de figer la disposition des coraux et anémones.
