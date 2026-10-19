# 0016 — Plantes : ondulation au rendu, collision fixe sur les tiges

- Statut : acceptée
- Date : 2026-10-19
- Auteur : Dev (Claude), cycle 16, issue #49

## Contexte

L'épopée v0.3 « Le décor » ajoute des plantes qui ondulent (`docs/DA.md`, règle 6). Elles
s'appuient sur le décor en données (ADR 0015). Deux contraintes se croisent : le mouvement
doit être déterministe et suivre le temps simulé (contrat de capture, action 3 de la rétro
2), et les poissons ne doivent pas traverser les tiges, alors que le feuillage reste
traversable.

## Décision

- **Données** : `DecorItem` accepte `kind: 'plant'` avec un champ `form` (`tall` : deux à
  quatre longues tiges serrées à feuilles alternées ; `tuft` : touffe basse de brins qui
  s'écartent), obligatoire pour une plante et refusé sur un rocher. Le reste (position,
  rotation, échelle, graine) est commun. La racine est enfoncée d'un voxel dans le sable.
- **Modèle** (`sim/plant.ts`) : voxels générés depuis la graine (arête 0,8 cm × échelle),
  chacun marqué tige ou feuillage, avec l'indice de sa tige ou de son brin. La graine donne
  aussi la **phase** de la plante ; chaque tige y ajoute un décalage fixe.
- **Ondulation** (`sim/plant-sway.ts`) : fonction pure `plantSway(h, temps, phase,
  amplitude)` qui renvoie un déplacement horizontal dans le repère du bac : deux sinusoïdes
  lentes (périodes 5 s et 8 s) pondérées 0,8 et 0,6, en retard vers la pointe, multipliées
  par `amplitude · h²`. Sa norme est donc nulle à la racine et bornée par `amplitude · h²`.
  L'amplitude vaut 6 % de la hauteur de la plante. Elle ne fait **pas** partie de l'état du
  monde : le rendu la calcule à partir de `World.time` (interpolé entre deux pas comme les
  poissons).
- **Rendu** (`render/plant-model.ts`, `render/decor-layer.ts`) : déformation par sommet sur
  le processeur. Le maillage garde ses positions au repos, la hauteur relative et la phase
  de chaque sommet ; `applyPlantSway` réécrit en place un seul tableau de positions, partagé
  par le maillage et sa coque de contour (aucune allocation par image). Les plantes ne sont
  pas éliminées par le tronc de vision (sphère englobante calculée au repos).
- **Collision** : colonne de sphères **fixes** sur l'axe des tiges, espacées de 2 voxels,
  dont le rayon couvre le voxel de tige le plus éloigné de l'axe **plus** la borne
  d'ondulation au haut du tronçon. La tige reste dans sa forme à tout instant (testé coin
  par coin, déplacement maximal dans 8 directions), le feuillage qui dépasse reste
  traversable, et la simulation ne dépend pas du temps de l'ondulation. Une touffe n'a pas
  de tige : une petite sphère au collet suffit.

## Options écartées

- **Shader de sommets** (déplacement dans le GPU) : moins de travail processeur, mais il
  faut dupliquer la fonction en GLSL, la garder identique à la fonction testée, et
  l'injecter dans `MeshBasicMaterial` et dans le shader de la coque. Avec quelques milliers
  de sommets, le calcul processeur est négligeable ; à reconsidérer si le décor grossit.
- **Sphères de collision qui suivent l'ondulation** : la forme de collision dépendrait du
  temps, les obstacles ne seraient plus des données immobiles et chaque pas devrait les
  recalculer. L'élargissement par la borne coûte quelques millimètres en haut des tiges.
- **Collision sur tout le feuillage** : bloquerait les poissons loin des tiges et ferait
  une enveloppe grossière, contraire à la « collision fine » de l'issue.

## Conséquences

- Les plantes ajoutent des obstacles au monde par défaut : les trajectoires des poissons
  et les captures changent (naissances hors des tiges, évitement).
- Coût : les colonnes de sphères des tiges rendaient 10 000 pas du monde par défaut 45 %
  plus lents (5,5 s sous couverture, délai du test dépassé). Rejets **exacts** ajoutés
  (`obstacleBound`, sphère englobante mise en cache ; distance à une union sans racine pour
  les sphères qui ne peuvent pas battre la meilleure) : résultats identiques au bit près,
  surcoût ramené à environ 30 %. Le reste vient du comportement (évitement plus fréquent
  près des plantes), non de la géométrie : espacer les sphères n'y change rien.
- Deux plantes proches de phases presque égales bougeraient à l'unisson : les graines du
  décor par défaut sont choisies pour des phases distinctes (test).
- Une nouvelle forme de plante n'ajoute qu'une branche à `plantModel` ; la collision et le
  rendu la traitent sans changement si elle marque ses voxels tige ou feuillage.
