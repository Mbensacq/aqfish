# 0131 — Kits de test de l'eau, dans la pharmacie

- Statut : acceptée
- Date : 2026-11-11
- Auteur : Dev, cycle 196, issue #564

## Contexte

Le tableau de bord donne les valeurs exactes de l'eau. Un vrai aquarium se mesure avec des
kits (gouttes ou bandelettes) qui se lisent sur une carte de couleurs, avec une précision
limitée et après quelques minutes. L'issue #564 (reste de #229) demande un kit simulé dans la
pharmacie, sans toucher à l'évolution de l'eau ni aux captures du bac par défaut.

## Décision

- **Module pur `sim/water-test.ts`** : cinq kits (`WATER_KITS` : pH, ammoniaque, nitrites,
  nitrates, dureté). Les quatre premiers se lisent sur une **carte** : palier le plus proche
  (`roundToChart`), à égale distance le palier du dessus, valeur hors carte marquée « ≤ » ou
  « ≥ », valeur non finie lue au dernier palier (un kit ne rassure jamais à tort). La dureté se
  **titre** : une goutte par degré, arrondi au-dessus, au moins une, plafond de 30 gouttes
  (`dropCount`). Paliers et délai sont des **approximations de jeu** (forme des cartes des kits
  en gouttes courants) ; ammoniaque, nitrites et nitrates restent en unités de jeu.
- **Échantillon pris au lancement**, résultat après `WATER_TEST_TICKS` = 600 pas (10 s
  simulées) : le délai se compte en pas de simulation, donc une simulation à l'arrêt n'avance
  pas le test, et le résultat est déterministe quel que soit le rythme des relevés.
- **État tenu par l'hôte, hors du monde** (`WeakMap<World, WaterTest>`, comme `usedProducts`) :
  rien n'est sauvegardé ni sérialisé, les captures du bac par défaut ne changent pas. Un seul
  test à la fois par bac : les boutons des kits attendent le résultat.
- **Conseil** : une phrase par résultat (`kitAdvice`), lue sur le palier avec les seuils du
  tableau de bord (`COMPOUND_THRESHOLDS`), plus le conseil de l'entrée « Tests d'eau » du wiki
  (`sim/care-guide.ts`, salicylate plutôt que Nessler).
- **Paramètre `test-eau=<kit>`** (hors capture) : un test de ce kit lancé avant le chargement,
  résultat prêt ; il sert à la capture `three-quarter-kit-eau.png` avec la simulation à l'arrêt.

## Options écartées

- Résultat lu à la fin du délai : dépendrait du pas où l'hôte fait son relevé (toutes les
  30 pas), donc moins déterministe ; le vrai kit mesure l'eau prélevée.
- Délai de quelques minutes simulées, comme un vrai kit : trop long à jouer à vitesse ×1.
- Bruit aléatoire sur la mesure, kits payants, consommables : hors périmètre de l'issue.

## Conséquences

- La pharmacie gagne une section « Tests de l'eau » avant la liste des produits : cinq
  boutons de plus dans l'ordre du clavier (« Fermer », kits, lien du wiki).
- Un kit de plus (chlore, cuivre) se déclare dans `WATER_KIT_INFO` sans toucher à l'hôte.
