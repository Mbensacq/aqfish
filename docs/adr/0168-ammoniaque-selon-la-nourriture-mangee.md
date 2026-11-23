# 0168 — Ammoniaque selon la nourriture mangée, part au repos selon la masse

- Statut : acceptée
- Date : 2026-11-23
- Auteur : Dev, cycle 287, issue #798 (tranche 2b de #728)

## Contexte

Jusqu'ici, les habitants produisaient de l'ammoniaque à un rythme fixe, proportionnel à leur
charge (`waterLoad`, cube de la taille de chaque espèce), qu'on les nourrisse ou non ; seule
la nourriture non mangée ajoutait une pollution (#638, ADR 0145). Or, en aquaculture,
l'ammoniaque totale produite vaut 3 à 5 % du poids de nourriture (Global Seafood Alliance,
`docs/ECOSYSTEME.md` § 2) : la pollution suit **ce qu'on donne à manger**, plus que le nombre
de poissons (`docs/ECOSYSTEME.md` § 3.3).

## Décision

- **Deux parts** pour les habitants :
  - **au repos** : `RESTING_AMMONIA_PER_LOAD_LITER` × charge / litres, un tiers de l'ancien
    taux (`AMMONIA_PER_LOAD_LITER`), dans `stepWaterInPlace` ; la charge reste la masse
    (cube de `bodyLength`), le pH en dépend comme avant ;
  - **des repas** : chaque granulé mangé rend `EATEN_FOOD_AMMONIA` mg par unité de masse
    (`pelletMass`), soit 4 % (milieu de 3 à 5 %) d'un poids de jeu de 31,25 mg par unité.
    `eatMassInPlace` (`sim/feeding.ts`) renvoie la masse mangée du pas ; elle entre dans
    l'eau avant le pas d'eau (`addEatenFoodInPlace`), comme la nourriture pourrie.
- **Nourriture non mangée** : inchangée (`FOOD_DECAY_AMMONIA` = 2,5 mg par unité), qui vaut
  désormais 8 % du même poids, tout l'azote d'une nourriture à 50 % de protéines : un granulé
  pourri pollue deux fois plus qu'un granulé mangé, le poisson retenant la moitié de l'azote.
  Elle reste bornée par `MAX_FOOD` et par le plafond `MAX_CONCENTRATIONS.ammonia`.
- **Corps en décomposition** (#582) : ils ne mangent pas mais gardent leur pollution d'avant
  (la part au repos par la charge, le reste ajouté à part dans `world-step-life.ts`).
- **Calibration** : avec un tiers au repos, un poisson de charge moyenne qui mangerait un
  granulé toutes les 45 s (sa faim pleine) retrouverait l'ancienne production ; en pratique
  les poissons mangent moins souvent. Mesuré sur le bac tropical par défaut, 30 min simulées,
  nitrates : 10,6 mg/L avant ; 7,0 nourri toutes les 20 s ; 4,7 nourri chaque minute ; 3,6 à
  jeun. `AMMONIA_PER_LOAD_LITER` reste le repère « bac nourri » du bilan. Les seuils de
  `docs/SOINS.md` ne changent pas.
- **Sauvegardes** : aucun champ ajouté, schéma 3 inchangé (test de relecture).

## Options écartées

- **Masse tirée de la taille adulte des fiches** (`adultSize`, 4 à 60 cm) : plus juste, mais
  le koï (60 cm) pèserait plus de 3 000 fois un néon (4 cm) et ferait basculer le bassin. La
  masse reste le cube de la taille de jeu (`bodyLength`) ; à revoir avec les scénarios de la tranche 2c (S12).
- **Pollution des repas proportionnelle à la masse du poisson** : contraire à la source, qui
  la rapporte au poids de nourriture, pas au mangeur.
- **Paramètre de plus à `stepWaterInPlace`** : la limite de 5 paramètres l'interdit ; la
  nourriture mangée suit le chemin déjà tracé par la nourriture pourrie.

## Conséquences

- Nourrir fait monter l'ammoniaque : un bac suralimenté pollue plus, un bac à jeun bien
  moins. Les bacs par défaut se dégradent plus lentement qu'avant tant qu'on ne les nourrit
  pas beaucoup (moins difficile à court terme) ; l'équilibre se jugera avec les scénarios de
  la tranche 2c.
- Toutes les empreintes de non-régression et de caractérisation qui font vivre des animaux
  changent (tableau dans la PR) ; l'empreinte dorée de `room-state.spec.ts` reste valable,
  composés azotés d'avant remis à leur place.
