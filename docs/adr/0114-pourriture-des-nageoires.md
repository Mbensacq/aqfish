# 0114 — Pourriture des nageoires : deuxième maladie, liée à la qualité de l'eau

- Statut : acceptée
- Date : 2026-11-08
- Auteur : Dev, cycle 172, issue #485

## Contexte

Reste de l'épopée #229 (soins et maladies). Seuls les points blancs étaient simulés (ADR 0088,
0089, 0091) ; leurs remèdes sont des produits. Il manquait une maladie dont le soin est
l'entretien de base : changer l'eau, corriger la cause. La pourriture des nageoires
(Aeromonas et apparentées, `docs/SOINS.md` § 5.7) est la plus courante des maladies liées à
l'eau chez le débutant. Contraintes : déterminisme, captures par défaut identiques à l'octet,
sauvegardes anciennes relues telles quelles, aucun bouton « guérir ».

## Décision

- **État** : champ facultatif `Fish.finRot`, progression en secondes simulées dans
  [0, 1200] ; absent, l'animal est sain. Un seul nombre sert à l'aggravation **et** à la
  guérison : il monte tant que l'eau est chargée, redescend (vitesse 1) quand elle ne l'est
  plus, et s'efface à 0. La guérison dure donc autant que la maladie a duré, sans état de
  plus.
- **Stades** : début [0, 240 s[ (aucun signe), effiloché [240, 720 s[ (demi-cause de santé),
  avancé à partir de 720 s (cause entière).
- **Cause** (`finRotCauses`, 0 à 2) : ammoniaque ≥ seuil « mauvaise », nitrites ≥ seuil
  « mauvaise ». Les blessures de territoire ne sont pas modélisées (ADR 0106 : les gestes de
  territoire n'abîment personne).
- **Qui** : comme les points blancs (`catchesIch`), poissons nageurs d'eau douce.
- **Apparition** : par pas, chaque poisson sain concerné tombe malade avec la probabilité
  1 − e^(−causes × dt / 3600). Pas de contagion : les bactéries sont considérées comme
  présentes dans tout bac, c'est l'eau qui fait la maladie.
- **Hasard** : hachage sans état (graine, pas, animal) avec un sel distinct de celui des points
  blancs ; aucun sous-générateur consommé ; aucun tirage en eau bonne.
- **Boucle** : après les points blancs et les traitements, avant la santé ; en pause en mode
  décor, comme le reste du soin.
- **Soin** : aucun produit simulé. L'alerte « Nageoires effilochées » (critique au stade
  avancé) donne la cause probable (eau trop chargée) et l'action (changer l'eau, nourrir
  moins), avec le lien vers la page « Maladies » du wiki. Les malades sortent de l'alerte de
  santé générale (`HealthSummary.diseased`, `weakWithoutDisease`).
- **Rendu** : chaque voxel porte un rang d'effilochage (`voxelFrayRank`) : caudale, bout
  d'abord, mêlé d'un hachage ; voxels de nageoire (`f`) au bord du profil du corps ensuite ;
  le reste jamais. Le shader ramène à l'origine les sommets sous `intensité × 0,5` (voxel
  perdu) et teinte en gris de roche (`PALETTE.roche`) une bande de 0,2 au-dessus. Garde
  `intensité > 0` : rendu inchangé pour un poisson sain. Valeurs revues au cycle 174 (voir
  « Lisibilité en vue de côté »).
- **Sauvegarde** : champ `finRot` écrit seulement pour un malade, relu s'il est dans
  [0, 1200], refusé sinon, ignoré pour un animal qui ne l'attrape pas ; pas de changement de
  schéma.
- **Capture** : paramètre `pourriture=1` (tous les poissons concernés au maximum à t = 0).

## Lisibilité en vue de côté (cycle 174, issue #509)

Sur les captures du cycle 172, à l'échelle du bac entier (`side-pourriture`,
`front-pourriture`), le liseré gris de roche se confondait avec l'eau sombre et les voxels
perdus de la caudale se voyaient à peine. Valeurs choisies sur capture, en comparant à
`main` :

| Valeur               | Cycle 172         | Cycle 174              | Effet                                                                                       |
| -------------------- | ----------------- | ---------------------- | ------------------------------------------------------------------------------------------- |
| `FIN_ROT_LOSS_SHARE` | 0,3               | 0,35                   | caudale un peu plus rongée ; à 0,5, elle disparaissait presque et il ne restait rien à voir |
| `FIN_ROT_EDGE`       | 0,15              | 0,3                    | le liseré couvre le reste de la caudale et le bord des nageoires du corps (rang ≥ 0,3)      |
| `FIN_ROT_EDGE_COLOR` | `roche` `#6e6a63` | `sableClair` `#e3cf9e` | tissu pâli, net sur l'eau ; distinct du blanc `koiBlanc` des points blancs                  |

Résultat : en vue de côté et de face, chaque poisson malade porte une queue courte, pâle et
déchiquetée, et les nageoires du corps (corydoras) un bord pâle. Seules les captures
`-pourriture` changent ; les captures par défaut restent identiques à l'octet (garde
`intensité > 0`).

## Valeurs : sources et approximations

- Sourcé (`docs/SOINS.md` § 5.7, Merck) : Aeromonas, infection bactérienne la plus courante en
  eau douce, nageoires effilochées parmi les signes ; cause : stress et eau ; le choix d'un
  antibiotique demande un test de laboratoire (vétérinaire). § 5.11 : ammoniaque et nitrite.
- **Statut France/UE du médicament** : les antibiotiques vétérinaires sont soumis à
  ordonnance (règlement (UE) 2019/6) ; c'est pourquoi aucun médicament n'est proposé dans le
  jeu. Référence citée sans consultation en ligne (réseau des agents restreint) : à confirmer.
- **Approximations de jeu** : toutes les valeurs numériques (seuils des stades, taux
  d'apparition, vitesse de guérison, poids dans la santé), dans le temps compressé du jeu
  (une journée de 20 minutes).

## Options écartées

- **Deux champs (gravité et minuterie de guérison)** : plus fidèle (les nageoires repoussent
  plus lentement qu'elles ne se dégradent) mais deux champs à sauvegarder et valider ; la
  vitesse de guérison `FIN_ROT_HEAL_SPEED` permet de ralentir plus tard sans changer d'état.
- **Antibiotique simulé** : sur ordonnance dans l'UE, choisi après un test ; le proposer
  enseignerait l'automédication.
- **Contagion** : non sourcée pour cette maladie ; la mettre aurait fait des points blancs bis.
- **Voxels effacés par la couleur du fond** : dépend de l'environnement et de l'heure ; les
  triangles dégénérés suppriment vraiment le voxel.

## Conséquences

- Un bac à l'eau chargée longtemps a désormais deux maladies possibles ; leur poids s'ajoute
  dans la santé (toujours bornée au plancher, aucune mort).
- Les prochaines maladies liées à l'eau (lots suivants) peuvent suivre ce modèle à un champ.
