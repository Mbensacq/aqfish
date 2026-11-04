# 0106 — Comportements propres à l'espèce : broutage, fouille, territoire

- Statut : acceptée
- Date : 2026-11-04
- Auteur : Dev, cycle 144, issue #427 (épopée v1.9 « Enrichir et partager »)

## Contexte

Les espèces se distinguaient par leur forme, leur hauteur de nage et leur fiche, peu par leur
conduite. L'issue demande trois comportements déterministes, visibles en capture, coupés par
« Réduire les mouvements » (ADR 0098) quand ils ajoutent du mouvement, sans changer les
populations par défaut, avec une ligne « Comportement » dans les fiches.

## Décision

1. **Trois comportements** (`sim/behaviors.ts`, table `SPECIES_BEHAVIORS`) :

   | Comportement | Espèces              | Déclenchement                       | Effet sur la nage                                                                                 |
   | ------------ | -------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------- |
   | Fouille      | corydora             | épisode **et** un granulé posé      | point visé sur le sable, 4 cm devant le museau : descend et avance le nez au sol                  |
   | Broutage     | ancistrus, otocinclus | épisode                            | point visé sur la vitre la plus proche (hauteur tirée, bornée par la hauteur préférée : bas de la vitre pour l’ancistrus), avancé de 5 cm le long de la vitre |
   | Territoire   | gourami, gramma      | hors du rayon : toujours ; épisode  | retour au centre (rayon 15 cm) ; pendant un épisode, charge vers l'intrus d'une autre espèce le plus proche du centre, arrêtée à 1,5 longueur de lui |

   La nourriture en vue l'emporte toujours. Pendant le broutage, l'évitement des **parois**
   est annulé (`stepFish(…, hugWalls)`) : sans cela, le poisson restait à 5 cm de la limite de
   nage (portée de l'évitement), loin de la vitre ; les obstacles et la boîte `hard` restent.
2. **Calendrier sans état** : le temps est découpé en fenêtres (`period` : 12 s fouille, 40 s
   broutage, 15 s territoire) ; un épisode par fenêtre, durée et début hachés de (graine,
   identifiant, rang de fenêtre) par `deriveSeed`. Rien n'est ajouté au monde (sauvegardes et
   liens de partage inchangés), aucun tirage n'est pris au générateur du poisson. Le centre du
   territoire est haché de la même façon dans la zone de naissance, hors des obstacles
   (8 essais ; aucun : pas de territoire).
3. **Deux phases** : les points visés sont calculés pour tous les poissons sur les positions du
   début du pas (`computeBehaviorTargets`, comme le banc) ; le résultat ne dépend pas de l'ordre
   de mise à jour. Sans espèce concernée, aucun calcul.
4. **Rendu** : un geste par comportement actif (`behaviorGesture`), ajouté à la pose
   interpolée par `FishLayer` : museau baissé de 0,35 rad et hochement (fouille), frétillement
   latéral (broutage : râpe ; territoire : parade). « Réduire les mouvements » met à 0 la part
   mobile (`MotionFactors.behaviorGesture`), la posture reste. La **simulation ne voit jamais
   l'option** (règle de l'ADR 0098) : la nage des comportements est la même avec ou sans, seuls
   les gestes décoratifs sont coupés.
5. **Fiches** : ligne « Comportement » (`SPECIES_BEHAVIOR_TEXT`) en fin de fiche et de wiki
   pour les cinq espèces.

## Sources et limites

- Comportements connus des aquariophiles, décrits qualitativement : loricariidés et
  otocinclus qui râpent les algues et le biofilm des surfaces, corydoras qui fouillent le
  substrat du museau et des barbillons, gourami nain mâle et gramma royal qui défendent un
  coin du bac. Les pages de référence déjà citées par les fiches (Seriously Fish pour
  `trichogaster-lalius`, `ancistrus-cf-cirrhosus`, `otocinclus-macrospilus` ; FishBase 5281 et
  Wikipédia « Royal gramma ») n'ont **pas pu être consultées** pendant le cycle : la ligne est
  marquée `approximation de jeu`, comme toutes les durées, rayons et amplitudes.
- **Pas d'algue visible** : le broutage ne retire rien ; une couche d'algues liée à
  l'entretien est laissée à une issue future.
- **Chromis écarté** : *Chromis viridis* vit en banc ; sa territorialité n'est pas son trait
  marquant. Le gramma, présent dans les mêmes séries de captures, le remplace.
- La fouille n'existe qu'avec un granulé posé (« à la recherche de la nourriture tombée ») :
  un bac par défaut, sans nourrissage, nage exactement comme avant.
- Le geste du rendu suit le calendrier (`activeBehavior`) sans savoir si la nourriture a pris
  le pas sur le comportement ; un corydora qui mange un granulé posé a de toute façon le nez au
  sol.
- Mode immersif : gestes non transmis (sa vue n'appelle pas `updateFish` avec le contexte) ;
  la nage, elle, est la même.

## Conséquences

- Captures changées, voulues (comparées à `main`, graine 42, 30 s) : `three-quarter-` et
  `front-eau-douce-lot1` (gouramis), `three-quarter-`, `front-` et `libre-eau-douce-lot2(-fond)`
  (ancistrus, otocinclus), `recif-three-quarter-` et `recif-front-lot2`, `-lot3` (grammas),
  `trajectoires-nourriture-top` (fouille). Nouvelle : `front-fouille`. Les séries `nourriture`
  sont identiques : à 30 s, aucun granulé n'y est posé. Les autres sont identiques à l'octet.
- Tout nouveau comportement s'ajoute à `SPECIES_BEHAVIORS` et à `SPECIES_BEHAVIOR_TEXT`, avec
  un geste qui passe par `MotionFactors`.
