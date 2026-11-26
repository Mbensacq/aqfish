# 0183 — Bilan de reproduction lu dans le journal, filtre du journal retenu

- Statut : acceptée (complète les ADR 0117 et 0118)
- Date : 2026-11-26
- Auteur : Dev, cycle 309, issue #677

## Contexte

Épopée v1.23 « Reproduction, suite » : pontes, éclosions et naissances entrent au journal du bac
(#581, #655), une ligne par événement, mais rien n'en donne une vue d'ensemble. Le filtre par
type du journal revenait à « Tout » à chaque repli du bilan et à chaque visite.

## Décision

1. **Le journal est la seule source** du bilan de reproduction (`sim/reproduction-summary.ts`) :
   `reproductionSummary(entries, now)` compte, par espèce et dans l'ordre du catalogue, les
   pontes (et œufs), éclosions (et alevins) et naissances (et alevins) des entrées du journal.
   Aucun compteur de plus dans le monde ni dans la sauvegarde : un bac relu donne le même
   bilan, et rien n'est compté deux fois (la reprise d'une sauvegarde est un premier regard
   muet, `watchJournal`).
2. **Période : 7 jours simulés entiers** jusqu'au jour courant compris (approximation de jeu,
   une semaine). Le jour courant est celui du temps du bac ou, s'il est plus récent, celui de la
   dernière entrée (bac importé dont l'horloge repart de zéro). Temps invalide : aucune ligne ;
   nombre de jours invalide : `RangeError` (erreur de programmation).
3. **Affichage** : une phrase (`reproductionText`), « rien de nouveau » sans événement, dans le
   bilan déplié (sous l'occupation du bac) et en tête du journal filtré sur « Reproduction ».
   Elle est publiée par `TankRecordsController` à chaque relevé (la période glisse avec les
   jours ; un texte inchangé ne republie rien) et jamais en capture.
4. **Filtre du journal retenu** dans le stockage local du navigateur
   (`aqfish.journal-filtre`, `ui/dashboard-frame/journal-filter-store.ts`), comme la catégorie
   des réglages (#722) : il survit au repli du bilan et au rechargement, à part de la sauvegarde
   du monde (schéma inchangé). Valeur inconnue ou stockage indisponible : « Tout ».

## Options écartées

- **Compteurs dans le monde** : écrits par la simulation, ils changeraient les empreintes de
  non-régression et le schéma de sauvegarde pour une donnée déjà dans le journal.
- **Période depuis le début de la partie** : le journal est plafonné à 200 entrées, le total
  serait faux sans le dire ; une semaine reste lisible et tient sur un téléphone.

## Conséquences

- Un bac très actif (plus de 200 entrées en une semaine) peut avoir perdu les plus vieilles
  entrées de la période : le bilan les ignore.
- Le filtre n'est plus remis à « Tout » au repli du bilan (test de composant mis à jour).
