# 0126 — Effets secondaires des traitements : déclarés par produit, affichés, simulés

- Statut : acceptée
- Date : 2026-11-10
- Auteur : Dev, cycle 191, issue #549

## Contexte

Épopée v1.16. Certains traitements nuisent aux plantes, aux invertébrés ou au filtre
biologique ; le joueur doit l'apprendre en jouant. La pharmacie (#533, ADR 0125) liste les
produits mais n'agit sur rien : les gestes restent dans « Réglages ». Contraintes : aucun
nouveau produit, bac par défaut et captures inchangés, monde comparé au bit près par plusieurs
tests (`docs/PIEGES.md`).

## Décision

- **Données** : `sim/side-effects.ts` déclare les effets par produit (`SIDE_EFFECTS`, champ
  optionnel : un produit absent n'en a pas). Chaque effet a une cible (plantes, invertébrés,
  filtre), un texte court et une source, ou `null` pour « approximation de jeu ».
- **Effets retenus**, parmi les seuls produits existants (`docs/SOINS.md` § 12) :
  - sel → plantes : pousse des plantes à tige ralentie de 10 % par g/L (moitié à 5 g/L). La
    sensibilité des plantes au sel n'est affirmée que par des sources amateurs : approximation
    de jeu ;
  - médicament (formol + vert de malachite) → filtre : un filtre encore en maturation mûrit
    25 % moins vite tant que le médicament est dans l'eau. Le Merck juge l'effet du formol à
    dose de traitement minime : ralentissement modéré, approximation de jeu ; un filtre mûr
    n'est pas touché ;
  - sel et médicament → invertébrés : déjà refusés quand le bac en compte (#361, prudence) ;
    l'effet est déclaré pour être affiché, la simulation garde le refus.
- **Simulation** : deux facteurs purs (`plantGrowthFactor`, `filterMaturationFactor`) lus par
  `stepPlantGrowthInPlace` (paramètre `factor`, 1 par défaut) et
  `stepFilterMaturationInPlace`. Ils valent exactement 1 sans sel ni médicament, et le calcul
  d'origine est alors gardé tel quel : bac par défaut identique au bit près.
- **Affichage avant le geste** : dans la pharmacie, l'avertissement est écrit sous chaque
  produit concerné et sous le conseil ; le conseil décrit le dialogue (`aria-describedby`), lu
  à l'ouverture. Dans « Réglages, Soins », l'avertissement suit la source dans l'infobulle des
  boutons « Sel » et « Médicament », qui est leur description accessible : lue au focus, avant
  d'activer le bouton. Aucune ligne de plus dans le panneau des réglages (plein à 1280 × 720).

## Options écartées

- **Dialogue de confirmation avant chaque geste** : change tous les parcours de soins existants
  (e2e, captures) pour une estimation S ; l'avertissement au focus suffit à l'informer avant.
- **Tuer les invertébrés au lieu de refuser** : le refus est déjà en place, sourcé « prudence » ;
  une mortalité demanderait un modèle de dose et de durée non sourcé.
- **Effets du charbon, du régulateur de pH, de la catappa** : aucun effet sur plantes,
  invertébrés ou filtre trouvé dans `docs/SOINS.md` ; rien n'est inventé.

## Conséquences

- Un futur produit (cuivre, par exemple) déclare ses effets dans `SIDE_EFFECTS` ; un nouvel
  effet simulé ajoute son facteur, lu par le pas concerné.
- La capture `front-pharmacie` montre l'avertissement du médicament ; captures du contrat
  inchangées.
