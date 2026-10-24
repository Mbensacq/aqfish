# 0045 — Bois flotté à branches et collision fine

- Statut : acceptée
- Date : 2026-10-24
- Auteur : Dev, cycle 58, issue #169

## Contexte

L'idée de Mathis #34 demande du bois, des branches et des racines entre lesquels les poissons
passent en suivant la forme réelle de chaque élément. Le décor éditable n'avait que `rock` et
`plant` (ADR 0015, 0016, 0043). Un rocher garde une collision en quelques grosses sphères
(ses blocs) ; un bois est fait de branches fines et écartées : une enveloppe ou quelques
grosses sphères fermeraient les creux entre elles, et trop de sphères coûtent cher à
l'évitement (budget fixé par l'issue : 40 par élément).

## Décision

- **Nouveau type `wood`** dans `DECOR_KINDS`, validé comme les autres (pas de `form`), et
  « Bois flotté » dans le catalogue de l'éditeur. Le schéma de sauvegarde ne change pas : une
  sauvegarde sans bois se charge comme avant.
- **Squelette tiré de la graine** (`sim/wood.ts`, `woodSkeleton`) : un tronc de 3 tronçons
  couché le long de X (24 à 32 voxels de 1 cm à l'échelle 1), une extrémité relevée, puis 2 ou
  3 branches de 2 tronçons alternées de part et d'autre (±Z), penchées vers le bout relevé ; une
  graine sur deux ajoute une fourche. Chaque tronçon est une capsule à rayon dégressif.
- **Voxels** : centre dans une capsule (`woodModel`). Chaque voxel est rattaché au tronçon où
  il est le plus profond, puis à la sphère la plus proche de ce tronçon.
- **Collision** : sphères posées le long de chaque tronçon (écart de 2 voxels, élargi jusqu'à
  tenir dans `MAX_WOOD_SPHERES` = 40), jonctions fusionnées ; le rayon de chaque sphère est le
  plus grand écart entre son centre et le coin le plus éloigné de ses voxels (au moins le rayon
  local de la capsule). Elle contient donc tous les voxels par construction, et pas plus que
  nécessaire : 2 à 3,5 voxels de rayon.
- **Passage entre les branches** : l'écart angulaire des branches (52° à 77° de part et d'autre
  de X) laisse, sur toute graine testée, un disque libre d'au moins 5 cm entre les bouts de deux
  branches à l'échelle 1 (5,8 cm au minimum sur 2 000 graines). 5 cm est la plus petite
  longueur de corps des espèces (grenouille), qui majore la largeur du plus petit poisson.
- **Rendu** (`render/wood-model.ts`) : maillage voxel générique et coque de contour, comme un
  rocher ; trois bruns de la palette (`sableSombre` dessus, `sableOmbre` flancs, `rocheSombre`
  pour les nœuds et la rangée posée sur le sable), sans le gris des rochers.
- **Nourriture** : un granulé se pose sur le dessus du bois (`woodTopAt`), comme sur un rocher.
- **Captures** : `bois=x:z:rotation:echelle:graine` ajoute des bois au décor par défaut, en
  capture seulement ; les séries existantes ne changent pas.

## Options écartées

- **Un voxel plein si ses huit coins sont dans une même sphère** (méthode des rochers) : avec
  des sphères fines, les branches se coupaient en morceaux ; il aurait fallu des sphères plus
  grosses que la branche.
- **Rayon de sphère fixé par une borne théorique** (rayon de la capsule + demi-diagonale d'un
  voxel + demi-écart) : collision de 3 cm autour d'une branche de 1 cm, creux bouchés.
- **Nouvelle forme d'obstacle « capsule »** : distance exacte et moins de primitives, mais un
  cas de plus dans l'évitement et la sauvegarde des obstacles ; l'union de sphères existante
  suffit dans le budget.
- **Ajouter un bois au décor par défaut** : toutes les captures du bac tropical auraient changé.

## Conséquences

- Les modèles de bois sont mis en cache (32 au plus, données immuables) : l'éditeur, la
  nourriture et le rendu redemandent le même bois à chaque geste. Un modèle coûte ~0,5 ms.
- Le filet de sécurité de `stepFish` pose le centre d'un poisson sur la surface d'une sphère :
  la distance mesurée ensuite vaut 0 à l'arrondi près (≈ −1e-17 m). Les tests de non-traversée
  du bois tolèrent un nanomètre.
- Pas encore de pose par gravité (#170) ni de plantes fixées sur le bois.
