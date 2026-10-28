# 0072 — Guide du débutant : dialogue modal, « Pourquoi ? » et première visite

- Statut : acceptée
- Date : 2026-10-28
- Auteur : Dev, cycle 95, issue #240 (épopée v0.12 « L'aquarium éducatif », #229)

## Contexte

L'issue #240 demande des aides pour débutant : alertes qui disent quoi faire, explications
« Pourquoi ? » (cycle de l'azote, acclimatation, eau trouble…), un « Guide du débutant » en
cinq étapes accessible depuis l'interface et ouvert à la première visite. Les alertes avec
cause et action existent déjà (`sim/dashboard-alerts.ts`, #260) : il ne faut pas en dupliquer
les seuils. Contraintes : rien de nouveau en mode capture (captures identiques à l'octet),
e2e existants intacts, accessibilité au clavier et au lecteur d'écran, aucune affirmation
biologique sans source ou sans la mention « simplification de jeu ».

## Décision

1. **Contenu pur** (`sim/beginner-help.ts`) : huit explications (`WhyTopicId`) et cinq
   étapes (`GUIDE_STEPS`), chacune avec un statut `FieldStatus` (`sim/species-sheet.ts`) :
   une source dans `docs/SOINS.md`, ou « Simplification de jeu » quand le texte décrit le
   modèle du jeu. `ALERT_TOPICS` relie chaque alerte à son explication ; un test vérifie que
   tout sujet d'alerte a son explication, que chaque
   état hors plage produit son alerte avec une action, et qu'aucun état normal n'en produit.
2. **Dialogue modal** (`ui/beginner-guide/`) : `role="dialog"`, `aria-modal`, titre par
   `aria-labelledby` ; focus dans le dialogue à l'ouverture (sur l'explication demandée,
   sinon sur le dialogue), Tab et Maj+Tab y tournent en boucle, Échap ou « Fermer » ou un clic
   sur le voile ferment, et le focus revient à l'élément qui l'avait ouvert. Les touches
   frappées dans le dialogue ne remontent pas au document : aucun raccourci de l'application
   (vues, `?`, Échap du wiki) ne s'y déclenche. Pas de `<dialog>` natif : `showModal` manque à
   jsdom (tests unitaires).
3. **État partagé** (`BeginnerGuideState`, service racine) : tout composant l'ouvre
   (`show(topic?)`). Accès : entrée « Guide du débutant » dans la liste « Guides » du wiki,
   bouton « Pourquoi ? » sous le détail d'une alerte (explication liée dépliée).
4. **Première visite** : `App` appelle `showOnFirstVisit()` hors mode capture. Clé versionnée
   `aqfish.guide-debutant.v1`, valeur `vu`, écrite à chaque ouverture ; stockage local avec
   repli en mémoire (`createFallbackStore`, ADR 0020). Passer à `.v2` rouvrirait le guide une
   fois chez tout le monde après un changement important.
5. **Tests de bout en bout** : `playwright.config.ts` démarre chaque test avec la clé déjà
   posée (`storageState`), sinon le dialogue couvrirait l'interface de tous les e2e existants ;
   `e2e/guide-debutant.spec.ts` repart d'un stockage vide pour tester la première visite.

## Options écartées

- **Bouton « Pourquoi ? » dans chaque jauge du cadre haut** : le cadre est mesuré au pixel
  près à 1280 × 720 et sur téléphone (#256, `e2e/cadrage-panneaux.spec.ts`) ; cinq boutons de
  plus l'auraient élargi. Les explications des jauges sont dans le guide, et « Pourquoi ? »
  apparaît sous chaque alerte, c'est-à-dire quand une jauge sort de sa plage. La table
  jauge → explication (`GAUGE_TOPICS`), restée sans usage, a été retirée au cycle 96 (#302) ;
  la recréer si l'on ajoute ces boutons.
- **Paramètre d'URL pour désactiver le guide en e2e** : il aurait fallu modifier chaque
  `page.goto` des ~70 fichiers ; le stockage de départ de Playwright suffit.
- **Panneau non modal** : le guide se lit d'un bout à l'autre ; un panneau de plus aurait dû
  entrer dans les règles d'exclusivité (#136, #287) à toutes les largeurs.

## Conséquences

- Mode capture inchangé : l'interface, guide compris, n'y est pas rendue.
- Un nouvel e2e qui vide le stockage (`storageState` vide, `localStorage.clear()`) verra le
  guide s'ouvrir : fermer le dialogue (Échap) ou poser la clé.
- Ajouter une alerte (`AlertId`) impose de compléter `ALERT_TOPICS` (erreur de typage sinon).

## Suivi (cycle 96, #302)

- **Source affichée** : le statut garde la référence complète (`docs/SOINS.md § 2 et § 14
  (UF/IFAS FA16)`) pour la traçabilité, mais l'écran montre « Source : documentation du projet
  (UF/IFAS FA16) » : `publicReference` (`sim/species-sheet.ts`) remplace tout chemin
  `docs/….md` et ses paragraphes, pour le guide comme pour les fiches, le wiki et le guide de
  soins.
- **Nitrates** : la simulation ne modélise pas leur absorption par les plantes ; le texte dit
  que, dans le jeu, seul un changement d'eau les fait baisser.
