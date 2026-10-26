# 0056 — Nourriture en voxels par défaut et tons de granulé

- Statut : acceptée
- Date : 2026-10-26
- Auteur : Dev, cycle 77, issue #226

## Contexte

Après #117, les granulés se lisaient comme des masses jaune-orangé fluo cernées de noir
(`poissonJaune` et liseré `koiNoir`), pas comme de la nourriture. L'issue #226 (idée de
Mathis) demande des grains plus naturels : voxels par défaut, teintes de nourriture réelle
(brun-ocre, beige, olive sourd, rouge-brun), nuance par granulé, ombrage par face, liseré
supprimé ou discret, plusieurs formes ; lisibles de jour et de nuit, sur le sable, un rocher
et devant une plante ; captures sans nourriture inchangées à l'octet.

La difficulté est la palette : la passe ramène chaque pixel à la couleur la plus proche, et la
palette commune n'a **aucun brun** (ses tons chauds sont des sables, des oranges saturés et
des rouges).

## Pistes comparées sur captures

| Piste                                              | Teintes                                                     | Résultat                                                                                                                                                                                                                                                               |
| -------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Bruns mats de la palette commune                | `sableOmbre`, `sableSombre` (flancs `roche`, `rocheSombre`) | Granulés quasi invisibles sur le sable et sur les rochers (même clarté) : critère de lisibilité de #83 perdu. **Écartée.**                                                                                                                                             |
| B. Trois bruns ajoutés à la palette commune        | ocre `#a0703a`, brun-rouge `#8c4630`, brun `#6b4428`        | Granulés justes, mais 19 captures **sans nourriture** changent : le brun prend des pixels de la pièce, des meubles et du bassin (jusqu'à 54 000 pixels sur une capture), le brun-rouge et l'ocre des pixels de nuit du bassin, du paludarium et du récif. **Écartée.** |
| C. Les mêmes bruns, réservés aux pixels de granulé | B, proposés seulement là où un granulé a été dessiné        | Granulés comme en B ; les 64 captures sans nourriture identiques à l'octet, sauf les 3 qui montrent le panneau (le bouton affiche le nouveau défaut, « Granulés : voxels »). **Retenue.**                                                                              |

## Décision

- **Tons de la nourriture** (`render/palette.ts`, `FOOD_TONES`) : `granuleOcre`,
  `granuleBrunRouge`, `granuleBrun`, placés en fin de la palette du shader, après les tons
  d'environnement (ADR 0039).
- **Marqueur d'opacité** : les matériaux des granulés écrivent leur couleur et une opacité de
  `FOOD_ALPHA_MARKER` (0,5) **telles quelles** (`CustomBlending`, facteurs `One` / `Zero`
  pour la couleur et l'opacité : l'image ne dépend pas de l'opacité, comme avant avec une
  opacité de 1). La passe lit l'opacité du pixel de scène : sous `FOOD_ALPHA_THRESHOLD`
  (254,5 / 255), les tons de la nourriture sont proposés sans pénalité ; sinon ils reçoivent
  `TONE_PENALTY_OFF` et ne peuvent jamais l'emporter.
  - Rien d'autre n'écrit d'opacité inférieure à 1 : le fond est opaque (canvas sans alpha,
    effacement à 1) et le mélange normal des surfaces translucides donne
    `a + 1 × (1 − a) = 1` sur une destination opaque.
  - Un granulé vu à travers l'eau (30 %) garde un marqueur sous le seuil
    (0,3 + 0,5 × 0,7 = 0,65) ; un objet opaque dessiné par-dessus l'efface (1).
- **Teintes** (`FOOD_SHADE_COLORS`) : ocre, `sableSombre` (beige) et brun-rouge, une par
  nuance tirée de l'identifiant (`foodLook`, `sim/food.ts`, hachage de l'identifiant seul :
  aucun tirage du hasard de la simulation).
- **Ombrage par face** (`FOOD_FACE_SHADING`, couleurs de sommet d'un cube unité, multipliées
  par la teinte de l'instance) : dessus 1 ; flancs ±z 0,72 ; flancs ±x 0,5 ; dessous 0,35.
  La passe ramène les flancs aux tons plus sombres de la même famille (ocre → brun-rouge →
  brun ; beige → `sableOmbre`). **Plus de liseré** en voxels : le volume se lit par la
  clarté des faces.
- **Formes** (`FOOD_SHAPES`, proportions `FOOD_SHAPE_PROPORTIONS`) : grain (cube, 50 %),
  flocon (plaquette 1,5 × 0,4 × 1,25, 30 %), paillette (éclat 1 × 0,3 × 0,6, 20 %) ; trois
  tailles proches (0,85, 1, 1,15) ; quatre orientations autour de la verticale. Chaque
  dimension garde au moins un pixel de scène (dézoomé sur téléphone). Un maillage instancié
  par forme, une seule géométrie et un seul matériau partagés.
- **Voxels par défaut** (`DEFAULT_FOOD_STYLE`) : une sauvegarde sans le réglage donne des
  voxels ; un choix enregistré (points ou voxels) est respecté. Les points restent au choix,
  avec leur liseré, le cœur prenant la nuance du granulé.

## Conséquences

- Les tons de la nourriture ne coûtent qu'une lecture d'opacité et trois itérations de plus
  par pixel dans la passe.
- Tout futur objet qui écrirait une opacité inférieure à 1 dans la cible (un mélange
  personnalisé) se verrait proposer les tons de la nourriture : garder les mélanges
  standard, ou réserver un autre marqueur.
- De nuit, les granulés restent bruns (les tons de la nourriture n'ont pas de version de
  nuit) : lisibles sur le sable bleuté et la roche, un peu plus chauds que le reste du bac.
- Le bouton du panneau et le paramètre `granules=` restent (ADR 0022) : Mathis tranchera
  entre les deux rendus après essai.
