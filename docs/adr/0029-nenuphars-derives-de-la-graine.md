# 0029 — Nénuphars : dérivés de la graine et du temps, ombre dessinée après l'eau

- Statut : acceptée
- Date : 2026-10-21
- Auteur : Dev, cycle 35, issue #103

## Contexte

L'issue #103 ajoute des nénuphars à la surface du bassin : nombre, positions et tailles tirés
de la graine, dérive très lente qui ne touche ni la margelle ni une autre feuille, ombre
légère sur le fond, aucun effet sur le bac tropical (captures identiques à l'octet) ni sur
la simulation des poissons. Deux questions : faut-il un état des feuilles dans `World` (et
donc dans la sauvegarde, ADR 0028) ? Comment rendre une ombre visible sous une eau que la
passe palette ramène à une seule couleur ?

## Décision

- **Aucun état** : les nénuphars sont une donnée de l'environnement
  (`Environment.lilyPads` : effectif et rayons, `null` pour le bac tropical, ADR 0026) et
  une fonction pure (`sim/lily-pads.ts`).
  - `lilyPadLayout(graine, eau, réglage)` tire la disposition d'un **flux de hasard
    séparé** (`deriveSeed(graine, LILY_PAD_STREAM)`), comme les bulles et la nourriture :
    les sous-générateurs des poissons ne sont jamais consommés. Placement par rejet borné
    (`LILY_PAD_ATTEMPTS` essais par feuille, feuille omise sinon) : jamais de boucle infinie.
  - Chaque feuille a un **encombrement** (rayon + amplitude de dérive) placé à
    `LILY_PAD_EDGE_MARGIN` de la bordure et à `LILY_PAD_GAP` des autres encombrements.
  - `lilyPadPose(feuille, temps)` : dérive de Lissajous dont chaque composante est bornée par
    `dérive / √2`, donc dans le disque de rayon `dérive` ; balancement de ± 0,06 rad.
    L'absence de contact est ainsi **garantie par construction**, à tout instant.
  - La sauvegarde n'a aucun champ nouveau : schéma 1 inchangé.
- **Rendu** (`render/lily-pad-layer.ts`) : feuille en prisme mince (6 mm) à encoche, dessus
  `vegetation` et bord `vegetationSombre`, contour d'un pixel (coque arrière avec onglets aux
  coins de l'encoche). Les feuilles sont posées 2 mm au-dessus de la surface et dessinées
  comme le décor (après l'eau) : couleurs exactes de la palette.
- **Ombre** : disque à encoche à plat sur le fond, décalé à l'opposé du soleil
  (`LILY_PAD_SHADOW_OFFSET`, plus court que la marge), en `eauProfonde` pleine, **dessiné
  après le volume d'eau et avant les rides de la surface** (ordre 1,2). Une ombre dessinée
  sous l'eau comme le fond (même noire) sortait de la passe palette en `eauSombre`, la
  couleur de l'eau : invisible sur les captures.

## Options écartées

- **État des feuilles dans `World`** (positions intégrées pas à pas) : imposait un schéma 2
  avec migration, pour un mouvement qu'une fonction du temps décrit exactement.
- **Ombre portée Three.js** (shadow maps) : coûteuse en rendu logiciel, et ramenée elle
  aussi à la couleur de l'eau par la passe.
- **Feuilles sous la surface** : teintées par l'eau, elles perdaient leurs couleurs.

## Conséquences

- Changer le réglage du bassin, le flux ou l'ordre des tirages change la disposition (et
  les captures du bassin), pas les poissons ni le bac tropical.
- La feuille est très mince : sans `polygonOffset`, le dessous de la coque du contour et le
  dessus de la feuille tombaient sur la même profondeur quantifiée en vue lointaine, et le
  contour noircissait la moitié lointaine des feuilles (voir `docs/PIEGES.md`).
- Les feuilles flottent au-dessus des poissons : un koï passe dessous et disparaît. Aucune
  interaction poisson-feuille (hors périmètre).
