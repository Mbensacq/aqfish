# 0167 — Composés azotés en mg/L, conversion exacte et sauvegardes au schéma 3

- Statut : acceptée
- Date : 2026-11-23
- Auteur : Dev, cycle 284, issue #793 (tranche 2a de #728)

## Contexte

Ammoniaque, nitrites et nitrates étaient des « unités de jeu » (ADR 0052) : impossible de les
comparer aux kits de test et aux seuils de `docs/SOINS.md`, exprimés en mg/L
(`docs/ECOSYSTEME.md` § 3.4). Le changement ne doit pas modifier le comportement du bac, et
les sauvegardes existantes doivent être relues sans perte.

## Décision

- **Un facteur fixe par composé**, puissance de deux (`sim/water-units.ts`) : ammoniaque
  × 0,5, nitrites × 0,125, nitrates × 1. Une multiplication par une puissance de deux est
  exacte en virgule flottante : la dynamique est celle d'avant **au bit près**, au facteur
  près (test sur 1 h simulée d'un bac tropical peuplé), et tous les seuils et comparaisons
  donnent les mêmes décisions.
- Les masses converties d'un composé à l'autre gardent le rapport d'avant
  (`NITRITE_PER_AMMONIA` = 0,25, `NITRATE_PER_NITRITE` = 8) : approximation de jeu, la
  stœchiométrie réelle n'est pas modélisée.
- **Plafonds par composé** (`MAX_CONCENTRATIONS`) au lieu du plafond commun `MAX_CONCENTRATION`.
- **Sauvegardes** (`sim/save-units.ts`) : la pièce passe au **schéma 3** (mg/L). Le schéma 2
  est converti à la relecture, avant la validation (dont les bornes sont en mg/L). Le schéma 1
  (fichiers de compatibilité, liens partagés) reste **en unités de jeu** à l'écriture comme à
  la relecture : un lien créé par une version de l'application reste lisible par l'autre, et
  l'aller-retour est exact. L'historique de l'eau (`waterHistory`) suit la même règle.
- **Affichage** : jauges, courbes, kits de test et bilan en « mg/L » ; ammoniaque et nitrites
  au centième (leurs seuils sont sous l'unité), le reste au dixième.

Correspondance des seuils (« à surveiller » / « mauvaise ») :

| Composé           | Avant (unités de jeu) | Après (mg/L)       | Bornes des sources (`docs/SOINS.md`)                                |
| ----------------- | --------------------- | ------------------ | ------------------------------------------------------------------- |
| Ammoniaque totale | 2 / 5                 | 1 / 2,5            | 1 mg/L déjà dangereux à pH 8 (§ 6) ; tolérance TAN < 2,0 (Loh 2015) |
| Nitrites          | 2 / 5                 | 0,25 / 0,625       | toxiques dès 0,1 (§ 1) ; tolérance < 0,5 (Loh 2015)                 |
| Nitrates          | 20 / 40               | 20 / 40            | < 10 idéal, < 70–110 toléré (Loh 2015)                              |
| Plein des jauges  | 7,5 / 7,5 / 60        | 3,75 / 0,9375 / 60 | —                                                                   |
| Plafond           | 100                   | 50 / 12,5 / 100    | approximation de jeu                                                |

Autres constantes converties (approximations de jeu) : production `AMMONIA_PER_LOAD_LITER`
0,045 → 0,0225 ; nourriture décomposée 5 → 2,5 ; coupe de plante 0,05 → 0,025 ; ammoniaque
liée par le conditionneur 1 → 0,5 mg/L (l'étiquette annonce ≈ 1 mg/L par dose, gardé à 0,5
pour ne pas changer le comportement) ; seuils de tendance 0,05 → 0,025 et 0,00625.

## Options écartées

- **Facteurs « ronds » sourcés un à un** (par exemple nitrites × 0,1) : la conversion n'est
  plus exacte, les empreintes et les captures bougent sans raison de comportement, et
  l'aller-retour du schéma 1 n'est plus garanti.
- **Recaler les seuils sur les sources** (rapport « à surveiller » / « mauvaise » différent) :
  change le comportement du bac ; à faire, s'il le faut, dans une issue dédiée.
- **Faire passer aussi le schéma 1 aux mg/L** : romprait les liens partagés entre versions.

## Conséquences

- Les empreintes de `sim/non-regression.spec.ts` changent (les nombres de l'eau sont
  multipliés), pas le comportement : décisions, nage et captures identiques hors textes des
  jauges.
- Les tests et e2e qui posent une eau à la main l'écrivent désormais en mg/L ; ceux qui
  passent par un fichier au schéma 1 restent valables (conversion à l'écriture et à la
  relecture).
- Les tranches suivantes de #728 (pollution par la nourriture, pas long) raisonnent en mg/L.
