# 0025 — Population réglable : identifiants jamais réutilisés, retrait du plus récent, bornes par espèce

- Statut : acceptée
- Date : 2026-10-20
- Auteur : Dev, cycle 29, issue #69

## Contexte

L'issue #69 permet de régler, dans le panneau de contrôle (ADR 0024), le nombre de néons,
de guppys et de corydoras pendant la simulation. Il faut ajouter et retirer des poissons
sans remettre le monde à zéro, sans perturber les autres espèces et en restant
déterministe : la même séquence de réglages à partir de la même graine doit redonner le
même monde.

## Décision

- **Module pur `sim/population.ts`** : `setPopulation(world, espèce, n)` renvoie un nouvel
  état, `setPopulationInPlace` modifie le monde de l'hôte (même convention que `feed` et
  `feedInPlace`). Temps, décor, obstacles, nourriture et générateurs des autres poissons ne
  changent pas.
- **Identifiants** : le monde porte un compteur `nextFishId` (égal à l'effectif initial à la
  création, jamais réutilisé, comme `nextFoodId`). Un poisson ajouté reçoit
  `nextFishId`, donc son propre sous-générateur `deriveSeed(seed, id)`, et naît comme à la
  création du monde (`createFish` : zone de naissance de l'espèce, profondeur préférée
  comprise, hors des obstacles). Il est ajouté en fin de tableau : l'ordre des entités
  reste celui des identifiants.
- **Retrait** : le poisson le plus récent de l'espèce (identifiant le plus grand)
  disparaît ; les autres gardent leur état tel quel (aucune pose recalculée, pas d'à-coup).
- **Bornes** : `maxPopulation` dans chaque définition d'espèce (néon 40, guppy 20,
  corydora 16 : approximations de jeu, au moins la population par défaut), et au plus
  `MAX_TOTAL_FISH` = 60 poissons en tout. Le banc est en O(n²) par espèce et le test de
  performance existant porte sur 60 néons. Une demande au-delà est ramenée à la borne
  (le panneau affiche alors la valeur obtenue) ; un effectif non entier, négatif ou non fini
  est refusé (`RangeError`), sans modifier le monde.
- **Indépendance des espèces** : banc, espacement minimal et évitement ne concernent que les
  congénères ou le décor. Ajouter ou retirer une espèce ne change donc pas, à l'identique,
  les trajectoires des autres (tests de `sim/population.spec.ts`). Exception assumée : avec
  de la nourriture, les espèces se disputent les granulés.
- **Contrat de capture** : `population=neon:12,guppy:2,corydora:0`, appliqué à t = 0 dans
  l'ordre de l'URL, avant d'avancer le monde. Absent, rien ne change (captures existantes
  identiques à l'octet).

## Options écartées

- **Identifiant = plus grand identifiant + 1** : évite un champ dans `World`, mais un
  poisson retiré puis « rajouté » reprendrait l'identifiant, donc le générateur, d'un
  ancien poisson : correct mais trompeur à déboguer.
- **Recréer le monde avec la nouvelle population** : simple, mais remet le temps à zéro et
  change toutes les trajectoires (critère de l'issue).
- **Retirer un poisson au hasard** : consommerait un tirage hors de tout générateur de
  poisson et rendrait le retrait moins prévisible pour l'utilisateur.

## Conséquences

- `World` gagne `nextFishId` (sérialisable) ; les mondes créés à la main dans les tests
  doivent le fournir.
- Le total borné laisse un ordre de réglage visible : au maximum de néons et de guppys, il
  ne reste que la place laissée sous 60 pour les corydoras (le bouton « + » est alors
  marqué inactif).
- La sauvegarde de la population (issue suivante) pourra réutiliser le format de
  `population=`.
