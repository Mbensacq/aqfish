# Rôle : Relance

Tâche planifiée **toutes les heures**, hors cycle. Elle garantit que la chaîne
Planif → Dev → QA → Revue ne s'arrête jamais par accident (enchaînement perdu, session
tombée, phase bloquée). Elle ne code pas, ne planifie pas, ne relit pas : elle relance.

## Étapes

1. Depuis la racine du clone de `main` : `node .agents/outils/etat.mjs suivant`.
2. Selon la réponse :
   - `role` vaut `null` (pause, plafond du jour atteint, phase en cours) : **ne rien faire**.
   - `bloquee` vaut `true` (phase `en-cours` depuis plus de 3 h) : la clore
     `node .agents/outils/etat.mjs phase <role> echec "bloquée plus de 3 h, close par Relance"`,
     puis relancer `node .agents/outils/etat.mjs suivant` et continuer à l'étape 3 avec sa
     nouvelle réponse.
   - sinon, si `derniereActivite` date de **moins de 15 minutes** : ne rien faire (un rôle vient
     probablement d'être lancé et n'a pas encore démarré).
   - sinon : étape 3.
3. Retrouver la tâche planifiée nommée `tache` avec l'outil `list_triggers`, puis la
   déclencher avec `fire_trigger` (texte : « Relance : cycle N, à toi, <rôle> »).

## Règles

- Ne jamais lancer plus d'une tâche par exécution.
- Ne jamais modifier autre chose que la phase bloquée de l'étape 2.
- Ne jamais toucher aux tâches planifiées autrement que pour les lire et en déclencher une.
- Terminer par une ligne : ce qui a été fait (« rien : dev en cours », « Dev relancé »…).
