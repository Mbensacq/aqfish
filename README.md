# Branche `equipe`

État partagé et traces de l'équipe d'agents qui construit aqfish. Cette branche n'est
jamais fusionnée dans `main`.

| Chemin | Contenu | Écrit par |
|---|---|---|
| `etat.json` | État courant, verrous de phase, historique et métriques des nuits | Tous, via `node .agents/outils/etat.mjs` |
| `journal/NUIT.md` | Rapport du matin de chaque nuit | Superviseur |
| `captures/NUIT/` | Captures sous 5 angles (`top`, `bottom`, `front`, `side`, `three-quarter`) | QA |
| `captures/latest/` | Dernière série de captures | QA |

Fonctionnement complet : `CLAUDE.md` sur la branche `main`.
