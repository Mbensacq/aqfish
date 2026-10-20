# 0028 — Sauvegarde : format JSON versionné, validation stricte, URL prioritaire

- Statut : acceptée
- Date : 2026-10-20
- Auteur : Dev (Claude), cycle 32, issue #70

## Contexte

L'issue #70 demande de retrouver son aquarium à l'ouverture suivante (stockage du
navigateur) et de l'exporter ou de l'importer en fichier JSON. Le monde est déjà un objet de
données pur (ADR 0003), mais un fichier importé vient de l'extérieur : il peut être faux,
ancien, énorme ou hostile. Il faut aussi que la restauration ne casse ni le déterminisme ni
le contrat de capture.

## Décision

- **Format** (`sim/save.ts`, fonctions pures `serializeWorld` / `parseWorld`) : un objet
  JSON `{ format: "aqfish", schema: 1, seed, environment, tick, nextFishId, nextFoodId,
  decor, fish, food, settings: { speed, clock } }`.
  - Le temps n'est pas écrit : il vaut `tick · SIM_DT`, comme dans `stepInPlace`.
  - Les **obstacles** ne sont pas écrits : ils sont recalculés à partir du décor
    (`createWorld`). Un monde à obstacles explicites (tests seulement) n'est pas
    enregistrable dans le schéma 1 (`RangeError` à l'écriture).
  - Chaque poisson est écrit en entier, **état de son sous-générateur compris** (`rng`, ADR
    0012 et 0014) et état du pas précédent ; `kind` est implicite. Les robes des koïs ne sont
    pas écrites : elles dérivent de la graine et de l'identifiant (ADR 0027).
  - Les réglages enregistrés sont la vitesse (`SIM_SPEEDS`) et l'horloge de la journée
    (`DayClock`), dont l'heure dérive au temps du monde.
- **Politique de versions** : `schema` est un entier ; la lecture n'accepte que la version
  courante (1) et refuse toute autre valeur avec un message clair. Un futur schéma 2
  ajoutera une migration explicite 1 → 2 (hors périmètre de #70).
- **Validation stricte** à la lecture, qui ne lève jamais (`{ ok: false, error }`) :
  taille plafonnée avant décodage (256 Kio de texte), types, nombres finis, bornes
  garanties par la simulation (position dans la zone de nage de l'espèce, vitesse, cap,
  inclinaison, faim, état 32 bits du générateur…), espèces de l'environnement, effectifs
  (`maxPopulation`, `MAX_TOTAL_FISH`), granulés (`MAX_FOOD`), décor (`parseDecorItems`,
  64 éléments au plus), identifiants strictement croissants et inférieurs aux compteurs.
  Seules les propriétés propres sont lues (`__proto__`, `constructor` sans effet) et les
  champs inconnus sont ignorés. Le monde rendu est construit à neuf, champ par champ.
- **Stockage** (`core/save-storage`) : texte opaque sous la clé `aqfish.sauvegarde`,
  derrière une interface injectable (`SAVE_STORAGE`) ; absent, refusé ou plein ne lève
  jamais et donne un état (`active`, `indisponible`, `plein`) affiché dans le panneau.
- **Quand** : écriture toutes les 10 s, quand l'onglet est masqué (`visibilitychange`) et
  quand la page est quittée (`pagehide`, plus fiable que `beforeunload` sur mobile) ;
  lecture au démarrage seulement.
- **Priorités** : en **mode capture**, le stockage n'est jamais lu ni écrit (images
  reproductibles). Hors capture, un paramètre de monde dans l'URL (`seed`, `environnement`,
  `population`) prime : le monde demandé est créé neuf, sans lire la sauvegarde (qui sera
  remplacée à la prochaine écriture). `heure=` prime sur l'horloge sauvegardée.
- **Interface** : section « Sauvegarde » du panneau de contrôle (ADR 0024) : état, boutons
  « Exporter » (téléchargement `aqfish-sauvegarde.json`) et « Importer » (champ de fichier
  masqué ouvert par le bouton) ; un import refusé affiche la raison en alerte et laisse le
  bac intact.

## Options écartées

- **Écrire le monde tel quel (`JSON.stringify(world)`)** : plus court, mais fige les
  obstacles calculés (redondants avec le décor, et à revalider), et lie le format à la
  structure interne : tout renommage casserait les sauvegardes.
- **Valider avec une bibliothèque de schémas (zod, ajv)** : dépendance supplémentaire pour
  une trentaine de champs ; les bornes utiles (zone de nage par espèce et environnement)
  demandent de toute façon du code propre au domaine.
- **Restaurer malgré les paramètres d'URL** : un lien partagé `?seed=7&environnement=bassin`
  doit montrer ce monde-là, et les tests de bout en bout s'appuient sur ces paramètres.
- **Accepter un schéma inconnu « au mieux »** : un fichier d'une version future serait lu
  partiellement et donnerait un monde faux sans prévenir.

## Conséquences

- Tout nouveau champ d'état du monde (`World`, `Fish`, `FoodPellet`) doit être ajouté au
  format, à sa validation et au test d'aller-retour, sinon il est perdu au rechargement ;
  un changement de sens d'un champ existant impose un schéma 2 et une migration.
- Le test de déterminisme (`sim/save.spec.ts`) garantit qu'un monde sauvegardé, rechargé puis
  avancé est identique, au bit près, au monde jamais sauvegardé.
- Le JSON ne distingue pas `-0` de `0` : sans effet constaté (le test de déterminisme
  compare avec `toEqual`, qui distingue les deux zéros), à surveiller si un calcul venait à
  dépendre du signe d'un zéro.
