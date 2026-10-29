# 0076 — Pièce de N bacs, lot 3b : tous les bacs vivants et renommage

- Statut : acceptée
- Date : 2026-10-29
- Auteur : Dev, cycle 101, issue #316 (épopée #264)

## Contexte

Jusqu'au lot 3a (ADR 0075), l'hôte n'avance que le bac affiché ; les mondes des autres
environnements (ADR 0063) et les bacs posés (ADR 0074) sont **figés**. La liste des bacs
montre donc des alertes figées, et un animal transféré dans un bac posé n'y vit pas. L'ADR
0069 prévoyait la fin de ce gel par `stepRoom` dans l'hôte. La boucle d'affichage avance le
bac affiché **en place**, sans allocation par image (ADR 0060) ; elle ne doit pas changer.

## Décision

1. **Rattrapage par lots** (`advanceBackgroundTanks` de l'hôte) : les bacs non affichés
   avancent par `stepRoom(pièce, n, horloge, bacAffiché)`, où `n` est le nombre de pas du
   bac affiché depuis le rattrapage précédent. Le bac affiché est exclu (`exceptTankId` :
   même objet), toujours avancé en place par la boucle : son état est identique, au bit près,
   à celui d'avant le lot (empreinte de référence relevée sur `main` dans
   `room-state.spec.ts`).
2. **Rythme** : le rattrapage a lieu aux relevés de l'eau (`WATER_READOUT_TICKS`, au plus
   4 fois par seconde de temps réel, ADR 0060), et avant tout ce qui lit ou change les autres
   bacs : changement de bac, transfert, sauvegarde. Aucune allocation par image ; un clone
   par bac non affiché et par rattrapage (`advance` est pur).
3. **Déterminisme** : `advance(monde, a + b) = advance(advance(monde, a), b)` ; le découpage
   en lots, qui dépend du temps réel, ne change donc pas l'état d'un bac. Un bac non affiché
   évolue exactement comme s'il était affiché, à l'horloge du jour près (point 5).
4. **Renommage** depuis la liste (« Bac à renommer », « Nouveau nom », « Renommer » ou
   Entrée) : `renameTank` (existant depuis le lot 2) normalise désormais le nom
   (`normalizeTankName` : caractères de contrôle et suites de blancs ramenés à une espace,
   bords rognés), refuse un nom vide ou de plus de `MAX_TANK_NAME_LENGTH` caractères
   (unités UTF-16, comme la validation du schéma 2) ; refus affiché en `role="status"`. Le
   nom est enregistré au schéma 2 (champ `name`, déjà présent) : pas de changement de schéma.
5. **Faim dans la liste** : `TankListEntry.hunger` (faim moyenne en pour cent, `null` sans
   animal nourri aux granulés), exposée en `data-tank-hunger` : preuve, testable, qu'un bac
   non affiché vit.

## Options écartées

- **Avancer chaque bac à chaque image, en place** : coût par image multiplié par le nombre
  de bacs ; en place, il casserait aussi le cache de gravité par monde de la liste.
- **Modèle réduit pour les bacs non affichés** (eau et faim seulement, sans nage) : moins
  cher, mais l'état divergerait de celui d'un bac affiché (positions, nourriture, santé liée
  aux poissons), avec un saut au moment de le sélectionner. Reste possible au lot 4
  (niveaux de qualité) si la mesure le justifie.
- **Plafonner les pas d'un rattrapage** : les bacs prendraient un retard croissant à grande
  vitesse ; le coût est déjà borné par `maxStepsForSpeed` côté bac affiché.

## Conséquences

- **Fin du gel des ADR 0063 et 0074** (à signaler dans les notes de version) : revenir à un
  environnement quitté le retrouve avancé d'autant de temps que le séjour ailleurs.
- Coût : le temps de simulation par seconde croît linéairement avec le nombre de bacs peuplés
  (32 au plus) ; à mesurer au lot 4.
- **Limite connue** : l'horloge du jour (`DayClock`) est celle du bac affiché et se lit au
  temps de chaque monde ; un bac dont le `time` diffère du bac affiché voit une autre heure
  (rythme du jour décalé). Sans effet sur l'eau et la faim ; à reprendre si la pièce
  partage un jour commun.
- La sélection d'un bac posé et son rendu dans son repère restent au lot 3c.
