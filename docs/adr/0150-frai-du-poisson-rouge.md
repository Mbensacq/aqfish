# 0150 — Frai du poisson rouge : œufs sur la végétation, le long des tiges des nénuphars

- Statut : acceptée (complète les ADR 0111 et 0146)
- Date : 2026-11-17
- Auteur : Dev, cycle 239, issue #675

## Contexte

Épopée v1.23 « Reproduction, suite » : au bassin, le poisson rouge (#654) ne se reproduisait
pas. FishKeeper (fiche du poisson rouge de bassin) : la poursuite de frai commence « à 15 °C et
au-dessus », les œufs sont déposés « parmi la végétation aquatique » et éclosent en 48 à 72 h.
Le bassin n'a **aucune plante** dans son décor (non éditable) : sa seule végétation est celle
des nénuphars (`sim/lily-pads.ts`), qui dérivent lentement autour d'une ancre.

## Décision

1. **Même calendrier, mêmes conditions** que les corydoras et le clown (ADR 0111, 0146) : le
   poisson rouge rejoint `EGG_SPECIES` (en dernier : les tirages des autres espèces, salés par
   leur rang, ne changent pas). Température de frai (`GOLDFISH_SPAWN_TEMPERATURE`) : 15 °C
   (sourcé) à 22 °C (haut de la plage préférée du jeu, approximation) ; le bassin (18 °C) y est.
2. **Végétation seulement** (`VEGETATION_EGG_SPECIES`, `layVegetationClutch`) : chaque œuf est
   tiré sur une plante du décor (au pied, comme les corydoras) ou sur un nénuphar, **le long de
   sa tige** : à `LILY_STEM_SPREAD` de l'ancre de la feuille et de 8 à 20 cm sous la surface
   (`LILY_EGG_DEPTH`). La tige part du fond à l'ancre : l'œuf n'a pas à suivre la dérive de la
   feuille, et il se voit sous elle en vue trois-quarts (collé juste sous la feuille, il était
   caché, capture du cycle 239). Sans végétation (listes vides, `null`, `undefined`) : aucune
   ponte, aucune exception.
3. **Nénuphars côté simulation** : `worldLilyPads(world)` recalcule `lilyPadLayout` (même graine,
   même eau que le rendu) au moment de la ponte, une fois par période au plus ; aucun état
   ajouté au monde.
4. **Prédation** : ces œufs sont exposés (`isEggExposed`) ; tout adulte nageur à moins de
   `EGG_EAT_RADIUS` (distance ordinaire, sans la portée vers la vitre) les mange, koïs comprises
   (FishKeeper cite des poissons de bassin qui mangent les œufs du poisson rouge).
5. **Éclosion sans alevin** : `hatchesToFry` est faux pour le poisson rouge, l'œuf disparaît à
   `EGG_HATCH_TIME` ; les alevins (bruns, qui se colorent en grandissant) sont hors périmètre de
   #675. Sauvegarde : schéma inchangé (surface `'plante'` existante).
6. **Rendu** : œuf crème, comme ceux des corydoras ; quand le bac porte du frai de poisson rouge,
   la couche passe après l'eau (comme le clown) pour ne pas se fondre dans l'eau sombre.
7. **Capture** : `bassin-three-quarter-oeufs` (graine fixe 9, `population=koi:3,rouge:2`,
   `oeufs=1` : ponte pleine de 8 œufs).

## Options écartées

- **Ajouter des plantes au décor du bassin** : changeait toutes les images du bassin et les
  obstacles des koïs, hors périmètre.
- **Œufs collés sous les feuilles** : invisibles en vue de dessus comme en trois-quarts, et
  ils auraient dû suivre la dérive de la feuille (état ou calcul au rendu).
- **Œufs sur le fond d'algues** : la fiche parle de végétation ; à 30 cm sous l'eau sombre, la
  grappe ne se lisait pas.

## Conséquences

- Un bassin avec un groupe de poissons rouges nourris voit du frai apparaître sous les
  nénuphars ; les koïs et les adultes en mangent une partie.
- Une autre espèce qui fraie sur la végétation n'a qu'à rejoindre `VEGETATION_EGG_SPECIES`.
