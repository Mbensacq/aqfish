# 0173 — Populations par défaut du bassin et du paludarium sous la capacité

- Statut : acceptée
- Date : 2026-11-24
- Auteur : Dev, cycle 292, issue #811 (reste de #809, ADR 0172)

## Contexte

Depuis l'ADR 0172, la capacité borne les ajouts en mode soins. Deux bacs **par défaut** la
dépassaient au premier lancement (`docs/ESPECES.md`, point 19) : le bassin (7 koïs de 60 cm à
4 L/cm, 1 680 L demandés pour 834,3 L d'eau réelle, 201 %) et le paludarium (3 sonneurs et
2 tritons à 3 L/cm, 114 L pour 45,7 L, 249 %). Leur section « Population » affichait l'alerte
dès l'ouverture et refusait tout ajout. Deux voies : ramener les populations de départ sous la
capacité, ou sourcer d'autres classes de densité.

## Décision

**Populations par défaut ramenées sous la capacité**, sans toucher aux classes de densité ni
aux fiches :

- **Bassin : 3 koïs** (`KOI.defaultPopulation`) : 720 L demandés pour 834,3 L, **86 %**. Une
  quatrième (960 L) est refusée.
- **Paludarium : 2 sonneurs orientaux, aucun triton** (`GRENOUILLE.defaultPopulation`,
  `PALUDARIUM.population`) : 36 L pour 45,7 L, **79 %**. Le triton reste proposé
  (`PALUDARIUM.species`) : il se règle en mode décor, ou seul (30 L) en mode soins.

Les autres bacs ne changent pas (tropical 63 %, récif 66 %, eau froide 98 %). Un test par
environnement vérifie qu'aucun bac par défaut n'est au-delà de sa capacité
(`sim/default-tanks-capacity.spec.ts`, graines 1 et 7).

## Options écartées

- **Classes de densité sourcées** : la classe « coldwater » de la koï vient de la RSPCA (règle
  du poisson rouge, déjà la plus favorable connue) ; aucune source consultable ne donne de litres
  d'eau par cm pour les amphibiens (point 18). Les fiches de soins trouvées (secondaires)
  donnent un volume de **terrarium** entier (terre et eau) par animal, pas un volume d'eau : les
  appliquer au volume d'eau réel, berge déduite (ADR 0171), mélangerait deux mesures.
- **Abaisser la classe « amphibien »** (approximation 3–4 L/cm) pour loger un sonneur et un
  triton (48 L pour 45,7 L) : ce serait gonfler la capacité sans source, pour faire passer la
  population voulue.
- **Un sonneur et un triton** : 105 %, encore au-delà.
- **Garder les populations et ne pas alerter au premier lancement** : la règle ne serait plus
  la même pour le joueur et pour le bac de départ.

## Conséquences

- Empreintes de non-régression `bassin`, `bassin+nourri`, `paludarium`, `paludarium+nourri`
  changées (population de départ) ; captures du bassin et du paludarium changées, celles des
  autres environnements identiques.
- Au paludarium, sonneurs et tritons ne cohabitent plus en mode soins : la classe « amphibien »
  comptée sur l'eau seule est stricte pour un sonneur semi-terrestre. Les sourcer sur le volume
  du milieu entier (terre comprise) demanderait de revoir l'ADR 0171 : laissé à une issue.
- Les e2e qui ont besoin de tritons les ajoutent par l'URL (`population=triton:2`) ; ceux qui
  testent un plafond technique au-delà de la capacité restent en mode décor.
