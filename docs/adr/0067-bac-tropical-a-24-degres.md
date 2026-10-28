# 0067 — Bac tropical à 24 °C : une eau dans la plage préférée de chaque espèce

- Statut : acceptée
- Date : 2026-10-28
- Auteur : Dev, cycle 90, issue #293 (point 1 de #286)

## Contexte

L'ADR 0065 a rendu cohérentes les populations par défaut et posé la règle « intersection non
vide des plages préférées » (`docs/ESPECES.md`). Le bac tropical y échappait : son eau était à
**25 °C** (`WATER_TEMPERATURES.tropical`), alors que les plages préférées de sa population
par défaut (`sim/species-sheet.ts`) sont :

| Espèce | Préférée (approximation de jeu) | Tolérée (sourcée) |
|---|---|---|
| Néon | 22–25 °C | 20–26 °C (FishBase via `docs/SOINS.md`) ; Seriously Fish : 21–25 °C |
| Guppy | 23–27 °C | 18–28 °C (FishBase) ; Seriously Fish : 17–28 °C |
| Corydoras poivré | 22–24 °C | 22–26 °C (Seriously Fish) ; Animalia.bio (secondaire) : 16–24 °C |

Plage préférée commune : **23–24 °C**. À 25 °C, l'eau sortait d'un degré de la plage préférée
du corydoras ; le test `environment-populations.spec.ts` le tolérait par une exception écrite
pour le seul bac tropical (#286).

## Décision

1. **L'eau du bac tropical passe à 24 °C** (`WATER_TEMPERATURES.tropical`). 24 °C est dans la
   plage préférée de chaque espèce de la population par défaut, et dans **toutes** les plages
   des sources citées, y compris la plus fraîche (corydoras 16–24 °C, Animalia.bio) et la plus
   étroite (néon 21–25 °C, Seriously Fish) : le choix ne tranche pas le désaccord entre
   sources, il le contourne.
2. **Le test est durci** : pour **chaque** environnement, l'eau neuve doit tomber dans la plage
   préférée commune de la population par défaut (l'exception du bac tropical disparaît).
3. La plage préférée du corydoras (22–24 °C) **reste** : c'est le recoupement des deux sources
   en désaccord (22–26 et 16–24 °C) ; l'élargir pour faire passer le test aurait présenté une
   approximation comme une donnée.

## Options écartées

- **Élargir la plage préférée du corydoras à 22–25 °C** : aucune source ne la fonde, la
  valeur aurait été choisie pour satisfaire le test.
- **Garder 25 °C et laisser l'exception du test** : la contradiction reste dans le jeu, alors
  que le bac doit enseigner une eau adaptée à toutes ses espèces (#229).
- **23 °C** : aussi dans la plage commune, mais au bord de celle du guppy (23–27 °C) ; 24 °C
  laisse un degré de marge des deux côtés pour le néon, le guppy et le corydoras.

## Conséquences

- L'eau neuve du bac tropical, la consigne par défaut du chauffage et la référence des alertes
  de température (« Régler le chauffage sur 24 °C ») suivent `WATER_TEMPERATURES` sans autre
  changement de code. Tests unitaires et e2e qui affichaient « 25,0 » mis à jour.
- Les anciennes sauvegardes (eau à 25 °C) se rechargent telles quelles : sans chauffage
  réglé, l'eau redescend vers 24 °C à la constante de temps habituelle
  (`TEMPERATURE_TIME_CONSTANT`) ; un chauffage réglé à 25 °C est conservé.
- La température n'agit pas sur le mouvement des poissons : seules les captures qui
  affichent la température (tableau de bord, panneau) peuvent changer.
