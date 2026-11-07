# 0111 — Ponte et œufs des corydoras : entité à part, calendrier sans état

- Statut : acceptée
- Date : 2026-11-07
- Auteur : Dev, cycle 168, issue #478 (épopée v1.13 « Reproduction, dureté et santé »)

## Contexte

L'issue demande que des corydoras bien tenus pondent des œufs sur la vitre ou une plante,
que les adultes en mangent une part, que les autres éclosent en alevins (`sim/fry.ts`,
ADR 0107), le tout déterministe, sauvegardé, lisible en pixel art, et sans changer les
captures par défaut (aucun œuf à l'état initial).

## Décision

1. **Un œuf n'est pas un poisson** : `World.eggs` (facultatif) liste des objets de données
   `{ species, x, y, z, age, surface }` (`sim/eggs.ts`). Il ne nage pas, n'a ni faim ni santé,
   et n'entre ni dans le banc ni dans `populationCounts`. Le champ est absent tant qu'aucune
   ponte n'a eu lieu et retiré quand le dernier œuf a disparu : un monde sans œuf est
   identique à l'octet à celui d'avant (empreintes dorées et captures inchangées).
2. **Ponte sans état**, comme la mise bas : le temps est découpé en périodes de
   `SPAWN_PERIOD` (600 s) ; au dernier pas de chaque période, une espèce ovipare
   (`EGG_SPECIES` : le corydoras) qui compte au moins deux adultes en forme (santé pleine,
   sans points blancs, faim sous `FED_HUNGER`), dans une eau bonne au pH toléré et entre 22 et
   26 °C (`SPAWN_TEMPERATURE`, plage tolérée de la fiche), pond `clutchSize` œufs (4 à 10).
   Nombre, surface et position sont tirés du hachage (graine, espèce, rang de la période,
   rang de l'œuf) : aucun tirage pris aux générateurs des poissons. Le corydoras n'a pas
   d'apparence « femelle » : la condition est un groupe, pas une mère.
3. **Surfaces** : une grappe sur la vitre de devant ou de derrière, et, s'il y a des plantes
   dans le décor, environ un œuf sur deux au pied d'une plante tirée ; tous entre 2 et 10 cm
   au-dessus du fond.
4. **Prédation** : un adulte nageur (`isPredator`, comme pour les alevins) à moins de
   `EGG_EAT_RADIUS` (4 cm) d'un œuf de la vitre le mange, l'écart vers la vitre étant diminué
   de `EGG_GLASS_REACH` (4 cm) : les bornes de nage et la marge aux parois tiennent les
   poissons à 3 cm au moins des vitres, une distance brute n'en attrapait presque aucun (1 œuf
   sur 51 en 180 s sur neuf graines, contre 13 sur 51 avec la portée). Les œufs des plantes
   sont à l'abri. Aucun adulte n'en meurt.
5. **Éclosion** : à `EGG_HATCH_TIME` (180 s), l'œuf devient un alevin de l'espèce
   (`birthYoungInPlace`, mise en commun avec `birthFryInPlace`) : même croissance, mêmes
   cachettes, même prédation que les alevins de guppy. La sauvegarde accepte donc `growth`
   pour une espèce ovipare.
6. **Plafonds** : œufs et animaux de l'espèce ne dépassent pas `maxPopulation`, œufs et
   animaux du bac `MAX_TOTAL_FISH`, et le bac garde au plus `MAX_EGGS` (30) œufs ; un œuf qui
   éclôt dans un bac plein disparaît sans alevin.
7. **Sauvegarde** : `eggs` écrit seulement s'il y a des œufs, relu facultatif (schéma
   inchangé) ; chaque œuf est validé (espèce ovipare, position dans l'eau, âge, surface).
8. **Rendu** : un voxel crème par œuf (`render/egg-layer.ts`), de couleur plate et cerné d'un
   liseré `koiNoir`, sable clair à la seconde moitié de l'incubation ; deux maillages
   instanciés de `MAX_EGGS`, alloués une fois.
9. **Capture** : `oeufs=1` (capture seulement) fait pondre la première ponte à t = 0, âges
   étalés (`layEggsWorldInPlace`) : `front-oeufs`, `three-quarter-oeufs`.

Toutes les valeurs sont des approximations de jeu (éclosion réelle en plusieurs jours,
pontes souvent de plusieurs dizaines d'œufs).

## Options écartées

- **Œuf comme poisson immobile** (`Fish` avec un stade « œuf ») : il passerait par le banc,
  la faim, la santé et le rendu des poissons, qu'il faudrait court-circuiter partout.
- **Œufs dans `WaterState`** (comme les algues) : l'eau est comparée en entier par plusieurs
  tests de référence, et un œuf n'est pas une propriété de l'eau.
- **Part mangée tirée au hasard** : plus prévisible, mais l'emplacement (vitre ou plante) et
  le passage des poissons expliquent mieux au joueur pourquoi des œufs disparaissent.

## Conséquences

- Un bac nourri change d'effectif sans geste du joueur par une seconde voie (éclosions).
- D'autres ovipares n'auront qu'à rejoindre `EGG_SPECIES`.
