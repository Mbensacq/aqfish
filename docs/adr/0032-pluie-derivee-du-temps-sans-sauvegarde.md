# 0032 — Pluie : dérivée de la graine et du temps, jamais sauvegardée

- Statut : acceptée
- Date : 2026-10-21
- Auteur : Dev, cycle 39, issue #106

## Contexte

L'issue #106 ajoute la pluie au bassin (première « météo » de `docs/DA.md`) : gouttes qui
tombent, ronds concentriques à la surface, nénuphars qui frémissent, lumière légèrement
assombrie. Elle se commande par la touche `R` et une case du panneau, et `pluie=1` dans
l'URL. Contraintes : positions et instants déterministes (contrat de capture), captures du
bac tropical et du bassin sans pluie identiques à l'octet, au plus N gouttes et N ronds,
rien de nouveau dans la sauvegarde.

## Décision

- **Simulation sans état** (`sim/rain.ts`), comme les bulles (ADR 0017) : la goutte n° k
  naît à `k · RAIN_DROP_PERIOD`, tombe à vitesse constante et touche l'eau après
  `RAIN_FALL_TIME` ; son rond vit `RIPPLE_DURATION`. Point d'impact tiré d'un **flux de
  hasard séparé** (`deriveSeed(deriveSeed(graine, RAIN_STREAM), k)`) : aucun autre tirage
  (poissons, bulles, nourriture, nénuphars) n'est consommé. `fillRain` écrit gouttes et ronds
  dans un tampon préalloué ; `MAX_RAIN_DROPS` et `MAX_RIPPLES` se déduisent de la cadence.
  Durées de chute et de vie choisies non multiples de la période : aucun cas limite
  d'arrondi aux bornes. Impacts tirés dans la surface rétrécie du rayon maximal d'un rond :
  aucun rond sur la margelle.
- **État de la pluie** (allumée ou non) : un signal de l'hôte, **jamais sauvegardé**
  (schéma 1 inchangé). `Environment.rain` dit où il peut pleuvoir (le bassin) : ailleurs, la
  vue refuse la pluie et l'hôte expose `false` ; changer d'environnement l'arrête.
- **Nénuphars** : `lilyPadPose(feuille, temps, pose, frémissement)` ajoute une rotation
  bornée (`RAIN_PAD_SHIVER_ANGLE`), sans toucher au centre : l'encombrement de chaque
  feuille, donc l'absence de contact (ADR 0029), est inchangé. Frémissement nul : pose
  identique à l'octet.
- **Rendu** (`render/rain-layer.ts`) : `LineSegments` d'un pixel de la cible, sans lissage.
  Gouttes en traits verticaux `eauTresClaire` (après les poissons et les bulles) ; ronds en
  cercles de 16 segments juste au-dessus de la surface, deux par impact, `eauTresClaire`
  puis `eauClaire` dans la seconde moitié de leur vie, dessinés après les rides de la
  surface et avant les nénuphars, qui les cachent par la profondeur. Couleurs pleines de la
  palette, assombries la nuit comme les bulles. Couche masquée et inerte sans pluie.
- **Commande** : touche `R` déclarée dans `core/commands` (groupe « Affichage ») ; `P` reste
  le filtre pixel art (décision de Mathis). Un test unitaire interdit deux commandes sur la
  même touche.

## Options écartées

- **Assombrir la lumière en réduisant l'intensité du jour** (× 0,85 sous la pluie) :
  essayé, retiré. La passe palette autorise alors en partie les tons du crépuscule (ADR 0021)
  et la teinte du décor change : stries claires sur les parois de l'eau, touffes d'herbe
  ternies, en plein midi. L'assombrissement demande un réglage propre (tons ou pénalités
  dédiés), laissé à l'issue #123.
- **Gouttes et ronds dans `World`** (intégrés pas à pas) : imposait un schéma de sauvegarde 2
  pour un phénomène qu'une fonction du temps décrit exactement.
- **Ronds en anneaux translucides qui s'estompent** : l'opacité partielle est ramenée par la
  passe palette à des couleurs imprévisibles ; deux paliers de couleurs pleines suffisent.

## Amendement (cycle 40, issue #125)

Lisibilité en vue trois-quarts, sans toucher à la simulation (`sim/rain.ts` inchangé : mêmes
impacts, mêmes instants, mêmes ronds) :

- **Gouttes en fondu** : opacité par sommet, nulle à `RAIN_FADE_TOP` (0,4 m) au-dessus de la
  surface, pleine à `RAIN_FADE_BOTTOM` (0,15 m). Une goutte ne se voit qu'en fin de chute et
  ne se détache plus sur le fond au-dessus du terrain. Abaisser `RAIN_START_HEIGHT` aurait
  décalé tous les impacts dans le temps (ronds différents dans toutes les captures de pluie)
  et, pour la même lisibilité, réduit la chute à quelques images.
- **Ronds vus de biais** (sinus de l'élévation de la caméra dans ]0,2 ; 0,9[) : rond extérieur
  seul, toujours `eauTresClaire`, pour qu'il se distingue des reflets `eauClaire` de la
  surface. Vue de dessus : tracé habituel, captures identiques. Un tracé épaissi d'un pixel a
  été essayé et écarté (ellipses remplies en taches).

## Conséquences

- Changer la cadence, les durées, le flux ou l'ordre des tirages change les captures avec
  pluie seulement ; les séries sans pluie et le bac tropical ne bougent pas.
- La pluie ne touche pas la simulation des poissons (aucune interaction avec les gouttes).
- La lumière ne change pas sous la pluie tant que l'issue #123 n'est pas traitée.
