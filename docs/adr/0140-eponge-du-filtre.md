# 0140 — Éponge du filtre : le rinçage au robinet affaiblit le filtre, qui repart en maturation

- Statut : acceptée (complète les ADR 0138 et 0123)
- Date : 2026-11-14
- Auteur : Dev, cycle 218, issue #606

## Contexte

Lot 3 de l'épopée « Entretenir à la main » (#593) : l'étape « filtre » de la séance guidée
(ADR 0138) reçoit son geste. Le filtre est simulé par son efficacité `water.filter` (0 à 1),
qui convertit ammoniaque et nitrites (`stepWaterInPlace`) ; seule une eau marquée `cycling`
voit son filtre mûrir (ADR 0123). Un filtre mûr (`filter` = 1, sans marque) ne bouge plus.

## Décision

1. **Deux choix** à l'étape, chacun avec sa phrase « pourquoi » : rincer l'éponge **dans l'eau du
   bac** ou **à l'eau du robinet**. Le choix est gardé dans la séance (`CareSession.rinse`,
   sauvegardé avec elle) et ne s'applique qu'à « Étape terminée » ; une étape sautée ne change
   ni l'eau ni le calendrier.
2. **Eau du bac** : rien ne change (`rinseFilterInPlace` laisse l'eau telle quelle).
3. **Robinet** : le chlore tue `TAP_RINSE_LOSS` (50 %, **approximation de jeu** : aucune source
   chiffrée, seulement le conseil de rincer dans l'eau du bac) des bactéries : `filter` est
   multiplié par `1 − TAP_RINSE_LOSS` et l'eau est marquée `cycling` pour que le filtre se
   repeuple par la courbe logistique existante. L'ammoniaque n'est pas modifiée sur le coup :
   le pic des jours suivants vient du filtre affaibli, qui la convertit moins bien.
4. **Filtre absent** (`filter` = 0) : rien à tuer, rien ne change (pas de marque `cycling`, qui
   ferait repartir le filtre du plancher `FILTER_SEED`).
5. **Calendrier** : « Étape terminée » enregistre la tâche existante `filter` (nettoyage du
   filtre, 30 jours), quel que soit le choix.

## Options écartées

- **Ajouter directement de l'ammoniaque au rinçage** : double emploi avec la nitrification
  simulée, et faux sur le coup (l'éponge ne relâche pas d'ammoniaque).
- **Appliquer le choix dès le clic** : un clic d'essai sur « robinet » serait irréversible ; la
  phrase « pourquoi » s'affiche d'abord, l'effet vient avec « Étape terminée ».

## Conséquences

- Un bac mûr rincé au robinet redevient « en maturation » : l'amorce de bactéries
  (`sim/bacteria-starter.ts`) l'aide de nouveau, et la quarantaine affiche son pourcentage.
- L'hôte expose l'efficacité du filtre en pour cent (`data-aqfish-bacteries`) pour les e2e.
