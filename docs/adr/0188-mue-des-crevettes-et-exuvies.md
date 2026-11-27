# 0188 — Mue des crevettes : calendrier pur, crevette cachée, exuvies au sol

- Statut : acceptée (complète l'ADR 0180)
- Date : 2026-11-27
- Auteur : Dev, cycle 317, issue #859

## Contexte

Épopée v1.34 : les crevettes cerises de la colonie (ADR 0180) ne muaient pas. En vrai, une
Neocaridina grandit en changeant de carapace : une jeune mue environ chaque semaine, un adulte
toutes les trois à quatre semaines ; l'exuvie, vide et claire, reste au sol quelques jours (la
crevette la mange souvent) ; juste après la mue, la carapace est molle et la crevette se cache.

## Décision

1. **Calendrier pur** (`sim/shrimp-molt.ts`) : la crevette `id` mue aux instants
   `k · intervalle − décalage`, le décalage tiré du hachage (graine, identifiant). L'intervalle
   est proportionnel à la longueur réelle (3 cm × `fryScale`, jalons discrets des jeunes) :
   `MOLT_SECONDS_PER_CM` = 1 200 s, soit trois jours de jeu pour un adulte, 1 620 s pour un jeune
   au premier jalon, plancher `MIN_MOLT_INTERVAL_SECONDS`. Aucun champ ajouté aux animaux : la
   dernière mue se recalcule (`lastMoltTime`), pas fin et gros pas donnent les mêmes mues, et un
   rechargement les retrouve.
2. **Crevette cachée** : pendant `MOLT_HIDE_SECONDS` (300 s) après sa mue, `isShrimpHiding` est
   vrai et la prédation de la colonie la saute (aucun poisson ne la mange, adulte ou jeune).
   **Approximation de jeu**, non sourcée : la mue ne rend jamais une crevette mangeable par un
   poisson compatible ; elle la protège même un moment des autres. La nage n'est pas changée.
3. **Exuvies** (`World.exuviae`) : à chaque mue, une exuvie (espèce, position et cap de la
   crevette, taille, temps de la mue) est posée ; elle se dissout après
   `EXUVIA_LIFETIME_SECONDS` (trois jours de jeu) ; au plus `MAX_EXUVIAE` (32), les plus
   anciennes partent. Champ absent sans exuvie : les bacs sans crevette restent identiques au
   bit près (empreintes de non-régression inchangées). `stepMoltsInPlace` est appelé par
   `stepShrimpColonyInPlace` à chaque pas, avant la prédation, au pas fin comme à gros pas.
4. **Sauvegarde** : `exuviae` écrit seulement s'il y en a, relu par `sim/save-exuviae.ts`
   (espèce qui mue, position dans l'eau, cap réel, taille dans ]0, 1], temps positif).
5. **Journal** : sorte `mue` (famille « Santé »), « Mue : Crevette cerise (n animaux) », une
   ligne par espèce pour les exuvies plus récentes que la dernière vue.
6. **Rendu** (`render/exuvia-layer.ts`) : un voxel allongé dans l'axe de la crevette, aux trois
   cinquièmes de la longueur de son modèle, posé au sable (`EXUVIA_SAND_LIFT`, même si la
   crevette a mué sur un rocher), crème (`koiBlanc`) puis sable clair à la seconde moitié de sa
   vie, liseré `sableOmbre` plutôt que noir pour ne pas semer de points sombres sur le sable.
   Dessiné après l'eau (file des transparents, opacité pleine, comme les capsules de la
   néritine) : dans la file opaque, la passe palette virait le crème au vert d'eau pâle et
   l'exuvie disparaissait dans le sable. Couche créée et ajoutée en dernier, masquée sans
   exuvie : captures existantes identiques à l'octet (vérifié sur les cinq angles,
   `three-quarter-oeufs-neritine` et `front-alevins-crevettes`). `AquariumView.updateFood` et
   `updateEggs` deviennent `updateGround` (le fichier est à son plafond de taille).
7. **Captures** `top-mues` et `front-mues` : colonie de douze crevettes à 1 200 s, dans un test
   à part (le `time=` commun des captures de jour passe devant celui de la requête).

## Options écartées

- **Un champ `lastMolt` par animal** : schéma de sauvegarde des animaux élargi, et l'écart entre
  pas fin et gros pas à gérer ; le calendrier pur suffit.
- **Une vulnérabilité accrue après la mue** (plus réaliste) : contraire au critère de l'issue,
  et sans source chiffrée.
- **Une nage de crevette cachée** (immobile près des plantes) : reportée, l'issue ne demande que
  la protection.

## Conséquences

- Une colonie de douze adultes laisse environ quatre exuvies par jour de jeu ; le journal note
  chaque mue (lignes neutres, filtrables).
- Les jeunes crevettes à découvert sont un peu moins mangées (environ un sur six, caché à un
  instant donné, ne l'est pas) ; le test de composition de la prédation compte ces jeunes cachés.
- Mue des écrevisses et des crabes : à ajouter à `MOLT_SPECIES` quand ces espèces existeront.
