# 0075 — Pièce de N bacs, lot 3a : liste des bacs, sélection et transfert à l'épuisette

- Statut : acceptée
- Date : 2026-10-29
- Auteur : Dev, cycle 100, issue #306 (épopée #264)

## Contexte

L'ADR 0061 prévoit au lot 3 la liste des bacs, la sélection du bac regardé et le transfert
d'un animal d'un bac à un autre ; l'ADR 0069 y ajoutait la fin du gel des bacs non affichés
(`stepRoom` dans l'hôte) et l'ADR 0074 la sélection des bacs posés. L'hôte actuel n'affiche et
ne simule qu'un monde (le bac à la position historique de l'environnement choisi), range les
autres environnements figés (ADR 0063) et garde les bacs posés figés (ADR 0074). Rendre un bac
posé « regardé » demande de dessiner la pièce dans le repère du bac sélectionné (ADR 0061,
« Rendu et captures ») : un chantier de rendu et de caméra qui ne tient pas, avec la liste et
le transfert, dans une PR d'environ 600 lignes.

## Décision

1. **Transfert** (`sim/tank-transfer.ts`, pur) : `transferFish(pièce, départ, arrivée,
   animal)` retire l'animal du bac de départ et l'ajoute au bac d'arrivée par `spawnEntity`
   (identifiant `nextFishId` et sous-générateur de la graine d'arrivée, zone de naissance de
   l'espèce, anémone attribuée comme à un ajout), **faim et santé conservées** (un animal malade
   le reste). Refus, dans l'ordre : bac inconnu, même bac, animal absent, **milieu**
   (`livesIn` : eau de mer, eau douce, eau froide, paludarium), **température** de l'eau
   d'arrivée hors de la plage tolérée de la fiche (bornes incluses), **bac plein**
   (`populationLimit` : plafond de l'espèce et `MAX_TOTAL_FISH`). Le volume conseillé et le
   groupe minimal restent des **avertissements** (`addWarnings`, #237), renvoyés avec le
   résultat et affichés. Chaque refus a un message en français.
2. **Liste** (`sim/tank-list.ts`, pur) : nom, environnement, litrage, nombre d'animaux, **pire
   gravité** des alertes du tableau de bord (`dashboardAlerts` sur le monde du bac), bac
   sélectionné, bac sélectionnable. L'hôte relit le bac sélectionné à chaque relevé de l'eau
   (`WATER_READOUT_TICKS`) et garde en cache, par monde, la gravité des bacs figés : leur monde
   ne change pas tant qu'il est figé, donc le coût par relevé est celui d'un seul bac (ADR 0060).
3. **Sélection** : un bac à la position historique (au plus un par environnement) se sélectionne
   depuis la liste, ce qui revient à changer d'environnement (`setEnvironment`) ; tableau de
   bord, fiches et wiki décrivent alors ce bac, sans changement de leur contrat (ADR 0061).
   La sélection est déjà enregistrée (`selectedTankId`, schéma 2) et restaurée au chargement.
   Un **bac posé** figure dans la liste (animaux, alerte) mais **n'est pas sélectionnable**
   (`aria-disabled`, mention « posé, figé ») : il peut recevoir un animal par transfert.
4. **Interface** : section « Bacs » des réglages, juste avant « Sauvegarde » (ordre au
   clavier des sections précédentes inchangé, testé par `e2e/panneau.spec.ts`), toujours affichée : un bouton par bac (`aria-pressed`),
   puis « Animal » (espèces présentes dans le bac sélectionné), « Vers » (les autres bacs) et
   « Transférer à l'épuisette » (l'animal le plus récent de l'espèce, comme le retrait de la
   population). Message de réussite ou de refus en `role="status"`. Attribut de test
   `data-aqfish-selected-tank`.

## Options écartées

- **Sélectionner un bac posé dès ce lot** : le monde affiché devrait pouvoir être un bac posé,
  donc `syncRoom` ne plus apparier par environnement, et le rendu dessiner la pièce dans le
  repère de ce bac ; reporté au lot 3b, avec `stepRoom` dans l'hôte.
- **Avancer tous les bacs (`stepRoom`) dès ce lot** : touche la boucle d'affichage et la
  sauvegarde de tous les mondes ; sans bac posé sélectionnable, l'utilisateur ne verrait que
  des jauges qui bougent dans la liste. Reporté au lot 3b.
- **Liste flottante à côté du tableau de bord** : la place libre de l'interface est comptée
  au pixel (`docs/PIEGES.md`, 390 et 320 px) ; le panneau des réglages défile déjà.
- **Refuser un transfert vers un bac trop petit** : le volume conseillé est un conseil de
  maintenance (#237), pas une impossibilité ; il reste un avertissement, comme à l'ajout.

## Conséquences

- La liste montre l'alerte d'un bac non affiché, mais cette alerte est **figée** avec lui
  (son eau n'évolue pas) jusqu'au lot 3b.
- Un animal transféré dans un bac posé y reste figé jusqu'au lot 3b.
- Reste du lot 3 (3b) : bacs posés sélectionnables (rendu dans le repère du bac sélectionné),
  `stepRoom` dans l'hôte (fin du gel des ADR 0063 et 0074), un bac tropical de plus à la
  position historique, renommage depuis la liste.
