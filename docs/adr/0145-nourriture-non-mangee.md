# 0145 — Nourriture non mangée : décomposition en ammoniaque à l'expiration du granulé

- Statut : acceptée (complète les ADR 0022 et 0052)
- Date : 2026-11-16
- Auteur : Dev, cycle 228, issue #638

## Contexte

Épopée v1.21 « Un bac qui réagit à nos soins » : une ration que personne ne mange
(distributeur automatique, nourrissage trop généreux) disparaissait du fond après
`FOOD_GROUND_SECONDS` sans aucune conséquence sur l'eau, alors que le guide du débutant
affirmait déjà que la nourriture oubliée fait monter l'ammoniaque. Le déterminisme et les
captures sans nourriture ne doivent pas bouger.

## Décision

1. **Le délai de décomposition est le délai existant** : un granulé posé depuis
   `FOOD_GROUND_SECONDS` (30 s) se décompose au moment où il est retiré de `World.food`.
   Aucun nouveau champ dans le granulé ni dans la sauvegarde.
2. **Masse d'un granulé** : `pelletMass` (`sim/food.ts`) = cube du facteur de taille de son
   aspect (`foodLook`, hachage de l'identifiant seul) ; 1 pour un granulé moyen. Elle ne
   consomme aucun hasard.
3. `stepFoodInPlace` **renvoie** la masse des granulés retirés pendant le pas (0 sinon).
   Un granulé mangé (`eatInPlace`) ou siphonné n'est jamais compté.
4. `addDecayedFoodInPlace` (`sim/food-decay.ts`) ajoute `FOOD_DECAY_AMMONIA · masse / litres`
   à l'ammoniaque, plafonnée à `MAX_CONCENTRATION`, **avant** `stepWaterInPlace` : convertie
   au pas suivant, comme l'ammoniaque des déchets. Le cycle de l'azote existant fait le reste.
5. Valeur de jeu : `FOOD_DECAY_AMMONIA = 5` (unités × litres) ; une surcharge pleine
   (`MAX_FOOD`, douze clics) apporte ≈ 1 unité dans les 288 L du bac tropical, donc deux ou
   trois surcharges rapprochées passent le seuil de vigilance (2) du tableau de bord.
6. En mode décor, l'eau est en pause : la nourriture qui expire alors n'atteint pas l'eau.

## Options écartées

- **Un champ « décomposition » dans le granulé** (délai propre, masse restante) : plus de
  sauvegarde à valider et des captures modifiées, pour un effet invisible à l'échelle du jeu.
- **Une masse identique pour tous les granulés** : plus simple, mais contredit le rendu,
  où les granulés n'ont pas tous la même taille.
- **Ajouter l'ammoniaque dans `stepWaterInPlace`** : l'eau devrait connaître la nourriture ;
  la décomposition reste une étape à part, appelée par le monde.

## Conséquences

- Un bac où tout est mangé avance exactement comme avant (eau identique, test unitaire).
- Les sorties de simulation avec des granulés non mangés changent (ammoniaque plus haute).
- L'alerte « Ammoniaque trop haute » existante réagit à la suralimentation, sans nouveau texte.
