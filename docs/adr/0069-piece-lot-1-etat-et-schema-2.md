# 0069 — Pièce de N bacs, lot 1 : état de la pièce et sauvegarde au schéma 2

- Statut : acceptée
- Date : 2026-10-28
- Auteur : Dev, cycle 92, issue #292 (épopée #264)

## Contexte

L'ADR 0061 fixe la cible de la pièce de N bacs et prévoit six lots. Le lot 1 pose le modèle
de données et la sauvegarde au schéma 2, sans aucun changement visible et avec des captures
identiques à l'octet. Entre-temps, l'ADR 0063 (cycle 85) a introduit un monde **figé** par
environnement visité, écrit dans le champ `others` du schéma 1, et a laissé ouverts deux
points pour ce lot : la graine des bacs issus de `others`, et leur place dans la pièce.

Le lot doit tenir dans une PR d'environ 600 lignes : la pièce graphique (meubles en repère du
bac, `cabinetHeight`), l'éditeur de la pièce et le rendu ne doivent pas changer.

## Décision

1. **Modèle `sim/room-state.ts`** : `RoomState { seed, tick, tanks, nextTankId }` et
   `RoomTank { id, name, place, world }`, conformes à l'ADR 0061 **sans** les meubles,
   supports ni positions (`furniture`, `nextFurnitureId`, `placement`), reportés au lot 2
   (« Bacs et meubles »), qui les ajoutera au schéma 2 comme champs facultatifs, dérivés à
   la lecture de `settings.room` quand ils sont absents. Pas de schéma 3 pour autant.
   Fonctions pures : `tankSeed`, `createRoom`, `stepRoom`, `resolveSelectedTank` ; pour
   l'hôte du lot 1 : `roomWorlds` et `syncRoom`.
2. **Graine des bacs** : `tankSeed(seed, 0) = seed`, `tankSeed(seed, id) =
   deriveSeed(deriveSeed(seed, TANK_SEED_SALT), id)` pour `id > 0`, comme l'ADR 0061.
   Cette graine sert **à la création** d'un bac (`createRoom`, et les ajouts du lot 2). Le
   corps de chaque bac enregistré **garde sa graine** (`world.seed`), contrairement à la
   forme envisagée par l'ADR 0061 (graine omise, dérivée) : les bacs migrés depuis `others`
   ont la graine de la pièce (ADR 0063) et la gardent, donc rien ne change pour l'utilisateur
   (décor tiré, robes des koïs, coraux), et le validateur du schéma 1 est réutilisé tel quel.
3. **Schéma 2** (`sim/room-save.ts`) : `{ format, schema: 2, seed, tick, nextTankId,
   selectedTankId, tanks: [{ id, name, place, world }], settings }`, où `world` est le corps
   du schéma 1 (graine comprise) et `settings` les réglages du schéma 1 (vitesse, horloge,
   granulés, pièce graphique), inchangés. `SAVE_SCHEMA` vaut 2 ; `serializeRoom` est la
   seule écriture de l'application ; `serializeWorld` écrit encore le schéma 1 (constante
   `SAVE_SCHEMA_1`) pour les tests et les fichiers de compatibilité. Validation : 1 à 32
   bacs, identifiants strictement croissants et inférieurs à `nextTankId`, nom non vide de
   40 caractères au plus, `place` égal à `jardin` pour le bassin et `piece` sinon, un seul
   bac au jardin, `selectedTankId` facultatif (absent ou inconnu : plus petit identifiant).
   Taille : 256 Kio par corps de bac, 8 Mio pour le document (32 × 256 Kio) en attendant
   l'étude du lot 4 ; un document au schéma 1 garde sa limite historique de 256 Kio.
4. **Migration 1 → 2** (`migrateSchema1`, après validation complète du schéma 1) : monde
   affiché en bac 0 (bac sélectionné), mondes de `others` en bacs 1, 2… dans l'ordre de
   `ENVIRONMENT_IDS` ; `tick` de la pièce = celui du monde affiché (l'horloge enregistrée
   reste valable, l'heure affichée ne change pas) ; nom = nom de l'environnement.
5. **Hôte du lot 1** : il garde le monde affiché et les mondes rangés figés (ADR 0063,
   inchangé) et possède une `RoomState` avec l'identifiant du bac sélectionné,
   **resynchronisée** (`syncRoom`) avant chaque changement d'environnement et à chaque
   sauvegarde : un bac garde son identifiant et son nom ; un environnement nouveau reçoit
   `nextTankId`. Il y a donc au plus un bac par environnement ; une sauvegarde au schéma 2
   avec deux bacs du même environnement est refusée à l'import avec un message (« pas encore
   pris en charge »), jamais perdue en silence. Le `tick` de la pièce est celui du bac
   sélectionné tant que les autres bacs sont figés ; il deviendra l'âge de la pièce au lot 3,
   quand l'hôte avancera tous les bacs par `stepRoom`.
6. **Copie de l'ancienne sauvegarde** : avant d'écrire par-dessus une sauvegarde au schéma 1,
   `writeStoredSave` la copie une seule fois sous `aqfish.sauvegarde.schema1`. Le schéma 1
   est reconnu à l'en-tête que l'application écrivait (`{"format":"aqfish","schema":1,`),
   sans décoder le texte, pour un coût constant à chaque sauvegarde automatique. Un fichier
   au schéma 1 édité à la main (champs dans un autre ordre) n'est pas copié : cas marginal,
   le fichier existe déjà hors du navigateur.

## Options écartées

- **Graine omise dans le corps d'un bac et dérivée à la lecture** (forme de l'ADR 0061) :
  changerait la graine des bacs issus de `others` (décor tiré, coraux, robes des koïs
  différents après la mise à jour) et obligerait à dupliquer le validateur du corps.
- **Livrer les meubles et supports dans ce lot** : conversion des meubles du repère du bac
  vers celui de la pièce, catalogue `meuble-bac`, éditeur et rendu à adapter ; trop gros pour
  un lot « sans changement visible », et c'est l'objet du lot 2.
- **Faire porter la `RoomState` par l'hôte comme source unique dès ce lot** (monde affiché
  lu dans la pièce, `advanceRoomInPlace`) : touche toute la boucle et les ~130 tests de
  l'hôte pour un résultat identique à l'écran ; reporté au lot 3, avec la liste des bacs et
  la simulation de tous les bacs.
- **Garder le schéma 1 en écriture jusqu'au lot 2** : l'issue demande le schéma 2 ; écrire
  tout de suite l'enveloppe stable évite une seconde migration.

## Conséquences

- Une version antérieure de l'application qui lit une sauvegarde au schéma 2 la refuse et
  repart d'un monde neuf ; la copie `aqfish.sauvegarde.schema1` garde l'état d'avant la mise
  à jour (une restauration manuelle reste possible par l'import du panneau, après export de
  la copie : outil non fourni).
- Les tests de bout en bout lisent le monde sauvegardé par `e2e/outils-sauvegarde.ts`
  (`selectedTankWorld`).
- Lot 2 : ajouter `furniture`, `nextFurnitureId` et `placement` (facultatifs), migrer
  `settings.room` vers le repère de la pièce. Lot 3 : liste des bacs, plusieurs bacs du même
  environnement, `stepRoom` dans l'hôte (fin du gel de l'ADR 0063, à signaler dans les notes
  de version).
