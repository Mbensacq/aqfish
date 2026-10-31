# 0088 — Points blancs, lot 1/2 : modèle de la maladie dans la simulation

- Statut : acceptée
- Date : 2026-10-31
- Auteur : Dev, cycle 119, issue #360

## Contexte

Épopée v1.6 « Soigner pour de vrai ». Jusqu'ici, un animal ne perdait de la santé que par la
faim, l'eau mauvaise ou le pH (ADR 0054, 0057) ; les maladies n'existaient que dans le wiki
(ADR 0068). Ce lot fait apparaître la maladie la plus courante des débutants, les points
blancs (_Ichthyophthirius multifiliis_, `docs/SOINS.md` § 5.1), sans rendu ni alerte (#366)
ni traitement (lot 2/2). Contraintes : déterminisme (même graine, mêmes actions, même
contagion), captures de la graine 42 identiques à l'octet, sauvegardes anciennes inchangées.

## Décision

- **État** : champ facultatif `Fish.ich`, âge de l'infection en secondes simulées, dans
  [0, `ICH_AGGRAVATED_AT`] ; absent, l'animal est sain. Un nombre plutôt qu'un objet : sans
  allocation, sérialisable tel quel, et extensible plus tard par d'autres champs de maladie.
- **Stades** : incubation [0, 300 s[ (aucun signe, pas contagieux), points visibles
  [300 s, 900 s[ (contagieux, demi-cause de santé), aggravation à 900 s (contagieux, cause
  entière : de 1 au plancher en 8 min). L'âge s'arrête à 900 s. Aucune mort : la santé reste
  au plancher (`HEALTH_FLOOR`), comme pour les autres causes.
- **Qui** : poissons nageurs d'eau douce seulement (`catchesIch`) : ni marcheurs ni
  amphibiens (axolotl, grenouille, triton), ni espèces du récif, ni bac de récif. Le projet
  n'a pas d'invertébré.
- **Stress du bac** (`ichStress`, 0 à 4 causes) : écart à la température de l'environnement
  ≥ 6 °C (seuil « mauvaise » de l'eau, ADR 0053) ; écart à la température visée ≥ 3 °C
  (changement brusque : l'eau rejoint la consigne avec une constante de 10 min, donc au moins
  18 °C par heure simulée) ; ammoniaque ≥ 5 et nitrites ≥ 5 (seuils « mauvaise », unités de
  jeu). Les nitrates ne comptent pas (eau vieillie, pas un choc). Une valeur non finie ne
  compte pas.
- **Infection** : par pas, chaque poisson sain concerné est infecté avec la probabilité
  1 − e^(−λ·dt), λ = causes × 1/3600 s⁻¹ + contagieux × 1/1800 s⁻¹, le nombre de contagieux
  étant compté au début du pas (résultat indépendant de l'ordre). Sans stress ni malade,
  λ = 0 : un bac sain et stable ne tombe **jamais** malade, et aucun calcul n'est fait.
- **Hasard** : hachage sans état `deriveSeed(deriveSeed(graine, pas) ^ sel, animal)`, pas le
  sous-générateur de l'animal. Rien n'est consommé : la nage des mondes sans stress reste
  identique au bit près (captures inchangées), et un tirage de maladie ne décale jamais la
  suite de nage d'un animal malade.
- **Boucle** : après l'eau du pas, avant la santé ; en pause en mode décor, comme l'eau et la
  santé (ADR 0077).
- **Sauvegarde** : champ `ich` écrit seulement pour un animal malade, relu s'il est dans
  [0, 900], refusé sinon ; pas de changement de schéma.
- **Lecture pour le rendu (#366)** : `ichStage`, `ichSeverity` (0 → 1 pendant le stade
  visible), `isIchContagious`.

## Valeurs : sources et approximations

- Sourcé (`docs/SOINS.md` § 5.1, Merck) : symptômes (points blancs sur la peau et les
  nageoires) et mortalité soudaine et élevée sans traitement ; § 5.11 : ammoniaque et nitrite
  comme intoxications.
- **Approximations de jeu** : toutes les valeurs numériques (durées des stades, taux
  d'infection et de contagion, poids dans la santé, seuil du choc de température). Le temps
  du jeu est compressé (une journée de 20 min), comme pour l'eau (ADR 0052).
- **Non vérifié** : durée réelle du cycle selon la température, lien chiffré entre stress
  (température, ammoniaque) et déclenchement, taux de transmission. Aucune source fiable
  consultée ne les chiffre ; à compléter dans `docs/SOINS.md` si une source est trouvée.

## Options écartées

- **Sous-générateur de l'animal** (`Fish.rng`) : aurait décalé la nage d'un poisson dès le
  premier tirage de maladie, et imposé de ne tirer que sous stress pour garder les captures.
- **Tirage par bac puis choix d'un animal** : dépend de l'ordre et de l'effectif ; le tirage
  par animal reste indépendant de l'ajout ou du retrait des autres.
- **Ajout sans quarantaine comme cause** : la quarantaine n'existe pas dans le jeu ; à
  ajouter quand elle existera (nouveau facteur de `ichStress` ou exposition à l'ajout).
- **Mort de l'animal** : hors du modèle actuel de santé (plancher), à décider avec les
  traitements.

## Conséquences

- #366 peut afficher les points et les alertes à partir de `Fish.ich` sans toucher à la
  simulation ; le lot 2/2 ajoutera la guérison (effacer `ich`) et l'effet des traitements.
- Un monde stressé change désormais d'état avec le temps (cas, santé) : les tests et
  captures qui chaufferaient fort ou laisseraient monter l'ammoniaque longtemps doivent s'y
  attendre.
