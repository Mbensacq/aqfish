# 0122 — Charbon actif et régulateur de pH

- Statut : acceptée
- Date : 2026-11-09
- Auteur : Dev, cycle 184, issue #531

## Contexte

`docs/SOINS.md` décrit le charbon actif (à retirer pendant un traitement) et les régulateurs de pH.
L'issue demande leur version jouable, sans changer le bac par défaut.

## Décision

- Deux champs optionnels de `WaterState`, absents par défaut : `carbon` (présence dans le filtre) et
  `phRegulatorWait` (secondes avant la prochaine dose). Sauvegardes anciennes relues sans migration.
- Le charbon réduit la demi-vie du médicament à 120 s simulées : la protection tombe et la cure
  s'interrompt par le chemin existant. Il retire aussi la teinte des tanins (`tea`), pas les feuilles
  ni leur effet sur le pH.
- Le sel et la chaleur ne sont pas concernés : le charbon n'adsorbe pas le sel. Seul le médicament
  déclenche la mise en garde (message du geste et alerte « Charbon actif pendant un traitement »).
- Le régulateur déplace le pH de 0,1 par dose, borné à [`MIN_PH`, `MAX_PH`]. Une attente d'un tiers
  de journée suit chaque dose : sur toute période d'une journée, la variation reste ≤ 0,3. Un seau
  percé aurait permis le double du plafond sur une même journée glissante.

## Conséquences

- Le charbon ne sature pas et ne retire pas le chlore : simplifications assumées, hors périmètre.
- Toutes les valeurs (120 s, 0,1, 0,3) sont des approximations de jeu : `docs/SOINS.md` ne donne pas
  de dose vérifiée pour les tampons.
- La dérive naturelle du pH, le changement d'eau et les feuilles restent hors du plafond : il ne
  concerne que le produit.
