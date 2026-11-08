# 0116 — Calendrier d'entretien par bac

- Statut : acceptée
- Date : 2026-11-08
- Auteur : Dev, cycle 176, issue #513

## Contexte

Le jeu ne rappelle pas les gestes périodiques (eau, filtre, test, taille) : on les oublie, puis
l'alerte tombe. Le rappel doit rester distinct des alertes de santé, et le rendu sans interface
strictement inchangé.

## Décision

- **Module pur** `sim/maintenance.ts` : quatre tâches, échéances calculées sur `World.time` (la
  vitesse de simulation n'y change rien), journal borné à 10 actions. Périodes en jours de
  jeu (7, 30, 7, 14) : **approximation de jeu**, pas une règle d'aquariophilie. Une valeur non
  finie ne donne ni retard ni action.
- **État** : champ optionnel `World.maintenance`, écrit dans le corps du monde de la sauvegarde.
  Pas de nouveau numéro de schéma : champ optionnel relu quand il est présent, comme `eggs` ou
  `current`, refusé s'il est invalide.
- **Migration** : une sauvegarde sans calendrier reste valide. Au premier relevé, l'hôte commence
  le suivi au temps courant, écrit dans le monde à la première action ou sauvegarde automatique
  après avance : une ancienne partie ne part pas en retard, un bac figé reste identique à sa
  sauvegarde et la simulation au bit près. Jamais en capture : monde et images inchangés, aucun rappel affiché.
- **Remise à zéro** : changement d'eau et taille effective passent par l'action existante.
  Filtre et test n'ont pas de geste dans le jeu : bouton « Fait » dans le calendrier.
- **Tableau de bord** : bouton « Entretien » dans la ligne de santé, icône de calendrier et
  texte, encre neutre, hors de la liste des alertes ; il déplie les échéances et le journal.
  La taille n'est listée que si le bac a des plantes à tige qui poussent.

## Conséquences

- Pas d'allocation par image : le relevé suit le rythme de `exposeWater`.
- Les bacs non affichés n'ont de calendrier qu'une fois sélectionnés.
- Notifications du navigateur, rappels hors ligne et tâches personnalisées restent hors périmètre.
