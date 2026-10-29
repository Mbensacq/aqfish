# 0077 — Mode décor, lot 1 : un mode par bac, état de soin en pause

- Statut : acceptée
- Date : 2026-10-29
- Auteur : Dev, cycle 102, issue #278

## Contexte

Mathis veut, à côté du mode où l'on s'occupe des animaux (eau, faim, santé, compatibilité),
un **mode décor** purement graphique : on regarde, on aménage, toute espèce du catalogue dans
n'importe quel bac, sans rien à gérer ni alerte. Le mode est **par bac** (épopée #264) et
enregistré ; changer de mode met l'état de soin en pause sans l'effacer. Le bac affiché est
avancé **en place** par la boucle d'affichage, qui ne connaît que son `World` (ADR 0060,
0076) ; les autres bacs avancent par `stepRoom`.

## Décision

1. **Le mode est un champ facultatif du monde du bac** (`World.careMode`, `sim/care-mode.ts`) :
   `soins` ou `decor`. Absent, c'est le mode soins d'un bac jamais passé par le décor :
   `createWorld`, les sauvegardes et les captures existantes sont inchangés à l'octet.
   Chaque `RoomTank` porte donc son mode par son monde ; `stepRoom` et la boucle en place
   le lisent sans paramètre de plus.
2. **Pause dans le pas** (`stepInPlace`) : en décor, la faim de chaque animal est relevée au
   début du pas (tampon réutilisé, aucune allocation par image) et rendue à la fin ; l'eau
   (composés, température, catappa) et la santé ne sont pas avancées. La nage, la nourriture
   (purement visuelle : un animal affamé la mange, sans être rassasié) et le temps avancent.
   Déterministe : `advance(a + b) = advance(advance(a), b)` est conservé.
3. **Toute espèce en décor** : `acceptsSpecies` (hôte et `population=`) et `decorCatalog`
   (panneau : espèces du bac d'abord, puis les autres). Les espèces exclues pour raison légale
   (#262) ne sont pas dans `SPECIES` : elles restent absentes. Les bornes techniques
   (`maxPopulation`, `MAX_TOTAL_FISH`) restent. Aucune alerte : `worstAlert` rend `null`, les
   avertissements de mélange et d'ajout du panneau sont masqués.
4. **Sauvegarde** : `careMode` est écrit dans le corps de chaque monde (schémas 1 et 2) dès
   que le bac est passé par le décor ; retour en soins = `soins` **explicite**. Un mode écrit
   autorise à la relecture des espèces d'un autre milieu (`acceptsSavedSpecies`), puisque le
   lot 1 les garde au retour en soins ; sans mode, la validation reste stricte (anciennes
   sauvegardes). Pas de nouveau schéma : un champ facultatif, ignoré par une version
   antérieure.
5. **Interface** : bouton « Mode : … » sur la ligne du titre « Bacs » (aucune ligne de plus à
   1280 × 720, PIEGES), confirmation `role="alertdialog"` posée au-dessus du panneau (position
   fixe : la mise en page des colonnes ne bouge pas), texte qui explique la conséquence. En
   décor, le tableau de bord (cadre haut et bandeau bas) est remplacé par le badge discret
   « Mode décor : pas une simulation réaliste » (`ui/decor-badge`) ; la liste des bacs
   indique « décor ». `mode=decor` (contrat de capture) met le bac affiché en décor au départ.

## Options écartées

- **Champ du `RoomTank`** : la boucle d'affichage avance le monde seul ; il aurait fallu
  passer le mode à `advanceInPlace` et le resynchroniser dans `syncRoom` et dans la
  sauvegarde à part du monde, pour le même résultat.
- **Avancer puis rétablir l'état de soin** (copie avant / après) : allocation par image, et
  la santé pèse sur la nage pendant le pas.
- **Mode global de l'application** : contraire à l'attendu (un bac de soins et un bac de décor
  dans la même pièce).

## Conséquences

- Lot 2 (#278 reste ouverte) : au retour en soins, lister les animaux inadaptés (milieu,
  température, compatibilité, volume) et proposer de les retirer. D'ici là, ils sont gardés,
  et le panneau en soins ne propose que les espèces du bac (un animal gardé reste visible dans
  le bac et dans la liste, pas dans les compteurs).
- Le transfert à l'épuisette garde ses refus (milieu, température) même vers un bac en décor.
- Un bac gardé en soins avec un animal d'un autre milieu n'a pas d'alerte de milieu : à
  traiter avec la liste du lot 2.
