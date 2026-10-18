# 0005 — Organisation de l'équipe d'agents

- Statut : acceptée (calendrier nocturne remplacé par l'ADR 0008)
- Date : 2026-10-16
- Auteur : socle (Claude, avec Mathis)

## Contexte

Cinq agents se succèdent chaque nuit, chacun dans une session neuve, sans mémoire. Ils
doivent se coordonner, ne pas se marcher dessus et laisser une trace lisible pour Mathis.

## Décision

- Une tâche planifiée par rôle, à heures décalées (voir `CLAUDE.md`).
- Consignes détaillées versionnées dans `.agents/prompts/` ; la tâche planifiée ne fait que
  renvoyer vers ce fichier. Les modifier passe par une PR que seul Mathis fusionne.
- **Code** sur `main`, protégée (PR + CI verte).
- **État et traces** sur la branche `equipe` : `etat.json` (verrou et historique),
  `journal/`, `captures/`. Elle n'est jamais fusionnée.
- **Communication** par issues et PR ; rapport du matin dans `journal/NUIT.md` et en
  commentaire de l'issue « Rapport du matin » (#2).
- Points d'étape à la fin de chaque phase avec pause automatique.

## Options écartées

- Un seul agent orchestrateur avec des sous-agents : moins observable, un seul point de
  défaillance, impossible d'améliorer un rôle sans toucher aux autres.
- État sur `main` : une PR par mise à jour d'état, bruit dans l'historique du code.

## Conséquences

- Un rôle qui déborde de son créneau fait sauter le suivant : c'est consigné, pas caché.
- Les agents agissent avec l'identité GitHub de Mathis : aucune approbation de PR n'est
  exigée (impossible d'approuver sa propre PR) ; la qualité repose sur la CI et sur la revue
  écrite de l'agent Revue.
