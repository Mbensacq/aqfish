# 0021 — Tons de nuit et du crépuscule : palette étendue pondérée par l'heure

- Statut : acceptée
- Date : 2026-10-19
- Auteur : Dev, cycle 23, issue #73

## Contexte

Demande de Mathis (#73) : la nuit est grise et terne (sable sur `roche`, eau vert-gris,
plantes et rochers au niveau de midi) et rien n'indique qu'il fait nuit. Attendu : nuit de
clair de lune bleutée et contrastée, crépuscule chaud sans dominante brune ou verdâtre, même
qualité sans filtre, et captures de midi identiques à l'octet.

L'ADR 0019 avait mesuré qu'**aucune** couleur ajoutée à la palette ne peut capter le sable de
minuit sans changer les captures de midi : la passe choisit la couleur la plus proche, et
l'eau de midi est à 19 unités du sable de nuit. Elle proposait « une palette par heure,
choisie par la passe ».

## Décision

- **Palette étendue pondérée** (`render/palette.ts`, `render/palette-pass.ts`) : la passe
  reçoit les couleurs de jour (`PALETTE`), puis les tons de nuit (`NIGHT_TONES`), puis ceux
  du crépuscule (`TWILIGHT_TONES`). La distance au carré d'un ton reçoit une pénalité de
  groupe (uniformes `uNightPenalty`, `uTwilightPenalty`) :
  `pénalité(poids) = 0,02 · (1 − poids) / poids`, et `TONE_PENALTY_OFF = 1000` pour un
  poids nul (plus que la distance au carré maximale, 3 : le ton ne peut jamais gagner).
  Poids des tons de nuit : `1 − i` ; du crépuscule : `√(4 · i · (1 − i))` (`i` : intensité
  du jour). **En plein jour (`i = 1`), les deux groupes sont écartés** : l'image est celle de
  la palette de jour seule, ce que vérifient un balayage de tout l'espace RVB
  (`palette.spec.ts`) et la comparaison d'octets des captures. Les couleurs de jour restent
  en tête : à égalité, elles l'emportent. `nearestPaletteIndex` (`render/pixel-art.ts`)
  prend les mêmes pénalités, pour les tests.
- **Tons mesurés, pas devinés** : chaque ton est la couleur d'une surface **avant
  quantification** (passe court-circuitée le temps d'une capture, voir `docs/PIEGES.md`) :
  sable sous la lune `#4a6485` → `sableLune`, eau `eauLune`, plantes `vegetationLune*`,
  rochers `rocheLune*`, bleu des néons assombris `neonBleuNuit` (sans lui, ils tombaient sur
  une couleur d'eau) ; au crépuscule, sable rosé `sableCrepuscule` (18 h) et mauve
  `sableCrepusculeMauve` (19 h), eau `eauCrepuscule*`.
- **Décor teinté** (`render/night-shade.ts`, `decorTintInto`) : plantes et rochers sont en
  couleurs plates non éclairées (ADR 0015), donc identiques à midi et à minuit. Leur
  matériau reçoit un facteur linéaire par canal : blanc à midi (exact), `DECOR_NIGHT_TINT`
  `(0,4 ; 0,5 ; 1,2)` la nuit (plantes vert-bleu sombre, rochers gris bleuté), teinte chaude
  `(1 ; 0,78 ; 0,74)` à mi-transition. Cycle 62 (#81) : à 19 h, sable gris-mauve et rochers
  gris neutre ; la teinte de crépuscule du décor passe à `(1 ; 0,55 ; 0,8)` (rochers mauve
  rosé, plantes vert-bleu), le ciel de crépuscule à `(1 ; 0,45 ; 0,55)`, et trois tons
  mesurés s'ajoutent (`rocheCrepuscule`, `rocheCrepusculeSombre`, `sableCrepusculeOmbre`) ;
  `sableCrepusculeMauve` est plus saturé. Midi reste identique à l'octet.
- **Entrées de nuit bleues** (`render/aquarium-scene.ts`) : l'eau étant translucide (30 %),
  une eau de nuit `eauProfonde` changeait à peine l'image. Les teintes d'entrée la nuit
  sont bleues et saturées (`NIGHT_WATER_BODY`, `NIGHT_WATER_SURFACE`), de même que le sol de
  la lumière ambiante (`NIGHT_GROUND`, côtés du sable) et le dessous du sable
  (`NIGHT_SAND_BOTTOM`, vue de dessous). Ces entrées ne sont pas affichées telles quelles :
  la passe les ramène aux tons de nuit ; sans filtre, elles donnent directement la teinte
  de lune (même qualité, #40).
- **Crépuscule plus long et plus chaud** (`sim/daylight.ts`) : `NIGHT_ELEVATION` passe de
  −0,25 à −0,5 (pleine nuit de 20 h à 4 h au lieu de 19 h à 5 h ; plein jour inchangé de
  8 h à 16 h) pour que 19 h soit encore le crépuscule ; poids de la teinte rasante
  `0,75 · √(4i(1 − i))` au lieu de `0,6 · 4i(1 − i)`, teintes un peu plus rosées.
- **Indicateur** (`ui/day-indicator/`) : icône SVG pixel art 9 × 9 à 3 px par pixel, en
  couleurs de la palette, en haut à gauche, nom accessible « Moment de la journée : … ».
  `dayPhaseAt(heure)` : `jour` dès une intensité de 0,6, `nuit` jusqu'à 0,1, `aube` ou
  `crepuscule` entre les deux. Le signal `AquariumHost.dayPhase` est mis à jour avec
  l'éclairage et ne notifie qu'au changement (quatre fois par journée).

## Options écartées

- **Deux palettes et bascule à un seuil d'heure** : simple, mais saut visible au seuil ;
  la pénalité fait entrer les tons progressivement, pixel par pixel.
- **Teinte appliquée avant quantification dans la passe** (multiplier l'image par une
  couleur de lune) : sans effet sur la palette d'arrivée, le sable bleuté retombait sur
  `roche` ; et sans filtre, aucune passe ne l'appliquerait.
- **Éclairer le décor** (`MeshLambertMaterial`) : nuances d'éclairage par face qui changent
  les couleurs de midi (contraire à l'identité des captures) et à l'ADR 0015.

## Conséquences

- Captures de midi (5 angles et sans filtre) identiques à l'octet ; seules changent les
  captures à heure figée, et `three-quarter-crepuscule-19h` s'ajoute.
- Le test « image dans la palette » de nuit accepte la palette étendue
  (`EXTENDED_PALETTE_COLORS`) ; les néons de nuit sont `neonBleuNuit` au lieu de `neonBleu`.
- Ajouter une couleur de jour ou un ton impose de refaire la mesure avant/après
  (`docs/PIEGES.md`, « Rendu »). La passe parcourt 51 couleurs au lieu de 34.
- 19 h est un crépuscule tardif, plutôt mauve que doré : les teintes dorées sont à 17 h -
  18 h. Le panneau de contrôle (#52) permettra d'y aller directement.
- L'ADR 0019 reste valable pour les couleurs plates des poissons ; son point « pas de sable
  nocturne » est remplacé par la présente décision.
