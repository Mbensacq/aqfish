# 0078 — Mode décor, lot 2 : retour en soins avec la liste des animaux inadaptés

- Statut : acceptée
- Date : 2026-10-30
- Auteur : Dev, cycle 105, issue #323 (épopée #278)

## Contexte

Le lot 1 (ADR 0077) garde au retour **Décor → Soins** tous les animaux, même ceux qui ne
conviennent pas au bac, sans les signaler. Il faut les lister (milieu, température,
compatibilité, volume) et laisser le choix : les retirer, ou les garder avec les
avertissements habituels.

## Décision

1. **Fonction pure** `unsuitableAnimals` (`sim/care-return.ts`) : une entrée par espèce
   présente, dans l'ordre de `speciesShownIn` (espèces de l'environnement, puis celles d'un
   autre milieu), avec la **première** raison : milieu (`livesIn`), température hors de la
   plage tolérée de la fiche (comme le transfert, #306), volume puis groupe (`addWarnings`),
   compatibilité (`compatibility`). Aucun contrôle n'est recopié. Elle lit l'environnement,
   les effectifs, le volume et la température : le panneau la calcule à partir de ce que
   l'hôte lui fournit déjà, sans signal de plus.
2. **Compatibilité contre les espèces gardées** : de deux espèces déconseillées ensemble,
   seule la seconde est listée ; une espèce déjà listée pour une autre raison ne rend pas la
   suivante inadaptée. Retirer la liste laisse donc un bac dont la liste est vide
   (idempotence, testée sur des mélanges variés). Lister les deux espèces d'un couple aurait
   vidé le bac de ses propres animaux pour un seul intrus.
3. **Choix dans la confirmation existante** (`role="alertdialog"`) : « Tout retirer »,
   « Tout garder », « Annuler » ; sans animal inadapté, ni liste ni bouton de retrait
   (« Revenir au mode soins » du lot 1). « Tout retirer » émet les espèces affichées
   (`careReturned`) : l'hôte les retire puis repasse en soins en une opération
   (`returnToCareInPlace`) ; « Tout garder » reste `careModeChanged('soins')`.
4. **Avertissements habituels** : mélanges déconseillés, avertissements d'ajout et tableau
   de bord, inchangés ; s'y ajoute en soins une ligne par animal d'un autre milieu gardé
   (`data-milieu-warning`), le seul cas qui n'avait aucun avertissement (ADR 0077,
   conséquences). Les autres raisons ont déjà les leurs : pas de doublon.
5. Le dialogue garde sa position fixe ; la liste défile dans un dialogue borné à la hauteur
   de l'écran, les boutons passent à la ligne si besoin (390 px).

## Options écartées

- **Retrait espèce par espèce** : hors de l'attendu (« Tout retirer » / « Tout garder »), et
  une ligne de plus par espèce dans un dialogue déjà dense à 390 px.
- **Signal de liste dans l'hôte** : la liste ne dépend que de valeurs déjà passées au
  panneau ; un second calcul aurait pu diverger de ce qui est affiché.

## Conséquences

- Aucun environnement n'a aujourd'hui deux espèces déconseillées ensemble : la raison
  « compatibilité » ne sort qu'avec une espèce à venir (le test parcourt chaque couple).
- Avec ce lot, l'attendu de #278 est couvert (transfert automatique et jardin hors périmètre).
