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

| Usage                                             | Couleurs                                                                                                                          |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Eau (profonde → claire)                           | `#0d3b3f` `#1b5e5a` `#2e8b7a` `#5fbfa3` `#a8e6cf`                                                                                 |
| Sable et roche                                    | `#e3cf9e` `#c9b38a` `#a8916a` `#6e6a63` `#45423e`                                                                                 |
| Végétation                                        | `#163d22` `#1f4d2b` `#2f6b3a` `#4e9a4a` `#8fd16a`                                                                                 |
| Koïs                                              | rouge `#d94a3a`, blanc cassé `#f2ead8`, noir `#1c1c22`, orange `#f08a2c`, or `#f2c14e`                                            |
| Petits poissons                                   | bleu néon `#3fa9f5`, rouge néon `#e63946`, jaune `#ffd166`, rose `#f4978e`                                                        |
| Amphibiens                                        | axolotl rose `#f7b2bd`, grenouille `#7bc950`, triton `#e07a2f` (ventre, ADR 0064)                                                 |
| Fleurs                                            | nénuphar rose `#f06a9b`, cœur `#ffb703`                                                                                           |
| Interface                                         | salle `#141418`, panneau plein `#1b1f23`, encre `#ebe7de`, laiton `#d1a65c` (`docs/INTERFACE.md`)                                 |
| Récif (tons d'environnement)                      | eau `#3f7597`, eau sous la surface `#4796cb`, corail violet `#7d4fb8` et `#b58be6`, poisson-clown `#ff6d00`, chirurgien `#1d3fbf` |
| Ciel couvert (tons réservés à la pluie, ADR 0082) | herbe `#42833f`, touffes `#7ab25a`, roche `#5e5a54` et `#3a3934`, terre `#74654d` : couleurs du bassin à 85 %                     |
| Nourriture (tons réservés aux granulés, ADR 0056) | ocre `#a0703a`, brun-rouge `#8c4630`, brun `#6b4428` ; plus `#a8916a` (beige) de la palette commune                               |

**Lune** (#856, ADR 0189) : les nuits suivent un cycle de 29,5 jours de jeu. Sous la pleine
lune, la nuit d'avant (tons de nuit, ADR 0021) ; sans lune, lumières, eau et décor gardent 72 %
de cette clarté, sans ton ajouté : la passe palette tire le décor vers les tons de nuit plus
sombres (roches gris-vert, coraux violets tramés de bleu). Le jour n'est jamais touché.

**Nourriture** (#226) : des grains mats, pas des taches. Petits voxels (grain, flocon,
paillette) de tons de nourriture réelle, une nuance par granulé, ombrés par face (dessus
clair, flancs plus sombres), sans liseré ; contraste avec le sable et la roche par la clarté.

## Environnements visés

| Environnement            | Ambiance                                                                  | Habitants possibles                                                    |
| ------------------------ | ------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Bac tropical d'eau douce | Bac planté, lumière chaude                                                | Néons, guppys, corydoras, scalaires, crevettes                         |
| Bassin extérieur à koïs  | Vue de dessus privilégiée, nénuphars, lotus, pluie, feuilles qui flottent | Koïs, poissons rouges, grenouilles en bordure                          |
| Paludarium               | Partie terrestre et partie aquatique, mousses, racines                    | Sonneurs orientaux et tritons à ventre de feu (terre et eau, ADR 0065) |
| Bac d'eau froide         | Eau fraîche plus sombre, sans courant ni bulles, sable, plantes au fond   | Axolotls seuls (ADR 0065)                                              |
| Récif marin              | Coraux colorés, lumière bleutée                                           | Poissons-clowns, chirurgiens, anémones                                 |

Les espèces sont décrites de façon **déclarative** (taille, silhouette, motifs, couleurs,
comportement, environnements compatibles, température), puis leurs modèles sont générés par
le code. Les valeurs réelles sont sourcées ou marquées comme approximations.

Une espèce peut avoir plusieurs **apparences** (dimorphisme, ADR 0013). Le guppy : mâle
plus petit, corps gris roche taché de rose nénuphar, grande caudale orange koï ; femelle
plus grande, corps sable, dos sable sombre, tache de gestation roche sombre, nageoires
sable clair. Les espèces autres que le néon n'empruntent pas le bleu et le rouge néon
(mesures de banc sur image).

Les **koïs** du bassin (#88, ADR 0027) ont trois robes, tirées de la graine pour chaque
individu : _kohaku_ (blanc cassé taché de rouge koï), _orenji_ (orange koï, ventre et
nageoires or) et _sanke_ (blanc cassé taché de rouge et de noir). Le motif est porté par le
dos, seul visible de dessus ; le corps est effilé au pédoncule et au museau vu de dessus.

Les **poissons rouges** du bassin (#654, ADR 0147) reprennent la palette des koïs, en trois
robes tirées de la graine : _commun_ (orange koï, ventre or), _sarasa_ (dos rouge koï, flanc et
ventre blanc cassé) et _jaune_ (dos or, flanc jaune, ventre blanc cassé). Silhouette propre,
plus courte et plus haute que la koï, haute dorsale et caudale fourchue ; dos toujours clair ou
vif pour se détacher de l'eau sombre du bassin.

Le corydora (poisson de fond, ADR 0014) : silhouette trapue (corps court et haut, ventre plat
clair, haute dorsale sable sombre), flanc crème (`koiBlanc`) « poivré » de taches noires, dos
roche sombre. Un flanc sable se confondait avec le substrat sur les captures, et un flanc
gris roche avec les rochers (#76) : les poissons de fond évitent les tons du sable **et** de
la roche sur leurs flancs ; le contraste clair / noir les détache des deux.

L'**axolotl** (#130, ADR 0035), seul dans le bac d'eau froide depuis #271 (ADR 0065) : corps rose axolotl, ventre blanc cassé,
crête dorsale, pattes et nageoire de la queue rose poisson, trois branchies de chaque côté de
la tête en rose nénuphar (plus soutenu que le corps, pour qu'elles se lisent de profil comme
de dessus, où elles dépassent des flancs). Il reste rose sur le sable clair du fond.

La **grenouille** du paludarium (#131, ADR 0036), sonneur oriental (_Bombina orientalis_)
depuis #270 (ADR 0064) : corps trapu vert grenouille taché de noir (`koiNoir`), ventre rouge
(`koiRouge`, le « ventre de feu », rangée basse du corps), deux yeux noirs posés de chaque côté du
haut de la tête (un œil en bandeau sur le dessus se lisait comme un chapeau noir), cuisses
et pieds vert sombre qui dépassent des flancs vu de dessus. À la nage, le dos et les yeux
restent au-dessus de la surface : elle se lit sur l'eau claire du rivage.

Le **triton** du paludarium (#133, ADR 0037), triton à ventre de feu chinois (_Cynops
orientalis_) depuis #270 (ADR 0064) : corps fin et longue queue noirs (`koiNoir`), ventre
orange triton (`tritonOrange`), quelques taches orange sur le dos et les flancs. Un dos gris
roche (`rocheSombre`), essayé d'abord, se confondait avec les racines et rochers de la berge.

Les **feuilles mortes** du bassin (#107, ADR 0033) : petites feuilles de 9 à 13 cm au bord
irrégulier, brunes (`sableSombre`, `sableOmbre`) ou ocre (`tritonOrange`, `sableSombre`), en
deux tons de part et d'autre de la nervure, contour `koiNoir`. Elles se posent par vagues
faibles, jamais plus de **8** à la fois (1 à 2 en moyenne), dérivent lentement au-dessus des
nénuphars et coulent au bout de 52 s. Des gris de la roche, essayés d'abord, les faisaient
confondre avec les pierres ; depuis #138, l'ocre est la plus fréquente (7 feuilles sur 10),
la brune restant proche des rochers vue de dessus.

Le **bois flotté** du bac tropical (#169, ADR 0045) : tronc couché sur le sable, un bout
relevé, deux ou trois branches d'un voxel d'épaisseur au bout qui montent en s'écartant de part
et d'autre, parfois fourchues. Bruns de la palette, éclaircis par #180 : dessus de bois blanchi
(`sableClair`), flancs `sableSombre`, nœuds (un flanc sur huit environ) en `sableOmbre`, seule
la rangée posée sur le sable en `rocheSombre` ; contour `koiNoir` comme le reste du décor. Aucun gris de rocher : bois et pierre restent
distincts au premier coup d'œil.

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

Les **anémones** du récif (#150, ADR 0041) : pied rond ocre (`sableSombre`) couronné d'un
tapis serré de tentacules rouges (`koiRouge`) aux bouts renflés rose saumon (`poissonRose`),
qui ondulent doucement en vagues ; aucun rouge parmi les coraux. Les **poissons-clowns** :
corps ovale orange vif (`clownOrange` #ff6d00, ton du récif, plus rouge et plus saturé que
les oranges des coraux), trois bandes blanches (`koiBlanc`) cerclées de noir (`koiNoir`) :
derrière l'œil, au milieu du corps, au pédoncule ; caudale arrondie bordée de noir. Robe
unique, petit groupe lâche au-dessus de son anémone.

Les **chirurgiens bleus** du récif (#151, ADR 0042) : corps ovale, haut et plat, bleu roi
(`chirurgienBleu` #1d3fbf, ton du récif, plus sombre et plus saturé que l'eau et que le bleu
néon), hautes nageoires dorsale et anale bleues, marque noire (`koiNoir`) de l'œil au
pédoncule sur le haut du flanc, pédoncule et caudale en croissant jaunes (`poissonJaune`).
Plus grands que les clowns ; banc lâche de 3 à 5 à mi-hauteur, au-dessus des coraux.

Les rochers (ADR 0015) : voxels de 1,2 cm (à l'échelle 1) en couleurs plates, dessus
`roche` parfois poudré de `sableOmbre`, flancs `roche` tachés de `rocheSombre`, rangée du bas
toujours `rocheSombre` (ombre de contact), contour d'un pixel `koiNoir`. Posés sur le sable,
base légèrement enfoncée.

La **pièce** autour du bac tropical (#187, ADR 0048), facultative : une pièce sombre où le
bac est la source de lumière. Meuble support en bois clair (`sableOmbre`, portes
`sableSombre`, poignées et socle `rocheSombre`), parquet sombre à lames de deux teintes
(`rocheSombre`, `koiNoir`), mur presque noir (`koiNoir`, couleurs plates) avec cimaise
`rocheSombre` au-dessus du bac et plinthe `sableOmbre`. Plinthes et moulures des murs suivent la
lumière du jour (#388), comme la porte : couleur de palette en plein jour, à moitié la nuit. Le mur reste sombre pour que l'eau vue
devant lui garde son vert ; aucune couleur ajoutée à la palette.

## Interface

- **Charte « la salle d'aquarium » et fenêtre des réglages : `docs/INTERFACE.md`** (décision
  de Mathis du 2026-11-18). Lot 1 livré (#721) : jetons de couleurs, coins, opacités et
  polices dans `ui/_panel-layout.scss`, **seul endroit** où une couleur, un rayon ou une
  opacité s'écrit (`ui/charte-jetons.spec.ts` le vérifie sur toutes les feuilles) ; panneaux
  pleins, coins à 2 px (contrôles) et 4 px (fenêtres), laiton `#d1a65c` pour l'action, la
  sélection et le focus, intitulés en casse de phrase. Icône du site et logo :
  `scripts/generer-icone.mjs` (un seul dessin de 16 × 16).
- Fenêtre des réglages (#722, cycle 267) : modale au centre, 1 100 px au plus, page assombrie
  derrière (voile `$scrim`) ; catégories par groupe à gauche, une seule ouverte à droite avec
  son titre et sa phrase d'explication ; la dernière catégorie ouverte est retenue (cycle 268).
  Sous 640 px (cycle 269) : panneau qui monte du bas sur 75 % de la hauteur (coins hauts
  arrondis, haut de la page assombri et visible) ; d'abord la recherche et la liste des
  catégories, chaque titre suivi de sa valeur résumée en gris (« 24 animaux », « Eau à 24 °C »),
  puis le contenu d'une catégorie seul, sous « ‹ Retour » en laiton ; cibles de 44 px au moins.
- Population et recherche (#723, cycle 270) : une tuile par espèce (filet de 1 px, coins de
  2 px, deux colonnes ou plus selon la largeur, une sous 640 px) avec le nom, le nom
  scientifique en italique gris, le compteur et « Fiche » ; filtres en boutons accolés, le
  choix courant plein en laiton ; tri en liste ; résumé « 24 animaux, 3 espèces » en police
  mono. Recherche : les résultats remplacent le titre de la catégorie (« Résultats »), une
  ligne par réglage (nom en gras, explication en gris, nom de sa catégorie en lien laiton,
  filet entre deux lignes), puis les sections qui les portent, réglables sur place.
- Barre du bas (cycle 268) : vues, « Libre », puis « Pixel art », « Nourrir », « Raclette »,
  « Sécateur » et « Photo » (gestes de jeu, hors des réglages) ; outil en main : bordure et
  texte laiton, « Poser la raclette ». Touches masquées sous 1 280 px, deux
  lignes sous 640 px (jamais trois, jamais hors de l'écran). Charte (#724, cycle 273) :
  panneau plein à filet ; les cinq vues en boutons accolés, la vue courante pleine en laiton
  (texte `#141418`) ; touches en `kbd` à filet, bord bas de 2 px, police mono. Icônes des
  outils (#724, cycle 274) : nourrir (boîte de granulés), raclette, sécateur et photo dessinés
  en pixels sur une grille de 12 (`ui/view-presets-bar/toolbar-icons.ts`), à la couleur du
  texte, 12 px à l'écran ; masquées avec les touches sous 1 280 px (la barre tient à 640 px).
- Minimale et discrète : l'interface s'efface devant le bac. Aucune interface en mode capture.
- Masquer l'interface (#725, cycle 275, à la place du mode immersif) : tout disparaît sauf le
  bac ; seule l'indication « I ou Échap pour revenir » (« Appui long pour revenir » au doigt)
  reste 3 s, petit panneau plein de la
  charte (coins de 4 px) en haut au centre, fondu sur sa dernière seconde (aucun fondu si
  « Réduire les mouvements ») ; le curseur se cache après 2 s d'immobilité.
- Icônes en pixel art, cohérentes avec la palette : composant commun `ui/pixel-icon`
  (un carré par pixel plein, sans lissage, décoratif). Chevrons dessinés (grille de 5) partout
  où un panneau se déplie : tableau de bord, guide du débutant, parcours du premier bac ; plus
  aucune flèche de texte ▸ ▾.
- Fiche d'espèce du wiki en cartel (#724) : nom courant en gras, nom scientifique en
  italique sur la même ligne après un point médian, puis une ligne utile avec ses unités
  (taille adulte, eau préférée, groupe, volume), tirée des lignes sourcées de la fiche.
- Une seule action pleine en laiton par zone : « Importer cet aquarium » dans l'offre de
  partage ; l'autre bouton reste à filet. Intitulés des groupes de la fenêtre des réglages en
  casse de phrase (plus de capitales espacées).
- Police : Atkinson Hyperlegible Next pour le texte, Atkinson Hyperlegible Mono pour les
  valeurs mesurées (OFL, `docs/INTERFACE.md`) ; pas de police pixel pour le texte.
- Contrôles attendus à terme : préréglages de vue, vitesse de simulation, population,
  jour/nuit, météo (pluie), son, choix de l'environnement, éditeur.
- Panneaux qui ne tiennent pas côte à côte : jamais ouverts ensemble. Sous 640 px de large,
  ouvrir « Réglages » replie « Commandes » et inversement (#136) ; plus large, la fenêtre des
  réglages replie « Commandes » le temps d'être ouverte et le rend à sa fermeture (#722), et
  l'aide-mémoire démarre replié sous 640 px (paysage de téléphone compris). Un nouveau panneau flottant suit la même règle
  (`ui/exclusive-panels`).
- Tableau de bord de l'eau (#256, ADR 0059) : cadre sur le bord haut, jamais au centre du
  bac ; niveaux aux couleurs d'état de la charte, bon (`#7db88c`), à surveiller (`#e8955f`)
  et danger (`#ec6a5c`), toujours doublés d'un texte et d'une icône pixel art (coche, point
  d'exclamation, croix) ; plein au repos comme au survol, sans opacité ni transition (#721,
  #724) ; noms des jauges en encre secondaire `#a9b1b5`, valeurs et heure en police mono ;
  chevrons dessinés en pixels (grille de 5) à la place des flèches ▴ ▾ ; focus en laiton.
  Bandeau bas (santé, alertes, entretien, bilan) : boutons à filet `#3d4850`, la couleur
  d'état sur l'icône et le texte seulement ; onglets « Bilan » et « Journal » et filtres du
  journal en choix exclusif, plein en laiton.
- Focus clavier (#407, ADR 0099) : anneau laiton `#d1a65c` de 2 px cerné d'un halo
  `#141418`, le même sur tous les contrôles ; texte des panneaux à 4,5:1 au moins sur le
  panneau (`#1b1f23`), le panneau élevé (`#232a30`) et la salle (`#141418`).
- Textes en français.
