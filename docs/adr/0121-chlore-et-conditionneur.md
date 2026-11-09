# 0121 — Chlore et conditionneur d'eau

- Statut : acceptée
- Date : 2026-11-09
- Auteur : Dev, cycle 183, issue #530

## Contexte

Le modèle d'eau ne connaissait pas le chlore. L'issue demande qu'un changement d'eau non traitée
pose problème et qu'un conditionneur le résolve, sans changer le comportement par défaut.

## Décision

- Trois champs optionnels de `WaterState`, absents par défaut : `chlorine` (mg/L), `untreatedTap`
  (option du bac) et `ammoniaBinder` (secondes de protection restantes). Module pur
  `sim/water-conditioner.ts`. Sauvegardes anciennes relues sans migration.
- Le chlore nocif (≥ 0,02 mg/L, Merck) rend `waterQuality` « mauvaise » : il passe par le seul
  chemin de santé existant, sans nouveau calcul de bien-être.
- Conditionneur simple refusé sans chlore ; variante liante toujours acceptée. Double dose sans
  cumul : la protection repart de sa durée entière.
- L'ammoniaque liée reste mesurée (jauges) mais n'agit plus (`toxicAmmonia`), à hauteur d'une dose.

## Conséquences

- Pas de dissipation naturelle du chlore : seuls le conditionneur ou un changement d'eau traitée
  le font baisser. Simplification assumée.
- Teneur du robinet (0,5 mg/L) : approximation de jeu, non vérifiée pour la France.
- Une eau chlorée paraît trouble, puisque le trouble suit `waterQuality`.
