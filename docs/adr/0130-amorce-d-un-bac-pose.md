# 0130 — Amorce de bactéries d'un bac posé, depuis la liste des bacs

- Statut : acceptée
- Date : 2026-11-11
- Auteur : Dev, cycle 195, issue #553

## Contexte

Depuis #538 (ADR 0123), un bac ajouté par le joueur démarre avec un filtre neuf (5 %) qui mûrit
seul en 8 semaines simulées, et l'amorce de bactéries (#529, ADR 0120) accélère cette
maturation. Mais un bac ajouté est **posé** : il n'est pas sélectionnable (ADR 0075), et le
bouton « Bactéries » des outils n'agit que sur le bac affiché, dont le filtre est toujours mûr.
En partie normale, l'amorce répondait donc toujours « Filtre déjà mûr » : le but de #538 n'était
pas atteint.

## Décision

- **Doser un seul bac de la pièce** : `doseTankStarter(pièce, bac)` (`sim/quarantine.ts`, pur)
  copie le monde du bac visé et lui verse une dose (`doseWorldBacteriaStarterInPlace`), mêmes
  règles qu'au bac affiché (filtre mûr, amorce encore active : refus) ; les autres bacs gardent
  le même objet. Refus en mode décor, comme les soins. Aucun état ni champ de sauvegarde nouveau :
  la réserve d'amorce est déjà dans `World.water` de chaque bac, et les bacs non affichés
  avancent déjà (ADR 0076), donc la dose y est consommée.
- **Interface** : dans le groupe « Quarantaine » de la section « Bacs » (où l'on soigne déjà un
  bac posé, ADR 0127), une ligne de plus **tant que le filtre du bac choisi n'est pas mûr** :
  bouton « Bactéries » et avancement « Filtre neuf : efficace à N % »
  (`QuarantineEntry.filter`). Message de réussite ou de refus dans `data-transfer-notice`, préfixé
  du nom du bac. La ligne disparaît une fois le filtre mûr.
- Le bac par défaut ne change pas (aucun bac posé) : captures et panneau identiques.

## Options écartées

- **Rendre un bac posé sélectionnable** (suite de l'ADR 0075) : chantier de rendu et de caméra
  (pièce dessinée dans le repère du bac choisi), hors d'une PR de cycle de rétrospective ; il
  reste la bonne réponse à terme et règlerait aussi le tableau de bord et les relevés d'un bac
  posé.
- **Filtre neuf pour le bac de départ d'un nouvel environnement** : changerait l'eau des bacs
  créés par le jeu au démarrage, donc les captures et l'équilibre de tous les environnements ;
  un joueur qui change d'environnement n'« installe » pas un bac.
- **Bouton « Bactéries » des outils qui vise un bac posé** : ambigu (quel bac ?) ; la liste des
  bacs désigne déjà le bac par son nom.

## Conséquences

- Le joueur voit l'avancement du filtre d'un bac posé et peut l'amorcer ; la gravité de la liste
  reste le seul relevé de son eau tant qu'il n'est pas sélectionnable.
- Le groupe garde le nom « Quarantaine » : tout bac posé peut en servir (ADR 0127).
