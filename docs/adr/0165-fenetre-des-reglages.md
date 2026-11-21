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

## Révision (cycle 267, branchement)

- **Toutes les sections restent dans le document, celles des autres catégories masquées**
  (attribut `hidden` sur leur `fieldset`, que `.control-panel__section[hidden]` respecte), au
  lieu du `@switch` prévu. Raisons : 29 ouvertures des e2e enchaînent plusieurs catégories
  (PR #757), dont 28 imports de monde par le champ de fichier de « Sauvegarde et partage » ;
  un champ masqué reste utilisable par `setInputFiles`, et l'état local d'une section (fiche
  ouverte, confirmation, saisie du renommage) survit à un changement de catégorie. Les tests
  qui cliquent un contrôle d'une autre catégorie passent par `ouvrirReglages`, qui clique la
  catégorie quand la fenêtre est déjà ouverte. La recherche (#723) pourra afficher des
  sections de plusieurs catégories en levant leur `hidden`.
- **Le panneau garde la catégorie ouverte** (`category`, signal du panneau) d'une ouverture à
  l'autre ; la préférence locale arrive à la tranche 2.
- **Fermeture** : Échap, « Fermer » et clic sur le fond rendent le focus au bouton
  « Réglages » ; prendre la raclette ou le sécateur referme la fenêtre (le bac redevient
  cliquable) ; l'éditeur de décor et le mode immersif la referment déjà (`app.ts`).
- **Hôte au-dessus des autres panneaux** : tant que la fenêtre est ouverte, l'hôte du panneau
  passe en `z-index: 10` (classe `control-panel-host--window`) : le fond couvre la barre des
  vues, le tableau de bord, l'aide-mémoire et le wiki.
- **Bouton « Fermer »** (et non « Fermer les réglages ») : `getByRole('button', { name:
  'Réglages' })` cherche une sous-chaîne et aurait trouvé deux boutons.


## Révision (cycle 269, Dev) : téléphone

- **Disposition choisie en TypeScript, pas seulement en CSS** : sous 640 px, la fenêtre montre
  soit la liste des catégories, soit le contenu d'une catégorie. Le bloc caché porte `hidden`
  (et non un simple `display: none` de feuille de style) pour rester hors du piège du focus
  (`focusableIn` saute `[hidden]`) et des lecteurs d'écran. La largeur est lue par
  `PHONE_LAYOUT` (`ui/settings-window/phone-layout.ts`), un signal racine qui suit
  `matchMedia` (téléphone tourné) ; même seuil que les panneaux exclusifs ; sans `matchMedia`
  (jsdom) : bureau. Au-delà de 639 px, rien ne change (capture `front-panneau` identique).
- **Valeurs résumées calculées par le panneau** (`ui/control-panel/settings-summaries.ts`,
  fonction pure testée) et passées à la fenêtre (`summaries`), qui reste sans connaissance de
  l'état du bac. Sur téléphone, le résumé est la description du bouton (`aria-describedby`),
  son nom reste le titre de la catégorie.
