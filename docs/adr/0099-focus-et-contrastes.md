# 0099 — Accessibilité : anneau de focus commun, contrastes vérifiés, Échap

- Statut : acceptée
- Date : 2026-11-03
- Auteur : Dev, cycle 136, issue #407 (épopée v1.8 « Aquarium vivant et accessible »)

## Contexte

Chaque feuille de style de `src/app/ui` déclarait son propre `:focus-visible` (vingt règles,
le plus souvent `2px solid #5fbfa3`, décalage 1 ou 2 px) ; les contrôles sans règle (listes
déroulantes, cases à cocher hors réglages) gardaient l'anneau du navigateur, plus fin. Les
panneaux sont translucides sur la scène : l'anneau turquoise d'un bouton posé sur la scène
tombait à ~2,5:1 devant un sable ou un ciel clair (exigé : 3:1). Les couleurs des panneaux
n'étaient vérifiées que pour le tableau de bord (#256). « Réglages » et « Commandes » ne se
fermaient pas à Échap (le wiki, la fiche d'espèce et le guide, si).

## Décision

1. **Jetons dans `ui/_panel-layout.scss`**, à côté de la géométrie (#322) : fond
   `$panel-background` (`#141418`), opacités minimales `$panel-button-alpha` (72 %, bouton
   sur la scène) et `$panel-alpha` (88 %, panneau déplié), encre `$panel-ink`, opacité
   minimale du texte secondaire `$panel-muted-alpha` (62 %, panneau déplié seulement),
   accent, et l'anneau : couleur, épaisseur (2 px), halo.
2. **Un anneau pour tous** : mixin `focus-ring($offset, $color)` posé une fois sur
   `:focus-visible` dans `src/styles.scss`. Contour de 2 px, plus un **halo opaque** du fond
   des panneaux (`box-shadow`, 2 px de part et d'autre de l'anneau) : l'anneau n'a plus pour
   voisin que ce halo, d'où un contraste fixe (8,3:1 pour l'accent) de jour comme de nuit,
   sur toute scène. Les composants n'incluent le mixin que pour changer l'écart (curseurs,
   dialogue du guide : 2 px) ou la couleur (tableau de bord, mode immersif) ; les règles
   identiques à l'anneau commun sont supprimées. Aucun mouvement ni transition (#406).
3. **Contrastes vérifiés sur le SCSS lui-même** (`ui/panel-contrast.spec.ts`) : le test lit
   `_panel-layout.scss` comme texte (`import … with { loader: 'text' }`, déclaration
   `ui/scss-text.d.ts`), résout les variables et calcule les rapports WCAG (fonctions de
   `ui/dashboard-frame/contrast.ts`) sur sept scènes, de jour (blanc, sable, eau, ciel) et de
   nuit (noir, fond, eau de nuit). Il lit aussi les feuilles des panneaux : aucun fond
   `#141418` sous 72 %, aucune encre sous 62 %, toute couleur de texte pleine ≥ 4,5:1 sur un
   panneau déplié.
4. **Échap** : « Réglages » et « Commandes » se replient à Échap quand le focus est dans le
   panneau ou sur son bouton (écoute sur l'hôte, pas sur le document : un Échap ailleurs, par
   exemple sur la scène, ne ferme rien), et rendent le focus au bouton d'origine. Une fiche
   ou une confirmation ouverte se ferme d'abord (elle arrête l'événement) ; un Échap déjà
   traité (`defaultPrevented`) est ignoré. Le wiki garde son Échap sur le document (#289).
5. **E2e** `clavier-focus.spec.ts` : parcours complet à Tab, réglages ouverts, jusqu'au
   retour sur « Réglages » (aucun piège), chaque contrôle atteint visible, nommé, avec
   l'anneau commun et son halo ; Échap sur les trois panneaux ouvrables.

## Options écartées

- **Anneau plus clair ou plus épais, sans halo** : aucune couleur ne fait 3:1 à la fois sur
  le blanc et sur le noir derrière un fond translucide ; seul un voisin opaque fixe le contraste.
- **Couleurs en propriétés CSS posées depuis TypeScript** (comme `DASHBOARD_COLORS`) pour tous
  les panneaux : vingt feuilles à reprendre et des liaisons de style sur chaque hôte, pour le
  même résultat que la lecture du SCSS par le test.
- **Piège de focus dans les panneaux** : ce ne sont pas des dialogues modaux ; le focus doit
  pouvoir en sortir vers la scène et les raccourcis de caméra.

## Conséquences

- Captures inchangées : l'interface est absente en mode capture et rien n'a le focus.
- Un nouveau contrôle a l'anneau sans rien écrire ; un nouveau panneau doit prendre ses
  couleurs dans les jetons, sous peine d'échec du test de contraste.
- Le parcours e2e coûte une image par appui sur Tab (~1 s en rendu logiciel) : il tourne en
  800 × 600 et consigne le focus par `focusin` plutôt qu'en relisant la page à chaque appui
  (`docs/PIEGES.md`).
- Le tableau de bord garde ses couleurs propres (`DASHBOARD_COLORS`, #256) ; leurs anneaux
  sont vérifiés contre le halo par le même test.
