# 0165 — Fenêtre des réglages : catégories déclarées, contenu projeté

- Statut : acceptée
- Date : 2026-11-20
- Auteur : Dev

## Contexte

Le panneau « Réglages » devient une fenêtre modale à catégories (#722, `docs/INTERFACE.md`
section 2). La recherche du lot 3 (#723) doit chercher dans les mêmes réglages que ceux que la
fenêtre affiche, et chaque contrôle actuel doit garder son comportement et ses attributs
`data-aqfish-*`. Les sections du panneau sont déjà des composants posés sur leur `fieldset`
(ADR 0161).

## Décision

- **Une seule déclaration** : `ui/settings-window/settings-categories.ts` liste, en données, les
  groupes et les catégories (identifiant stable, titre, explication, sections réutilisées par
  leur `data-section`, contrôles portés). La fenêtre, l'inventaire et l'index de recherche la
  lisent ; un test vérifie que chaque section du panneau est dans une et une seule catégorie.
- **La fenêtre ne connaît pas les réglages** : `SettingsWindow` gère la modale (rôle `dialog`,
  `aria-modal`, fond, focus piégé, Échap, flèches, `/`) et la catégorie ouverte (`model`) ; le
  contenu est projeté (`ng-content`) par le panneau, qui choisit les sections de la catégorie
  ouverte. Les entrées et sorties des sections restent relayées par le panneau, comme avant :
  l'hôte (`app.html`) ne change pas.
- **Fermeture demandée, pas décidée** : la fenêtre émet `closeRequested` ; le parent ferme et
  rend le focus au bouton « Réglages ».

## Options écartées

- **Toutes les catégories empilées, la liste servant d'ancres** : aurait épargné la mise à jour
  des e2e, mais contredit la maquette validée (une catégorie à la fois, que la recherche
  remplace).
- **Une fenêtre qui instancie elle-même les sections** : elle aurait dû reprendre les ~60
  entrées et sorties du panneau ; doublon et couplage.
- **`<dialog>` natif avec `showModal()`** : la couche supérieure du navigateur passe au-dessus
  de tout, y compris des bulles que le reste de l'interface pose (fiche, confirmation), et
  jsdom ne l'implémente pas complètement pour les tests unitaires.

## Conséquences

- Un contrôle qui change de catégorie se déplace en changeant une ligne de données.
- Les e2e qui ouvrent les réglages devront choisir la catégorie avant d'agir sur un contrôle.
