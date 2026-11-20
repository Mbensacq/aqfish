# 0164 — Jetons de la charte, polices servies par le site

- Statut : acceptée
- Date : 2026-11-20
- Auteur : Dev

## Contexte

La charte « la salle d'aquarium » (`docs/INTERFACE.md`, décision de Mathis du 2026-11-18)
remplace l'apparence de l'interface. Avant elle, chaque feuille écrivait ses couleurs en clair
(plus de 300 valeurs : turquoise `#5fbfa3`, encre à 6 à 85 % d'opacité, fonds à 72 à 97 %,
rayons de 3 à 10 px), et `ui/panel-contrast.spec.ts` ne vérifiait que les valeurs qu'il
savait lire. Les lots suivants (#722 à #725) doivent pouvoir changer l'apparence sans
reprendre chaque feuille.

## Décision

- **Une seule source** : toutes les couleurs, rayons, opacités et polices de l'interface sont
  des variables de `ui/_panel-layout.scss` (`$room`, `$panel-background`, `$panel-raised`,
  `$panel-rule`, `$panel-border`, `$panel-ink`, `$panel-ink-muted`, `$brass`, `$on-brass`,
  `$state-*`, `$radius-control`, `$radius-window`, `$opacity-*`, `$scrim`, `$font-*`).
- **Cliquet par test** : `ui/charte-jetons.spec.ts` lit toutes les feuilles d'interface comme
  texte et échoue sur toute couleur, tout rayon chiffré ou toute opacité autre que 0 et 1
  écrits ailleurs. `ui/panel-contrast.spec.ts` vérifie les contrastes des jetons (texte
  ≥ 4,5:1 sur le panneau, le panneau élevé et la salle ; focus ≥ 3:1) et que les couleurs du
  tableau de bord (`DASHBOARD_COLORS`, posées en variables CSS par le composant) sont celles
  des jetons.
- **Panneaux pleins** : plus de fond translucide ni d'estompage au repos ; le contraste ne
  dépend plus de la scène derrière (seul l'anneau de focus la rencontre, cerné de son halo).
- **Polices servies par le site** : `@fontsource-variable/atkinson-hyperlegible-next` et
  `…-mono` (OFL-1.1), chargées par `src/styles.scss` (fichiers woff2 à part, hors du bundle
  JavaScript, `font-display: swap`) ; repli `system-ui` puis `sans-serif`.
- **Icône et logo générés par le code** : `scripts/generer-icone.mjs` écrit `favicon.ico`
  (16, 32, 48 px), deux PNG et `logo.svg` depuis un seul dessin de 16 × 16, sans dépendance.

## Options écartées

- Propriétés CSS personnalisées (`--panel-ink`) partout : lisibles par le navigateur, mais
  pas par le test sans navigateur ; les variables SCSS gardent le test de contraste simple.
  Le tableau de bord garde ses variables CSS, alimentées par des constantes vérifiées.
- Polices d'un service externe : interdit (aucun appel tiers, `CLAUDE.md`).
- Garder l'estompage au repos (0,6 à 0,9) : le danger `#ec6a5c` tombait sous 4,5:1 sur une
  scène claire, et la charte veut des panneaux pleins.

## Conséquences

- Une nouvelle feuille d'interface s'ajoute à la liste de `charte-jetons.spec.ts`.
- Changer une teinte se fait dans `_panel-layout.scss` seulement, et relance les contrastes.
- La largeur des textes change avec la police : les tests de cadrage (police par défaut et
  DejaVu Sans) la couvrent.
