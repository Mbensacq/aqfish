# 0061 — La pièce de N aquariums : modèle, sauvegarde au schéma 2, bac sélectionné

- Statut : acceptée (cible ; l'implémentation viendra par lots, au sprint 14)
- Date : 2026-10-27
- Auteur : Dev, cycle 83, issue #272 (demande de Mathis #264)

## Contexte

Mathis veut une **pièce contenant plusieurs aquariums et meubles**, réorganisables, chacun
avec ses espèces, d'un seul poisson dans un nano-bac à une animalerie entière (#264). Le
bassin à koïs reste un **bassin dans le jardin**, scène extérieure séparée de la pièce,
accessible depuis la liste des bacs (décision de Mathis du 2026-10-27).

État actuel (v1.0.5) :

- la simulation est **un seul bac** : `World` (`sim/world.ts`) porte une graine, un
  environnement, des dimensions, un compteur de pas, des entités, un décor, des granulés, une
  eau ; l'hôte (`ui/aquarium-host`) possède un seul `MutableWorld` qu'il avance en place ;
- la sauvegarde est au **schéma 1** (`sim/save.ts`, ADR 0028) : un monde et des réglages
  (vitesse, horloge, rendu des granulés, pièce), 256 Kio au plus, clé de stockage unique
  `aqfish.sauvegarde` ; un schéma inconnu est refusé ;
- la pièce (ADR 0048 à 0050, `sim/room.ts`, `sim/room-furniture.ts`) est **purement
  graphique** et entoure ce bac unique, dans le repère du bac (sol du bac en y = 0), avec un
  meuble support implicite (`cabinetHeight`) et 24 meubles au plus ; elle n'existe que pour
  le bac tropical (`ROOM_ENVIRONMENTS`) ;
- le tableau de bord (ADR 0059, 0060), les fiches (ADR 0058) et le futur wiki (#252) lisent
  les signaux de l'hôte, donc implicitement « le » bac.

Cette ADR fixe la cible avant tout code, pour que les lots en cours (#262, #252) soient
écrits « par bac » et que l'épopée #264 (avec #227, #228, #35, #34) ne refasse rien.
**Aucun code n'est livré avec elle.**

Contraintes héritées : déterminisme (même graine et mêmes actions donnent le même état, au
bit près, ADR 0003) ; `sim` pur ; une sauvegarde rechargée puis avancée est identique au
monde jamais sauvegardé (ADR 0028) ; contrat de capture : les séries existantes restent
identiques à l'octet avec une pièce à un seul bac (`docs/ARCHITECTURE.md`).

## Options étudiées

### A. Une pièce = une liste de mondes indépendants (retenue)

Chaque bac garde le `World` actuel, inchangé, dans son propre repère ; la pièce ajoute
autour un identifiant, un nom, une position, une horloge commune et l'ordre de mise à jour.

- Avantages : aucun système de la simulation (nage, banc, nourriture, eau, santé, pH) ne
  change ; **aucune interaction entre deux bacs par construction** (chaque monde ne lit que
  lui-même) ; un monde à un bac est exactement le monde actuel, d'où la migration et les
  captures à l'octet ; un bac se teste seul comme aujourd'hui ; un bac ajouté ou retiré ne
  décale pas le hasard des autres.
- Inconvénients : tampons de banc et de nourriture alloués par bac (mémoire en O(bacs)) ;
  la graine de chaque bac doit être dérivée avec soin (corrélations, voir plus bas) ; la
  sauvegarde grossit linéairement avec le nombre de bacs ; l'hôte doit gérer un monde
  « sélectionné » parmi N.

### B. Un seul monde dont les entités portent un numéro de bac

Un `World` unique avec `entity.tankId`, une eau, un décor et des granulés par bac.

- Avantages : une seule boucle, un seul compteur, sauvegarde d'un seul tenant.
- Inconvénients : **chaque système** (banc, évitement, nourriture, eau, santé,
  compatibilité, rythme du jour) doit filtrer par bac, avec un risque permanent
  d'interaction parasite (un banc qui « voit » les poissons du bac voisin) ; les compteurs
  d'identifiants deviennent communs, donc ajouter un poisson dans un bac change les
  identifiants, et le hasard, des ajouts suivants dans les autres ; refonte de `sim/` entière
  et de tous ses tests ; déterminisme d'un bac dépendant de ses voisins. Écartée.

### C. Seul le bac sélectionné est simulé, les autres sont figés ou rattrapés

- Avantages : coût de simulation constant, quel que soit le nombre de bacs.
- Inconvénients : un bac non regardé ne vieillit pas (eau, faim, santé, pH figés), ce qui
  contredit l'objectif pédagogique ; un rattrapage à la sélection (`advance` de tout le retard)
  peut coûter des secondes et fige l'interface ; l'état dépend de l'ordre des sélections, donc
  le déterminisme « mêmes actions, même état » exige d'enregistrer les sélections. Écartée,
  mais le **rendu** simplifié des bacs éloignés (lot de performance) reprend l'idée côté
  affichage seulement.

### D. Un hôte Angular et un canevas WebGL par bac

- Inconvénients : les navigateurs limitent le nombre de contextes WebGL actifs (de l'ordre de
  16) ; pas de pièce commune ni de caméra libre (#228) ; mémoire GPU dupliquée. Écartée.

### Sauvegarde : un document ou une clé par bac

Une clé de stockage par bac permettrait d'écrire moins à chaque sauvegarde, mais une
écriture interrompue laisserait une pièce incohérente (bacs d'époques différentes) et
l'export en fichier deviendrait un ensemble de fichiers. Retenu : **un seul document**, écrit
d'un bloc, comme aujourd'hui.

## Décision

### Modèle de données (`sim/`, pur)

Nouveau module `sim/room-state.ts` (le nom `sim/room.ts` reste à la pièce graphique) :

```ts
interface RoomState {
  readonly seed: number;            // graine de la pièce (celle de l'URL ou tirée)
  readonly tick: number;            // pas exécutés depuis la création de la pièce
  readonly tanks: readonly RoomTank[];   // triés par identifiant croissant
  readonly nextTankId: number;      // compteur, jamais réutilisé
  readonly furniture: readonly PlacedFurniture[];  // meubles et supports, avec identifiant
  readonly nextFurnitureId: number;
}

interface RoomTank {
  readonly id: number;              // entier 32 bits non signé, 0 pour le premier bac
  readonly name: string;            // nom affiché (≤ 40 caractères), modifiable
  readonly place: 'piece' | 'jardin';
  readonly placement: TankPlacement | null;  // null pour le bassin du jardin
  readonly world: World;            // le monde actuel, inchangé
}

interface TankPlacement {
  readonly supportId: number;       // meuble ou niveau d'étagère qui porte le bac
  readonly x: number; readonly z: number;    // centre au sol, repère de la pièce, au cm
  readonly quarter: 0 | 1 | 2 | 3;  // quart de tour, comme `RoomItem`
}
```

- **Graine d'un bac** : le bac 0 a **la graine de la pièce** (d'où la migration et les
  captures à l'octet). Un bac `id > 0` a
  `deriveSeed(deriveSeed(seedPièce, SEL_BACS), id)`, avec une constante de domaine
  `SEL_BACS` : sans elle, la graine du bac `k` serait égale à celle du sous-générateur du
  poisson `k` du bac 0 (`createEntityPrng(seed, k)`), une corrélation à éviter. Ajouter ou
  retirer un bac ne change pas la graine des autres.
- **Temps** : un pas de la pièce avance **tous les bacs d'un pas**, par identifiant
  croissant, puis `tick` de la pièce. `world.tick` de chaque bac reste son âge (pas depuis
  sa création) : un bac ajouté à l'heure H part de `tick = 0`. L'horloge de la journée est
  **commune** et dérive du `tick` de la pièce (ADR 0018) ; elle est passée à chaque bac
  (`advanceInPlace(monde, n, horloge)`, ADR 0055), comme aujourd'hui.
- **Aucune lecture croisée** : une fonction de `sim/` qui reçoit un bac ne reçoit jamais la
  pièce, sauf les actions explicitement inter-bacs ci-dessous. Test exigé : l'eau, la
  population et le hasard d'un bac sont identiques au bit près qu'il soit seul ou entouré
  d'autres bacs.
- **Transfert à l'épuisette** (inter-bacs) : retrait du poisson du bac A puis ajout dans B
  avec un **nouvel identifiant** de B (`nextFishId`) et un sous-générateur dérivé de la graine
  de B ; faim et santé conservées ; position à la surface de B. Même résultat qu'un ajout
  dans B avec ces valeurs, donc déterministe. Les avertissements d'ajout (#237) et le statut
  légal (#262) s'appliquent au bac d'arrivée.
- **Fonctions** : `createRoom(seed, bacs?)`, `stepRoom` (pure), `advanceRoomInPlace` (boucle
  d'affichage seulement, sans allocation par pas), `addTank`, `removeTank`, `moveTank`,
  `renameTank`, `transferFish` ; toutes pures sauf la variante « en place ».
- **Plafonds provisoires** (valeurs de validation, à confirmer par l'étude de performance) :
  32 bacs au plus ; 60 animaux par bac (`MAX_TOTAL_FISH`, inchangé) ; un seul bac
  `place: 'jardin'`, et il est de l'environnement `bassin`, qui n'est jamais dans la pièce ;
  au moins un bac au total. Les bacs de la pièce : `tropical`, `paludarium`, `recif`
  (et les environnements à venir de #262).

### Meubles, supports et repère

- **Repère de la pièce** : mètres, parquet en y = 0, origine au centre du sol. Chaque bac
  garde son repère actuel (fond du bac en y = 0) ; sa position dans la pièce est une
  **translation au centimètre et un quart de tour**, jamais une échelle.
- Le meuble support implicite (`Room.cabinetHeight`) devient un **meuble explicite** du
  catalogue (`meuble-bac`, hauteur réglable dans `ROOM_LIMITS`), et le catalogue gagne des
  **étagères d'animalerie** à plusieurs niveaux ; chaque niveau est un support. Un bac repose
  **toujours** sur un support (`supportId`) : supprimer un support qui porte un bac est
  refusé (le bac doit être déplacé ou supprimé d'abord). Les meubles reçoivent un
  identifiant stable (compteur), indispensable à `supportId` ; leur ordre ne compte plus.
- La pose par gravité analytique (ADR 0049) s'étend aux bacs : la boîte d'un bac avec son
  cadre est un obstacle pour les meubles, et un bac se pose sur le dessus d'un support, sans
  chevauchement ; Rapier reste réservé au décor dans le bac (ADR 0046).
- 24 meubles au plus aujourd'hui : plafond à revoir avec l'étude de performance (une
  animalerie demande davantage d'étagères).

### Bac sélectionné

- La sélection (`selectedTankId`) est un **réglage d'interface**, enregistré avec la
  sauvegarde mais **jamais lu par la simulation** : changer de bac ne change aucun état
  simulé. Un bac sélectionné absent (supprimé, sauvegarde modifiée) retombe sur le plus petit
  identifiant.
- L'hôte garde **un seul monde « regardé »** : tous ses signaux actuels (`environment`,
  `population`, `water`, `waterSample`, `health`, `tankDimensions`, `tankLiters`, décor,
  sélection du décor) deviennent ceux du **bac sélectionné**, et les actions (nourrir,
  changer l'eau, chauffage, population, décor, redimensionnement, ajout depuis la fiche ou le
  wiki) visent ce bac. Les composants d'interface ne changent donc pas de contrat ; seul
  l'hôte apprend à choisir le monde. C'est ce que doivent supposer #262 et #252 dès
  maintenant : **lire le bac par les signaux de l'hôte, jamais en supposant un bac unique
  ailleurs** (par exemple une clé de stockage ou une constante d'environnement).
- **Ce qui est « par bac »** : jauges de l'eau et du pH, santé, faim, alertes détaillées,
  population et avertissements d'ajout, décor, dimensions et litrage, nourrissage, bouton
  « Ajouter » des fiches et du wiki. **Ce qui est commun** : heure, vitesse de simulation,
  rendu des granulés, filtre de rendu, pièce et meubles. Le contenu du wiki et des fiches
  (textes sourcés, compatibilités) ne dépend d'aucun bac ; seule la mention « dans ce bac »
  et l'action d'ajout en dépendent.
- **Liste des bacs** : nom, environnement, litrage, nombre d'animaux et **pire gravité
  d'alerte** de chaque bac. Les alertes détaillées ne sont calculées que pour le bac
  sélectionné ; la pire gravité des autres bacs est recalculée **un bac par relevé**
  (`WATER_READOUT_TICKS`), à tour de rôle, pour garder le coût de l'interface constant
  (ADR 0060 : au plus 4 rafraîchissements par seconde, aucune écriture dans la simulation).
- Cliquer un bac le sélectionne et centre l'orbite sur lui ; choisir le bassin dans la liste
  bascule vers la scène du jardin.

### Sauvegarde au schéma 2

`serializeRoom` écrit **toujours** le schéma 2 ; `parseSave` lit le schéma 1 (migré) et le
schéma 2 ; tout autre schéma reste refusé. Forme :

```json
{
  "format": "aqfish",
  "schema": 2,
  "seed": 42,
  "tick": 108000,
  "nextTankId": 3,
  "nextFurnitureId": 5,
  "selectedTankId": 0,
  "furniture": [{ "id": 0, "kind": "meuble-bac", "x": 0, "z": 0, "quarter": 0, "height": 0.75 }],
  "tanks": [
    {
      "id": 0,
      "name": "Bac tropical",
      "place": "piece",
      "placement": { "supportId": 0, "x": 0, "z": 0, "quarter": 0 },
      "world": { "environment": "tropical", "tick": 108000, "…": "corps du schéma 1" }
    }
  ],
  "settings": { "speed": 1, "clock": {}, "foodStyle": "points", "roomShown": true }
}
```

- Le champ `world` d'un bac est **le corps du schéma 1** (environnement, dimensions, tick,
  compteurs, décor, poissons, granulés, eau), sans `format`, `schema`, `seed` (dérivée) ni
  `settings` : le validateur actuel est réutilisé tel quel pour chaque bac, avec ses messages.
- Validation propre au schéma 2 : identifiants entiers croissants et uniques, compteurs
  supérieurs aux identifiants, `selectedTankId` facultatif, `supportId` existant, au plus un
  bac au jardin et toujours `bassin`, pas de `bassin` dans la pièce, plafonds ci-dessus,
  noms de texte borné. Comme aujourd'hui : aucune exception, champs inconnus ignorés,
  propriétés propres seulement.
- **Migration 1 → 2** (fonction pure `migrateSchema1`, après validation complète du
  schéma 1, jamais avant) : la graine du monde devient celle de la pièce, le monde devient le
  bac 0 avec son `tick`, et `tick` de la pièce vaut celui du monde (l'heure affichée reste la
  même). Bac `tropical`, `paludarium` ou `recif` : `place: 'piece'`, posé au centre sur un
  `meuble-bac` 0 de la hauteur `cabinetHeight` ; les meubles de `settings.room.items`
  reçoivent les identifiants suivants, dans leur ordre, avec leurs positions **converties du
  repère du bac à celui de la pièce** (translation verticale de la hauteur du meuble, au
  centimètre) ; `room.shown` devient `roomShown`. Bac `bassin` : `place: 'jardin'`, pièce
  vide. Nom par défaut : celui de l'environnement. Cas limites à tester : sauvegarde vide
  ou tronquée (refusée, inchangé), corrompue (refusée avec le message du schéma 1), bac aux
  dimensions extrêmes (`TANK_LIMITS`), meubles absents, pièce masquée, bassin.
- **Stockage** : même clé `aqfish.sauvegarde`. Avant la **première** écriture au schéma 2
  par-dessus une sauvegarde au schéma 1, l'ancien texte est copié une fois sous
  `aqfish.sauvegarde.schema1` : une version antérieure de l'application, qui refuse le
  schéma 2, repartirait sinon d'un monde neuf et écraserait la sauvegarde. Un fichier exporté
  est toujours au schéma 2 ; un fichier au schéma 1 s'importe (migré).
- **Taille** : 256 Kio par bac (la limite actuelle, appliquée au corps de chaque bac).
  Une animalerie de 32 bacs pleins (≈ 40 Kio chacun, mesure de `sim/save.ts`) pèse environ
  1,3 Mio. La limite du document entier n'est **pas** fixée ici : elle dépend du quota du
  stockage du navigateur (non mesuré, variable selon le navigateur) et sera fixée avec
  l'étude de performance ; en attendant, le statut `plein` (ADR 0028) couvre un quota
  dépassé sans perte du monde en mémoire.

### Rendu et captures

- Le rendu dessine la pièce dans le **repère du bac sélectionné** : le bac sélectionné est à
  l'origine, la pièce et les autres bacs sont translatés (et tournés d'un quart de tour au
  besoin) par rapport à lui. Avec un seul bac, ses coordonnées sont celles d'aujourd'hui, et
  la pièce est décalée d'une translation entière en centimètres : **condition des captures à
  l'octet**, à vérifier au premier lot par la série complète.
- Paramètres d'URL de capture pour plusieurs bacs : à définir au lot qui en a besoin
  (forme envisagée : `bacs=environnement:x:z:quart,…`) ; sans eux, une pièce à un bac.

## Ce qui n'est pas décidé

- **Plafonds de performance** (nombre de bacs, animaux au total, meubles) et **niveaux de
  qualité** (instanciation des maillages, rendu simplifié des bacs éloignés ou hors champ) :
  fixés par l'étude mesurée du lot « Du petit au très grand » de #264, sur bureau et
  téléphone, et consignés dans une ADR qui complète celle-ci. Les plafonds ci-dessus ne sont
  que des bornes de validation provisoires. Même chose pour la taille maximale du document
  de sauvegarde entier.
- **Catalogue des bacs** (litrages, dimensions réelles du nano au très grand bac) : les
  `TANK_LIMITS` actuels (60 à 200 cm) ne descendent pas au nano-bac ; les valeurs réelles
  seront sourcées au lot « Bacs et meubles », et `TANK_LIMITS` élargi en conséquence.
- **Scène du jardin** : disposition, caméra et éclairage du bassin hors de la pièce ;
  l'aménagement du jardin est hors périmètre (#264).
- **Caméra libre** (#228) et son passage avec l'orbite du bac sélectionné.
- Forme exacte des paramètres d'URL multi-bacs et des attributs de test
  (`data-aqfish-tanks`, `data-aqfish-selected-tank` envisagés).
- Nom définitif de l'environnement « bac tropical » quand plusieurs bacs tropicaux
  coexistent (le nom du bac le distingue).

## Conséquences

- `sim/world.ts` et tous les systèmes de simulation restent inchangés ; la pièce est une
  couche au-dessus. Les tests actuels d'un bac restent valables tels quels.
- `sim/save.ts` sépare la lecture du corps d'un bac (schéma 1) de l'enveloppe ; le schéma 2
  devient la seule forme écrite. `SAVE_SCHEMA` passe à 2 au lot qui l'implémente, avec
  `migrateSchema1` et ses tests.
- `Room.cabinetHeight` et `RoomItem` sans identifiant disparaissent de la forme écrite
  (lus seulement à la migration) ; `ROOM_ENVIRONMENTS` s'étend aux environnements de la pièce.
- L'hôte (`ui/aquarium-host`) possède un `RoomState` modifiable et un identifiant de bac
  sélectionné ; ses signaux publics décrivent le bac sélectionné. Les composants du tableau
  de bord, des fiches et du wiki n'ont pas à connaître la pièce, sauf la liste des bacs.
- Lots prévus (#264, sprint 14) : (1) `sim/room-state.ts`, schéma 2 et migration, hôte à un
  bac sélectionné, sans changement visible et captures à l'octet ; (2) bacs et meubles,
  catalogue et pose ; (3) liste des bacs, sélection, transfert ; (4) étude de performance et
  niveaux de qualité ; (5) caméra libre (#228) ; (6) jardin.
- Risque : la sauvegarde d'une animalerie, écrite d'un bloc à chaque sauvegarde automatique,
  peut coûter plusieurs millisecondes ; à mesurer au lot 4 (écriture espacée ou différée si
  besoin).
