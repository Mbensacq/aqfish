# 0012 — Évitement des parois et des obstacles par forces de proximité

- Statut : acceptée
- Date : 2026-10-18
- Auteur : Dev (Claude), cycle 9, issue #28

## Contexte

Jusqu'ici, un poisson dont le point visé sortait de la zone d'évitement virait d'un coup, à
pleine vitesse de virage, vers le centre du bac (`sim/swimmer.ts`) : réaction tout ou rien,
non testable à valeurs exactes, et sans notion d'obstacle. L'issue #28 demande une force
proportionnelle à la proximité, pure et testée, et des obstacles sphériques (rochers à venir)
déclarés dans le monde, contournés sans demi-tour brusque. L'idée #34 annonce des formes de
collision plus fines (branches, racines).

## Décision

- **Obstacles = données** (`sim/obstacles.ts`) : union discriminée par `shape`, sphère
  seulement (`id`, centre, `radius`). Une seule primitive géométrique :
  `obstacleDistance(obstacle, point, normalOut)` → distance signée à la surface et normale
  sortante. Une nouvelle forme n'ajoute qu'un cas. `World.obstacles` (copiés, validés, triés
  par identifiant ; `createWorld(seed, population, obstacles)`), sérialisable en JSON. Le
  monde par défaut n'en a pas (rendu des rochers : v0.3).
- **Forces pures** (`sim/avoidance.ts`, sans allocation) : `proximity(d, range) = 1 − d/range`
  (bornée à [0, 1]) ; `wallAvoidance` somme les normales intérieures des six faces de la
  boîte `hard` ; `obstacleAvoidance` somme les normales des obstacles, au point le plus
  proche parmi trois échantillons du segment position → point visé (un petit rocher ne
  passe pas entre les deux), marge `wallMargin` déduite. Portée : `AVOID_ZONE` (7 cm ; 8 cm jusqu'au cycle 12), donc
  aucune force tant que le point visé reste dans la boîte `soft`.
- **Contourner, pas freiner** (`deflect`) : dans le plan horizontal, la composante de la
  force opposée au cap est tournée de 90° du côté `side` ; une force dans le sens du cap est
  atténuée de `1 − cos` (nulle si le poisson fuit déjà tout droit). Le résultat est
  **continu** en cap. `side` = signe de la vitesse de virage d'errance, qui, pendant
  l'évitement, prend le sens du virage d'évitement (« mémoire du virage ») et perd son hasard.
- **Dosage** (`stepFish`) : intensité `a = min(1, ‖force brute‖)`. Le cap tourne vers
  « cap + 2 × déviation » d'au plus `avoidTurnRate · dt`, multiplié par `a` ; errance et banc
  gardent la part `1 − a`. L'inclinaison visée glisse vers celle de cette direction, en
  proportion de `a`.
- **Filets de sécurité** : après le déplacement, un centre entré dans un obstacle est projeté
  sur sa surface, puis dans `hard`. Naissance hors des obstacles (tirage répété, au plus 16
  fois ; sans obstacle, un seul tirage : mondes existants inchangés).

## Options écartées

- **Déviation 3D, renormalisée** (premier essai) : oscillation constatée d'un pas à l'autre
  (cap qui alterne entre deux valeurs à ± `avoidTurnRate · dt`) : dans un coin, une petite
  force de la seconde paroi qui apparaît ou disparaît faisait basculer le côté du virage ; et
  pour un poisson incliné, la composante opposée était surestimée dans le plan horizontal.
- **Champ de potentiel pur** (normale sans déviation) : pile face à une paroi, la force est
  colinéaire au cap et ne fait pas tourner avant d'être plus forte que lui.
- **Mémoire du virage à pleine errance** (± `wanderTurnRate`) : le poisson continuait à
  tourner après l'obstacle et faisait demi-tour ; ramenée à 25 %.
- **Distance signée analytique d'un segment** : exacte pour la sphère, mais pas générique ;
  trois échantillons suffisent à la vitesse des poissons (point visé à ≈ 9 cm).

## Conséquences

- Mesures (20 néons, 10 000 pas, deux rochers, graines 1, 42, 2³² − 1 ; 30 graines sans
  rocher) : aucun poisson hors du bac, aucun plaqué contre une limite de nage ou dans un
  rocher, aucun virage de plus de 90° en un pas (au plus ≈ 2,5° par pas). Ces critères sont
  des tests (`world.spec.ts`).
- Le comportement de nage change (trajectoires des graines existantes) : captures à revoir.
- Avec obstacles, la projection hors d'un obstacle peut allonger un pas au-delà de
  `maxSpeed · dt` ; la garantie reste vraie sans obstacle.
- Coût : 6 faces + 3 évaluations par obstacle et par poisson et par pas ; négligeable
  jusqu'à des dizaines d'obstacles.

## Réglage du cycle 13 (issue #43)

Constat : les poissons restaient loin des vitres (médiane des distances minimales aux vitres
9 à 10 cm sur 300 s, 0,3 % des positions à moins de 10 cm). Réglage retenu : `wallMargin`
5 → 4 cm (néon et guppy, toujours ≥ la demi-longueur du corps) et `AVOID_ZONE` 8 → 7 cm.
La zone de naissance garde l'ancienne marge (13 cm, `SPAWN_MARGINS`), pour que les mondes à
t = 0 restent identiques au bit près. Résultat : médiane 7 à 8,7 cm (8,5 à 8,6 cm pour les
graines 1, 42, 2³² − 1), 10 à 14 % des positions à moins de 10 cm, distance minimale ≥ 4,7 cm,
aucun contact avec la limite de nage (20 graines, avec et sans rochers). Écarté : raccourcir l'anticipation
(`LOOKAHEAD_SECONDS` 1,5 → 1 ou 1,2 s) : poissons plaqués dans les coins et contre les
rochers (tests de `swimmer.spec.ts` et `world.spec.ts` en échec). Mesure et tracé :
`sim/trajectory.ts`, `trajectory.spec.ts` et `trajectoires-top.png` du harnais de captures.
