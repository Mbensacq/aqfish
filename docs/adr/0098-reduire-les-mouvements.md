# 0098 — Accessibilité : option « Réduire les mouvements »

- Statut : acceptée
- Date : 2026-11-03
- Auteur : Dev, cycle 135, issue #406 (épopée v1.8 « Aquarium vivant et accessible »)

## Contexte

`prefers-reduced-motion` n'était respecté que dans les feuilles de style de l'interface. Le
rendu 3D gardait tous ses mouvements décoratifs : glissement de caméra vers les préréglages
(0,5 s), caustiques et reflet de surface, plantes qui ondulent, pluie, parallaxe du mode
immersif. L'issue demande un aquarium calme pour qui réduit les mouvements, sans toucher à
la simulation ni aux soins, et des captures par défaut identiques à l'octet.

## Décision

1. **Deux sources, une priorité** (`core/reduced-motion`, pur) : le choix fait dans les
   réglages, mémorisé sous `aqfish.mouvements-reduits` (`reduits` / `normaux`, hors de la
   sauvegarde du monde), l'emporte ; sans choix, la préférence système décide. Une valeur
   inconnue, un stockage absent ou qui lève valent « pas de choix ».
2. **État partagé** `ReducedMotionState` (`ui/reduced-motion`, service racine à signaux) :
   lu par l'hôte de l'aquarium et le mode immersif, réglé par la case « Réduire les
   mouvements » d'une section « Accessibilité » des réglages, juste après « Décor » (seule
   place libre de la première colonne du panneau à 1280 × 720). La préférence système est
   suivie en direct (`change` de la requête média). Écriture refusée : le choix vaut pour la
   session (le signal le garde).
3. **Rendu seulement**, par une table de facteurs (`FULL_MOTION` à 1, `REDUCED_MOTION`) :

   | Mouvement                                           | Facteur réduit  | Application                                     |
   | --------------------------------------------------- | --------------- | ----------------------------------------------- |
   | Transition de caméra vers un préréglage             | 0 (saut)        | `presetTransitionSeconds`                       |
   | Caustiques, reflet de surface, dérive des nénuphars | 0,25 (vitesse)  | temps passé à `WaterLightLayer`, `LilyPadLayer` |
   | Ondulation des plantes et des tentacules            | 0,3 (amplitude) | `DecorLayer.update(time, swayScale)`            |
   | Pluie (chute, ronds)                                | 0,4 (vitesse)   | `updateVisibleEffects(…, timeOf)`               |
   | Parallaxe du mode immersif                          | 0               | décalage de l'œil multiplié                     |

   Valeurs de jeu, choisies à l'œil sur capture. Sans l'option, toutes les multiplications
   sont par 1 exactement : rendu inchangé à l'octet.

4. **Capture** : le choix mémorisé est ignoré ; seule la préférence système compte, que
   Playwright émule (`contextOptions: { reducedMotion: 'reduce' }`) pour une capture avec
   l'option. Les séries existantes ne changent pas.

## Options écartées

- **Réduire la densité de la pluie** (moins de gouttes dessinées) : les gouttes du tampon
  `fillRain` sont rangées par ordre de naissance ; en dessiner un préfixe ne garde que les
  plus anciennes et ferait clignoter la sélection d'une image à l'autre. Ralentir le temps
  de la pluie suffit et reste sans état.
- **Atténuer la réaction au tapotement de la vitre** (« secousse ») : le rendu n'a aucune
  secousse visuelle ; la fuite ou la curiosité des poissons est de la simulation
  (`sim/glass-tap.ts`, ADR 0092). La changer selon l'option casserait la règle « simulation
  identique avec ou sans l'option ». Laissée telle quelle.
- **Paramètre d'URL `mouvements=`** pour les captures : la requête média émulée suffit, sans
  élargir le contrat de capture.
- **Couper complètement l'eau et les plantes** : un aquarium figé paraît cassé ; un
  mouvement lent et faible reste conforme à l'esprit de `prefers-reduced-motion`.

## Conséquences

- Activer ou retirer l'option en cours de route fait sauter une fois la phase des caustiques
  et de la pluie (temps multiplié) ; sans conséquence durable.
- Le balancement lent de la caméra du fond d'écran (`wallpaperOrbitAngle`) n'est pas touché :
  le fond d'écran est un mode choisi exprès, hors périmètre.
- Toute nouvelle animation décorative du rendu doit passer par `MotionFactors`.

## Révision (cycle 154, #409 pt 2)

La revue de #408 demandait d'atténuer le **rendu** de la « secousse » de tapotement, ou de
consigner que ce n'est pas souhaité. Décision : **pas d'atténuation**, consignée ici.

- Le rendu n'a toujours aucune secousse propre : ni décalage de caméra, ni tremblement de la
  vitre ou du bac. Ce qui bouge après un tapotement, ce sont les poissons (fuite ou
  curiosité, `sim/glass-tap.ts`, ADR 0092) : un état simulé, que le rendu dessine tel quel.
- Atténuer ce mouvement à l'affichage seulement (poissons dessinés ailleurs que là où la
  simulation les place) désynchroniserait le dessin du monde : la sélection d'un poisson, la
  fiche suivie et les captures ne désigneraient plus le même endroit.
- Le tapotement est un geste volontaire et ponctuel, et la réaction des poissons est brève :
  rien d'un mouvement décoratif continu, que l'option vise.

Si une réaction visuelle propre au rendu est ajoutée un jour (onde sur la vitre, léger choc
de caméra), elle passera par `MotionFactors` comme toute animation décorative.
