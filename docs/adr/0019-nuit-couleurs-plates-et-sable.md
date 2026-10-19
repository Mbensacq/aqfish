# 0019 — Nuit : couleurs plates assombries, pas de sable nocturne dans la palette

- Statut : acceptée
- Date : 2026-10-19
- Auteur : Dev (Claude), cycle 19, issue #64

## Contexte

Remarques de la revue de #63 (cycle jour/nuit, ADR 0018) :

1. les poissons, les bulles et le diffuseur, en couleurs plates non éclairées (ADR 0009,
   0017), restent au niveau de midi à minuit et ressortent trop vivement ;
2. le sable de nuit tombe sur `roche` (gris) en pixel art ;
3. `lightAt` alloue quatre tableaux par appel.

Contrainte commune : les captures par défaut (midi) restent identiques à l'octet.

## Décision

- **Couleurs plates assombries la nuit** (`render/night-shade.ts`) : facteur
  `flatBrightness(i) = 0,6 · (1 − i) + 1 · i` (exactement 1 en plein jour), appliqué par
  `AquariumView.updateLight` à la couleur des matériaux des poissons (qui multiplie leurs
  couleurs de sommet) et des bulles et du diffuseur (couleur de la palette × facteur).
  Valeur de nuit `NIGHT_FLAT_BRIGHTNESS = 0,6` choisie pour la passe palette : le bleu néon
  reste `neonBleu`, le rouge néon passe à `koiRouge`, le blanc à `sable`, les nageoires et
  bulles `eauTresClaire` à `eauClaire`, le noir à `fondScene`. Sous 0,55, le bleu néon
  tombe sur `eauMoyenne` : les néons se fondraient dans l'eau.
- **Sable de nuit : aucune couleur ajoutée à la palette** (point 2 écarté). Mesure : sable
  du dessus avant quantification (passe palette court-circuitée le temps d'une capture) à
  minuit `#486068`, au crépuscule `#7a7a6b`, à midi `#c1c29a`. Recherche exhaustive au pas
  de 2 sur les canaux RVB dans [40, 150[ : **aucune** couleur ajoutée qui capte `#486068`
  ne laisse inchangées les six captures par défaut (l'eau de midi `#3b685d`, ramenée à
  `eauSombre`, est à 19 unités du sable de nuit, et plusieurs centaines d'autres pixels
  bleu-gris des captures de midi sont dans la même zone). Le sable reste donc `roche` la nuit
  (effet de clair de lune sans couleur nouvelle) ; sans filtre, sa teinte bleutée est la
  lumière de lune voulue (pas de palette dans ce mode).
- **`lightAtInto(heure, tampon)`** (`sim/daylight.ts`) : écrit la lumière dans un
  `MutableDayLight` (`createDayLight()`), sans allocation ; résultat identique à `lightAt`
  composante par composante. `lightAt` devient une enveloppe (`lightAtInto(h,
createDayLight())`) gardée pour les tests et usages ponctuels ; l'hôte réutilise un tampon.

## Options écartées

- **Variante nocturne par couleur de la palette** (table jour → nuit) : plus de contrôle,
  mais une seconde géométrie de couleurs par couche ou un shader dédié, pour un résultat
  proche du facteur unique une fois quantifié.
- **Éclairer les poissons** (`MeshLambertMaterial`) : contraire à l'ADR 0009 (les nuances
  d'éclairage font basculer les petits poissons sur des teintes d'eau).
- **Teinte de lune sur les couleurs plates** (facteur bleuté) : le blanc et le sable des
  poissons basculent vers des couleurs d'eau à la quantification.
- **Ajouter un sable nocturne à la palette** : impossible sans changer les captures de midi
  (mesure ci-dessus).

## Conséquences

- À minuit, poissons et bulles sont visiblement plus sombres ; les néons restent lisibles.
  Les captures de midi sont identiques à l'octet ; seules changent les captures à heure
  figée (`three-quarter-crepuscule`, `three-quarter-minuit`,
  `three-quarter-sans-filtre-minuit`).
- Un futur sable nocturne passera par un autre levier que la palette seule (par exemple
  une palette par heure, choisie par la passe), avec la même comparaison avant/après.
