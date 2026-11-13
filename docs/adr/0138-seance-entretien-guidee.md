# 0138 — Séance d'entretien guidée : machine à états pure, raclette par passage

- Statut : acceptée (complète les ADR 0109 et 0116)
- Date : 2026-11-13
- Auteur : Dev, cycle 212, issue #604

## Contexte

L'épopée « Entretenir à la main » (#593) remplace peu à peu les boutons d'entretien par des
gestes. Le lot 1 (#604) livre le squelette d'une séance guidée (vitres → siphon → filtre →
eau neuve → taille → bilan, chaque étape sautable, une phrase « pourquoi » par étape) et sa
première étape : la raclette qu'on passe sur les vitres. Les plaques d'algues (ADR 0109) ne
s'enlevaient jusqu'ici qu'une par clic.

## Décision

1. **Machine à états pure** (`sim/care-session.ts`) : `CareSession` = étape affichée + issue
   (`fait` ou `saute`) des étapes passées. `completeCareStep` et `skipCareStep` avancent d'une
   étape ; au bilan, plus rien ne change. Aucun hasard, aucune horloge.
2. **Hors du monde** : la séance n'entre pas dans la sauvegarde du bac (ni `saveText`, ni
   empreinte dorée, `docs/PIEGES.md`). Une séance interrompue (« Plus tard ») est gardée sous
   sa propre clé de stockage (`aqfish.seance-entretien`, `serializeCareSession`), relue par
   `readCareSession`, qui refuse tout texte incohérent sans lever ; une séance finie efface la
   clé (texte vide).
3. **Calendrier** : terminer une étape enregistre sa tâche (`careStepTask`). Les vitres sont
   une tâche nouvelle, `glass` (14 jours), **suivie seulement après une première séance** :
   `MaintenanceState.lastDone.glass` est facultatif, absent d'un calendrier d'avant. Tant
   qu'il manque, la ligne n'est ni affichée ni échue : relevés, e2e et captures d'avant restent
   identiques, et les anciennes sauvegardes se relisent.
4. **Raclette par passage** : à l'étape « vitres », la vue autorise un passage
   (`AquariumView.setStrokeEnabled`) ; l'appui est pris en phase de capture, avant
   `OrbitControls` coupés pour le geste (comme le glissement du décor, ADR 0044), souris et
   doigt (événements `pointer`). Chaque point du glissé, tous les 6 px au plus
   (`strokePoints`), lance un rayon ; `scrapedPatchesAlong` retire chaque plaque visible
   touchée (portée `SCRAPER_REACH` autour du rayon dessiné). La plaque entière part : pas
   d'effacement partiel, la couverture reste une valeur par plaque.
5. **Interface** : « Entretenir le bac » est dans le calendrier d'entretien déplié du tableau
   de bord (aucun bouton de plus dans le bandeau ni dans « Réglages », `docs/PIEGES.md`) ; la
   séance est une carte non modale en haut au centre, le bac reste manipulable. Absente en
   mode décor (le tableau de bord y est remplacé par le badge) et en capture.

## Options écartées

- **Séance dans le monde sauvegardé** : chaque champ de plus dans le bac touche
  `setEnvironment`, l'empreinte dorée et `aquarium-host.spec` (comparaison au bit près).
- **Effacement partiel des plaques** (masque par plaque) : il faudrait un état par texel
  dans l'eau et dans la couche des algues ; disproportionné pour le lot 1.
- **Tâche `glass` suivie dès le départ** : une ligne de plus dans chaque calendrier aurait
  changé les relevés, les échéances comptées par les e2e et la capture du rappel.

## Conséquences

- Lots 2 à 4 : chaque étape gagne son geste et sa tâche (`careStepTask`) ; d'ici là, elles se
  passent (« Ce geste arrive bientôt »).
- Une seule séance gardée à la fois, quel que soit le bac affiché : elle reprend à l'étape,
  dans le bac courant.
