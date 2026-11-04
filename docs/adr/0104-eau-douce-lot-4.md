# 0104 — Nouvelles espèces d'eau douce, lot 4 : xipho, crevette cerise, néritine zèbre

- Statut : acceptée
- Date : 2026-11-04
- Auteur : Dev, cycle 142, issue #425 (épopée v1.9 « Enrichir et partager »)

## Contexte

Suite des lots 1 (ADR 0070), 2 (ADR 0090) et 3 (ADR 0095). L'issue #425 demande trois espèces
d'eau douce tropicale, dont au moins un invertébré et au moins une silhouette absente des 17
espèces d'eau douce actuelles, reconnaissables en capture `front` (#405, #424), sur les
mécanismes existants : marcheurs du fond et contournement des obstacles de la crevette nettoyeuse
(ADR 0103). Contraintes inchangées : bac tropical à 24 °C (ADR 0067), pH 7 de l'eau neuve qui
baisse ensuite (ADR 0057), bac par défaut identique à l'octet (graine 42), palette commune
(ADR 0039).

## Décision

1. **Trois espèces**, parmi les six candidats de l'issue :

   | Espèce          | Nom scientifique                | Comportement (mécanismes existants)                                                                | Silhouette et couleurs                                                                    |
   | --------------- | ------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
   | Xipho           | _Xiphophorus hellerii_          | nageur de pleine eau et du haut (`depth` 35–85 %), sans banc, fuit au tapotement                   | **épée** : lobe bas de la caudale prolongé, jaune bordé de noir ; corps vert, bande rouge |
   | Crevette cerise | _Neocaridina davidi_            | marcheuse du fond (`walker`, 85 % marche, 15 % nage brève, jamais de remontée), contourne le décor | crevette rouge, ventre rose, pattes, antennes relevées                                    |
   | Néritine zèbre  | _Neritina natalensis_ « zèbre » | marcheuse du fond qui **ne nage jamais** (poids `marche` seul), très lente, contourne le décor     | coquille ronde et haute jaune or rayée de noir, pied beige, tentacules                    |

   Les trois silhouettes (`xipho`, `cerise`, `neritine`) sont absentes des 17 espèces d'eau douce
   d'avant (test). Le xipho est le seul nageur du bac à épée ; la néritine est le premier
   escargot du jeu.

   **Écartés** pour ce lot :
   - _Endler_ : trop proche du guppy mâle à l'échelle des captures (ADR 0090, 0095), inchangé.
   - _Barbu de Sumatra_ et _betta_ : leur intérêt dans l'issue tient à leur incompatibilité
     mutuelle (nageoires mordues) ; avec un seul des deux, la paire n'existe pas, et les deux
     ensemble ne laissaient qu'une place, sans invertébré exigé par l'issue. Ils restent
     candidats d'un lot suivant, ensemble.

2. **Invertébrés** : la crevette cerise et la néritine reprennent le mécanisme des marcheurs du
   fond avec `walker.avoidsObstacles` (ADR 0103), sans code de simulation nouveau. La néritine
   a des poids `{ marche: 1, nage: 0, remontee: 0 }` (déjà admis par `validateSpecies`). Toutes
   deux entrent dans `INVERTEBRATES` (sel et médicament refusés ; FishKeeper : « intolérantes
   aux médicaments à base de cuivre »), ne prennent pas les points blancs (marcheuses, règle
   inchangée), n'ont ni banc, ni recherche de granulés, ni réaction au tapotement, ni repos de
   nuit (comme l'axolotl et la crevette nettoyeuse). L'escalade des vitres par la néritine et le
   broutage des algues ne sont pas modélisés (hors périmètre, issue « Comportements plus
   riches »).
3. **Tailles des modèles** (approximations de jeu, pour la lisibilité en vue de face, #424) :
   xipho 0,12 (comme le molly, le plus long nageur du bac avec lui, plus court que le koï ;
   l'épée s'ajoute derrière) ; crevette cerise 0,1 pour 3 cm en vrai ; néritine 0,08 pour
   2,5 cm. `clearance` des marcheuses égale environ la demi-hauteur du modèle, sinon les pattes
   et le pied s'enfoncent dans le sable (`docs/PIEGES.md`). Les deux marcheuses restent hors du
   mode immersif (`smallSwimmers` ne prend que les nageurs) ; le xipho, plus grand que les trois
   plus petits nageurs, aussi : population immersive inchangée (test).
4. **Bac tropical** : les trois s'ajoutent à `Environment.species` après le lot 3 (panneau,
   wiki, cohabitation), **pas** à sa population de départ : le monde par défaut et ses captures
   ne changent pas ; le panneau et `data-aqfish-population` comptent trois lignes de plus
   (effectif 0).
5. **Valeurs sourcées** (consultées le 2026-11-04) :
   - xipho : FishBase (`fishbase.org/summary/3231`) pour la taille (14 cm de longueur totale
     du mâle), la température (22–28 °C), le pH (7–8), le régime (vers, crustacés, insectes,
     végétaux : `omnivore`) et le statut de « nuisible potentiel » hors de son aire ; FishKeeper
     (`fishkeeper.co.uk/fish/freshwater/livebearers/swordtail`) pour le bac de 90 cm de long au
     moins, la rivalité des mâles, le rapport des sexes, la compatibilité « sans très petites
     espèces » et l'origine d'élevage de la plupart des sujets vendus ;
   - crevette cerise : FishKeeper (`…/miscellaneous/cherry-shrimp`) pour la taille (3 cm), la
     température (12–28 °C), le pH (6–8), le régime, la vie en colonie, l'intolérance au cuivre
     et aux nitrates, et « les compagnons plus grands la prennent pour un en-cas » ;
   - néritine : FishKeeper (`…/miscellaneous/zebra-snail`) pour la taille (2,5 cm), la
     température (22–26 °C), le pH (7,2–8,2), le régime, l'intolérance au cuivre, les œufs qui
     n'éclosent pas en eau douce et la tendance à sortir de l'eau.

   **Approximations de jeu** : températures préférées (choisies pour contenir 24 °C), groupes
   minimaux (xipho 3, d'après « un mâle pour plusieurs femelles » ; crevette 6, « au mieux en
   grandes colonies » sans effectif chiffré ; néritine 1), volumes (aucune source lue n'en
   chiffre : xipho 100 L pour un bac de 90 cm, crevette 20 L, néritine 30 L), plages de pH de la
   simulation, réactions au tapotement, rythmes, paramètres de nage et de marche, tailles des
   modèles.

6. **pH** : comme le platy et le molly, la borne basse tolérée du xipho (7) et de la néritine
   (7,2) est abaissée à 6,8 pour que l'eau neuve à 7, qui baisse avec la charge, ne les fasse
   pas souffrir d'emblée ; la fiche affiche l'exigence réelle (eau dure et alcaline).
7. **Compatibilité** (ADR 0055) : xipho, crevette cerise et néritine `paisible`. La règle des
   prédateurs (tempérament `predateur` et taille plus petite) ne couvre pas un poisson paisible
   qui mange une crevette naine : ajout de **`EXTRA_PREDATORS`** (`sim/compatibility.ts`), table
   des proies et des espèces non prédatrices qui les mangent quand même, avec verdict
   `predateur`, symétrique. Une seule entrée : `cerise: ['xipho']` (FishKeeper, voir 5 ; FishBase
   compte les crustacés dans son régime). Rien ne change pour les couples existants (test des
   lots précédents inchangés).
   - **Paire incompatible nouvelle** : xipho et crevette cerise ; koï avec chacune (prédateur,
     règle inchangée).
   - **Paires compatibles** : crevette cerise avec les petits poissons (néon, rasbora, tétra
     braise, otocinclus, corydoras…) ; néritine avec tout le bac tropical ; xipho avec tout le
     bac sauf la crevette cerise.
   - L'évitement des espèces incompatibles (`RIVAL_MIN_DISTANCE`) ne concerne que les nageurs :
     le xipho ne poursuit pas la crevette, seul l'avertissement d'ajout le signale.
8. **Statut légal** : `a-verifier`, confiance « non vérifié », comme les lots précédents : ni
   l'annexe 2 de l'arrêté de 2018 ni la liste des espèces exotiques envahissantes de l'Union
   n'ont été relues pour ces espèces. Notes : xipho et crevette « ne jamais relâcher » (FishBase
   signale des effets écologiques néfastes du xipho introduit) ; néritine probablement prélevée
   dans la nature (elle ne se reproduit pas en eau douce), origine non vérifiée.
9. **Couleurs** : palette commune seulement (`vegetationClaire`, `grenouilleVert`, `koiRouge`,
   `neonRouge`, `poissonRose`, `poissonJaune`, `koiOr`, `koiNoir`, `sable`, `sableSombre`).

## Non vérifié

- **Molly et gouramis** face à la crevette cerise : non évalués (aucune source lue) ; ils
  restent compatibles par la règle de jeu. À compléter dans `EXTRA_PREDATORS` si une source le
  dit.
- **Robe du xipho** : forme verte « proche du sauvage » (FishKeeper) ; les formes rouges du
  commerce ne sont pas modélisées. L'épée est celle du mâle ; la femelle n'en a pas.
- **Néritine** : l'identité spécifique exacte des « néritines zèbres » vendues n'est pas
  vérifiée (FishKeeper écrit « _N. natalensis_ sp. zebra »).
- Volumes minimaux : aucun chiffré par les sources lues.
- Statut légal en France : à vérifier auprès de la DDPP.
- Lisibilité : à juger par QA sur `front-eau-douce-lot4` et `three-quarter-eau-douce-lot4`.

## Conséquences

- Le bac tropical propose dix-sept espèces ; les tests qui listaient `…,miel:0` ou les espèces
  ajoutables sont mis à jour (trois effectifs nuls de plus).
- `compatibility` consulte `EXTRA_PREDATORS` : une future proie hors de la règle de taille
  (alevins, autres invertébrés) s'y ajoute sans changer la règle.
- Captures `three-quarter-eau-douce-lot4` et `front-eau-douce-lot4` ajoutées.
