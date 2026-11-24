# 0170 — Cycle de l'azote recalé sur le jour de jeu

- Statut : acceptée
- Date : 2026-11-24
- Auteur : Dev, cycle 289, issue #805 (tranche 2d de #728)

## Contexte

Le harnais des scénarios (ADR 0169) montre que le bac par défaut de chaque environnement
n'est pas stable avec l'entretien normal (S12), ni le bac de 120 L d'un poisson rouge changé
à 25 % par semaine (S2) : les nitrates du bac tropical montent d'environ 8 mg/L par **jour de
jeu** (60 par semaine) et dépassent 40 mg/L entre deux changements d'eau. La production et la
conversion de l'azote, comme la dérive du pH qui l'accompagne, avaient été calées en secondes
sur le tableau de bord ; l'entretien (changement d'eau tous les 7 jours) et la maturation du
filtre (8 semaines) se comptent en jours de 20 minutes.

## Décision

- **Un facteur unique `NITROGEN_DAY_SCALE` = 1/8** (`sim/water-units.ts`, puissance de deux :
  multiplication exacte) appliqué à :
  - la production d'ammoniaque au repos et nourri (`RESTING_AMMONIA_PER_LOAD_LITER`,
    `AMMONIA_PER_LOAD_LITER`, donc aussi les corps qui pourrissent) ;
  - la nourriture (`PELLET_FOOD_MG`, donc `EATEN_FOOD_AMMONIA` et `FOOD_DECAY_AMMONIA`) : les
    repas suivent la faim, comptée en secondes, et la ration doit donner la même quantité par
    jour de jeu que la production au repos ;
  - les vitesses de conversion du filtre (`AMMONIA_CONVERSION`, `NITRITE_CONVERSION`) ;
  - la dérive du pH avec la charge (`PH_DROP_PER_LOAD_LITER`).
- Production **et** conversion étant divisées par le même facteur, tout le cycle se déroule
  huit fois plus lentement, aux **mêmes concentrations d'équilibre** : l'ammoniaque et les
  nitrites d'un bac mûr restent ceux d'avant (seuils, jauges, densité du bilan inchangés) ;
  seuls les nitrates s'accumulent huit fois moins vite (environ 1 mg/L par jour de jeu pour le
  bac tropical par défaut).
- Restent inchangés : les seuils et unités (ADR 0167), la maturation du filtre (en jours), la
  feuille coupée et le fixateur d'ammoniaque (apports ponctuels, pas des débits).

Relevés sur 90 jours de jeu, entretien normal (`docs/ECOSYSTEME.md` § 4) : S2 et S12 stables
(nitrates au plus 22 mg/L pour le bac tropical, moins de 10 ailleurs), S1 toxique dès le
2e jour, S4 avec un pic d'ammoniaque (2,6 mg/L, jour 7) puis de nitrites (0,6 mg/L, jour 14).

## Options écartées

- **Diviser seulement la production** : l'ammoniaque et les nitrites d'équilibre tombent au
  huitième, le cyclage d'un bac neuf (S4) ne dépasse plus les seuils « à surveiller » ; le
  tableau de bord n'aurait presque plus rien à montrer.
- **Allonger le jour de jeu ou l'entretien** : change le calendrier, la lumière et toutes les
  durées en jours, bien au-delà de l'azote.
- **Facteur non puissance de deux** (÷ 7, ÷ 10) : rien ne le justifie mieux, et la
  multiplication ne serait plus exacte (comparaisons au bit près des tests d'unités).

## Conséquences

- Changement de comportement de tout le jeu : empreintes de non-régression, de
  caractérisation du pas et des sauvegardes simulées relevées de nouveau ; les tests de
  calibrage parlent en durées huit fois plus longues (« à surveiller avant 8 h, mauvaise avant
  16 h » pour le bac tropical nourri, sans changement d'eau).
- Un bac laissé sans changement d'eau se dégrade toujours, mais en semaines de jeu plutôt
  qu'en jours ; une surcharge de nourriture pèse huit fois moins sur le coup.
- S1, S2, S4 et S12 sont des tests ; le lot suivant (#729, capacité du bac) peut s'appuyer sur
  un azote calé sur le jour de jeu.
