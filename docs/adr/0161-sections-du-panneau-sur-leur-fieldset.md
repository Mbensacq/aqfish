# 0161 — Sections du panneau « Réglages » posées sur leur `fieldset`

- Statut : acceptée
- Date : 2026-11-19
- Auteur : Dev
- Chantier : assainissement #686, lot 11 (#697)

## Contexte

`ui/control-panel/control-panel.ts` faisait 2 231 lignes (1 871 hors blancs et
commentaires), dont un gabarit de 1 160 lignes, et `control-panel.scss` était au bord du
budget de style d'un composant (8 kB). Le lot 11 découpe le panneau en un composant par
section, sans rien changer à l'écran ni au DOM : les e2e lisent `[data-section=…]`,
`:scope > fieldset` (`cadrage-panneaux-soins.spec.ts`), la mise en page à 1280 × 720 repose
sur `column-count` et `break-inside` appliqués aux `fieldset`, et la bordure entre deux
sections sur `.control-panel__section + .control-panel__section`.

Deux difficultés :

1. Un composant à sélecteur d'élément (`app-…`) ajouterait un élément autour de chaque
   `fieldset` : les sections ne seraient plus sœurs, ni enfants directs du panneau.
2. Avec l'encapsulation émulée, les classes de `control-panel.scss` ne s'appliquent qu'aux
   éléments du gabarit du panneau (docs/PIEGES.md, cycle 149) ; passer le panneau en
   `ViewEncapsulation.None` baisserait la spécificité de toutes ses règles (un attribut de
   moins par sélecteur) et changerait la cascade face aux styles globaux.

## Décision

1. **Sélecteur d'attribut sur le `fieldset`** : `fieldset[app-population-section]`,
   `fieldset[app-room-section]`, `fieldset[app-tanks-section]`. Le panneau garde dans son
   gabarit le `fieldset` et ses attributs (`class`, `data-section`, `aria-labelledby`), donc
   les règles du panneau qui le visent (section, colonnes, défilement de « Population ») ne
   bougent pas ; la section remplit son contenu. La règle `@angular-eslint/component-selector`
   accepte ce type de sélecteur pour les seuls fichiers `ui/control-panel/*-section.ts`
   (`eslint.config.js`).
2. **Règles communes en mixins, dans l'ordre d'origine** : `_panel-controls.scss` regroupe
   les règles des éléments du panneau (`base`, `count`, `phone`, `texts`, `rows`, `sheet`,
   `tanks`) ; chaque feuille inclut les groupes dont elle a besoin, toujours dans l'ordre du
   fichier. Chaque règle garde son attribut d'encapsulation, donc sa spécificité, et l'ordre
   relatif des règles qui s'appliquent à un même élément ne change pas.
3. **API du panneau inchangée** : il garde toutes ses entrées et sorties et relaie celles
   des sections ; l'hôte et les tests ne changent pas. Les fonctions et types sortis avec une
   section (`populationInput`, `speciesStepLabel`, `PopulationRequest`, `NewTankRequest`…)
   sont réexportés par `control-panel.ts`. Les vues partagées par plusieurs sections
   (catalogue affiché, nom d'environnement, infobulle d'un soin, quarantaine affichée) sont
   des fonctions pures de `panel-views.ts`.
4. **État local dans la section** : fiche ouverte et dernière espèce ajoutée
   (« Population »), choix du prochain bac et confirmation de retrait (« Bacs et meubles »),
   transfert, renommage, quarantaine et confirmation du mode (« Bacs »). Le panneau ouvert
   crée les sections et les détruit à sa fermeture, comme il le faisait de leur contenu.

## Conséquences

- `control-panel.ts` passe à 1 021 lignes hors blancs et commentaires après cette tranche ;
  les sections restantes (environnement, simulation, journée, eau, soins, décor,
  accessibilité, son, sauvegarde) suivent le même modèle.
- Vérification : styles calculés et boîtes de chaque élément du panneau relevés avant et
  après, dans douze états (défaut, fiche et ajout, pièce à deux bacs, confirmation du mode ;
  1280 × 720, 1600 × 1000, 390 × 844) : identiques, hors valeurs qui varient avec le temps
  (faim, fondu du bouton).
- Une feuille de section qui n'inclut pas un groupe utile perd silencieusement ses styles :
  relever les styles calculés (ou regarder les captures) à chaque extraction.
- Le CSS commun est répété dans chaque section (encapsulation émulée) : quelques kilo-octets
  de plus dans le paquet, sous les budgets.
