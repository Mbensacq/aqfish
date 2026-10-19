# 0023 — Faim des poissons et attraction vers la nourriture : un terme du pilotage

- Statut : acceptée
- Date : 2026-10-19
- Auteur : Dev (Claude), cycle 25, issue #68

## Contexte

Les granulés existent (ADR 0022) ; les poissons doivent s'y intéresser : faim qui monte avec
le temps, attraction vers le granulé le plus proche, repas. Contraintes : déterminisme, état
sérialisable, aucune consommation du hasard des poissons, **captures sans nourriture
identiques à l'octet**, évitement des parois et des obstacles prioritaire (aucun rocher
traversé), comportement de banc plausible, différence entre espèces (néons et guppys en
pleine eau, corydoras au fond).

## Décision

- **Faim dans l'état du poisson** : `Fish.hunger` ∈ [0, 1], `HUNGER_START` = 0,5 à la
  naissance (valeur fixe, sans tirage : les mondes à t = 0 sont inchangés), montée de
  `feeding.hungerRate · dt` dans `stepFish`, retrait de `PELLET_SATIATION` = 0,25 par
  granulé. Affamé à partir de `HUNGRY_THRESHOLD` = 0,3 : un poisson né mange un ou deux
  granulés puis laisse les autres aux congénères. Pas de mort par la faim (v0.10).
- **Paramètres par espèce** (`SpeciesDefinition.feeding`) : vitesse de la faim, rayon de
  perception, vitesse de virage vers la nourriture, tranche d'eau `[minHeightRatio,
  maxHeightRatio]` où l'espèce remarque et mange (néon : 35 à 100 % de la hauteur d'eau ;
  guppy : 20 à 100 % ; corydora : 0 à 10 %, granulés arrivés au fond). Approximations de jeu.
- **Point visé** (`foodTarget`, `sim/feeding.ts`) : granulé le plus proche dans la tranche, à
  portée, **en vue** (le segment poisson → granulé reste à au moins la moitié de
  `wallMargin` de tout obstacle, échantillonné tous les centimètres), ramené dans les bornes
  de nage `hard` (un granulé flottant ou posé est hors d'atteinte du centre). Calculé sur les
  positions du début du pas, comme le banc.
- **Terme du pilotage** : `stepFish(…, food)` remplace l'errance et le banc par un virage vers
  le point visé (au plus `feeding.turnRate` rad/s) et une inclinaison vers lui ; l'évitement
  garde sa priorité (`avoid`) comme pour le banc. Les tirages de l'errance sont faits quand
  même : même suite de tirages avec ou sans nourriture. Vitesse visée : accourt
  (`(croisière + max) / 2`) puis ralentit à l'approche (`FOOD_RUSH_DISTANCE`, rappel plus
  fort), pour ne pas tourner autour du granulé. La prospection de l'évitement s'arrête au
  point visé : un granulé au fond n'est plus repoussé par l'évitement du fond.
- **Repas** (`eatInPlace`), après la nage et l'écartement minimal : dans l'ordre des
  identifiants, chaque poisson affamé mange le granulé le plus proche à moins de
  `EAT_DISTANCE` = 2 cm du point visé ; un granulé pris l'est pour de bon (deux poissons ne
  mangent jamais le même). Compactage en place, ordre conservé, aucune allocation par pas.
- **Sans granulé, aucune branche nouvelle n'est prise** : `food` reste nul, les calculs de
  la nage sont exactement ceux d'avant (même expression flottante). La faim monte, mais
  n'est lue par aucun calcul de trajectoire.

## Options écartées

- **Machine à états parallèle** (errance / chasse / repas) : demandée hors périmètre par
  l'issue ; doublerait la logique d'évitement.
- **Attraction ajoutée au vecteur de banc** : limitée par `schooling.turnRate` et diluée par
  la cohésion ; et le corydora suivrait son banc plutôt que la nourriture.
- **Faim initiale tirée au hasard** : consommerait le générateur des poissons (mondes à
  t = 0 changés) ou un flux de plus, sans gain visible.
- **Sans test de visibilité** : un granulé derrière un rocher attire le poisson contre le
  rocher (minimum local : l'évitement et l'attraction s'équilibrent) ; mesuré : le poisson
  s'y bloque ou s'en écarte jusqu'à perdre le granulé de vue.
- **Portée d'évitement des obstacles réduite en approche** (pour atteindre les granulés près
  des plantes) : poissons à 2,5 mm d'un obstacle au pire mesuré ; inutile une fois la
  visibilité et l'arrêt de la prospection au point visé en place.

## Conséquences

- Les captures avec `nourrir=` changent (les poissons viennent manger) ; sans `nourrir=`,
  inchangées à l'octet. Nouveau tracé `trajectoires-nourriture-top.png`.
- Un granulé tombé à moins de ~`wallMargin` d'un obstacle peut rester hors d'atteinte : il
  disparaît à son délai (ADR 0022).
- Nourris et pressés, les poissons frôlent davantage les obstacles (0,38 `wallMargin` au pire
  mesuré sur 3 graines, contre 0,64 sans nourriture) sans jamais y entrer.
- Le panneau de bien-être (v0.10) pourra lire `Fish.hunger`.
