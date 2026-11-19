# 0158 — Soins de l'eau et caméra libre hors de l'hôte

- Statut : acceptée
- Date : 2026-11-19
- Auteur : Dev
- Complète : ADR 0157 (suivi du bac et bacs de la pièce hors de l'hôte)

## Contexte

Après le deuxième passage du lot 10 du chantier d'assainissement #686 (ADR 0157),
`ui/aquarium-host/aquarium-host.ts` faisait encore 2 935 lignes (2 051 hors blancs et
commentaires). Deux blocs y gardaient leur propre état, sans lien avec l'orchestration :

- les **soins de l'eau** du bac affiché : traitement des points blancs (#361), conditionneur et
  eau du robinet (#530), charbon actif et régulateur de pH (#531), amorce de bactéries (#529),
  pharmacie (#533) et test de l'eau (#564), avec deux tables par monde (produits utilisés,
  test en cours) et le message du dernier geste ;
- la **caméra libre** dans la pièce (#343, ADR 0084) : bascule avec l'orbite, préréglage
  d'avant, touches et boutons tenus (#344), tampon de consigne réutilisé à chaque image (#352)
  et préférence d'affichage mémorisée.

## Décision

1. **Deux contrôleurs** dans `ui/aquarium-host/`, construits par l'hôte avec un objet de ports,
   sans importer l'hôte :
   - `WaterCareController` (`water-care-controller.ts`) : signaux `treatment`, `pharmacy`,
     `waterTest` et `notice` (`treatmentNotice` de l'hôte), réexposés tels quels ; gestes de
     soin, `presetWaterTest` pour `test-eau=`, `refresh` au relevé de l'eau, qui renvoie le
     traitement que l'hôte publie (même ordre qu'avant). Ports : monde, capture, journal du
     bac, relevé, sauvegarde, image.
   - `FreeCameraController` (`free-camera-controller.ts`) : signal `active` (`freeCamera` de
     l'hôte), `toggle`, `resumeStored`, `leaveForPreset`, `roomShownChanged`, `reset`,
     `setMoveHeld`, `onKey`, `releaseAll` et `step` (sans allocation, tampon gardé). Ports :
     vue, capture, fond d'écran, stockage de la préférence, signal du préréglage suivi,
     publications et image.
2. **Déplacement sans changement de comportement** : les corps sont repris à la cible des appels
   près ; les cinq gestes de soin qui répétaient « message, puis relevé, sauvegarde et image
   s'il est accepté » passent par une seule méthode privée (`answer`), aux mêmes effets dans
   le même ordre. L'hôte garde ses méthodes publiques, qui délèguent en une ligne (gabarit,
   panneau et tests inchangés).
3. **Garde-fous** : `aquarium-host.soins.spec.ts` (test de l'eau, `test-eau=`, charbon,
   régulateur de pH, amorce, eau du robinet, message effacé au changement de bac, mode décor,
   capture), écrit avant le déplacement ; la caméra libre était déjà caractérisée dans
   `aquarium-host.spec.ts`. Chaque contrôleur a son test avec des ports factices.

## Options écartées

- **Exposer les contrôleurs au gabarit** (`aquarium.waterCare.treat(…)`) : économise les
  délégations, mais change le contrat public de l'hôte lu par `app.html`, le panneau et une
  centaine de tests ; à décider avec le découpage final de l'hôte.
- **Réglages de l'eau** (chauffage, éclairage, lampe, distributeur) dans `WaterCareController` :
  ils passent déjà par `applyWaterSetting` en une ligne, et la séance d'entretien s'en sert
  aussi ; les déplacer n'allégerait presque rien.

## Conséquences

- `aquarium-host.ts` passe de 2 935 à 2 701 lignes (1 855 hors blancs et commentaires) ;
  l'exception de taille est abaissée. Restent notamment : relevés de l'eau et des animaux,
  changement d'environnement et dimensions du bac, création de la vue.
