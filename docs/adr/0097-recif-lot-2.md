# 0097 — Récif, lot 2 : chromis vert, gobie à crevette jaune, gramma royal

- Statut : acceptée
- Date : 2026-11-03
- Auteur : Dev, cycle 134, issue #403 (épopée v1.8 « Aquarium vivant et accessible »)

## Contexte

Le récif n'avait que deux espèces (poisson-clown, chirurgien bleu, ADR 0041 et 0042) contre
quatorze au bac tropical. La rétro #399 demande d'élargir sa communauté avec des silhouettes
bien distinctes, reconnaissables en capture `front`. Contraintes : récif à 26 °C et pH 8,2 de
l'eau neuve, récif par défaut identique à l'octet (graine 42), palette commune ou tons du
récif seulement (ADR 0039), environ 600 lignes, mécanismes existants seulement.

## Décision

1. **Trois poissons**, un par étage du récif :

   | Espèce                 | Nom scientifique        | Comportement (mécanismes existants)                               | Silhouette et couleurs                                                              |
   | ---------------------- | ----------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
   | Chromis vert           | _Chromis viridis_       | banc au-dessus des coraux, sous les reflets (`depth` 45–75 %)     | ovale court, vert pomme (`vegetationLumineuse`, `grenouilleVert`), caudale fourchue |
   | Gobie à crevette jaune | _Cryptocentrus cinctus_ | au ras du sable (`depth` < 8 %, rares remontées), solitaire, lent | long et bas, 3 voxels d'épaisseur, jaune, dos or, points bleus, deux dorsales       |
   | Gramma royal           | _Gramma loreto_         | bas et milieu du bac (`depth` 12–45 %), solitaire, `territorial`  | avant violet (`corailViolet`, ton du récif), arrière et nageoires jaunes            |

   Trois silhouettes nouvelles (`chromis`, `gobie`, `gramma`). **Invertébré reporté** :
   crevette nettoyeuse, oursin ou étoile demandent un modèle et une démarche non poissons
   (nouveau comportement lourd, comme la crevette cerise de l'ADR 0095) ; le terrier partagé
   avec une crevette _Alpheus_ du gobie n'est pas modélisé non plus.

   **Écartés** : demoiselle bleue (_Chrysiptera_), bleue sur l'eau bleue et proche du
   chirurgien ; gobie néon (_Elacatinus_), bande bleue sur l'eau bleue.

2. **Récif** : les trois s'ajoutent à `Environment.species` après le clown et le chirurgien
   (panneau, wiki, cohabitation, avertissements d'ajout), **pas** à sa population de départ :
   le récif par défaut et ses captures restent identiques à l'octet (vérifié par `cmp` sur les
   12 captures `recif-*` et du bac tropical, `main` contre la branche).
3. **Couleurs** : premier essai du chromis en `eauClaire` / `eauTresClaire` (verts d'eau) :
   en capture, il se confondait avec les reflets verts de la surface du récif. Il passe au vert
   pomme et vert grenouille de la palette commune, et nage sous 75 % de la hauteur d'eau.
4. **Tailles des modèles** (approximations de jeu, comme le clown agrandi de l'ADR 0041) :
   chromis 0,085, gramma 0,1, gobie 0,105, tous sous le chirurgien (0,11). Le gramma à 0,088
   se perdait en vue de face. **Mode immersif du récif** (ADR 0094, trois plus petites espèces
   nageuses) : il passe de clown + chirurgien à **chromis, clown, gramma**. Conséquence
   assumée : plus de variété ; le chirurgien n'y figure plus.
5. **Valeurs sourcées** (consultées le 2026-11-03) : FishBase (`fishbase.se/summary/5679`,
   `7208`, `5281`) pour les tailles (10 cm LT, 10 cm LS, 8 cm LT) et les températures du gobie
   (22–28 °C) et du gramma (22–27 °C) ; Wikipédia en anglais (secondaire) pour le régime du
   chromis (phytoplancton, zooplancton, algues), celui du gramma (planctonophage), le volume du
   gramma (30 gallons, environ 114 L) et sa territorialité ; Proaquatix (secondaire) pour le
   terrier, la crevette et l'alimentation en bac du gobie. **Approximations de jeu** :
   températures préférées (25–27 °C), température tolérée du chromis (FishBase n'en donne
   pas : 24–28 °C), régime du gobie (`carnivore`), groupe du chromis (5 : « petits groupes de
   nombre impair »), volumes du chromis (200 L) et du gobie (100 L), plages de pH (celles du
   chirurgien), réactions au tapotement (fuite), paramètres de nage.
6. **Compatibilité** (ADR 0055, règle inchangée) : chromis et gobie `paisible` ; gramma
   `territorial` (« délimite des territoires dans les roches », agressif en petit bac).
   **Paire incompatible nouvelle** : gramma et poisson-clown (deux territoriaux). La règle de
   jeu est plus sévère que la pratique : le mélange est courant en grand bac ; noté ici, la
   règle ne change pas dans ce lot. **Paires compatibles** : chromis et gobie avec tout le
   récif ; gramma et chirurgien.
7. **Milieu** : les trois sont refusées dans un bac d'eau douce (et l'inverse) par le contrôle
   `milieu` du transfert (`sim/tank-transfer.ts`), message « Les … ne vivent pas dans … » ;
   elles n'apparaissent dans aucun catalogue d'eau douce. Pas de points blancs (maladie d'eau
   douce, `catchesIch`).
8. **Statut légal** : `a-verifier`, confiance « non vérifié » : ni l'annexe 2 de l'arrêté de
   2018 ni les annexes CITES n'ont été lues pour ces espèces. Origine : FishBase indique que
   le gramma a été élevé en captivité (« préférer ces sujets ») ; le gobie existe en élevage
   (Proaquatix, sans confirmation de l'origine des sujets vendus) ; rien pour le chromis.

## Non vérifié

- Inscription ou non aux annexes CITES et à l'annexe 2 : non lue ; à vérifier (DDPP).
- Couleur exacte : la forme jaune du gobie seulement (il existe une forme grise) ; le vert du
  chromis est ramené à la palette, sans son reflet bleuté.
- Température tolérée du chromis et volumes du chromis et du gobie : aucune source lue.
- Lisibilité : le gobie (jaune) et l'arrière du gramma (jaune) partagent une couleur ; ils
  se distinguent par la forme et l'étage, pas par la teinte. À juger par QA.

## Conséquences

- Le récif propose cinq espèces ; `data-aqfish-population` du récif compte trois effectifs
  nuls de plus (`…,chromis:0,gobie:0,gramma:0`), et les tests qui listaient ses espèces ou
  celles « d'ailleurs » sont mis à jour.
- Captures `recif-three-quarter-lot2` et `recif-front-lot2` ajoutées.
- Suite : lot « invertébrés » (crevette nettoyeuse, oursin) ; règle de cohabitation propre au
  récif si le verdict gramma/clown gêne.
