# 0066 — Wiki des espèces : modèle de vue, place à l'écran, lots

- Statut : acceptée
- Date : 2026-10-28
- Auteur : Dev, cycle 88, issue #287 (lot 1/2 de l'idée #252)

## Contexte

Mathis veut un wiki des espèces (#252) : chercher une espèce, voir ce dont elle a besoin, et
l'ajouter au bac. Les fiches existent déjà (ADR 0058, `sim/species-sheet.ts`), mais
uniquement repliées dans le panneau « Population » de « Réglages », une espèce de
l'environnement courant à la fois. L'idée, estimée L, est découpée en deux lots.

## Décision

1. **Modèle de vue pur dans `sim/species-wiki.ts`**, testé sans DOM :
   - `searchKey` / `matchesWikiSearch` : clé en minuscules, sans signes diacritiques (`NFD`
     puis suppression de `\p{M}`), blancs, tirets et apostrophes ramenés à une espace ; une
     espèce correspond si la clé est contenue dans son nom affiché, son nom scientifique, son
     singulier ou son pluriel (`SPECIES_LABELS`). Recherche vide : tout.
   - `wikiLists(environnement, effectifs, recherche)` : `present` (effectif fini > 0, ordre de
     l'environnement, puis, cas anormal montré tel quel, les espèces d'ailleurs) et
     `addable` (espèces de l'environnement d'effectif nul). Une espèce n'est que dans une
     partie.
   - `wikiSheet(id)` : nom, nom scientifique, `sheetRows(id)` et `sheetNotes(id)`. Aucune
     valeur n'est recopiée : la fiche du wiki et celle du panneau sont deux vues des mêmes
     lignes, statut de sourçage compris.
2. **Composant `ui/species-wiki/`** (standalone, `OnPush`, signaux), entrées et sorties
   comme `ui/control-panel` : environnement, effectifs, maxima, volume ; sortie
   `populationChanged`, branchée sur `AquariumHost.setPopulation`. « Ajouter au bac » demande
   **un individu de plus**, comme « + » ; les avertissements d'ajout (#237) s'affichent dans
   la fiche, recalculés sur le bac courant. Échap ferme la fiche (retour à la liste, focus
   sur l'espèce), puis le wiki (focus sur le bouton).
3. **Place à l'écran** (mesurée à 1280, 900, 768, 640, 390 et 320 px de large) :
   - bouton « Wiki » **en bas à droite** au-delà de 899 px, à côté de la barre des vues ;
     en dessous, la barre (660 px, ou deux lignes sur téléphone) ne laisse plus de place à
     droite : le bouton rejoint la **ligne des boutons du haut**, après « Réglages » (à
     145 px sous 481 px, où il reste 47 px avant « Commandes » replié à 320 px : texte en
     12 px, rembourrage de 5 px) ;
   - panneau à droite sous la ligne des boutons du haut (sous le tableau de bord entre 640 et
     1099 px, comme « Commandes »), pleine largeur sous 640 px, au-dessus de la barre.
4. **Exclusif avec tous les panneaux, à toute largeur** : le wiki occupe la droite comme
   « Commandes », et toute la largeur sur téléphone. L'ouvrir replie « Réglages » et
   « Commandes » (repli non mémorisé) et quitte l'éditeur de décor ; ouvrir l'un d'eux le
   ferme (`App`).

## Lots

- **1/2 (ce cycle)** : bouton, recherche, liste en deux parties, fiche, « Ajouter au bac ».
- **2/2** : alimentation détaillée et types de nourriture, cohabitation avec ses raisons,
  comparaison des besoins avec les valeurs du bac (température, pH, volume). Ces données
  s'ajoutent à `sim/species-sheet.ts` (même règle de sourçage) et au modèle de vue, pas au
  composant. Pages « produits et traitements » et « maladies » ensuite.

## Options écartées

- **Réutiliser la fiche du panneau « Population »** dans le wiki : elle vit dans
  `ui/control-panel`, dont la feuille de style dépasse déjà son budget d'avertissement.
- **Wiki toujours en bas à droite** : sous 900 px, il recouvrait la barre des vues ou sortait
  de l'écran (320 px : barre de 20 à 300 px).
- **« Ajouter » au groupe minimal** : plus pédagogique, mais différent du « + » du panneau ;
  l'avertissement « groupe trop petit » dit déjà ce qu'il faut faire.

## Conséquences

- Les captures d'interface (tableau de bord, panneaux) montrent désormais le bouton « Wiki » ;
  les captures du contrat (mode capture, sans interface) ne changent pas.
- Deux nouvelles captures : `three-quarter-wiki-fiche` (1280 × 720) et
  `telephone-wiki-fiche` (390 × 844).
- `e2e/cadrage-panneaux.spec.ts` contrôle le panneau (fiche la plus longue) et le bouton.
