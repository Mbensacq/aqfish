# 0011 — Comportement de banc : pilotage en deux phases et espacement minimal

- Statut : acceptée
- Date : 2026-10-18
- Auteur : Dev (Claude), cycle 8, issue #27

## Contexte

Les néons nageaient chacun pour soi (`sim/swimmer.ts`). L'épopée v0.2 demande un banc
crédible (séparation, alignement, cohésion), déterministe, sans allocation par pas, et sans
recouvrement entre poissons.

## Décision

- **Paramètres déclaratifs** : `SpeciesDefinition.schooling` (`sim/species.ts`) : rayons de
  perception et de séparation, trois poids, vitesse de virage due au banc, distance minimale.
  `null` = espèce solitaire (nage inchangée).
- **Règles de boids pures** (`sim/flocking.ts`) : `separation`, `alignment`, `cohesion`,
  `schoolSteering`, écrites dans un vecteur `out` fourni (aucune allocation). Voisins =
  congénères strictement dans le rayon ; parcours dans l'ordre des identifiants. Séparation
  pondérée par `radius / d - 1` (forte au contact) ; centres confondus départagés par
  l'identifiant.
- **Deux phases par pas** (`stepInPlace`, `sim/world.ts`) : le pilotage de tous les poissons
  est calculé sur les positions du début du pas (`computeSchoolSteering`, dans un
  `Float64Array` réutilisé, réalloué seulement si la population croît), puis chacun nage.
  Le résultat ne dépend pas de l'ordre de mise à jour.
- **Pilotage → cap** : `stepFish` reçoit le pilotage en trois nombres. La direction voulue est
  le cap actuel plus le pilotage ; le poisson y tourne d'au plus `turnRate` rad/s en plus de
  son errance, son inclinaison visée glisse vers celle de la direction voulue, et sa vitesse
  visée varie de ± 50 % selon que le banc est devant ou derrière. L'évitement des parois reste
  prioritaire. Pilotage nul ⇒ nage solitaire **à l'identique** (même suite de hasard).
- **Espacement minimal** (`enforceMinDistance`) : après la nage, chaque paire de congénères
  plus proche que `minDistance` est écartée symétriquement (une passe, paires `(i, j)`
  ordonnées), puis ramenée dans ses bornes. Le pilotage seul, à virage borné, laissait des
  passages à quelques millimètres.
- **Complexité** O(n²) par pas : ≈ 15 000 calculs de distance à 60 poissons, négligeable. Une
  grille spatiale ne se justifiera qu'au-delà de quelques centaines de poissons.

## Options écartées

- **Vecteur vitesse libre** (boids classiques) : aurait remplacé le modèle cap / inclinaison /
  vitesse dont dépendent les bornes, l'errance et le rendu (interpolation des angles).
- **Mise à jour séquentielle** (chaque poisson voit les voisins déjà déplacés) : déterministe
  mais dépendant de l'ordre ; les deux phases coûtent un tampon réutilisé.
- **Grille spatiale** : inutile à 60 poissons, complexité de code non justifiée aujourd'hui.

## Conséquences

- Les poissons d'un banc s'influencent : **ajouter un poisson change la trajectoire des
  autres**. La propriété garantie jusqu'ici (`world.spec.ts`) est réduite à l'indépendance du
  hasard et de l'état initial (sous-générateur par entité, ADR 0003).
- L'espacement forcé peut déplacer un poisson un peu plus que `maxSpeed · dt` sur un pas (au
  plus `minDistance / 2` par paire) ; la garantie de `stepFish` seul est inchangée.
- `turnRate` est lu dans la définition d'espèce par `stepFish`, même quand
  `computeSchoolSteering` reçoit d'autres paramètres (tests) : seuls rayons et poids varient.
- Population par défaut du néon portée de 8 à 12 pour qu'un banc se lise à l'écran.
- Hors périmètre : évitement des parois par le banc (issue suivante), ondulation du corps.
