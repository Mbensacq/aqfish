# 0166 — « Masquer l'interface » à la place du mode immersif

- Statut : acceptée (remplace 0086, 0087, 0092 et 0094 pour l'interface ; la partie `sim/`
  du mode immersif est retirée à la tranche 2 de #725)
- Date : 2026-11-22
- Auteur : Dev, cycle 275, issue #725

## Contexte

Mathis juge le mode immersif (#340 : étalonnage par une carte, projection décentrée,
parallaxe au gyroscope, bac aux proportions de l'écran) peu utile : « vaut mieux juste cacher
l'interface » (`docs/INTERFACE.md`, section 3, décision du 2026-11-18). On oriente la vue,
puis tout disparaît sauf le bac ; la caméra et la simulation continuent.

## Décision

- **État partagé** `HiddenInterfaceState` (`ui/hidden-interface/`, `providedIn: 'root'`) :
  `hidden`, `hintShown`, `cursorHidden`. Non enregistré : chaque visite commence avec
  l'interface (une interface introuvable au chargement serait un piège).
- **Commandes** : interrupteur « Masquer l'interface » dans la section « Affichage », touche
  `I` déclarée dans `core/commands` (aide-mémoire, groupe « Affichage ») ; `I` ou Échap
  réaffichent, ainsi qu'un appui long immobile (600 ms, moins de 10 px de déplacement, pointeur
  principal ; tout type de pointeur, l'appui long à la souris ne gêne rien). Un appui bref
  garde son effet ordinaire (nourrir) ; un glisser fait tourner la caméra.
- **Masquage par la racine** : `App` pose la classe `app--ui-hidden` (et
  `data-interface-hidden` pour les tests) ; `app.scss` met en `display: none` tous ses enfants
  sauf `app-aquarium-host` et l'indication. Les composants restent créés : panneaux, wiki,
  séance d'entretien gardent leur état, et les raccourcis du document (vues 1 à 5, caméra
  libre, pixel art…) marchent toujours. Au masquage, la fenêtre des réglages (où est
  l'interrupteur) se referme et le focus quitte le contrôle caché.
- **Écoute sans détection de changements** : clavier et pointeur sont écoutés sur le document
  par `addEventListener`, pas par une liaison `host` : un mouvement du pointeur ne relance pas
  la détection de changements de toute l'application ; les signaux ne notifient que si leur
  valeur change.
- **Indication** « I ou Échap pour revenir » 3 s, fondu sur la dernière seconde ; avec
  « Réduire les mouvements », sans fondu. **Curseur** caché après 2 s d'immobilité (feuille
  globale `styles.scss`, pour atteindre le canvas à travers l'encapsulation).
- **Retrait du mode immersif** (tranche 1) : `ui/immersive-mode`, `core/immersive`, la caméra
  immersive de `render/camera-controller.ts`, la suspension de `RenderLoop`, le bouton de la
  section « Simulation », le réglage de la recherche, le facteur `parallax` des mouvements
  réduits, le jeton `$radius-id-card`, et leurs tests et e2e. L'étalonnage enregistré
  (`aqfish.etalonnage-ecran`) n'est plus lu : il est ignoré, sans erreur, et n'est pas effacé
  (aucune écriture inutile dans le stockage de l'utilisateur).

## Options écartées

- **Détruire l'interface** (`@if`) : les panneaux perdraient leur état (catégorie ouverte,
  saisie) et les raccourcis de la barre des vues disparaîtraient avec elle.
- **`visibility: hidden`** : les éléments garderaient leur place et resteraient atteignables
  au toucher selon les cas ; `display: none` les retire aussi de l'ordre de tabulation.
- **Enregistrer l'état** : une interface masquée au rechargement, sans indication visible,
  laisserait croire à une panne.
- **Plein écran du navigateur** au masquage : hors du sujet (Mathis veut cacher l'interface),
  et le navigateur affiche ses propres bandeaux ; reste possible plus tard (F11 marche).

## Conséquences

- Plus aucune deuxième vue WebGL : les délais dépassés des e2e du mode immersif sous
  SwiftShader (`docs/PIEGES.md`) disparaissent avec eux.
- Tranche 2 de #725 : `sim/immersive-tank.ts`, `sim/glass-tap.ts`, le lieu `immersive: true`,
  `IMMERSIVE_LIMITS` et `IMMERSIVE_ENVIRONMENTS`, et l'adaptation des specs des lots
  (`eau-douce-lot3/4`, `recif-lot2/3`) qui s'appuient sur la population immersive.
