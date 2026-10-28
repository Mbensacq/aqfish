# 0068 — Wiki des espèces, lot 2/2 : soins, comparaison avec le bac, pages transversales

- Statut : acceptée
- Date : 2026-10-28
- Auteur : Dev, cycle 91, issue #291 (lot 2/2 de l'idée #252, suite de l'ADR 0066)

## Contexte

Le lot 1/2 (ADR 0066) a livré la recherche, la liste et la fiche du wiki. Le lot 2/2 ajoute
l'alimentation, la cohabitation avec ses raisons, la comparaison des besoins de l'espèce avec
l'eau du bac courant, et deux pages transversales (produits et traitements, maladies), tirées
de `docs/SOINS.md` et `docs/ESPECES.md`, sans valeur inventée.

## Décision

1. **Deux modules purs de plus dans `sim/`**, plutôt que d'allonger `sim/species-sheet.ts`
   (490 lignes) :
   - `sim/species-care.ts` : alimentation par espèce (`FeedingGuide`, même règle de sourçage
     que les fiches, ADR 0058), cohabitation (`cohabitation`), comparaison (`tankComparison`) ;
   - `sim/care-guide.ts` : entrées des deux pages, chacune avec la référence que
     `docs/SOINS.md` ou `docs/ESPECES.md` indique (`docs/SOINS.md § 5.1 (Merck ; …)`).
   Le modèle de vue `sim/species-wiki.ts` les regroupe (`wikiCare`) ; le composant ne fait
   qu'afficher.
2. **Alimentation** : le type de nourriture vient de `docs/ESPECES.md` quand il le cite
   (corydoras, guppy, chirurgien, triton ; sonneur : anapsid.org, secondaire) ; sinon, le
   régime avec « aliments précis non vérifiés ». Fréquence et quantité prudente sont des
   **approximations de jeu** (conseils prudents d'usage, aucune source consultable pendant le
   cycle : le réseau des agents n'atteint que les registres de paquets). La zone de
   nourrissage est lue de la simulation (`SpeciesDefinition.feeding`, par tiers de la hauteur
   d'eau) et marquée approximation de jeu.
3. **Cohabitation** : aucun verdict recalculé, tout vient de `compatibility` (ADR 0055) ; la
   raison est écrite d'après la règle qui a joué (prédateur nommé, deux territoriales, ou
   caractères des deux espèces). Trois groupes : déconseillées (où qu'elles vivent : ce sont
   celles de la ligne « À éviter avec »), compatibles **qu'un environnement du jeu accueille
   avec l'espèce**, et « autres milieux » en une ligne. Un néon « compatible » avec un
   poisson-clown n'a pas de sens pour un débutant : eau douce contre eau de mer.
4. **Comparaison avec le bac : la marge est l'écart entre plage préférée et plage tolérée.**
   `tankFit(valeur, préférée, tolérée)`, bornes comprises : « dans la plage » dans la plage
   préférée, « limite » dans la tolérée seulement, « hors plage » au-delà ; une valeur non
   finie (relevé inconnu) est « hors plage ». Pas de marge chiffrée en plus : les fiches ont
   déjà deux plages par paramètre (température, pH), la jauge pH du tableau de bord suit la
   même logique (idéal, toléré, hors plage) et la santé s'use hors de la plage tolérée
   (`sim/wellbeing.ts`). L'écart affiché est la distance à la plage préférée, au dixième.
   Le composant reçoit la température et le pH du relevé (`AquariumHost.water()`, arrondis
   au dixième) ; il n'y a pas de comparaison du volume, déjà couvert par les avertissements
   d'ajout (#237).
5. **Pages transversales** : boutons « Produits et traitements » et « Maladies » sous la
   liste (groupe « Guides »), page à la place de la liste, « Retour à la liste » et Échap
   reviennent à la liste (focus sur le bouton de la page), un second Échap ferme le wiki. Le
   rappel « Ce jeu n'est pas un avis vétérinaire » ouvre les deux pages
   (`docs/SOINS.md`, recommandation 5). Ce qui n'est pas vérifié dans les documents
   (symptômes des poux, des champignons, de la maladie du néon) est écrit « non vérifié ».
6. **Ordre de la fiche** : comparaison avec le bac d'abord (ce qui change d'un bac à
   l'autre), puis besoins, alimentation, cohabitation ; le panneau défile.

## Options écartées

- **Marge fixe autour de la plage tolérée** (± 1 °C, ± 0,2) : un troisième seuil sans source,
  qui contredirait la jauge pH et la santé.
- **Compatibilité « en dur » par couple dans le wiki** : une seconde table divergerait de
  l'ADR 0055.
- **Pages dans un autre panneau** : le wiki est déjà exclusif avec les autres panneaux
  (ADR 0066) ; une page de plus dans le même panneau garde Échap et le focus cohérents.

## Conséquences

- Captures `three-quarter-wiki-fiche` et `telephone-wiki-fiche` changées (section
  « Comparaison avec le bac ») ; les autres captures ne montrent pas le wiki ouvert.
- Les données de soins se corrigent dans `sim/species-care.ts` et `sim/care-guide.ts`, avec
  la source, comme les fiches.
