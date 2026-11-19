# 0157 — Suivi du bac et bacs de la pièce hors de l'hôte

- Statut : acceptée
- Date : 2026-11-19
- Auteur : Dev
- Complète : ADR 0156 (sauvegarde, photo, boucle et démarrage hors de l'hôte)

## Contexte

Après le premier passage du lot 10 du chantier d'assainissement #686 (ADR 0156),
`ui/aquarium-host/aquarium-host.ts` faisait encore 3 560 lignes. Deux blocs y vivaient seuls,
avec leur propre état :

- le **suivi du bac affiché**, gardé hors du monde pendant la partie et inscrit seulement à la
  sauvegarde ou au changement de bac : calendrier d'entretien (#513), historique de l'eau
  (#511), journal (#581) et parcours « Mon premier aquarium » (#512), cinq tables par monde
  et leurs dernières vues publiées ;
- les **bacs de la pièce de N bacs** (#264, ADR 0069) : pièce, bac sélectionné, mondes rangés
  (#277), rattrapage des bacs non affichés (#316, ADR 0076), liste des bacs et cache des
  gravités, quarantaine (#547), renommage, sélection, transferts à l'épuisette, soin et amorce
  dans un bac posé seul.

## Décision

1. **Deux contrôleurs** dans `ui/aquarium-host/`, construits par l'hôte avec un objet de ports,
   sans importer l'hôte :
   - `TankRecordsController` (`tank-records-controller.ts`) : signaux `maintenance`,
     `waterHistory`, `journal`, `firstTankPath` (réexposés tels quels par l'hôte), `refresh`
     au rythme des relevés de l'eau (dans l'ordre d'avant : calendrier, historique, journal,
     parcours), `advanceAndRecord`, accès (`journalOf`, `waterHistoryOf`,
     `maintenanceStartOf`, `recordMaintenance`) et inscriptions (`keep…`). Seul port :
     `isCapture`.
   - `TankRoomController` (`tank-room-controller.ts`) : seul propriétaire de la pièce, du bac
     sélectionné et des mondes rangés ; signaux `tankList`, `quarantine` et `notice`
     (`tankNotice` de l'hôte) ; `sync`, `advanceBackground`, `refreshList` et les gestes sur
     les bacs. Le type `TankNotice` y vit, réexporté par l'hôte. Le monde affiché reste à
     l'hôte (même objet, avancé en place par la boucle) : le contrôleur le lit par un port.
2. **Déplacement pur** : les méthodes gardent leur corps, à la cible des appels près
   (`this.ports…`, `this.room`, `this.selected`) ; l'hôte garde ses méthodes publiques, qui
   délèguent en une ligne.
3. **Garde-fous** : `aquarium-host.suivi.spec.ts` (calendrier, tâche faite, début du suivi à
   la sauvegarde) et `aquarium-host.bacs.spec.ts` (quarantaine, transfert, soin, amorce,
   retour, refus), écrits avant le déplacement ; chaque contrôleur a son test avec des ports
   factices.

## Options écartées

- **Un contrôleur par suivi** (entretien, historique, journal, parcours) : ils partagent le
  même cycle (repris de la sauvegarde au premier accès, publiés au relevé, inscrits à la
  sauvegarde) et les mêmes appelants ; quatre classes de 60 lignes multiplieraient les ports.
- **Changement d'environnement dans `TankRoomController`** : il recrée la vue, l'horloge du
  jour et les relevés de l'hôte ; il reste à l'hôte, qui passe par `stash` et `setStash`.

## Conséquences

- `aquarium-host.ts` passe de 3 560 à environ 2 970 lignes (2 051 hors blancs et
  commentaires) ; l'exception de taille est abaissée. Restent à sortir : relevés de l'eau,
  soins et gestes sur l'eau, caméra.
- Un test qui lisait les mondes rangés de l'hôte par un champ privé les lit désormais dans le
  contrôleur (`tanks.stash`), même assertion.
