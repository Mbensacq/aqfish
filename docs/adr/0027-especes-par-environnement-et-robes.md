# 0027 — Espèces par environnement ; robes tirées de la graine

- Statut : acceptée
- Date : 2026-10-20
- Auteur : Dev, cycle 31, issue #88

## Contexte

Les koïs (issue #88) sont la première espèce du bassin. Jusqu'ici, toutes les espèces de
`SPECIES` peuplaient le bac tropical (`Object.values(SPECIES)`), le panneau proposait toutes
les espèces et `data-aqfish-population` les listait toutes. Ajouter le koï à `SPECIES` aurait
donc mis des koïs dans le bac tropical, dont les captures doivent rester identiques à
l'octet. Par ailleurs, l'issue demande des robes variées **déterminées par la graine**, alors
que les apparences existantes (guppy mâle et femelle, ADR 0013) alternent selon
l'identifiant seul.

## Décision

- **`Environment.species`** : liste des espèces qui vivent dans l'environnement, dans
  l'ordre du panneau (`['neon', 'guppy', 'corydora']` pour le bac, `['koi']` pour le bassin).
  La population de départ du bac est désormais écrite explicitement (mêmes espèces, même
  ordre, donc même monde). Le panneau ne propose que ces espèces ; l'hôte ignore un réglage
  (`setPopulation`, `population=`) d'une espèce absente de l'environnement et n'expose
  qu'elles dans `data-aqfish-population` (`koi:7` dans le bassin ; inchangé dans le bac).
  La simulation reste générale : `createWorld` et `setPopulation` acceptent toute espèce
  (tests, scènes de mesure).
- **`SpeciesDefinition.variantDraw`** : `'alternance'` (défaut, comportement d'avant) ou
  `'graine'`. En mode `'graine'`, `speciesVariantIndex(def, id, seed)` groupe les
  identifiants par blocs d'autant d'individus que d'apparences et donne à chaque bloc une
  permutation des apparences tirée d'un hachage entier de la graine et du numéro de bloc.
  Même graine, mêmes robes ; toutes les robes sont présentes dès qu'il y a au moins autant
  de koïs que de robes ; aucun état ni tirage du générateur des entités (la simulation ne
  change pas). Le rendu reçoit la graine du monde (`AquariumView.updateFish`,
  `FishLayer.update`).
- **Gabarit effilé** : `FishTemplate.bodyColumnDepths` donne l'épaisseur de chaque colonne
  (centrée), pour une silhouette lisible vue de dessus (pédoncule et museau étroits). Le
  motif de la robe est porté par la rangée du dos, seule visible de dessus.

## Options écartées

- **Robe stockée dans l'état du poisson** (champ `variant` tiré à la naissance) : change la
  forme de chaque `Fish` de toutes les espèces et consommerait un tirage, au risque de
  modifier le bac tropical ; le hachage sans état suffit.
- **Hachage indépendant par individu** : pour une graine donnée, sept koïs pouvaient tous
  porter la même robe ; les blocs permutés garantissent la variété.
- **Koïs autorisés partout, simplement absents de la population du bac** : le panneau du bac
  aurait proposé des koïs de 14 cm dans un bac de 60 cm, et `data-aqfish-population` aurait
  changé pour le bac.

## Conséquences

- Une espèce nouvelle n'apparaît dans un environnement que si elle est ajoutée à sa liste
  `species` (et à sa population de départ).
- Le koï mesure 14 cm (approximation de jeu, plus petit qu'un koï réel) : `wallMargin` vaut
  aussi en hauteur et le bassin n'a que 30 cm d'eau (bande de nage verticale de 16 cm).
  Des koïs plus grands demanderaient une marge verticale distincte de la marge horizontale.
- Les captures du bac tropical sont inchangées ; celles du bassin montrent désormais des
  koïs.
