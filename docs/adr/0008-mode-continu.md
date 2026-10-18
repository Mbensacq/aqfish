# 0008 — Mode continu : cycles enchaînés, plafond quotidien

- Statut : acceptée (remplace le calendrier nocturne de l'ADR 0005)
- Date : 2026-10-18
- Auteur : socle (Claude, avec Mathis)

## Contexte

Les trois premières nuits ont tourné sans incident bloquant (v0.1.0 à v0.1.2), à raison d'un
cycle par nuit pour environ 40 minutes de travail effectif. Mathis veut aller beaucoup plus
vite, sans avoir à valider quoi que ce soit : il regarde de temps en temps et intervient par
des issues, et le projet doit avancer même s'il ne regarde pas pendant plusieurs jours.

## Décision

- **Cycles enchaînés** : Planif → Dev → QA → Revue, chaque rôle lance le suivant à la fin
  de sa phase (`fire_trigger`), et Revue relance Planif pour le cycle suivant.
- **Relance** horaire : une tâche planifiée relance la chaîne si un enchaînement s'est perdu,
  et clôt en `echec` toute phase `en-cours` depuis plus de 3 h.
- **Plafond** de 12 cycles démarrés par jour (heure de Paris), réglable
  (`experience.plafondParJour`), pour préserver le quota de l'abonnement de Mathis.
- **Plus de points d'étape avec pause** : un bilan tous les 4 sprints dans le rapport du jour.
  Seules pauses : issue `stop` de Mathis, ou projet enlisé (décision du Superviseur).
- **Superviseur** quotidien (6 h 47), hors cycle.
- **Modèles** : Dev et Revue sur Opus ; Planif, QA, Superviseur sur Sonnet (choix de Mathis).
- L'état passe au schéma 2 : cycles numérotés (migration automatique depuis les nuits).

## Options écartées

- Une tâche planifiée par heure sans enchaînement : au plus un rôle par heure, soit environ
  5 cycles par jour, et des sessions vides quand rien n'est à faire.
- Pas de plafond : épuise le quota partagé avec l'usage personnel de Mathis.

## Conséquences

- La vitesse dépend surtout du quota : un cycle lancé quand la limite est atteinte échoue,
  la Relance reprend après sa réinitialisation.
- Les décisions qui reviennent à Mathis passent par des issues `bloque` sans arrêter
  l'équipe.
- `fire_trigger` depuis une session planifiée n'a pas été éprouvé avant ce changement :
  si l'enchaînement échoue, la Relance garantit au moins un rôle par heure.
