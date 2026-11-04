# 0103 — Récif, lot 3 : crevette nettoyeuse, blennie bicolore, gobie et gramma lisibles

- Statut : acceptée
- Date : 2026-11-04
- Auteur : Dev, cycle 141, issue #422 (épopée v1.9 « Enrichir et partager »)

## Contexte

Le lot 2 (ADR 0097) a porté le récif à cinq espèces, mais le gobie à crevette jaune et le gramma
royal restent petits en vue `front` et partagent le jaune (#405) ; l'invertébré a été reporté.
L'issue #422 demande : #405, un invertébré marin (crevette nettoyeuse en priorité) et un poisson
de roche (blennie bicolore ou équivalent), sur les mécanismes existants, récif par défaut et bac
tropical identiques à l'octet (graine 42), palette commune ou tons du récif (ADR 0039).

## Décision

1. **#405, gobie** : modèle de 0,105 à **0,13** (seule espèce du récif plus longue que le
   chirurgien, 0,11 ; 13 cm en tout en vrai pour 10 cm de longueur standard), trois **selles
   brunes** sur le dos et le flanc (`sableOmbre`, « cinctus » : ceinturé), ventre clair
   (`koiBlanc`) et nageoires sombres. Il ne partage plus aucune couleur avec le gramma (test).
   Conséquence : la marge des parois (≥ demi-longueur) le remonte un peu (médiane vers 14 % de la
   hauteur d'eau, PIEGES.md).
2. **#405, gramma** : taille inchangée (0,1 ; plus grand, il aurait laissé entrer le chirurgien
   dans le mode immersif) ; **avant violet clair** (`corailVioletClair`) bordé de violet, au lieu
   du violet sombre perdu sur l'eau bleue, **arrière or soutenu** (`coeurFleur`) au lieu du jaune
   du gobie, et **étage relevé** à 25–45 % de la hauteur d'eau : il nage sur l'eau bleue, au-dessus
   des coraux, au lieu de se fondre devant le corail violet.
3. **Crevette nettoyeuse** (_Lysmata amboinensis_) : invertébré, retenue sans nouveau
   comportement lourd. Elle reprend le **mécanisme des marcheurs du fond** de l'axolotl
   (`walker`, ADR 0035 ; l'issue citait la crevette cerise de l'ADR 0095, qui n'a jamais été
   implémentée) : marche sur le sable (80 % des créneaux), courtes nages par à-coups (20 %),
   jamais de remontée à la surface. Seul ajout : `stepWalker` **contourne les obstacles**
   (coraux, rochers, décor) comme un fond trop haut, et refuse une montée ou une descente vers un
   obstacle, sauf pour s'en éloigner. Sans obstacle, la marche est identique au bit près (le
   paludarium par défaut n'en a pas). Modèle : corps rouge, bande dorsale blanche, ventre jaune,
   pattes, longues antennes blanches (12 cm antennes comprises, approximation de jeu pour la
   lisibilité). Groupe `invertebre` des traitements : sel et médicament refusés. Au plus **deux**
   par bac (« elles s'entretuent au-delà », Reeflex). Ni banc, ni recherche de granulés, ni
   réaction au tapotement, comme l'axolotl : la nage des nettoyeuses vers les poissons n'est pas
   modélisée.
4. **Poisson de roche : blennie bicolore** (_Ecsenius bicolor_), phase « bicolore » (FishBase :
   avant noir, arrière jaune-orange) : avant brun-noir (`koiNoir`, `rocheSombre`), arrière orange
   (`tritonOrange`), corps long et bas, tête ronde et haute, longue dorsale continue, œil clair.
   Silhouette distincte des cinq poissons présents ; la couleur de flanc n'est celle d'aucun
   (test). Étage : 6–24 % de la hauteur d'eau, au-dessus du gobie, sous le gramma ; solitaire.
   Modèle de **0,106**, strictement plus long que le gramma : à 0,1, l'ordre alphabétique l'aurait
   fait entrer dans le mode immersif à la place du gramma (PIEGES.md).
   **Écartés** : poisson-faucon flamme (_Neocirrhitus armatus_), rouge comme la crevette et
   prédateur des petites crevettes ; blennie à lignes (_Salarias fasciatus_), brune et tachetée,
   confondue avec les roches.
5. **Mode immersif du récif inchangé** : chromis, clown, gramma (la crevette marche, la blennie
   est plus longue que le gramma).
6. **Valeurs sourcées** (consultées le 2026-11-04) :
   - crevette : Reeflex (`en.reeflex.net/tiere/1180_Lysmata_amboinensis.htm`, secondaire) pour
     la taille (environ 6 cm), la température (21,9–28,8 °C, arrondie à 22–28 °C), le volume
     (environ 112 L), le régime (omnivore : mysis, artémias, copépodes, krill, flocons ; en
     nature parasites, peau morte et détritus), l'agressivité entre congénères, la sensibilité à
     la salinité et l'élevage (possible, rare dans le commerce) ;
   - blennie : FishBase (`fishbase.se/summary/6033`) pour la taille (11 cm de longueur totale),
     le régime (niveau trophique 2,0 : rangée en `herbivore`), la vie solitaire dans des tubes
     abandonnés et les phases de couleur ; Wikipédia confirme 11 cm.
   **Approximations de jeu** : températures préférées (25–27 °C), température tolérée de la
   blennie (FishBase n'en donne pas : 24–28 °C), groupes minimaux (1), volume de la blennie
   (100 L), plages de pH (celles du chirurgien), tempérament de la blennie, réactions au
   tapotement, rythmes, paramètres de nage et de marche, tailles des modèles.
7. **Compatibilité** (ADR 0055, règle inchangée) : crevette `paisible` (agressive seulement
   envers ses congénères) ; blennie `territorial` (« défend son trou », usage amateur **non
   sourcé**). **Paires incompatibles nouvelles** : blennie et gramma, blennie et poisson-clown.
   **Paires compatibles** : crevette avec tout le récif, clown compris ; blennie avec le
   chirurgien et le chromis.
8. **Milieu** : refusées en eau douce et inversement par le contrôle `milieu` du transfert ;
   absentes des catalogues d'eau douce ; pas de points blancs.
9. **Statut légal** : `a-verifier`, confiance « non vérifié » : ni l'annexe 2 de l'arrêté de
   2018 ni les annexes CITES lues. FishBase donne la CITES « non évaluée » pour la blennie, ce qui
   ne vaut pas confirmation. Origine : élevage de la crevette possible mais rare (Reeflex) ; rien
   pour la blennie.

## Non vérifié

- Annexes CITES et annexe 2 : non lues pour les deux espèces (à vérifier, DDPP).
- Tempérament territorial de la blennie, sa température tolérée et son volume : aucune source lue.
- pH de la crevette et de la blennie : aucune source lue.
- Lisibilité : à juger par QA sur `recif-front-lot3` et `recif-three-quarter-lot3`. À 30 s, la
  blennie peut encore survoler un corail (vers 40 % de la hauteur d'eau) avant de redescendre.

## Conséquences

- Le récif propose sept espèces ; `data-aqfish-population` du récif compte deux effectifs nuls de
  plus (`…,crevette:0,blennie:0`).
- Captures `recif-front-lot2` et `recif-three-quarter-lot2` modifiées (gobie et gramma) ;
  `recif-front-lot3` et `recif-three-quarter-lot3` ajoutées.
- `recif-lot2.spec.ts` : la règle « aucune espèce du lot plus grande que le chirurgien » excepte
  le gobie, et la liste des espèces du récif est comparée par préfixe.
