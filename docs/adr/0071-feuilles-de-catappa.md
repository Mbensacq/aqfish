# 0071 — Feuilles de catappa : soin simple, pH et eau teintée

- Statut : acceptée
- Date : 2026-10-28
- Auteur : Dev, cycle 94, issue #239 (épopée v0.12 « L'aquarium éducatif », #229)

## Contexte

Mathis cite les feuilles de catappa (badamier, *Terminalia catappa*) comme exemple de soin
utile. L'issue demande un objet que l'on dépose depuis la section « Eau » (0 à 5), un effet
lent et borné sur le pH, une eau teintée brun-thé, un fond de santé légèrement relevé pour
les espèces qui aiment l'eau acide, une décomposition en quelques heures simulées, une
feuille voxel brune au sol, et un rappel que l'effet est simplifié. Contraintes : modèle de
pH existant (ADR 0057), sauvegarde au schéma 2 (ADR 0069), palette commune (ADR 0039),
captures sans feuille identiques à l'octet.

## Décision

1. **État** : `WaterState.catappa?: number[]`, la **réserve** de chaque feuille dans [0, 1]
   (1 : neuve). Absent sans feuille (le champ disparaît quand on retire la dernière) : un
   monde sans feuille et sa sauvegarde sont inchangés. Relu en option par `readWater` :
   une sauvegarde antérieure se charge sans feuille ; le schéma n'est pas monté.
2. **Décomposition** (`sim/catappa.ts`) : la réserve baisse linéairement en
   `CATAPPA_DECAY_SECONDS` = 7 200 s simulées (deux heures, six journées de 20 min). Une
   feuille épuisée reste au fond, plus sombre et sans effet, jusqu'à ce qu'on la retire.
   « − » retire d'abord la plus décomposée, « + » ajoute une feuille neuve.
3. **pH** : après la dérive organique du pas, le pH approche exponentiellement
   `CATAPPA_PH_FLOOR` = 6,0 avec le taux `CATAPPA_PH_RATE · réserve totale · 288 / litres`
   (`CATAPPA_PH_RATE` = 1/7 200 s⁻¹). Les feuilles ne font jamais passer le pH sous le
   plancher ; un pH déjà en dessous n'est pas touché. Une feuille seule dans le bac par
   défaut fait passer le pH de 7,0 à environ 6,6 sur toute sa vie ; cinq feuilles
   l'approchent du plancher. Le changement d'eau le remonte comme avant (ADR 0057).
4. **Santé** : tant qu'une feuille agit, les espèces dont le pH idéal descend à 6 ou moins
   (`likesAcidWater` : néon, rasbora, tétra citron, loche kuhli) ne perdent plus de santé
   sous `CATAPPA_HEALTH_FLOOR` = plancher + 0,1 (0,3). La santé n'est jamais portée d'un coup
   à ce plancher. Le guppy, qui préfère une eau plus dure, n'en profite pas, et un pH
   descendu sous sa tolérance l'use comme avant : c'est voulu (le soin n'est pas bon pour
   toutes les espèces).
5. **Teinte de l'eau** : un seul palier (`catappaTint`, 0 ou 1 dès qu'une feuille agit,
   `docs/PIEGES.md`, « Opacité partielle »). Les teintes d'entrée `eauTheEntree` et
   `surfaceTheEntree` remplacent celles de l'eau de jour, sous le trouble de l'eau mauvaise.
   La palette commune n'ayant aucun brun d'eau (l'eau tombait sur les gris `rocheSombre` et
   `roche`), deux **tons d'environnement** sont ajoutés selon l'ADR 0039 : `eauThe` (volume)
   et `eauTheClaire` (surface), proposés à la passe **seulement** quand l'eau est teintée
   (`AquariumView.setWaterTea`, `TEA_TONES`), dans tous les environnements.
6. **Feuille au sol** (`render/catappa-layer.ts`) : feuille voxel obovale (masque de 13 × 7
   voxels de 1 cm, 4 mm d'épaisseur), cinq emplacements fixes devant, sans hasard. Couleurs :
   les bruns de la nourriture (`FOOD_TONES`, ADR 0056) avec le marqueur d'opacité des
   granulés, dessinée après l'eau comme eux (donc non voilée par l'eau) ; aucune couleur
   ajoutée à la palette commune. Posée 8 mm au-dessus du sable : plus bas, les ombres plates
   du décor la masquaient.
7. **Interface** : ligne « Feuilles de catappa » (« − », nombre, « + ») dans la section
   « Eau », puis la note « Effet simplifié : ne remplace pas un test de pH. ». Attribut
   `data-aqfish-catappa` = « nombre;teinte » sur l'hôte. Paramètre de capture `catappa=n`
   (1 à 5 feuilles neuves à t = 0).

## Statut des valeurs

Toutes les valeurs (plancher 6,0, taux, durée de décomposition, plancher de santé 0,3, seuil
« eau acide » ≤ 6) sont des **approximations de jeu**. Aucune source n'a été consultée pendant
le cycle (réseau limité aux registres de paquets) ; elles ne prétendent pas décrire l'effet
réel des tanins, qui dépend de la dureté de l'eau, de la taille et de l'état des feuilles.

## Conséquences

- Les captures et sauvegardes sans feuille sont inchangées ; deux captures nouvelles
  (`three-quarter-catappa`, `top-catappa`).
- La feuille n'est pas voilée par l'eau (comme les granulés) : légèrement plus vive que le
  sable alentour.
- Dans le paludarium, le sol en colonnes n'est pas à la hauteur du fond de l'eau : les
  feuilles peuvent y être masquées par la berge. Limite acceptée pour ce cycle.

## Suites possibles (hors de cette issue)

- Autres soins simples : **conditionneur d'eau** (neutralise ammoniaque et nitrites sur
  quelques minutes), **tourbe** dans le filtre (acidification plus lente et durable).
- Tanins comme paramètre de l'eau à part entière (teinte qui persiste jusqu'au changement
  d'eau, plusieurs niveaux de teinte).
- Effet modulé par la dureté de l'eau, si elle entre un jour dans le modèle.
