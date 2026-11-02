# 0095 — Nouvelles espèces d'eau douce, lot 3

- Statut : acceptée
- Date : 2026-11-02
- Auteur : Dev, cycle 129, issue #391 (épopée v1.7 « Lisibilité et pièce complète »)

## Contexte

Suite des lots 1 (ADR 0070) et 2 (ADR 0090). Mathis veut « beaucoup plus d'espèces »,
réalistes et légales en France ; la rétro #381 demande que toute nouvelle créature soit
reconnaissable en capture `front`. Contraintes inchangées : bac tropical à 24 °C (ADR 0067), pH
7 de l'eau neuve (ADR 0057) qui **baisse** ensuite avec la charge, bac par défaut identique à
l'octet (graine 42), palette commune seulement (ADR 0039), environ 600 lignes.

## Décision

1. **Trois poissons**, parmi les sept candidats de l'issue :

   | Espèce       | Nom scientifique         | Comportement (mécanismes existants)                                                   | Silhouette et couleurs                                                             |
   | ------------ | ------------------------ | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
   | Tétra braise | _Hyphessobrycon amandae_ | banc serré, milieu et haut (`depth` 40–85 %), le plus petit en vrai (2 cm SL)         | gabarit le plus court (9 colonnes), orange rougeoyant                              |
   | Molly        | _Poecilia sphenops_      | haut de la colonne (`depth` 45–90 %), sans banc, curieux au tapotement                | grand corps long et haut (3 voxels d'épaisseur), entièrement noir, œil clair       |
   | Gourami miel | _Trichogaster chuna_     | **zone nouvelle** : sous la surface (`depth` 70–96 %), montée à l'air toutes les 75 s | ovale haut orange miel, gorge et anale sombres, dorsale jaune, ventrales filaments |

   **Taille du modèle du tétra braise** : 0,056, juste au-dessus du rasbora (0,055), et non
   plus petit que tous : le mode immersif se peuple des trois plus petites espèces nageuses
   (ADR 0094, `smallSwimmers`) ; un modèle plus court aurait changé sa population par défaut
   et ses captures (voir `docs/PIEGES.md`). Le gabarit court (9 colonnes) le garde trapu et
   distinct du néon.

   Trois silhouettes nouvelles (`braise`, `molly`, `miel`) ; le gourami miel nage plus haut que
   toute autre espèce du bac (test), sous les plantes flottantes que réclame sa fiche.

   **Écartés** pour ce lot :
   - _Endler_ : trop proche du guppy mâle à l'échelle des captures et s'hybride avec lui
     (non sourcé, ADR 0090) ; inchangé.
   - _Corydoras bronze_ (_Corydoras aeneus_) : même gabarit et même zone que le corydoras
     poivré du bac par défaut ; seule la couleur le distinguerait en capture.
   - **Crevette cerise** et **néritine** : mêmes raisons que l'ADR 0090 (maladie des points
     blancs, proies du koï, démarche, modèle non poisson : nouveau comportement lourd). Ils
     restent pour un lot « invertébrés » dédié.

2. **Bac tropical** : les trois s'ajoutent à `Environment.species` après le lot 2 (panneau,
   wiki, cohabitation), **pas** à sa population de départ. Le monde par défaut et ses captures
   ne changent pas ; le panneau et `data-aqfish-population` comptent trois lignes de plus
   (effectif 0).
3. **Valeurs** : tailles (longueur standard), températures tolérées, groupes, volumes, aliments
   et mises en garde viennent des fiches Seriously Fish consultées le 2026-11-02
   (`hyphessobrycon-amandae`, `poecilia-sphenops`, `trichogaster-chuna` ; références dans
   `sim/species-sheet.ts` et `sim/species-care.ts`). Températures tolérées : 20–28 °C, 21–28 °C
   et 22–27 °C, toutes contenant 24 °C. Le reste est marqué **approximation de jeu** :
   températures préférées (choisies pour contenir 24 °C), régimes du tétra braise et du gourami
   miel (« micro-prédateur », « insectivore probable » : rangés en `carnivore`), groupe minimal
   du molly (3 : « plusieurs femelles par mâle », sans effectif chiffré), plages de pH de la
   simulation, réactions au tapotement, paramètres de nage et taille des modèles.
4. **pH** : le molly réclame 7,0–8,5 et une eau très dure (15–30 °dGH). Comme le platy (ADR
   0090), la borne basse tolérée est abaissée à 6,8 (approximation de jeu) pour qu'il ne souffre
   pas dès que l'eau neuve baisse ; la fiche affiche l'exigence réelle et le déconseille en bac
   communautaire ordinaire, comme Seriously Fish. Le tétra braise donne 5,0–7,0 : borne haute
   tolérée relevée à 7,2 pour l'eau neuve à 7.
5. **Compatibilité** (ADR 0055, règle inchangée) : tétra braise et molly `paisible`. Le gourami
   miel est `territorial` : la fiche décrit des dominants qui chassent leurs rivaux et demande
   d'éviter les espèces territoriales. **Paire incompatible nouvelle** : gourami miel et gourami
   nain (`territorial`) ; koï avec chacune (prédateur). **Paires compatibles** : tétra braise et
   molly avec toutes les espèces du bac tropical (le molly, plus grand, n'est pas prédateur :
   règle inchangée) ; gourami miel avec toutes sauf le gourami nain.
6. **Statut légal** : `a-verifier`, confiance « non vérifié », comme les lots précédents :
   aucune ligne de l'annexe 2 de l'arrêté de 2018 n'a été lue, ni la liste des espèces exotiques
   envahissantes de l'Union. Origine : la fiche du molly dit les sujets « produits en masse en
   Extrême-Orient et en Europe de l'Est », celle du gourami miel « presque tous produits
   commercialement » ; celle du tétra braise ne dit rien de l'origine.
7. **Couleurs** : palette commune seulement (`tritonOrange`, `koiRouge`, `koiOrange`, `koiOr`,
   `poissonJaune`, `koiNoir`, `rocheSombre`, `koiBlanc`). Aucune n'est dans le bac par défaut.

## Non vérifié

- **Couleurs du tétra braise** : la fiche ne décrit pas la robe ; l'orange rougeoyant suit le
  nom commercial (« ember », « fire »), pas une description sourcée.
- **Gourami miel** : la robe choisie est celle du mâle en livrée (fiche) ; la femelle, brune à
  bande sombre, n'est pas modélisée. Groupe : la fiche se contredit (« au mieux en couple »,
  puis « 4 à 6 au moins ») ; le couple est retenu.
- **Molly** : « forme noire » du commerce ; certaines variétés viennent d'hybrides avec
  _P. latipinna_, l'identité spécifique des sujets vendus n'est donc pas garantie.
- Zones de nage du molly et du gourami miel : non dites par les fiches (couvert de surface et
  accès à l'air pour le gourami) ; approximations de jeu.
- Statut légal en France : à vérifier auprès de la DDPP.

## Conséquences

- Le bac tropical propose quatorze espèces ; les tests qui listaient `…,otocinclus:0` ou les
  espèces ajoutables sont mis à jour (trois effectifs nuls de plus).
- Le mélange gourami nain + gourami miel affiche un avertissement de cohabitation et les deux
  s'évitent (`RIVAL_MIN_DISTANCE`), sans code nouveau.
- Suite : lot « invertébrés » (notion d'invertébré : maladie, proies, démarche) ; corydoras
  bronze si une variante de robe du corydoras devient lisible en capture.
