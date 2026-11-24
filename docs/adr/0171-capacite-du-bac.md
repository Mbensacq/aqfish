# 0171 — Capacité du bac : volume d'eau réel et verdict d'ajout

- Statut : acceptée
- Date : 2026-11-24
- Auteur : Dev, cycle 290, issue #807 (tranche 1 de #729)

## Contexte

`docs/ECOSYSTEME.md` § 3.1 fixe les règles de capacité : volume minimal par espèce, besoin
par animal (longueur adulte × litres par cm de sa classe, ou volume par adulte supplémentaire
quand une source en donne un), plafond 1,5 L/cm et conseillé 2 L/cm pour les tropicaux, comptés
sur le **volume d'eau réel**, décor déduit. Les données sont livrées (#727, `sim/species-ecology.ts`
et la fiche) mais aucune simulation ne les lisait. Cette tranche écrit le calcul, pur ; les
compteurs, les raisons affichées et le bilan viennent en tranche 2.

## Décision

- **Volume d'eau réel** (`sim/tank-water-volume.ts`) = litres de la boîte d'eau
  (`waterLiters(environmentWater(…))`, ceux de la fenêtre des réglages) moins la part immergée
  - des voxels des rochers et des bois flottés, rognés au sable et à la surface ;
  - des boîtes de collision des coraux et des anémones × `CORAL_FILL_RATIO` (0,5,
    approximation de jeu : une colonie ne remplit pas sa boîte englobante) ;
  - du sol au-dessus du fond de l'eau (berge du paludarium), échantillonné tous les
    `TERRAIN_SAMPLE_STEP` (1 cm).

  Les plantes ne comptent pas (tiges et feuilles fines, approximation de jeu), la forme ovale ou
  haricot du bassin non plus (comme les litres affichés). Jamais négatif.

  Valeurs des bacs par défaut (graine 1) : tropical 288 L bruts, 4,2 L de décor, 283,8 L réels ;
  bassin 840 → 834,3 L ; paludarium 105 L bruts, 59,3 L de berge, 45,7 L réels ; récif
  472,5 L, 4 L de décor et 10,5 L de coraux, 458,1 L réels ; eau froide 155,3 → 153,6 L.

- **Besoin** (`sim/tank-capacity.ts`, `speciesNeedLiters`) : avec un volume par adulte
  supplémentaire `e`, `max(volume minimal, e) + (n − 1) × e` (poisson rouge : 100, 150, 200 L ;
  néritine : 40 L chacune) ; sinon `n × longueur adulte × L/cm`, borne basse de la classe au
  **plafond**, borne haute au **conseillé** (`CapacityLevel`). Tout animal compte comme un
  adulte. Effectif non fini, négatif ou nul : 0 ; longueur non finie ou nulle : aucun besoin par
  cm (seul le volume minimal compte).
- **Verdict** (`canAdd(bac, espèce, seuil)`), dans l'ordre : mode décor → accepté
  (`mode-decor`) ; bac sous le volume minimal de l'espèce → refusé (`volume-minimal`) ; besoin de
  la population, animal compris, au-delà du volume réel → refusé (`capacite`) ; sinon accepté.
  Le verdict porte la raison chiffrée et sa source au nom court (« OATA », « RSPCA »,
  « approximation de jeu »), l'occupation du bac avec l'animal (fraction de la capacité,
  `Infinity` sans eau) et le désaccord entre sources noté dans la référence (`disagreement`).
- **Sauvegarde au-delà de la capacité** : `capacityStatus` la signale (`over`), ne modifie rien.
- `MAX_TOTAL_FISH` et les maximums par espèce restent des plafonds **techniques**, à part.

## Options écartées

- **Part d'eau des amphibiens** (`AMPHIBIAN_WATER_SHARE`, #786) appliquée au volume du bac :
  dans le paludarium, la berge est déjà déduite par la géométrie ; l'appliquer en plus la
  compterait deux fois. Elle reste une donnée de fiche (dimensionner un milieu).
- **Voxels des plantes** : une plante de 45 voxels compterait comme un bloc plein et ferait
  perdre plusieurs litres par touffe, très loin de la réalité.
- **Volume exact des coraux** (voxels des colonies) : il faudrait construire leurs maillages
  dans la simulation ; la boîte pondérée suffit à l'ordre de grandeur (moins de 3 % du récif).

## Conséquences

- La fenêtre des réglages affiche encore les litres bruts : la tranche 2 devra afficher le
  volume réel (ou les deux) pour que la raison d'un refus reste lisible.
- Au plafond, deux bacs par défaut dépassent déjà leur capacité : bassin (7 koïs de 60 cm à
  4 L/cm : 1 680 L pour 834 L), paludarium (114 L pour 45,7 L, classe « amphibien » en
  approximation) ; le récif est à 66 %, le tropical à 63 %, l'eau froide à 98 %. Brancher les
  compteurs (tranche 2) les signalera au chargement : à arbitrer à la planification (populations
  par défaut ou classes de densité à sourcer, `docs/ESPECES.md` point 19).
- Le calcul n'est appelé qu'à la demande (ajout, chargement) : il construit les voxels du décor
  et échantillonne 5 000 points de sol pour le paludarium, jamais dans la boucle d'affichage.
