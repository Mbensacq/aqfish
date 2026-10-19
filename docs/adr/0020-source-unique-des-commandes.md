# 0020 — Source unique des commandes et aide-mémoire généré

- Statut : acceptée
- Date : 2026-10-19
- Auteur : Dev (Claude), cycle 22, issue #74

## Contexte

Les raccourcis clavier s'accumulent (`1` à `5`, `P`, `H`, `J`, `N`) et n'étaient listés
nulle part à l'écran : on ne savait pas ce qu'on pouvait faire (#74). Les touches étaient
des constantes de `ui/view-presets-bar`, les gestes de la souris un réglage
d'`OrbitControls` dans `render/aquarium-view.ts`, et leur description seulement dans
`docs/ARCHITECTURE.md` et l'ADR 0018. Un aide-mémoire écrit à la main aurait dérivé dès le
raccourci suivant.

## Décision

- **Déclaration unique** dans `core/commands/commands.ts` (module pur : ni Angular, ni
  Three.js) :
  - `KEY_COMMANDS` : identifiant, touche (`KeyboardEvent.key` en minuscules, comparée sans
    tenir compte de la casse), touche affichée, description française, groupe ;
  - `ORBIT_MOUSE_BUTTONS` et `ORBIT_TOUCHES` : action de chaque bouton de la souris et du
    toucher à un ou deux doigts ; `orbitGestures()` en déduit les lignes de l'aide-mémoire
    (dont « Maj + glisser » : déplacement, que fait `OrbitControls` quand le clic gauche
    tourne) ;
  - `helpSections()` : l'aide-mémoire complet, par groupe (`COMMAND_GROUPS`).
- **Les consommateurs lisent la déclaration** : la barre des préréglages construit ses
  boutons et ses constantes (`PIXEL_ART_KEY`, `CLOCK_KEY`, `DAY_KEY`, `NIGHT_KEY`) avec
  `commandKey` / `keyCommand` ; `AquariumView` règle `mouseButtons` et `touches`
  d'`OrbitControls` à partir de `ORBIT_MOUSE_BUTTONS` et `ORBIT_TOUCHES` (tables de
  correspondance `ORBIT_MOUSE_ACTIONS`, `ORBIT_TOUCH_ACTIONS`) ; l'aide-mémoire
  (`ui/commands-help`) est un rendu de `helpSections()`.
- **Test d'exhaustivité** (`ui/commands-help/commands-help.spec.ts`) : l'interface complète
  (barre et aide-mémoire) reçoit toutes les touches ASCII imprimables, des lettres
  accentuées et les touches nommées usuelles ; l'ensemble des touches consommées
  (`preventDefault`) doit être exactement celui des touches déclarées, et chacune doit
  figurer dans l'aide-mémoire affiché. Un raccourci ajouté à un gestionnaire sans être
  déclaré fait échouer ce test. Côté gestes, `aquarium-view.spec.ts` vérifie que le réglage
  effectif d'`OrbitControls` est celui de la déclaration.
- **Aide-mémoire** : panneau sombre translucide en haut à droite (la barre est en bas au
  centre), ouvert par défaut pour être découvert ; touche `?` (et bouton) pour le replier ou
  le déplier ; état mémorisé dans `localStorage` (`aqfish.aide-commandes` : `replie` ou
  `ouvert`), repli en mémoire si le stockage est indisponible ou lève ; absent en mode
  capture.

## Options écartées

- **Registre dynamique** (chaque composant enregistre ses touches au démarrage) : plus
  souple, mais l'aide-mémoire dépendrait de l'ordre d'initialisation et le test ne pourrait
  plus comparer à une liste connue d'avance.
- **Un seul gestionnaire clavier global** qui distribue les commandes : il aurait fallu
  remonter les actions de la barre et de l'aide dans un service ; refonte plus large que
  #74, sans gain pour l'exhaustivité que le test garantit déjà.
- **Écouter les touches d'`OrbitControls`** (`listenToKeyEvents`, flèches) : non activé ; s'il
  l'était, le test d'exhaustivité le signalerait (flèches consommées non déclarées).

## Conséquences

- Ajouter un raccourci : le déclarer dans `KEY_COMMANDS`, puis le gérer ; l'aide-mémoire
  suit sans autre modification.
- Changer un geste de la caméra : modifier `ORBIT_MOUSE_BUTTONS` ou `ORBIT_TOUCHES` ; les
  libellés suivent.
- Les commandes à venir (nourrissage, panneau de contrôle #52) s'ajoutent de la même façon.
