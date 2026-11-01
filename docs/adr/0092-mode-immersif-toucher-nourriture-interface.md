# 0092 — Mode immersif : tapoter la vitre, nourrir, interface par appui long

- Statut : acceptée
- Date : 2026-11-01
- Auteur : Dev, cycle 123, issue #346

## Contexte

Fin du lot 2 du mode immersif (#346, après l'ADR 0087 : parallaxe et API d'appareil). Sur
téléphone, l'écran est la vitre : on doit pouvoir la tapoter (les poissons proches
réagissent), nourrir en touchant le haut, et faire apparaître une interface minimale par un
appui long, qui se cache seule pour laisser l'écran au bac. Contraintes : simulation pure et
déterministe, aucun tirage consommé hors du mode immersif, boucle par image sans allocation
(#355), captures inchangées.

## Décision

- **Réaction au tapotement** (`sim/glass-tap.ts`, pur) : une table `TAP_REACTIONS` donne à
  chaque espèce `fuite` ou `curiosite` (`Record<SpeciesId, …>` : une nouvelle espèce oblige à
  choisir). Axolotl, grenouille et triton (`walker`, `amphibian`) ont leur propre machine à
  états : `null`, pas de réaction. Dans une sphère de `TAP_RADIUS` = 0,15 m simulé autour du
  point touché sur la vitre avant, la fuite oriente le cap à l'opposé du point et pousse la
  vitesse au maximum de l'espèce ; la curiosité oriente le cap vers le point à la vitesse de
  croisière. L'inclinaison prise est bornée à la moitié de `maxPitch`. C'est une **impulsion**
  : la nage habituelle (`stepFish`) reprend au pas suivant, ramène la vitesse, contourne les
  vitres. **Aucun tirage** : deux mondes de même graine tapotés aux mêmes pas restent égaux,
  et un monde jamais tapoté avance exactement comme avant.
- **Point touché** (`glassPoint`) : en mode immersif, la vitre avant remplit exactement
  l'image (projection décentrée, ADR 0086) ; la fraction d'écran (u, v) donne donc
  directement le point de la vitre, sans lancer de rayon et quelle que soit la position de
  l'œil.
- **Nourriture** : un toucher dans le haut de l'écran (`FEED_BAND` = 20 % de la hauteur)
  passe par le chemin existant `feedInPlace`, à l'aplomb du point touché, à mi-chemin de la
  vitre et du milieu du bac (visible de face). En mode décor, la faim est figée à sa valeur
  de départ, au-dessus du seuil : les poissons viennent manger.
- **Gestes** (composant) : un appui bref et immobile (moins de `TAP_SLOP_PX` = 10 px) est un
  toucher ; un appui tenu `LONG_PRESS_MS` = 500 ms affiche l'interface et n'est pas un
  toucher ; un appui qui glisse, un second doigt ou `pointercancel` n'est ni l'un ni l'autre.
  Le menu contextuel et la loupe d'iOS sont coupés sur la vitre.
- **Interface qui se cache seule** : visible à l'entrée, cachée après `UI_HIDE_MS` = 5 s **et**
  au moins `UI_HIDE_MIN_FRAMES` = 15 images rendues (un appareil qui peine, à une image par
  seconde ou moins, la garde le temps qu'on s'en serve ; le rendu logiciel des tests de bout
  en bout aussi), en `visibility: hidden` (ni cliquable ni atteignable au clavier), sauf pendant les
  réglages ou l'étalonnage ; toute interaction avec la barre relance le délai. Une touche du
  clavier l'affiche aussi (accès sans appui long), Échap quitte toujours.
- **Tests de bout en bout** : le nombre de granulés est exposé par `data-immersive-food` et
  l'état de l'interface par `data-immersive-ui`, écrits seulement quand ils changent.

## Options écartées

- **État d'attention durable dans `Fish`** (cible suivie quelques secondes) : réaction plus
  douce, mais un champ de plus dans l'état sérialisé et dans le pas de chaque poisson, pour
  un geste réservé au mode immersif. L'impulsion suffit à rendre la réaction lisible.
- **Lancer de rayon** (`pickWaterSurface`) pour la nourriture : inutile ici, le point de la
  vitre se déduit de la fraction d'écran.
- **Interface cachée dès l'entrée** : on ne découvrirait ni « Quitter » ni l'étalonnage.

## Conséquences

- La réaction est immédiate (une image) : un sursaut pour la fuite, un demi-tour plus franc
  qu'en vrai pour la curiosité.
- « Choix du bac » dans l'interface minimale n'est pas livré : le bac immersif reste unique
  (issue de suite créée).
- Tests d'interface : `vi.useFakeTimers` sur `setTimeout` seulement ; jsdom n'a pas
  `releasePointerCapture`, que les contrôles d'orbite appellent sur `pointercancel`.
