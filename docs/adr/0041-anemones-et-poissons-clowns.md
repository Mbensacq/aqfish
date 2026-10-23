# 0041 — Anémones du récif et poissons-clowns : flux de la graine, attache sans état

- Statut : acceptée
- Date : 2026-10-23
- Auteur : Dev, cycle 52, issue #150

## Contexte

L'issue #150 peuple le récif (ADR 0039, 0040) : des anémones aux tentacules qui ondulent,
posées sur le fond sans chevaucher les coraux, et des poissons-clowns (orange, trois bandes
blanches cerclées de noir) qui restent près d'une anémone et s'y réfugient quand on les
approche. Critère mesuré : un clown à moins de 25 cm de son anémone au moins 80 % du temps
sur 60 s simulées. Les autres environnements doivent rester identiques à l'octet.

Questions : où mettre l'état des anémones et l'attache des clowns ? Quelle forme de
collision pour un animal qui ondule ? Que veut dire « approcher » dans une simulation
déterministe ? Comment garder la place des anémones sur un fond déjà chargé de coraux ?

## Décision

- **Anémones dérivées de la graine, sans état** (`sim/anemones.ts`), comme les coraux :
  `anemoneLayout(graine, dimensions, réglage, décor)` tire tout d'un flux propre
  (`ANEMONE_STREAM`). Réglage dans l'environnement (`Environment.anemones` : 2 anémones,
  échelle 1,2 à 1,4 au récif ; `null` ailleurs). Sauvegarde inchangée (schéma 1) :
  `saveData` compte leurs boîtes parmi les obstacles recalculables. `seededFeatures`
  (`sim/world.ts`) donne coraux et anémones d'un monde ; `createWorld`, la sauvegarde et le
  rendu passent tous par elle.
- **Anémones avant les coraux.** Tirées après eux, 40 % des graines n'avaient aucune
  anémone (mesure sur 300 graines) : le sol est plein. Les anémones sont donc posées
  d'abord (rochers seuls à éviter) et les coraux évitent leur emprise élargie d'une
  clairière de 6 cm (`ANEMONE_CLEARING`, nouveau paramètre `keepOut` de `coralLayout`). Les
  coraux du récif changent donc de place (captures du récif seules).
- **Modèle** : pied rond de 3 voxels de rayon sur 3 de haut, tapis serré de tentacules de 4
  voxels sur un disque de 4 voxels, ceux du bord penchés vers l'extérieur ; voxels de 8 mm
  × échelle. Un damier de tentacules et des longueurs inégales laissaient le contour noir
  envahir l'anémone sur capture : tapis plein, longueur unique.
- **Ondulation** : celle des plantes (`plantSway`, ADR 0016), par tentacule, nulle sur le
  pied, phase décalée de 0,25 rad d'un tentacule au suivant (vagues sans fendre le tapis),
  amplitude 20 % de la longueur. **Obstacle : la boîte du pied seul**, sans paramètre de
  temps : l'ondulation ne peut pas la changer (test : obstacles identiques après 10 s), et
  les tentacules restent traversables (les clowns s'y glissent).
- **Poisson-clown déclaratif** (`CLOWN`, `sim/species.ts`) : nageur ordinaire (banc lâche,
  préférence de profondeur basse) avec un paramètre d'attache `anemone` (laisse 8 cm, refuge
  25 cm et 5 s, 4 clowns par anémone). Robe : orange `clownOrange` (#ff6d00), nouveau **ton
  du récif** (ADR 0039) car tous les oranges de la palette commune sont pris par les coraux ;
  bandes `koiBlanc`, cerclage et œil `koiNoir`.
- **Attache sans état** (`bondTarget`, `sim/world.ts`) : l'anémone d'un clown se déduit de
  son rang parmi les poissons attachés (`homeForRank`) ; le point visé est passé à
  `stepFish` à la place de la nourriture (même suite de tirages) : refuge, sinon nourriture,
  sinon retour au point d'attache au-delà de la laisse. Les points d'attache sont mis en
  cache par tableau de décor (aucune allocation par pas dans `advanceInPlace`).
- **« Quand on les approche » = un dépôt de nourriture récent** (moins de 5 s, âge du
  granulé) à moins de 25 cm de l'anémone : c'est le seul geste de l'utilisateur qui entre
  dans la simulation ; la caméra ou le pointeur n'y entrent pas (contrat de capture).
- **Évitement cédé au retour, pour les seules espèces attachées** (`sim/swimmer.ts`) : en
  revenant, un clown longeait la vitre ou le sable au lieu de faire demi-tour (évitement
  prioritaire). Pour une espèce `anemone` qui vise un point, seule la part horizontale de
  l'évitement pèse sur le cap, et rien quand le point visé est du côté où l'évitement
  pousse. Les autres espèces gardent leur nage à l'octet (captures identiques).

## Conséquences

- Mesure sur 8 graines (0, 1, 7, 42, 123, 999, 4294967295, 31337) : chaque clown reste à
  moins de 25 cm de son anémone 85 à 100 % du temps sur 60 s (test sur 3 graines).
- Coraux du récif : de 2 à 8 colonies selon la graine (3 ou moins pour ~5 % des graines sur
  1 000) au lieu de 4 à 9 : la clairière des anémones prend de la place. Voir la dette #159
  (nombre de colonies sous le minimum visé).
- L'orange du clown, ton du récif, garde sa couleur la nuit (le ton capte l'orange
  assombri) : comme les violets des coraux (PIEGES), la lumière du récif reste à faire.
- Un clown seul peut rester loin de son anémone si un obstacle se trouve entre eux (le
  retour n'est pas une recherche de chemin) ; rare sur les graines mesurées.

## Complément (Dev, cycle 54, issues #162 et #159)

- **Laisse de 8 cm** : la valeur (`leashRadius: 0.08`) est celle mesurée ci-dessus (test des
  80 % à moins de 25 cm) ; seul le commentaire de `CLOWN`, qui disait 10 cm, est corrigé.
- **Attache par rang conservée, pas d'attache par identifiant.** Le rang d'un clown parmi
  les poissons attachés est stable pour ceux qui restent : le panneau retire toujours le
  poisson le plus récent de l'espèce, en fin de tableau, et ajoute en fin de tableau
  (`setPopulationInPlace`, ADR 0025) ; les autres espèces n'entrent pas dans le compte, et
  la sauvegarde garde l'ordre des entités. Retirer un clown ne déplace donc jamais les
  autres (test : population maximale, retraits, retrait des chirurgiens, retrait puis
  ajout). Une attache par identifiant (`id` modulo) aurait changé l'anémone des clowns à la
  graine des captures, et une attache enregistrée aurait demandé un nouveau schéma de
  sauvegarde : écartées. À revoir si un retrait d'un poisson précis (clic) apparaît.
- **Rétention de la nourriture près d'une anémone : compromis voulu.** Un granulé déposé
  à moins de 25 cm d'une anémone fait se réfugier ses clowns pendant 5 s au lieu d'aller le
  manger ; il reste mangeable par les autres poissons et par un clown qui passe à portée
  (`eatInPlace` ne dépend pas du point visé), puis par tous une fois le refuge écoulé. C'est le
  comportement recherché : on « approche » l'anémone, les clowns s'y cachent, puis
  ressortent se nourrir.
- **Disposition mise en cache** (`worldFeatures`, `sim/world.ts`) : coraux, anémones et
  points d'attache d'un monde sont figés et mis en cache par tableau de décor (le décor
  n'est jamais modifié en place), remplis par `createWorld`. `saveData` compte les obstacles
  tirés de la graine par ce cache (`seededObstacleCount`) au lieu de reconstruire les
  modèles voxels des coraux à chaque sauvegarde automatique ; une copie pure du monde
  (`cloneWorld`, qui copie le décor) recalcule une fois. Format de sauvegarde inchangé.
