# 0182 — Ponte du triton : un œuf à la fois, dans une feuille immergée

- Statut : acceptée (complète les ADR 0111, 0146 et 0150)
- Date : 2026-11-26
- Auteur : Dev, cycle 308, issue #676

## Contexte

Épopée v1.23 « Reproduction, suite » : au paludarium, le triton à ventre de feu (_Cynops
orientalis_) ne pondait pas. Caudata Culture (fiche de l'espèce) : reproduction de mars à juillet
dans une eau de 15 à 23 °C ; les œufs sont « pondus un à un sur la végétation aquatique » et la
femelle « replie les feuilles des plantes aquatiques sur l'œuf » ; 2,8 œufs par jour en moyenne.
Le plafond d'espèce du triton est de 3 adultes, et les œufs d'une espèce sans alevin ne prennent
pas de place d'espèce (ADR 0146) : un couple a donc une place d'œuf par ponte.

## Décision

1. **Même calendrier, mêmes conditions** que les autres ovipares (ADR 0111) : le triton rejoint
   `EGG_SPECIES` en dernier (tirages des autres espèces inchangés). Température de ponte
   `NEWT_SPAWN_TEMPERATURE` : 15–23 °C (sourcé) ; le paludarium (20 °C) y est.
2. **Un œuf par ponte** (`LEAF_CLUTCH = 1`) : « un à un ». Les œufs s'accumulent de période en
   période ; le plafond de l'espèce, inchangé, borne déjà la ponte d'un couple à un œuf.
3. **Dans une feuille** (`LEAF_EGG_SPECIES`, `layLeafClutch` dans `sim/eggs-leaf.ts`, fichier
   séparé pour garder `sim/eggs.ts` sous ses limites) : l'œuf est posé au centre d'un voxel de
   feuille (`part: 'leaf'` du modèle de `sim/plant.ts`) d'une plante enracinée du décor, sous la
   surface. Une feuille déjà occupée par un œuf (de la ponte ou d'une ponte précédente) n'en
   reçoit pas d'autre : les œufs restent isolés. Plantes flottantes exclues (frondes à la
   surface). Sans plante, sans feuille immergée ou décor absent : aucune ponte, aucune exception.
4. **À l'abri** : repliés dans la feuille, les œufs ne sont pas exposés (`isEggExposed` faux,
   surface `'plante'`, schéma de sauvegarde inchangé).
5. **Éclosion sans larve** : `hatchesToFry` faux, l'œuf disparaît à `EGG_HATCH_TIME`.
6. **Rendu** : œuf crème des corydoras, dessiné après l'eau (comme le clown et le poisson rouge),
   sans quoi l'eau du paludarium le teintait de vert d'eau.
7. **Capture** `paludarium-three-quarter-oeufs` : le décor du paludarium n'est pas éditable ;
   deux plantes à tige posées à la main côté eau et six périodes de ponte calculées hors de
   l'application, importées par une sauvegarde.

## Options écartées

- **Une ponte de 4 à 10 œufs en grappe** (corydoras) : contraire à « un à un ».
- **Ponte de 1 à 3 œufs** : toujours ramenée à 1 par le plafond d'espèce d'un couple, logique
  morte.
- **Exempter les œufs du triton du plafond d'espèce** : contredisait la règle commune de l'ADR
  0146 et son test.
- **Plantes par défaut au paludarium** : changeait toutes ses images, ses obstacles et ses
  empreintes de non-régression, hors périmètre d'une issue S. À traiter à part (décor du
  paludarium éditable ou planté).

## Conséquences

- Un paludarium planté avec un couple de tritons nourris voit apparaître un œuf par période,
  chacun dans sa feuille.
- Tant que le décor du paludarium est vide et non éditable, la ponte n'apparaît qu'avec un décor
  importé : suite à planifier (issue ouverte par Dev).
- Une autre espèce qui pond dans les feuilles n'a qu'à rejoindre `LEAF_EGG_SPECIES`.
