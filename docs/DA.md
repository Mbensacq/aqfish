# Direction artistique

## Intention

Un **aquarium vivant que l'on contemple**, plus qu'un jeu : calme, lisible, apaisant. On
doit avoir envie de le laisser ouvert dans un coin de l'écran et de tourner autour.

**Référence d'ambiance** : le bassin à koïs en pixel art de Nagomi (vue de dessus, eau
turquoise lumineuse, nénuphars sombres, koïs blancs tachés de rouge, petits bancs colorés).
C'est une référence d'**ambiance et de palette uniquement** : aucun code, sprite ou asset
n'en est repris. aqfish va plus loin avec une vraie 3D que l'on fait tourner.

## Règles du pixel art

1. **Taille de pixel constante** à l'écran, quel que soit le zoom (rendu basse résolution,
   voir `docs/ARCHITECTURE.md`).
2. **Palette limitée** (32 à 48 couleurs) définie dans un seul module, chaque couleur
   nommée par son usage (`eauProfonde`, `koiRouge`…). Toute couleur affichée en provient.
3. **Aucun lissage** : pas d'anticrénelage, pas de filtrage linéaire ; les dégradés sont
   obtenus par tramage.
4. **Contours** sombres d'un pixel sur les animaux et le décor, jamais sur l'eau.
5. **Lumière** douce venant du haut ; caustiques pixelisées sur le fond ; rayons de lumière
   discrets dans l'eau ; ombres portées simples des poissons sur le fond (comme dans un
   bassin vu de dessus).
6. **Mouvement** : ondulation du corps et de la queue des poissons, nageoires, plantes qui
   ondulent, bulles, reflets de surface. Rien de saccadé, rien de frénétique.

## Palette de départ (indicative)

Point de départ à affiner par PR, captures à l'appui. La palette effective (couleurs
ci-dessous et tons de transition ajoutés depuis) est déclarée dans `render/palette.ts` ;
la passe de post-traitement y ramène chaque pixel affiché (ADR 0007).

| Usage                   | Couleurs                                                                               |
| ----------------------- | -------------------------------------------------------------------------------------- |
| Eau (profonde → claire) | `#0d3b3f` `#1b5e5a` `#2e8b7a` `#5fbfa3` `#a8e6cf`                                      |
| Sable et roche          | `#e3cf9e` `#c9b38a` `#a8916a` `#6e6a63` `#45423e`                                      |
| Végétation              | `#163d22` `#1f4d2b` `#2f6b3a` `#4e9a4a` `#8fd16a`                                      |
| Koïs                    | rouge `#d94a3a`, blanc cassé `#f2ead8`, noir `#1c1c22`, orange `#f08a2c`, or `#f2c14e` |
| Petits poissons         | bleu néon `#3fa9f5`, rouge néon `#e63946`, jaune `#ffd166`, rose `#f4978e`             |
| Amphibiens              | axolotl rose `#f7b2bd`, grenouille `#7bc950`, triton `#e07a2f`                         |
| Fleurs                  | nénuphar rose `#f06a9b`, cœur `#ffb703`                                                |
| Interface               | fond `#141418` (translucide), texte `#e8e6e3`, accent `#5fbfa3`                        |
| Récif (tons d'environnement) | eau `#3f7597`, eau sous la surface `#4796cb`, corail violet `#7d4fb8` et `#b58be6` |

## Environnements visés

| Environnement            | Ambiance                                                                  | Habitants possibles                                   |
| ------------------------ | ------------------------------------------------------------------------- | ----------------------------------------------------- |
| Bac tropical d'eau douce | Bac planté, lumière chaude                                                | Néons, guppys, corydoras, scalaires, crevettes        |
| Bassin extérieur à koïs  | Vue de dessus privilégiée, nénuphars, lotus, pluie, feuilles qui flottent | Koïs, poissons rouges, grenouilles en bordure         |
| Paludarium               | Partie terrestre et partie aquatique, mousses, racines                    | Axolotls (eau), grenouilles et tritons (terre et eau) |
| Récif marin              | Coraux colorés, lumière bleutée                                           | Poissons-clowns, chirurgiens, anémones                |

Les espèces sont décrites de façon **déclarative** (taille, silhouette, motifs, couleurs,
comportement, environnements compatibles, température), puis leurs modèles sont générés par
le code. Les valeurs réelles sont sourcées ou marquées comme approximations.

Une espèce peut avoir plusieurs **apparences** (dimorphisme, ADR 0013). Le guppy : mâle
plus petit, corps gris roche taché de rose nénuphar, grande caudale orange koï ; femelle
plus grande, corps sable, dos sable sombre, tache de gestation roche sombre, nageoires
sable clair. Les espèces autres que le néon n'empruntent pas le bleu et le rouge néon
(mesures de banc sur image).

Les **koïs** du bassin (#88, ADR 0027) ont trois robes, tirées de la graine pour chaque
individu : *kohaku* (blanc cassé taché de rouge koï), *orenji* (orange koï, ventre et
nageoires or) et *sanke* (blanc cassé taché de rouge et de noir). Le motif est porté par le
dos, seul visible de dessus ; le corps est effilé au pédoncule et au museau vu de dessus.

Le corydora (poisson de fond, ADR 0014) : silhouette trapue (corps court et haut, ventre plat
clair, haute dorsale sable sombre), flanc gris roche « poivré » de taches noires, dos roche
sombre. Un flanc sable se confondait avec le substrat sur les captures : les poissons de fond
évitent les tons du sable sur leurs flancs.

L'**axolotl** du paludarium (#130, ADR 0035) : corps rose axolotl, ventre blanc cassé,
crête dorsale, pattes et nageoire de la queue rose poisson, trois branchies de chaque côté de
la tête en rose nénuphar (plus soutenu que le corps, pour qu'elles se lisent de profil comme
de dessus, où elles dépassent des flancs). Il reste rose sur le sable clair du fond.

La **grenouille** du paludarium (#131, ADR 0036) : corps trapu vert grenouille taché de vert
végétation (`vegetationClaire`), ventre blanc cassé, deux yeux noirs posés de chaque côté du
haut de la tête (un œil en bandeau sur le dessus se lisait comme un chapeau noir), cuisses
et pieds vert sombre qui dépassent des flancs vu de dessus. À la nage, le dos et les yeux
restent au-dessus de la surface : elle se lit sur l'eau claire du rivage.

Les **feuilles mortes** du bassin (#107, ADR 0033) : petites feuilles de 9 à 13 cm au bord
irrégulier, brunes (`sableSombre`, `sableOmbre`) ou ocre (`tritonOrange`, `sableSombre`), en
deux tons de part et d'autre de la nervure, contour `koiNoir`. Elles se posent par vagues
faibles, jamais plus de **8** à la fois (1 à 2 en moyenne), dérivent lentement au-dessus des
nénuphars et coulent au bout de 52 s. Des gris de la roche, essayés d'abord, les faisaient
confondre avec les pierres.

Le **récif** (#148, ADR 0039) : bac vitré plus grand que le bac tropical, eau d'un bleu franc
(`eauRecif`), plus clair sous la surface (`eauRecifClaire`), sable corallien blanc cassé
(`koiBlanc`, affiché `texteInterface` à travers l'eau ; de dessus, à travers la surface
bleue, il se lit en eau très claire, comme un lagon) et quelques rochers. Ses deux bleus
sont des **tons d'environnement** : la passe palette ne les propose qu'au récif, les autres
environnements n'en voient jamais la couleur. Teinte d'entrée de l'eau : le bleu néon,
saturé, que la translucidité ramène sur ces deux bleus.

Les **coraux** du récif (#149, ADR 0040) : colonies en voxels, en couleurs plates, de trois
formes lisibles de profil comme de dessus : **branchu** (branches fines et penchées, en bois
de cerf ; de dessus, des points), **table** (plateau large en T sur un pied ; de dessus, un
disque clair cerné de son rebord foncé), **dôme** (bosse pleine semée de polypes foncés).
Quatre teintes, chacune en deux couleurs (flanc foncé, dessus et bouts clairs) : rose
(`nenupharRose`, `axolotlRose`), orange (`tritonOrange`, `koiOrange`), jaune (`koiOr`,
`poissonJaune`) et violet, absent de la palette commune (`corailViolet`,
`corailVioletClair`, tons du récif). La nuit, roses et violets se confondent en violet,
oranges et jaunes en sable : la lumière du récif reste à faire.

Les rochers (ADR 0015) : voxels de 1,2 cm (à l'échelle 1) en couleurs plates, dessus
`roche` parfois poudré de `sableOmbre`, flancs `roche` tachés de `rocheSombre`, rangée du bas
toujours `rocheSombre` (ombre de contact), contour d'un pixel `koiNoir`. Posés sur le sable,
base légèrement enfoncée.

## Interface

- Minimale et discrète : barres flottantes sombres translucides aux coins arrondis, qui
  s'effacent quand on ne les utilise pas. Aucune interface en mode capture.
- Icônes en pixel art, cohérentes avec la palette.
- Police : une police pixel sous licence OFL pour les titres (choix à justifier dans une PR),
  une police lisible pour le texte courant.
- Contrôles attendus à terme : préréglages de vue, vitesse de simulation, population,
  jour/nuit, météo (pluie), son, choix de l'environnement, éditeur.
- Panneaux qui ne tiennent pas côte à côte : jamais ouverts ensemble. Sous 640 px de large,
  ouvrir « Réglages » replie « Commandes » et inversement (#136), et l'aide-mémoire démarre
  replié (paysage de téléphone compris). Un nouveau panneau flottant suit la même règle
  (`ui/exclusive-panels`).
- Textes en français.
