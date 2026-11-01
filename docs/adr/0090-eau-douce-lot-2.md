# 0090 — Nouvelles espèces d'eau douce, lot 2

- Statut : acceptée
- Date : 2026-11-01
- Auteur : Dev, cycle 121, issue #362 (épopée v1.6 « Soigner pour de vrai »)

## Contexte

Suite du lot 1 (ADR 0070, quatre espèces). Mathis veut « beaucoup plus d'espèces », réalistes et
légales en France ; le lot 2 vise des poissons de communauté faciles et, si le mécanisme
existant le permet sans nouveau comportement lourd, un premier invertébré. Contraintes
inchangées : bac tropical à 24 °C (ADR 0067) et pH 7 de l'eau neuve (ADR 0057), qui **baisse**
ensuite avec la charge ; bac par défaut identique à l'octet (graine 42) ; palette commune
seulement (ADR 0039) ; environ 600 lignes.

## Décision

1. **Quatre poissons**, parmi les sept candidats de l'issue :

   | Espèce           | Nom scientifique                             | Comportement (mécanismes existants)                                       | Silhouette et couleurs                                                          |
   | ---------------- | -------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
   | Platy            | _Xiphophorus maculatus_                      | pleine eau (`depth` 20–80 %), sans banc                                   | court et haut, rouge, nageoires noires                                          |
   | Danio zébré      | _Danio rerio_                                | banc rapide dans la moitié haute (`depth` 50–95 %), le plus rapide du bac | fin et long, deux bandes bleues et une claire                                   |
   | Ancistrus commun | _Ancistrus cirrhosus_ (voir « Non vérifié ») | fond (`depth` 6 %), lent, sans banc, actif la nuit (`DIURNAL`)            | aplati, large de tête vu de dessus, brun piqueté, barbillons, pectorales à plat |
   | Otocinclus       | _Otocinclus macrospilus_                     | groupe lâche dans le tiers bas (`depth` 30 %)                             | petit, beige, bande noire du museau à la caudale                                |

   Deux espèces de fond (ancistrus, otocinclus), une de pleine eau, une de surface : quatre
   silhouettes que le test de modèles distingue (rapport longueur/hauteur, épaisseur vue de
   dessus).

   **Écartés** pour ce lot :
   - _Endler_ (_Poecilia wingei_) : silhouette et couleurs trop proches du guppy mâle à
     l'échelle des captures ; il s'hybride avec le guppy (non vérifié, à sourcer).
   - **Crevette cerise** (_Neocaridina_) et **néritine** : les invertébrés demandent plus que
     des tables. La maladie des points blancs (ADR 0088) touche tout nageur d'eau douce
     (`catchesIch`) ; un invertébré l'attraperait. Il faudrait une notion d'invertébré
     (exclusion de la maladie, du banc, des proies du koï), une démarche (pattes, pas de
     battement de queue) et un modèle non poisson : un « nouveau comportement lourd », hors du
     cadre posé par l'issue. Ils restent pour un lot dédié.

2. **Bac tropical** : les quatre espèces s'ajoutent à `Environment.species` après le lot 1
   (panneau, wiki, cohabitation), **pas** à sa population de départ. Le monde par défaut et ses
   captures ne changent pas ; le panneau et `data-aqfish-population` comptent quatre lignes de
   plus (effectif 0).
3. **Valeurs** : tailles (longueur standard), températures tolérées, groupes, volumes,
   aliments et mises en garde sont repris des fiches Seriously Fish consultées le 2026-11-01
   (`xiphophorus-maculatus`, `danio-rerio`, `ancistrus-cf-cirrhosus`, `otocinclus-macrospilus` ;
   références dans `sim/species-sheet.ts` et `sim/species-care.ts`). Toutes les températures
   tolérées contiennent 24 °C (danio : 18–25 °C ; les autres : 20 ou 21 à 26 °C). Le reste est
   marqué **approximation de jeu** : températures préférées (choisies pour contenir 24 °C),
   régimes du platy, du danio et de l'ancistrus (la fiche décrit les aliments, pas une
   catégorie), groupe minimal du platy (3 : « plusieurs femelles par mâle », sans effectif
   chiffré), plages de pH de la simulation, activité nocturne de l'ancistrus, tous les
   paramètres de nage et la taille des modèles.
4. **pH du platy** : Seriously Fish donne 7,0–8,2. La borne basse tolérée est abaissée à 6,8
   (approximation de jeu) : sans cela, le platy souffrirait dès les premières minutes, l'eau
   neuve à 7 baissant avec la charge. L'idéal reste 7–8 et la fiche signale l'eau dure.
5. **Compatibilité** (ADR 0055, règle inchangée) : les quatre sont `paisible`. L'ancistrus est
   « territorial envers ses congénères et les poissons de même forme » (Seriously Fish) ; la
   règle de jeu ne connaît que le territorial envers les autres territoriaux, ce qui le mettrait
   en conflit avec le gourami nain et le poisson-clown à tort : il reste paisible et la mise en
   garde est écrite dans la fiche. Paires incompatibles nouvelles : koï avec chacune
   (prédateur) ; l'axolotl (prédateur, plus long) avec le platy, le danio et l'otocinclus. Les
   quatre sont compatibles entre elles et avec les sept espèces du bac tropical.
6. **Statut légal** : `a-verifier`, confiance « non vérifié », comme les lots précédents :
   aucune ligne de l'annexe 2 de l'arrêté de 2018 n'a été lue pour ces espèces, ni la liste des
   espèces exotiques envahissantes de l'Union. L'otocinclus porte en plus « sujets presque tous
   prélevés dans la nature » (Seriously Fish) et la fiche le déconseille dans un bac neuf.
7. **Couleurs** : palette commune seulement. Le danio emprunte le bleu des néons (`neonBleu`)
   comme le gourami ; aucune nouvelle espèce n'est dans le bac par défaut, donc les mesures du
   banc de néons sur image ne voient aucun pixel de plus.

## Non vérifié

- **Identité de l'ancistrus** : Seriously Fish nomme l'ancistrus courant du commerce
  _Ancistrus_ sp. « 3 », vendu sous _A._ cf. _cirrhosus_ ; le jeu affiche _Ancistrus
  cirrhosus_ (le test de nommage impose un binôme), ce qui n'est pas une identification.
- **Otocinclus** : le commerce mêle plusieurs espèces du genre ; la fiche de référence est
  celle d'_O. macrospilus_.
- Activité nocturne de l'ancistrus : non dite par la fiche consultée.
- Taille adulte : longueur standard (SL) ; aucune longueur totale recoupée sur FishBase.
- Statut légal en France : à vérifier auprès de la DDPP.

## Conséquences

- Le bac tropical propose onze espèces ; les tests qui listaient
  `…,kuhli:0,gourami:0` ou comptaient sept lignes sont mis à jour (quatre effectifs nuls de
  plus, onze lignes).
- Le test des libellés admet désormais un pluriel invariable pour un nom terminé par -s, -x
  ou -z (« des otocinclus ») : correction d'un test trop strict pour le français.
- Suite : un lot « invertébrés » (crevette cerise, néritine) avec une notion d'invertébré
  (maladie, proies, démarche) ; l'endler avec une règle d'hybridation si elle est sourcée.
