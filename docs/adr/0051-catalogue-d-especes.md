# 0051 — Catalogue d'espèces : libellés dans la simulation, curseur par espèce

- Statut : acceptée
- Date : 2026-10-25
- Auteur : Dev, cycle 67, issue #189

## Contexte

La population se règle par espèce depuis #69 (ADR 0025) : un champ numérique entre « − » et
« + » pour chaque espèce de l'environnement (#88). L'issue #189 demande un **catalogue** :
les espèces compatibles avec l'environnement, un curseur d'effectif par espèce, une fonction
pure de `sim/` qui liste ces espèces et applique des effectifs bornés. La dette #95 relevait
en plus des libellés construits à la main (« Retirer un grenouille », pluriel par ajout d'un
« s ») et `population=neon:9999` ignoré au lieu d'être borné.

## Décision

- **`sim/species-catalog.ts`** : `speciesCatalog(env)` renvoie, dans l'ordre de
  `Environment.species`, nom, nom scientifique, libellés, effectif par défaut et maximum de
  chaque espèce (résultat figé, mis en cache). `applySpeciesCounts` (pure) /
  `applySpeciesCountsInPlace` (hôte) appliquent des effectifs demandés dans l'ordre :
  arrondis, ramenés à [0, `populationLimit`], espèce inconnue ou hors environnement et
  nombre non fini ignorés sans erreur. `population=` passe par elle.
- **Libellés** : table `SPECIES_LABELS` (singulier, pluriel, genre) typée
  `Record<SpeciesId, …>` : une nouvelle espèce ne compile pas sans ses libellés. Le panneau
  en tire « Nombre de… », « Ajouter une grenouille », « Curseur du nombre de… ».
- **Panneau** : par espèce, le nom sur sa ligne (nom scientifique en info-bulle), puis
  « − », **curseur**, champ, « + ». L'échelle du curseur est fixe (0 au maximum de
  l'espèce) ; la valeur est ramenée à la place restante sous `MAX_TOTAL_FISH` et réécrite.
- **Sauvegarde** : inchangée (schéma 1) ; les poissons y sont déjà, donc les effectifs.
- **`population=`** : effectif de 1 à 6 chiffres, borné par l'application.

## Options écartées

- **Effectifs comme données à part dans la sauvegarde** : redondant avec la liste des
  poissons, et source d'incohérence.
- **Échelle du curseur égale à la place restante** : l'échelle changerait sous le pouce
  quand une autre espèce varie.
- **Libellés dans `SpeciesDefinition`** : neuf définitions à toucher pour des textes
  d'interface ; une table à part suffit et reste exhaustive par le typage.

## Conséquences

- La ligne d'une espèce gagne une ligne de nom (12 px). Pour qu'à 1280 × 720 la section
  « Sauvegarde » tienne toujours sans défiler (#101, test `sauvegarde.spec.ts`), les
  contrôles d'espèce font 24 px au-delà de 480 px de large (souris) et 28 px en dessous
  (tactile, test `panneau.spec.ts`). La marge restante est faible : une quatrième espèce
  dans un environnement ou une nouvelle ligne du panneau demandera une section
  « Population » repliable ou un autre agencement. Le panneau masque toujours une bonne
  partie du bac à 390 px (#95, point 3) : un tiroir bas reste à étudier.
- Ordre au clavier dans une ligne : « − », curseur, champ, « + ».
